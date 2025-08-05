# Orbital Edge Imaging (OEI) - Satellite Pass Predictor

A professional satellite pass prediction system that calculates orbital overpasses for user-defined Areas of Interest (AOI) using real TLE data and SGP4 orbital mechanics.

## 🛰️ Features

- **Real-time TLE fetching** from Space-Track.org
- **Precise orbital calculations** using SGP4 propagation (Skyfield)
- **Interactive map interface** with Leaflet
- **GeoJSON AOI upload** and visualization
- **PostgreSQL + PostGIS** database storage
- **Docker containerization** for easy deployment
- **Professional UI/UX** with satellite tracking visualization

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Space-Track.org account (free registration at https://www.space-track.org)

### Setup

1. **Navigate to project directory**
```bash
cd munich  # or your project folder name
```

2. **Configure Space-Track credentials**
   
   Update `docker-compose.yml` with your Space-Track.org credentials:
```yaml
environment:
  - SPACETRACK_USERNAME=your-email@example.com
  - SPACETRACK_PASSWORD=your-password
  - I have left my credentials for you to make it easier and quicker to run and check
```

3. **Start the application**
```bash
docker-compose up --build
```

4. **Access the application**
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

5. **Start the frontend separately**
```bash
# In a new terminal, navigate to frontend directory
cd frontend
npm install
npm start
# Frontend will be available at: http://localhost:1234
```

## 📡 Usage

### Web Interface

1. **Upload AOI**: Select a GeoJSON file defining your Area of Interest
2. **Enter Satellite**: Provide satellite name and NORAD ID (e.g., "Sentinel-1A", 39634)
3. **Run Prediction**: Click "Run Prediction" to calculate orbital passes
4. **View Results**: See predicted passes with rise/set times and orbital tracks on the map

### API Endpoints

#### Upload Area of Interest
```http
POST /aois/
Content-Type: application/json

{
  "name": "My AOI",
  "geom": { "type": "Polygon", "coordinates": [...] }
}
```

#### Fetch TLE Data
```http
POST /tles/
Content-Type: application/json

{
  "name": "Sentinel-1A",
  "norad_id": 39634
}
```

#### Calculate Orbital Passes
```http
POST /predict/
Content-Type: application/json

{
  "aoi_id": 1,
  "tle_ids": [1],
  "start": "2025-08-05T00:00:00Z"
}
```

#### List Available Data
```http
GET /aois/          # List all AOIs
GET /tles/          # List all TLEs
```

## 🏗️ Architecture

### Backend Stack
- **FastAPI** - Modern Python web framework
- **PostgreSQL + PostGIS** - Spatial database
- **Skyfield** - Astronomical calculations and SGP4 propagation
- **Shapely** - Geometric operations
- **SQLAlchemy** - Database ORM

### Frontend Stack
- **TypeScript/JavaScript** - Core language
- **Leaflet** - Interactive mapping
- **HTML5/CSS3** - Modern web standards
- **Parcel** - Build tool and dev server

### Infrastructure
- **Docker** - Backend containerization
- **Docker Compose** - Database orchestration

## 🛢️ Database Schema

### AOI Table
- `id` - Primary key
- `name` - Optional AOI name
- `geom` - PostGIS POLYGON geometry

### TLE Table
- `id` - Primary key
- `name` - Satellite name
- `line1` - TLE line 1
- `line2` - TLE line 2
- `epoch` - TLE epoch timestamp

### Pass Table
- `id` - Primary key
- `tle_id` - Foreign key to TLE
- `aoi_id` - Foreign key to AOI
- `rise_time` - Pass start time
- `set_time` - Pass end time
- `max_elevation` - Maximum elevation angle (degrees)
- `track` - PostGIS LINESTRING of sub-satellite track

## 🔧 Development

### Local Development Setup

1. **Install dependencies**
```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

2. **Start services individually**
```bash
# Database
docker-compose up db

# Backend (development mode)
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (development mode)
cd frontend
npm run dev
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SPACETRACK_USERNAME` | Space-Track.org username | Yes |
| `SPACETRACK_PASSWORD` | Space-Track.org password | Yes |

### API Testing

Test endpoints using curl or the built-in FastAPI documentation at http://localhost:8000/docs:

```bash
# Test system health
curl http://localhost:8000/

# Test Space-Track connection  
curl http://localhost:8000/test-space-track

# Full system diagnostic
curl http://localhost:8000/debug/full-system-test

# Test SGP4 calculations
curl http://localhost:8000/debug-sgp4
```

## 🧪 Testing

### System Testing
The following endpoints can be used to verify system functionality:

```bash
# Health check
curl http://localhost:8000/

# Space-Track.org connectivity
curl http://localhost:8000/test-space-track

# Complete system diagnostic
curl http://localhost:8000/debug/full-system-test

# SGP4 orbital calculations
curl http://localhost:8000/debug-sgp4
```

### Integration Testing
```bash
# Test complete workflow
curl -X POST http://localhost:8000/predict/ \
  -H "Content-Type: application/json" \
  -d '{"aoi_id":1,"tle_ids":[1],"start":"2025-08-05T00:00:00Z"}'
```

## 📊 Orbital Mechanics

### SGP4 Implementation
- Uses **Skyfield** library for precise orbital propagation
- Implements **find_events()** method for accurate pass prediction
- Filters passes by **minimum elevation angle** (5° default)
- Calculates **real-time satellite positions** and **sub-satellite tracks**

### Supported Satellites
- Any satellite with TLE data available from Space-Track.org
- Optimized for Earth observation satellites (Sentinel, Landsat, etc.)
- Supports polar, sun-synchronous, and other orbit types

## 🌍 Data Sources

- **TLE Data**: Space-Track.org (real-time orbital elements)
- **Maps**: OpenStreetMap tiles
- **Coordinate Systems**: WGS84 (EPSG:4326)

## 🚨 Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check if PostgreSQL is running
docker-compose logs db
```

**Space-Track Authentication Failed**
- Verify credentials in `docker-compose.yml`
- Ensure Space-Track.org account is active

**Frontend Not Loading**
```bash
# Check if frontend is running
cd frontend
npm start

# If issues persist, reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm start
```

### Debug Endpoints

- `GET /debug-sgp4` - Test SGP4 propagation
- `GET /test-space-track` - Verify Space-Track connection
- `GET /debug/full-system-test` - Complete system diagnostic

## 📝 License

This project is developed as a technical demonstration for European Space Imaging.


**Built with ❤️ for Orbital Edge Imaging**