import 'leaflet/dist/leaflet.css';
import L, { GeoJSON } from 'leaflet';

// Fix de iconos para Parcel
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl:        require('leaflet/dist/images/marker-icon.png'),
  shadowUrl:      require('leaflet/dist/images/marker-shadow.png'),
});

const map = L.map('map').setView([0, 0], 2);
L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '&copy; OpenStreetMap contributors' }
).addTo(map);

let aoiLayer: GeoJSON | null = null;
const passesLayer = L.layerGroup().addTo(map);

function showError(msg: string) {
  alert(`Error: ${msg}`);
}

document
  .getElementById('aoiFile')!
  .addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return showError('Selecciona un GeoJSON.');
    try {
      const geojson = JSON.parse(await file.text());
      if (aoiLayer) map.removeLayer(aoiLayer);
      aoiLayer = L.geoJSON(geojson).addTo(map);
      map.fitBounds(aoiLayer.getBounds());

      // Enviar AOI al backend
      const res = await fetch('http://localhost:8000/aois/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geom: geojson }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const { id: aoiId } = await res.json();

      // Habilita el botón
      const btn = document.getElementById('runBtn')!;
      btn.setAttribute('data-aoi-id', aoiId);
      btn.removeAttribute('disabled');
    } catch (err: any) {
      showError(err.message);
    }
  });

document
  .getElementById('runBtn')!
  .addEventListener('click', async () => {
    const name  = (document.getElementById('satName') as HTMLInputElement).value.trim();
    const norad = parseInt(
      (document.getElementById('noradId') as HTMLInputElement).value,
      10
    );
    const btn   = document.getElementById('runBtn')!;
    const aoiId = Number(btn.getAttribute('data-aoi-id'));

    if (!name || !norad || !aoiId) {
      return showError(
        'Introduce nombre, NORAD ID y carga un AOI primero.'
      );
    }

    try {
      // 1) Descargar y guardar TLE
      const resTle = await fetch('http://localhost:8000/tles/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, norad_id: norad }),
      });
      if (!resTle.ok) {
        const err = await resTle.json();
        throw new Error(err.detail || resTle.statusText);
      }
      const { id: tleId } = await resTle.json();

      // 2) Predecir pases
      const start = new Date().toISOString();
      const resPass = await fetch('http://localhost:8000/predict/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aoi_id: aoiId,
          tle_ids: [tleId],
          start,
        }),
      });
      if (!resPass.ok) {
        const err = await resPass.json();
        throw new Error(err.detail || resPass.statusText);
      }
      const passes = await resPass.json();

      // 3) Dibujar resultados
      const ul = document.getElementById('passList')!;
      ul.innerHTML = '';
      passesLayer.clearLayers();

      for (const p of passes) {
        const li = document.createElement('li');
        li.textContent = `Rise: ${p.rise_time}, Set: ${p.set_time}`;
        ul.appendChild(li);
        L.geoJSON(p.track).addTo(passesLayer);
      }
    } catch (err: any) {
      showError(err.message);
    }
  });
