# backend/app/crud.py

import os
import logging
import requests
from typing import List
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from shapely.geometry import shape, LineString, Point
from geoalchemy2.shape import from_shape, to_shape
from . import models, schemas
from skyfield.api import load, EarthSatellite

# Setup logging
logger = logging.getLogger(__name__)

# Load timescale once
ts = load.timescale()

# Space-Track URLs
AUTH_URL = "https://www.space-track.org/ajaxauth/login"
TLE_URL = "https://www.space-track.org/basicspacedata/query/class/tle_latest/ORDINAL/1/format/tle/NORAD_CAT_ID/"


def create_aoi(db: Session, aoi: schemas.AOICreate):
    """Create a new AOI in the database"""
    geom = shape(aoi.geom)
    obj = models.AOI(name=aoi.name, geom=from_shape(geom, srid=4326))
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_aoi(db: Session, aoi_id: int):
    """Get AOI by ID"""
    return db.query(models.AOI).get(aoi_id)


def create_tle(db: Session, tle_in: schemas.TLEFetch):
    """Fetch TLE from Space-Track and save to database"""
    sess = requests.Session()
    sess.headers.update({'User-Agent': 'OEI/1.0'})
    
    # Authenticate with Space-Track
    auth_response = sess.post(
        AUTH_URL, 
        data={
            "identity": os.getenv("SPACETRACK_USERNAME"),
            "password": os.getenv("SPACETRACK_PASSWORD")
        }, 
        timeout=30
    )
    
    if auth_response.status_code != 200:
        raise RuntimeError("Space-Track authentication failed")
    
    # Fetch TLE data
    tle_response = sess.get(f"{TLE_URL}{tle_in.norad_id}", timeout=30)
    lines = tle_response.text.strip().splitlines()
    
    if len(lines) < 2:
        raise RuntimeError("Invalid TLE data received from Space-Track")
    
    line1, line2 = lines[0], lines[1]
    
    # Parse epoch from TLE
    sat = EarthSatellite(line1, line2, tle_in.name, ts)
    epoch = sat.epoch.utc_datetime().replace(tzinfo=timezone.utc)
    
    # Create and save TLE object
    obj = models.TLE(
        name=tle_in.name, 
        line1=line1, 
        line2=line2, 
        epoch=epoch
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_tles(db: Session):
    """List all TLEs in the database"""
    return db.query(models.TLE).all()


def calculate_satellite_passes(db: Session, aoi_id: int, tle_ids: List[int], start: datetime):
    """
    Predict satellite passes over AOI using SGP4 orbital propagation
    
    Args:
        db: Database session
        aoi_id: AOI identifier
        tle_ids: List of TLE identifiers
        start: Start time for prediction
        
    Returns:
        List of Pass objects
    """
    logger.info(f"🔮 Starting SGP4 pass prediction for AOI {aoi_id}")
    logger.info(f"   TLE IDs: {tle_ids}")
    logger.info(f"   Start time: {start}")
    logger.info(f"   Propagation period: 24 hours")
    
    # Get AOI from database
    aoi = get_aoi(db, aoi_id)
    if not aoi:
        raise RuntimeError("AOI not found")
    
    # Convert AOI geometry from PostGIS to Shapely
    geom = to_shape(aoi.geom)
    logger.info(f"AOI bounds: {geom.bounds}")
    logger.info(f"AOI centroid: POINT ({geom.centroid.x} {geom.centroid.y})")
    
    # Setup time range (24 hours from start)
    t0 = ts.from_datetime(start)
    t1 = ts.from_datetime(start + timedelta(hours=24))
    
    results = []
    
    for tid in tle_ids:
        tle = db.query(models.TLE).get(tid)
        if not tle:
            logger.warning(f"TLE {tid} not found, skipping")
            continue
            
        logger.info(f"Processing satellite: {tle.name}")
        
        # Create satellite object
        sat = EarthSatellite(tle.line1, tle.line2, tle.name, ts)
        
        # Generate orbital points (every minute for 24 hours = 1440 points)
        secs = 24 * 3600  # 24 hours in seconds
        step = 60  # 60 second steps
        pts = []
        
        for i in range(secs // step):
            # Calculate time for this point
            t = t0 + (t1 - t0) * (i / (secs // step))
            
            # Get satellite position
            geo = sat.at(t)
            sp = geo.subpoint()
            
            # Get longitude and latitude
            lon, lat = sp.longitude.degrees, sp.latitude.degrees
            
            # Normalize longitude to -180 to 180
            if lon > 180:
                lon -= 360
            if lon < -180:
                lon += 360
                
            pts.append((lon, lat))
        
        logger.info(f"Generated {len(pts)} orbital points")
        
        # Find segments that intersect with AOI (with buffer for visibility)
        buffer = geom.buffer(1.0)  # 1 degree buffer around AOI
        segs = []
        curr = []
        
        for pt in pts:
            p = Point(pt)
            if buffer.contains(p):
                curr.append(pt)
            else:
                if len(curr) >= 2:
                    segs.append(curr)
                curr = []
        
        # Don't forget the last segment
        if len(curr) >= 2:
            segs.append(curr)
        
        logger.info(f"Found {len(segs)} potential pass segments")
        
        # Create Pass objects for each segment
        for i, s in enumerate(segs):
            logger.info(f"✅ Creating pass segment {i + 1}")
            
            # Create LineString for the track
            line = LineString(s)
            
            # Calculate rise and set times
            start_idx = pts.index(s[0])
            end_idx = pts.index(s[-1])
            rise = start + timedelta(seconds=start_idx * step)
            set_ = start + timedelta(seconds=end_idx * step)
            
            logger.info(f"   Rise: {rise}")
            logger.info(f"   Set: {set_}")
            logger.info(f"   Points in segment: {len(s)}")
            
            # Calculate maximum elevation (simplified - using 40° as default)
            max_elevation = 40.0
            
            # Create and save Pass object
            pass_obj = models.Pass(
                tle_id=tid,
                aoi_id=aoi_id,
                rise_time=rise,
                set_time=set_,
                max_elevation=max_elevation,
                track=from_shape(line, srid=4326)
            )
            db.add(pass_obj)
            db.commit()
            db.refresh(pass_obj)
            results.append(pass_obj)
    
    logger.info(f"📡 SGP4 prediction complete: {len(results)} passes found")
    return results