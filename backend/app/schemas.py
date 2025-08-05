from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime

# -------------------------
# AOI Schemas
# -------------------------

class AOICreate(BaseModel):
    name: Optional[str] = Field(None, description="Optional name for the AOI")
    geom: Dict  # GeoJSON Polygon or MultiPolygon

class AOI(BaseModel):
    id: int
    name: Optional[str]
    geom: Dict  # Ensure GeoJSON is returned in responses

    class Config:
        orm_mode = True


# -------------------------
# TLE Schemas
# -------------------------

class TLEFetch(BaseModel):
    name: str
    norad_id: int

class TLE(BaseModel):
    id: int
    name: str
    line1: str
    line2: str
    epoch: Optional[datetime]

    class Config:
        orm_mode = True


# -------------------------
# Prediction Schemas
# -------------------------

class PredictRequest(BaseModel):
    aoi_id: int
    tle_ids: List[int]
    start: datetime

class PassBase(BaseModel):
    rise_time: datetime
    set_time: datetime
    max_elevation: Optional[float]
    track: Dict  # GeoJSON LineString

class Pass(PassBase):
    id: int
    tle_id: int
    aoi_id: int

    class Config:
        orm_mode = True
