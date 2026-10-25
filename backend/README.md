# Backend — FastAPI pass-prediction service

REST API that stores Areas of Interest (AOIs) and TLEs in PostGIS, fetches the latest TLEs from Space-Track.org and propagates them with SGP4 (Skyfield) to predict when a satellite passes over an AOI.

## Modules

| File | Responsibility |
|------|----------------|
| `app/main.py` | FastAPI app, endpoints, pass prediction and debug/diagnostic routes |
| `app/crud.py` | Space-Track authentication and TLE download, database writes |
| `app/models.py` | SQLAlchemy + GeoAlchemy2 models: `AOI`, `TLE`, `Pass` |
| `app/schemas.py` | Pydantic request/response schemas |
| `app/database.py` | Engine and session, configured from `DATABASE_URL` |

## Run

With Docker (recommended), from the repository root after creating `.env` from `.env.example`:

```bash
docker compose up --build
```

Without Docker, with a PostGIS instance running:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://oei:<password>@localhost:5432/oei
export SPACETRACK_USERNAME=<your-email>
export SPACETRACK_PASSWORD=<your-password>
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs

## Pass prediction in short

1. Fetch the latest TLE for a NORAD ID from Space-Track.org.
2. Build a Skyfield `EarthSatellite` and propagate with SGP4 over a 24-hour window from the requested start.
3. Use `find_events()` for an observer at the AOI to get rise, culmination and set, keeping passes above the minimum elevation (5° by default).
4. Store each pass with its sub-satellite track as a PostGIS `LINESTRING`.

Credentials are read only from environment variables; never hard-code them.
