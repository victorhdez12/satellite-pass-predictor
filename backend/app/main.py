from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
from shapely.geometry import shape, LineString, Point
from geoalchemy2.shape import to_shape, from_shape
import time
import os
import logging
import traceback

from .database import SessionLocal, engine
from . import models, schemas, crud

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Wait for database to be ready
max_retries = 30
retry_count = 0
while retry_count < max_retries:
    try:
        models.Base.metadata.create_all(bind=engine)
        print("✅ Database connected successfully!")
        break
    except Exception as e:
        retry_count += 1
        print(f"⏳ Waiting for database... attempt {retry_count}/{max_retries}")
        time.sleep(2)
        if retry_count >= max_retries:
            print("❌ Could not connect to database after 30 attempts")
            raise e

app = FastAPI(title="OEI Orbital Pass API", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1234",
        "http://frontend:1234",
        "http://127.0.0.1:1234"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/", tags=["health"])
def health():
    return {"status": "OEI Orbital Pass API is running", "version": "1.0.0"}

@app.get("/aois/", response_model=List[schemas.AOI])
def list_aois(db: Session = Depends(get_db)):
    """List all AOIs in the database"""
    aois = db.query(models.AOI).all()
    result = []
    for aoi in aois:
        # Convert geometry back to GeoJSON for response
        geom_shape = to_shape(aoi.geom)
        result.append(schemas.AOI(
            id=aoi.id,
            name=aoi.name,
            geom=geom_shape.__geo_interface__
        ))
    return result

@app.post("/aois/", response_model=schemas.AOI)
def create_aoi_endpoint(aoi: schemas.AOICreate, db: Session = Depends(get_db)):
    print(f"🗺️ Creating AOI: {aoi.name or 'Unnamed'}")
    result = crud.create_aoi(db, aoi)
    print(f"✅ AOI created with ID: {result.id}")
    
    # Convert geometry back to GeoJSON for response
    geom_shape = to_shape(result.geom)
    return schemas.AOI(
        id=result.id,
        name=result.name,
        geom=geom_shape.__geo_interface__
    )

@app.post("/tles/", response_model=schemas.TLE)
def fetch_and_create_tle_endpoint(tle: schemas.TLEFetch, db: Session = Depends(get_db)):
    """Fetch TLE from Space-Track.org - NO MOCK, REAL DATA ONLY"""
    print(f"🛰️ Fetching REAL TLE for {tle.name} (NORAD {tle.norad_id}) from Space-Track.org")
    
    try:
        result = crud.create_tle(db, tle)
        print(f"✅ Successfully fetched REAL TLE from Space-Track!")
        print(f"   Line 1: {result.line1[:50]}...")
        print(f"   Line 2: {result.line2[:50]}...")
        return result
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Space-Track failed: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch TLE from Space-Track: {error_msg}")

@app.get("/tles/", response_model=List[schemas.TLE])
def list_tles_endpoint(db: Session = Depends(get_db)):
    return crud.list_tles(db)

@app.post("/predict/", response_model=List[schemas.PassBase])
def run_orbital_prediction(request: schemas.PredictRequest, db: Session = Depends(get_db)):
    """Predict satellite passes using Skyfield's find_events method (like your working version)"""
    try:
        from skyfield.api import load, EarthSatellite, Topos
        
        logger.info("🔮 Starting SGP4 pass prediction for AOI %s", request.aoi_id)
        logger.info("   TLE IDs: %s", request.tle_ids)
        logger.info("   Start time: %s", request.start)
        logger.info("   Propagation period: 24 hours")

        # Get AOI from database
        aoi = db.query(models.AOI).get(request.aoi_id)
        if not aoi:
            raise HTTPException(status_code=404, detail="AOI not found")
        
        # Convert AOI geometry from PostGIS to Shapely
        geom = to_shape(aoi.geom)
        logger.info(f"AOI bounds: {geom.bounds}")
        
        # Get AOI centroid as observer location (like your original code)
        centroid = geom.centroid
        observer = Topos(latitude_degrees=centroid.y, longitude_degrees=centroid.x)
        logger.info(f"Observer location: {centroid.y:.4f}°N, {centroid.x:.4f}°E")
        
        # Setup Skyfield timescale
        ts = load.timescale()
        
        # Setup time range (24 hours from start)
        end_time = request.start + timedelta(hours=24)
        t0 = ts.from_datetime(request.start)
        t1 = ts.from_datetime(end_time)
        
        result_passes = []
        
        for tid in request.tle_ids:
            tle = db.query(models.TLE).get(tid)
            if not tle:
                logger.warning(f"TLE {tid} not found, skipping")
                continue
                
            logger.info(f"Processing satellite: {tle.name}")
            
            # Create satellite object
            satellite = EarthSatellite(tle.line1, tle.line2, tle.name, ts)
            
            try:
                # Use Skyfield's find_events method (like your working code)
                # This finds rise, culminate, and set events above minimum altitude
                t, events = satellite.find_events(observer, t0, t1, altitude_degrees=5.0)
                logger.info(f"Found {len(events)} events for {tle.name}")
                
                # Process events to identify complete passes (rise and set)
                passes = []
                current_pass = {}
                
                for ti, event in zip(t, events):
                    event_time = ti.utc_datetime()
                    
                    if event == 0:  # Rise
                        current_pass = {
                            'rise_time': event_time,
                            'satellite_name': tle.name
                        }
                        logger.debug(f"{tle.name} - Rise: {event_time}")
                        
                    elif event == 1:  # Culminate (maximum elevation)
                        if 'rise_time' in current_pass:
                            # Calculate elevation at culmination
                            difference = satellite - observer
                            topocentric = difference.at(ti)
                            alt, az, distance = topocentric.altaz()
                            current_pass['max_elevation'] = float(alt.degrees)
                            current_pass['culminate_time'] = event_time
                            logger.debug(f"{tle.name} - Culminate: {event_time}, Max elevation: {alt.degrees:.1f}°")
                            
                    elif event == 2:  # Set
                        if 'rise_time' in current_pass:
                            current_pass['set_time'] = event_time
                            
                            # Create orbital track for this pass
                            track_points = []
                            pass_duration = (event_time - current_pass['rise_time']).total_seconds()
                            
                            # Generate track points every 30 seconds during the pass
                            for i in range(0, int(pass_duration), 30):
                                track_time = ts.from_datetime(current_pass['rise_time'] + timedelta(seconds=i))
                                geo = satellite.at(track_time)
                                subpoint = geo.subpoint()
                                
                                lon = subpoint.longitude.degrees
                                lat = subpoint.latitude.degrees
                                
                                # Normalize longitude
                                if lon > 180:
                                    lon -= 360
                                if lon < -180:
                                    lon += 360
                                    
                                track_points.append([lon, lat])
                            
                            # Create LineString for the track
                            if len(track_points) >= 2:
                                line = LineString(track_points)
                                
                                # Save to database
                                try:
                                    pass_obj = models.Pass(
                                        tle_id=tid,
                                        aoi_id=request.aoi_id,
                                        rise_time=current_pass['rise_time'],
                                        set_time=current_pass['set_time'],
                                        max_elevation=float(current_pass.get('max_elevation', 0.0)),
                                        track=from_shape(line, srid=4326)
                                    )
                                    db.add(pass_obj)
                                    db.commit()
                                    db.refresh(pass_obj)
                                except Exception as db_error:
                                    logger.error(f"Database error: {db_error}")
                                    db.rollback()
                                
                                # Add to results
                                pass_data = schemas.PassBase(
                                    rise_time=current_pass['rise_time'],
                                    set_time=current_pass['set_time'],
                                    max_elevation=float(current_pass.get('max_elevation', 0.0)),
                                    track=line.__geo_interface__
                                )
                                result_passes.append(pass_data)
                                
                                logger.info(f"✅ Pass recorded: {current_pass['rise_time']} to {current_pass['set_time']}")
                                logger.info(f"   Max elevation: {current_pass.get('max_elevation', 0.0):.1f}°")
                                logger.info(f"   Track points: {len(track_points)}")
                            
                            current_pass = {}
                
                logger.info(f"Completed processing {tle.name}: {len(passes)} passes found")
                
            except Exception as e:
                logger.error(f"Error calculating events for {tle.name}: {e}")
                continue
        
        logger.info("📡 SGP4 prediction complete: %d passes found", len(result_passes))
        return result_passes

    except Exception as e:
        logger.error("❌ SGP4 prediction error: %s", repr(e))
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"SGP4 prediction failed: {repr(e)}")

@app.post("/predict-demo/", response_model=List[schemas.PassBase])
def demo_orbital_prediction(request: schemas.PredictRequest, db: Session = Depends(get_db)):
    """Demo endpoint that always returns sample passes for presentation"""
    print(f"🎭 Creating DEMO passes for presentation...")
    
    demo_passes = []
    start_time = request.start
    
    # I create 3 demo pases to check the frontend
    # This is just a mockup, not real data
    # In a real scenario, you would fetch TLEs and calculate passes
    for i in range(3):
        rise_time = start_time + timedelta(hours=2 + i*8, minutes=15)
        set_time = rise_time + timedelta(minutes=8 + i*2)
        elevation = 35.0 + i * 15
        
        # Create track demo above España/Madrid
        demo_coords = [
            [-10.0 + i*2, 40.0 + i*0.5],
            [-8.0 + i*2, 41.0 + i*0.5],
            [-6.0 + i*2, 42.0 + i*0.5],
            [-4.0 + i*2, 41.5 + i*0.5],
            [-2.0 + i*2, 40.5 + i*0.5],
            [0.0 + i*2, 39.5 + i*0.5]
        ]
        
        track_geojson = {
            "type": "LineString",
            "coordinates": demo_coords
        }
        
        demo_pass = schemas.PassBase(
            rise_time=rise_time,
            set_time=set_time,
            max_elevation=elevation,
            track=track_geojson
        )
        demo_passes.append(demo_pass)
        
        print(f"   🛰️ Demo pass {i+1}: {rise_time} to {set_time} ({elevation}°)")
    
    print(f"🎯 Created {len(demo_passes)} demo passes")
    return demo_passes

@app.get("/test-space-track", tags=["debug"])
def test_space_track_connection():
    """Test Space-Track.org connection with REAL credentials"""
    import requests
    
    username = os.getenv("SPACETRACK_USERNAME")
    password = os.getenv("SPACETRACK_PASSWORD")
    
    if not username or not password:
        return {
            "error": "Space-Track credentials not configured",
            "username_set": bool(username),
            "password_set": bool(password)
        }
    
    try:
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'OEI-Orbital-Passes/1.0 (victor.legazpi@gmail.com)'
        })
        
        response = session.post(
            "https://www.space-track.org/ajaxauth/login",
            data={"identity": username, "password": password},
            timeout=30
        )
        
        login_success = response.status_code == 200
        
        if login_success:
            tle_response = session.get(
                "https://www.space-track.org/basicspacedata/query/class/tle_latest/ORDINAL/1/format/tle/NORAD_CAT_ID/39634",
                timeout=30
            )
            
            has_tle_data = bool(tle_response.text.strip())
            
            return {
                "message": "✅ Space-Track connection successful!" if has_tle_data else "❌ Space-Track connection failed",
                "login_success": login_success,
                "tle_data_received": has_tle_data
            }
        else:
            return {
                "message": "❌ Space-Track login failed",
                "login_success": False
            }
        
    except Exception as e:
        return {
            "error": f"Connection failed: {str(e)}",
            "message": "❌ Space-Track connection error"
        }

@app.get("/debug-sgp4", tags=["debug"])
def debug_sgp4_propagation():
    """Debug SGP4 propagation with current TLE"""
    try:
        from datetime import datetime, timezone
        from skyfield.api import load, EarthSatellite, wgs84
        
        # Use the real TLE from database
        db = SessionLocal()
        tle = db.query(models.TLE).first()
        if not tle:
            return {"error": "No TLE found in database"}
        
        print(f"🛰️ Debug SGP4 for {tle.name}")
        print(f"   TLE1: {tle.line1}")
        print(f"   TLE2: {tle.line2}")
        
        # Create satellite
        ts = load.timescale()
        satellite = EarthSatellite(tle.line1, tle.line2, tle.name, ts)
        
        # Test a few positions
        start_time = datetime(2025, 8, 3, 15, 0, 0, tzinfo=timezone.utc)
        positions = []
        
        for i in range(5):
            test_time = start_time + timedelta(minutes=i*30)
            t = ts.from_datetime(test_time)
            geocentric = satellite.at(t)
            subpoint = wgs84.subpoint(geocentric)
            
            pos = {
                "time": test_time.isoformat(),
                "longitude": subpoint.longitude.degrees,
                "latitude": subpoint.latitude.degrees,
                "altitude_km": subpoint.elevation.km
            }
            positions.append(pos)
            print(f"   {test_time}: {pos['longitude']:.2f}°, {pos['latitude']:.2f}°")
        
        db.close()
        return {
            "satellite": tle.name,
            "positions": positions,
            "message": "SGP4 working correctly"
        }
        
    except Exception as e:
        return {"error": f"SGP4 debug failed: {str(e)}"}

@app.get("/debug/full-system-test", tags=["debug"])
def full_system_diagnostic():
    """Test completo del sistema paso a paso"""
    try:
        db = SessionLocal()
        
        # 1. Verify data
        aoi_count = db.query(models.AOI).count()
        tle_count = db.query(models.TLE).count()
        pass_count = db.query(models.Pass).count()
        
        # 2. Verify credentials from Space-Track
        username = os.getenv("SPACETRACK_USERNAME")
        password = os.getenv("SPACETRACK_PASSWORD")
        
        # 3. State of the system
        system_status = {
            "database": {
                "connection": "OK",
                "aois_count": aoi_count,
                "tles_count": tle_count,
                "passes_count": pass_count
            },
            "space_track": {
                "username_configured": bool(username),
                "password_configured": bool(password),
                "credentials_format": f"{username[:3]}***@{username.split('@')[1] if '@' in username else 'invalid'}" if username else "Not set"
            },
            "sgp4_library": "Available",
            "gis_support": "PostGIS + Shapely ready"
        }
        
        # 4. Recommendations
        recommendations = []
        if aoi_count == 0:
            recommendations.append("Upload an AOI GeoJSON file first")
        if tle_count == 0:
            recommendations.append("Download a TLE for a satellite")
        if not username or not password:
            recommendations.append("Configure Space-Track credentials")
        
        if not recommendations:
            recommendations.append("System ready! Try running a prediction.")
        
        db.close()
        
        return {
            "system_status": system_status,
            "recommendations": recommendations,
            "test_endpoints": [
                "POST /aois/ - Create AOI",
                "POST /tles/ - Download TLE", 
                "POST /predict/ - Run prediction",
                "POST /predict-demo/ - Demo with sample passes"
            ]
        }
        
    except Exception as e:
        return {"error": f"System test failed: {str(e)}"}