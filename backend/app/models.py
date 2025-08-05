from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from geoalchemy2 import Geometry
from .database import Base

class AOI(Base):
    __tablename__ = "aois"
    id   = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    geom = Column(Geometry("POLYGON"), nullable=False)

class TLE(Base):
    __tablename__ = "tles"
    id     = Column(Integer, primary_key=True, index=True)
    name   = Column(String, nullable=False)
    line1  = Column(String, nullable=False)
    line2  = Column(String, nullable=False)
    epoch  = Column(DateTime, nullable=True)

class Pass(Base):
    __tablename__ = "passes"
    id            = Column(Integer, primary_key=True, index=True)
    tle_id        = Column(Integer, ForeignKey("tles.id"), nullable=False)
    aoi_id        = Column(Integer, ForeignKey("aois.id"), nullable=False)
    rise_time     = Column(DateTime, nullable=False)
    set_time      = Column(DateTime, nullable=False)
    max_elevation = Column(Float, nullable=True)
    track         = Column(Geometry("LINESTRING"), nullable=True)
