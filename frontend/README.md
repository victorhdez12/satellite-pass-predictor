# Frontend — Leaflet map client

Single-page client to upload a GeoJSON AOI, choose a satellite (name + NORAD ID), run a prediction against the backend and draw the predicted passes and ground tracks on a Leaflet map.

## Run

The backend must be running on http://localhost:8000 (see the root README).

```bash
cd frontend
npm install
npm start          # dev server at http://localhost:1234
npm run build      # production build into dist/
```

## Files

| Path | Purpose |
|------|---------|
| `index.html` | Page layout and form |
| `src/app.ts` | TypeScript source: API calls, map layers, results table |
| `src/app.js` | Compiled JavaScript loaded by Parcel |
| `static/` | Styles and Leaflet marker images |

Sample AOIs to try: `../madrid.geojson` and `../norway.geojson`.

`node_modules/`, `.cache/` and `dist/` are generated locally and are not committed.
