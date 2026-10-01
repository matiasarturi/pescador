const SPECIES = [
  { id: 'bagre', name: 'Bagre', icon: '🐟', color: '#f1a66c' },
  { id: 'pejerrey', name: 'Pejerrey', icon: '🐠', color: '#8dd5e8' },
  { id: 'carpa', name: 'Carpa', icon: '🐡', color: '#e8b768' },
  { id: 'dorado', name: 'Dorado', icon: '🐟', color: '#f0c84e' },
  { id: 'sabalo', name: 'Sábalo', icon: '🐠', color: '#c0a6e8' },
  { id: 'lisa', name: 'Lisa', icon: '🐟', color: '#82cfaa' },
  { id: 'tararira', name: 'Tararira', icon: '🐊', color: '#a9d56d' },
  { id: 'corvina', name: 'Corvina', icon: '🐟', color: '#dda3bc' },
  { id: 'otros', name: 'Otros', icon: '🎣', color: '#d3ddd5' }
];
const STORE_KEY = 'pesca-argentina-v1';
const blankData = () => ({ points: [], shops: [], catches: [], tides: [], showShops: true });
let data;
try { data = { ...blankData(), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch { data = blankData(); }
let map, pointLayer, shopLayer, userLayer, selectedCoordinates = null, mapPickMode = null, userPosition = null, nearFirst = false, toastTimer, tideRequestId = 0;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(data));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const speciesOf = id => SPECIES.find(item => item.id === id) || SPECIES.at(-1);
const byId = (items, id) => items.find(item => item.id === id);
const localDate = (date = new Date()) => { const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return copy.toISOString().slice(0, 10); };
const dateTimeLocal = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const uid = () => globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random());
const showToast = message => { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2400); };
const distanceKm = (a, b) => { const rad = value => value * Math.PI / 180; const dLat = rad(b.lat - a.lat), dLon = rad(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)); };
const distanceLabel = coords => { if (!userPosition) return ''; const distance = distanceKm(userPosition, coords); return distance < 1 ? Math.round(distance * 1000) + ' m' : distance.toFixed(1) + ' km'; };
const emptyState = (icon, message, sub = '') => '<div class="empty-state"><div class="empty-symbol">' + icon + '</div>' + escapeHtml(message) + (sub ? '<br>' + escapeHtml(sub) : '') + '</div>';

function initMap() {
  map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([-38.4, -63.6], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  pointLayer = L.layerGroup().addTo(map); shopLayer = L.layerGroup().addTo(map); userLayer = L.layerGroup().addTo(map);
  map.on('click', event => {
    if (!mapPickMode) return;
    const coords = { lat: event.latlng.lat, lng: event.latlng.lng }, mode = mapPickMode;
    mapPickMode = null; $('#map-hint').classList.add('hidden');
    if (mode === 'point') openPointForm(coords); else openShopForm(coords);
  });
  renderMap();
}
function markerForPoint(point, rank = 0) {
  const fish = speciesOf(point.species);
  return L.marker([point.lat, point.lng], { icon: L.divIcon({ className: '', html: '<div class="fish-marker" style="--marker-color:' + fish.color + '"><span>' + fish.icon + '</span></div>', iconSize: [32, 38], iconAnchor: [16, 33], popupAnchor: [0, -31] }), title: point.name, zIndexOffset: rank * 20 });
}
function renderMap() {
  if (!pointLayer) return;
  pointLayer.clearLayers(); shopLayer.clearLayers();
  const speciesFilter = $('#map-species-filter')?.value || 'all';
  const points = data.points.filter(point => speciesFilter === 'all' || point.species === speciesFilter);
  const sort = $('#map-sort')?.value || 'recent';
  if (sort === 'near' && userPosition) points.sort((a, b) => distanceKm(userPosition, a) - distanceKm(userPosition, b));
  else points.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  points.forEach((point, index) => {
    const marker = markerForPoint(point, points.length - index);
    marker.bindPopup(pointPopup(point)).addTo(pointLayer);
  });
  if (data.showShops) data.shops.forEach(shop => L.marker([shop.lat, shop.lng], { icon: L.divIcon({ className: '', html: '<div class="shop-marker">⌂</div>', iconSize: [31, 31], iconAnchor: [15, 15] }), title: shop.name }).bindPopup(shopPopup(shop)).addTo(shopLayer));
  if (userPosition) {
    userLayer.clearLayers();
    L.circleMarker([userPosition.lat, userPosition.lng], { radius: 8, color: '#eafff4', weight: 3, fillColor: '#42c898', fillOpacity: 1 }).bindPopup('Estás acá').addTo(userLayer);
  }
}
function pointPopup(point) {
  const fish = speciesOf(point.species);
  return '<div class="popup-title">' + escapeHtml(point.name) + '</div><div class="popup-detail">' + fish.icon + ' ' + fish.name + (point.date ? ' · ' + formatDate(point.date) : '') + '</div><div class="popup-actions"><button data-popup-detail="' + point.id + '">Ver punto</button><button data-popup-catch="' + point.id + '">＋ Captura</button></div>';
}
function shopPopup(shop) { return '<div class="popup-title">⌂ ' + escapeHtml(shop.name) + '</div><div class="popup-detail">' + escapeHtml(shop.address || 'Tienda de pesca') + '</div>' + (shop.phone ? '<div class="popup-detail">' + escapeHtml(shop.phone) + '</div>' : ''); }
function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) { if (!value) return ''; const parsed = new Date(value.length === 10 ? value + 'T12:00:00' : value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('es-AR', options).format(parsed); }

function startMapPick(mode) {
  mapPickMode = mode; closeModal(); $('#map-hint').classList.remove('hidden');
  if (window.innerWidth < 700) switchTab('mapa');
}
function getLocation() {
  if (!navigator.geolocation) { showToast('Este dispositivo no ofrece geolocalización.'); return; }
  $('#gps-status').classList.remove('live'); $('#gps-status').innerHTML = '<i></i> Buscando…';
  navigator.geolocation.getCurrentPosition(position => {
    userPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
    $('#gps-status').classList.add('live'); $('#gps-status').innerHTML = '<i></i> GPS activo';
    renderMap(); map.setView([userPosition.lat, userPosition.lng], 12); renderSearch(); renderShops();
    const nearby = $('#nearby-search'); if (nearby.classList.contains('enabled')) nearby.querySelector('.nearby-state').textContent = 'Activo';
    showToast('Ubicación encontrada');
  }, error => { $('#gps-status').innerHTML = '<i></i> Sin GPS'; const nearby = $('#nearby-search'); if (nearby.classList.contains('enabled')) nearby.querySelector('.nearby-state').textContent = 'Activar'; showToast(error.code === 1 ? 'Permití el acceso a tu ubicación para usar GPS.' : 'No se pudo obtener la ubicación.'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}
function switchTab(name) {
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  $$('.tab-page').forEach(page => page.classList.toggle('active', page.id === 'page-' + name));
  if (name === 'mapa' && map) setTimeout(() => map.invalidateSize(), 80);
  if (name === 'capturas') renderCaptures();
  if (name === 'mareas') renderTides();
  if (name === 'tiendas') renderShops();
  if (name === 'buscar') renderSearch();
}
function speciesOptions(selected = '') { return SPECIES.map(item => '<option value="' + item.id + '" ' + (item.id === selected ? 'selected' : '') + '>' + item.icon + ' ' + item.name + '</option>').join(''); }
function modal(content) { $('#modal-root').innerHTML = '<div class="modal-backdrop"><div class="modal-sheet"><div class="modal-grabber"></div>' + content + '</div></div>'; $('.modal-backdrop').addEventListener('click', event => { if (event.target.classList.contains('modal-backdrop')) closeModal(); }); }
function closeModal() { $('#modal-root').innerHTML = ''; }
function modalHeader(title, subtitle = '') { return '<div class="modal-heading"><div><h2>' + title + '</h2>' + (subtitle ? '<p>' + subtitle + '</p>' : '') + '</div><button class="modal-close" data-close aria-label="Cerrar">×</button></div>'; }
function openPointForm(coords) {
  selectedCoordinates = coords;
  modal(modalHeader('Nuevo punto de pesca', 'Marcá un buen lugar para volver.') + '<form id="point-form" class="modal-form"><label>Nombre del lugar<input name="name" required maxlength="60" placeholder="Ej. Costanera norte"></label><div class="two-col"><label>Tipo de pez<select name="species">' + speciesOptions('pejerrey') + '</select></label><label>Fecha de carga<input name="date" type="date" value="' + localDate() + '"></label></div><label>Notas<textarea name="notes" rows="3" maxlength="500" placeholder="Acceso, profundidad, señuelos..."></textarea></label><div class="modal-info">⌖ ' + coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5) + '</div><button class="primary-button full-button" type="submit">Guardar punto</button></form>');
  $('#point-form').addEventListener('submit', event => { event.preventDefault(); const form = new FormData(event.currentTarget); const point = { id: uid(), name: form.get('name').trim(), lat: coords.lat, lng: coords.lng, species: form.get('species'), notes: form.get('notes').trim(), date: form.get('date') || localDate() }; data.points.push(point); save(); refreshAll(); closeModal(); map.setView([point.lat, point.lng], Math.max(map.getZoom(), 11)); showToast('Punto guardado en tu mapa'); });
}
function chooseShopLocation() {
  modal(modalHeader('Ubicación de la tienda', 'Elegí cómo marcarla.') + '<div class="modal-form"><button id="shop-current-location" class="primary-button full-button">◎ Usar mi ubicación</button><button id="shop-map-location" class="secondary-button">Marcar en el mapa</button></div>');
  $('#shop-current-location').onclick = () => { if (userPosition) { openShopForm(userPosition); return; } if (!navigator.geolocation) { showToast('Geolocalización no disponible.'); return; } navigator.geolocation.getCurrentPosition(position => openShopForm({ lat: position.coords.latitude, lng: position.coords.longitude }), () => showToast('No se pudo obtener la ubicación.'), { enableHighAccuracy: true, timeout: 12000 }); };
  $('#shop-map-location').onclick = () => startMapPick('shop');
}
function openShopForm(coords) {
  selectedCoordinates = coords;
  modal(modalHeader('Agregar tienda', 'Un dato útil para la comunidad pescadora.') + '<form id="shop-form" class="modal-form"><label>Nombre<input name="name" required maxlength="60" placeholder="Nombre de la tienda"></label><label>Dirección o localidad<input name="address" maxlength="100" placeholder="Barrio, ciudad"></label><label>Teléfono (opcional)<input name="phone" type="tel" maxlength="30" placeholder="Teléfono de contacto"></label><div class="modal-info">⌖ ' + coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5) + '</div><button class="primary-button full-button" type="submit">Guardar tienda</button></form>');
  $('#shop-form').addEventListener('submit', event => { event.preventDefault(); const form = new FormData(event.currentTarget); data.shops.push({ id: uid(), name: form.get('name').trim(), address: form.get('address').trim(), phone: form.get('phone').trim(), lat: coords.lat, lng: coords.lng, date: localDate() }); save(); refreshAll(); closeModal(); switchTab('tiendas'); showToast('Tienda agregada al mapa'); });
}
function refreshPointSelects() {
  const tidePlace = $('#tide-place').value, catchPlace = $('#catch-place-filter').value, mapSpecies = $('#map-species-filter').value;
  const pointOptions = data.points.map(point => '<option value="' + point.id + '">' + escapeHtml(point.name) + ' · ' + speciesOf(point.species).name + '</option>').join('');
  $('#tide-place').innerHTML = pointOptions || '<option value="">Primero agregá un punto</option>';
  $('#catch-place-filter').innerHTML = '<option value="all">Todos los puntos</option>' + data.points.map(point => '<option value="' + point.id + '">' + escapeHtml(point.name) + '</option>').join('');
  $('#map-species-filter').innerHTML = '<option value="all">Todos los peces</option>' + SPECIES.map(item => '<option value="' + item.id + '">' + item.icon + ' ' + item.name + '</option>').join('');
  if (data.points.some(point => point.id === tidePlace)) $('#tide-place').value = tidePlace;
  if (catchPlace === 'all' || data.points.some(point => point.id === catchPlace)) $('#catch-place-filter').value = catchPlace;
  if (mapSpecies === 'all' || SPECIES.some(item => item.id === mapSpecies)) $('#map-species-filter').value = mapSpecies;
}
function openCatchForm(pointId = '') {
  if (!data.points.length) { showToast('Guardá un punto de pesca antes de registrar capturas.'); return; }
  const points = data.points.map(point => '<option value="' + point.id + '" ' + (point.id === pointId ? 'selected' : '') + '>' + escapeHtml(point.name) + ' · ' + speciesOf(point.species).name + '</option>').join('');
  modal(modalHeader('Registrar captura', 'Guardá el recuerdo y las condiciones.') + '<form id="catch-form" class="modal-form"><label>Foto (opcional)<input class="photo-input" name="photo" type="file" accept="image/*"></label><div class="two-col"><label>Especie<select name="species">' + speciesOptions('pejerrey') + '</select></label><label>Tamaño / peso<input name="size" maxlength="40" placeholder="Ej. 38 cm · 1,2 kg"></label></div><div class="two-col"><label>Cebo usado<input name="bait" maxlength="50" placeholder="Mojarra, lombriz..."></label><label>Punto de pesca<select name="pointId">' + points + '</select></label></div><label>Fecha y hora<input name="date" type="datetime-local" value="' + dateTimeLocal() + '"></label><button class="primary-button full-button" type="submit">Guardar captura</button></form>');
  $('#catch-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget), point = byId(data.points, form.get('pointId')), button = $('button[type="submit"]', event.currentTarget);
    button.disabled = true; button.textContent = 'Guardando…';
    let photo = ''; const file = form.get('photo');
    if (file && file.size) { try { photo = await compressPhoto(file); } catch { showToast('No se pudo cargar esa foto.'); } }
    let weatherSnapshot = null;
    try { weatherSnapshot = await getWeather(point.lat, point.lng); } catch {}
    data.catches.unshift({ id: uid(), pointId: point.id, species: form.get('species'), size: form.get('size').trim(), bait: form.get('bait').trim(), date: form.get('date') || dateTimeLocal(), photo, weather: weatherSnapshot ? { temperature: weatherSnapshot.current.temperature_2m, wind: weatherSnapshot.current.wind_speed_10m, pressure: weatherSnapshot.current.surface_pressure, rain: weatherSnapshot.current.precipitation } : null });
    save(); closeModal(); renderCaptures(); showToast('Captura guardada en tu bitácora');
  });
}
function compressPhoto(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => { const image = new Image(); image.onerror = reject; image.onload = () => { const scale = Math.min(1, 900 / Math.max(image.width, image.height)), canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', .78)); }; image.src = reader.result; }; reader.readAsDataURL(file); });
}
function renderCaptures() {
  const catches = [...data.catches].sort((a, b) => new Date(b.date) - new Date(a.date));
  const counts = {}; catches.forEach(item => counts[item.species] = (counts[item.species] || 0) + 1);
  const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const hours = {}; catches.forEach(item => { const hour = new Date(item.date).getHours(); const band = hour < 6 ? 'Madrugada' : hour < 12 ? 'Mañana' : hour < 18 ? 'Tarde' : 'Noche'; hours[band] = (hours[band] || 0) + 1; });
  const bestHour = Object.entries(hours).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  $('#catch-stats').innerHTML = '<div class="stat-card"><div class="stat-value">' + catches.length + '</div><div class="stat-label">Capturas totales</div></div><div class="stat-card"><div class="stat-value">' + (favorite ? escapeHtml(speciesOf(favorite[0]).name) : '—') + '</div><div class="stat-label">Más frecuente</div></div><div class="stat-card"><div class="stat-value" style="font-size:14px">' + bestHour + '</div><div class="stat-label">Mejor horario</div></div>';
  refreshPointSelects();
  const speciesFilter = $('#catch-species-filter').value, placeFilter = $('#catch-place-filter').value, from = $('#catch-date-from').value, to = $('#catch-date-to').value;
  const visible = catches.filter(item => (!speciesFilter || speciesFilter === 'all' || item.species === speciesFilter) && (placeFilter === 'all' || item.pointId === placeFilter) && (!from || item.date.slice(0, 10) >= from) && (!to || item.date.slice(0, 10) <= to));
  $('#catch-list').innerHTML = visible.length ? visible.map(item => {
    const fish = speciesOf(item.species), point = byId(data.points, item.pointId);
    const picture = item.photo ? '<img class="record-photo" src="' + item.photo + '" alt="Foto de captura">' : '<div class="record-icon">' + fish.icon + '</div>';
    const weather = item.weather ? '<span class="pill">' + Math.round(item.weather.temperature) + '° · viento ' + Math.round(item.weather.wind) + ' km/h</span>' : '';
    return '<article class="record-card">' + picture + '<div class="record-body"><div class="record-title-row"><span class="record-title">' + fish.name + '</span><button class="card-delete" data-delete-catch="' + item.id + '" aria-label="Eliminar captura">×</button></div><div class="subline">' + escapeHtml(point?.name || 'Punto eliminado') + ' · ' + formatDate(item.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</div>' + (item.size || item.bait ? '<div class="record-meta">' + (item.size ? '<span class="pill">' + escapeHtml(item.size) + '</span>' : '') + (item.bait ? '<span class="pill">Cebo: ' + escapeHtml(item.bait) + '</span>' : '') + weather + '</div>' : '') + '</div></article>';
  }).join('') : emptyState('◉', catches.length ? 'No hay capturas con esos filtros.' : 'Todavía no registraste capturas.', catches.length ? 'Probá cambiar los filtros.' : 'Tu próxima salida empieza acá.');
}

function moonInfo(dateValue) {
  const date = new Date((dateValue || localDate()) + 'T12:00:00');
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14), day = 86400000, cycle = 29.530588853;
  const age = ((date.getTime() - knownNewMoon) / day % cycle + cycle) % cycle, fraction = age / cycle;
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * fraction)) * 50);
  const phases = [[1.85, 'Luna nueva', '🌑'], [5.53, 'Luna creciente', '🌒'], [9.22, 'Cuarto creciente', '🌓'], [12.91, 'Luna gibosa creciente', '🌔'], [16.61, 'Luna llena', '🌕'], [20.3, 'Luna gibosa menguante', '🌖'], [23.99, 'Cuarto menguante', '🌗'], [27.68, 'Luna menguante', '🌘'], [29.54, 'Luna nueva', '🌑']];
  const phase = phases.find(item => age < item[0]) || phases[0];
  return { name: phase[1], icon: phase[2], illumination, age: age.toFixed(1) };
}
function renderMoon(date = localDate()) {
  const moon = moonInfo(date); $('#current-moon').textContent = moon.icon;
  $('#moon-card').innerHTML = '<div class="moon-symbol">' + moon.icon + '</div><div><div class="moon-name">' + moon.name + '</div><div class="moon-detail">' + formatDate(date) + ' · día ' + moon.age + ' del ciclo</div></div><div class="moon-illum">' + moon.illumination + '%<div class="moon-detail">iluminada</div></div>';
}
function loadTideForm() {
  const pointId = $('#tide-place').value, date = $('#tide-date').value || localDate();
  const entry = data.tides.find(item => item.pointId === pointId && item.date === date);
  ['high1', 'low1', 'high2', 'low2'].forEach((key, index) => { const fields = ['tide-high-1', 'tide-low-1', 'tide-high-2', 'tide-low-2']; $('#' + fields[index]).value = entry?.[key] || ''; });
  $('#tide-notes').value = entry?.notes || ''; renderMoon(date);
}
async function loadAutomaticTides() {
  const container = $('#automatic-tides'), date = $('#tide-date').value || localDate();
  if (container.dataset.date === date && container.dataset.loaded === 'true') return;
  const requestId = ++tideRequestId;
  container.dataset.date = date; container.dataset.loaded = 'false';
  container.innerHTML = '<div class="auto-tide-status">Cargando tabla de La Plata…</div>';
  try {
    https://pescador.matiasarturi.workers.dev/api/tides?date=2026-10-01

    const result = await response.json();
    if (requestId !== tideRequestId) return;
    if (!response.ok) throw new Error(result.error || 'No se pudo cargar la tabla.');
    container.innerHTML = '<div class="auto-tide-card"><div class="auto-tide-summary"><b>' + formatDate(result.date) + '</b><span>La Plata · Buenos Aires</span></div><div class="auto-tide-events">' + result.events.map(item => '<div class="auto-tide-event ' + (item.type === 'Pleamar' ? 'high' : 'low') + '"><span class="auto-tide-type">' + escapeHtml(item.type) + '</span><b>' + escapeHtml(item.time) + '</b><span>' + (typeof item.heightMeters === 'number' ? item.heightMeters.toFixed(1) + ' m' : 'Altura s/d') + '</span></div>').join('') + '</div><div class="auto-tide-note">Predicción de referencia para zonas costeras; no válida para navegación.</div><a class="auto-tide-source" href="https://tablademareas.com/ar/buenos-aires/la-plata" target="_blank" rel="noopener noreferrer">Fuente: tablademareas.com ↗</a></div>';
    container.dataset.loaded = 'true';
  } catch (error) {
    if (requestId !== tideRequestId) return;
    container.innerHTML = '<div class="auto-tide-status error">' + escapeHtml(error.message || 'No se pudo cargar la tabla.') + ' Probá otra fecha más tarde.</div>';
  }
}
function renderTides() {
  refreshPointSelects(); $('#tide-date').value ||= localDate(); loadTideForm(); loadAutomaticTides();
  const entries = [...data.tides].sort((a, b) => b.date.localeCompare(a.date));
  $('#tide-list').innerHTML = entries.length ? entries.map(entry => {
    const point = byId(data.points, entry.pointId), moon = moonInfo(entry.date);
    const times = [['Pleamar', entry.high1, 'tide-high'], ['Bajamar', entry.low1, 'tide-low'], ['Pleamar', entry.high2, 'tide-high'], ['Bajamar', entry.low2, 'tide-low']].filter(item => item[1]);
    return '<article class="tide-card"><div class="record-icon">' + moon.icon + '</div><div class="tide-body"><div class="card-title-row"><span class="card-title">' + escapeHtml(point?.name || 'Punto eliminado') + '</span><button class="card-delete" data-delete-tide="' + entry.id + '" aria-label="Eliminar tabla">×</button></div><div class="card-subline">' + formatDate(entry.date) + ' · ' + moon.name + ' · ' + moon.illumination + '%</div><div class="tide-times">' + (times.length ? times.map(item => '<span class="tide-time"><span class="' + item[2] + '">' + item[0] + '</span> ' + item[1] + '</span>').join('') : '<span class="tide-time">Sin horarios cargados</span>') + '</div>' + (entry.notes ? '<div class="card-subline">' + escapeHtml(entry.notes) + '</div>' : '') + '</div></article>';
  }).join('') : emptyState('◐', 'Aún no hay tablas guardadas.', data.points.length ? 'Elegí un punto y cargá sus horarios.' : 'Primero agregá un punto de pesca.');
}
function saveTide() {
  const pointId = $('#tide-place').value, date = $('#tide-date').value;
  if (!pointId) { showToast('Agregá un punto de pesca para cargar la tabla.'); return; }
  if (!date) { showToast('Elegí una fecha para la tabla.'); return; }
  let entry = data.tides.find(item => item.pointId === pointId && item.date === date);
  if (!entry) { entry = { id: uid(), pointId, date }; data.tides.push(entry); }
  entry.high1 = $('#tide-high-1').value; entry.low1 = $('#tide-low-1').value; entry.high2 = $('#tide-high-2').value; entry.low2 = $('#tide-low-2').value; entry.notes = $('#tide-notes').value.trim();
  const moon = moonInfo(date); entry.moon = moon.name; entry.illumination = moon.illumination; save(); renderTides(); showToast('Tabla de mareas guardada');
}

function renderShops() {
  const query = $('#shop-search').value.trim().toLowerCase();
  const shops = data.shops.filter(shop => (shop.name + ' ' + (shop.address || '')).toLowerCase().includes(query));
  $('#toggle-shops span:nth-child(2)').textContent = data.showShops ? 'Mostrando tiendas en el mapa' : 'Tiendas ocultas en el mapa';
  $('#toggle-shops .toggle-switch').classList.toggle('on', data.showShops);
  $('#shop-list').innerHTML = shops.length ? shops.map(shop => '<article class="shop-card"><div class="shop-icon">⌂</div><div class="shop-body"><div class="card-title-row"><span class="card-title">' + escapeHtml(shop.name) + '</span><span class="shop-distance">' + distanceLabel(shop) + '</span></div><div class="card-subline">' + escapeHtml(shop.address || 'Tienda de pesca') + (shop.phone ? ' · ' + escapeHtml(shop.phone) : '') + '</div><div class="shop-actions"><button class="small-button" data-focus-shop="' + shop.id + '">Ver en mapa</button><button class="small-button" data-delete-shop="' + shop.id + '">Eliminar</button></div></div></article>').join('') : emptyState('⌂', query ? 'No encontramos tiendas con ese nombre.' : 'Todavía no hay tiendas cargadas.', 'Sumá tu casa de pesca favorita.');
}
function renderSearch() {
  const query = $('#global-search').value.trim().toLowerCase();
  const all = [...data.points.map(item => ({ ...item, kind: 'point', title: item.name, detail: speciesOf(item.species).icon + ' ' + speciesOf(item.species).name, icon: speciesOf(item.species).icon })), ...data.shops.map(item => ({ ...item, kind: 'shop', title: item.name, detail: item.address || 'Tienda de pesca', icon: '⌂' }))];
  let matches = all.filter(item => !query || (item.title + ' ' + item.detail + ' ' + (item.notes || '')).toLowerCase().includes(query));
  if (nearFirst && userPosition) matches.sort((a, b) => distanceKm(userPosition, a) - distanceKm(userPosition, b));
  else matches.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('#search-results').innerHTML = matches.length ? matches.map(item => '<article class="result-card" data-result-kind="' + item.kind + '" data-result-id="' + item.id + '"><div class="result-icon">' + item.icon + '</div><div class="result-body"><div><div class="result-type">' + (item.kind === 'point' ? 'PUNTO DE PESCA' : 'TIENDA') + '</div><div class="card-title">' + escapeHtml(item.title) + '</div><div class="card-subline">' + escapeHtml(item.detail) + '</div></div><span class="result-distance">' + (userPosition ? distanceLabel(item) : '') + '</span></div></article>').join('') : emptyState('⌕', query ? 'No encontramos resultados.' : 'Todavía no hay lugares guardados.', 'Probá buscar una especie, lugar o tienda.');
}
function toggleNearby() {
  if (!userPosition) { if (navigator.geolocation) { getLocation(); nearFirst = true; $('#nearby-search').classList.add('enabled'); $('#nearby-search .nearby-state').textContent = 'Buscando GPS…'; } else showToast('Geolocalización no disponible.'); return; }
  nearFirst = !nearFirst; $('#nearby-search').classList.toggle('enabled', nearFirst); $('#nearby-search .nearby-state').textContent = nearFirst ? 'Activo' : 'Activar'; renderSearch(); renderMap(); renderShops();
}

async function getWeather(lat, lng) {
  const params = new URLSearchParams({ latitude: lat, longitude: lng, current: 'temperature_2m,relative_humidity_2m,precipitation,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max', forecast_days: '3', timezone: 'auto' });
  const response = await fetch('https://api.open-meteo.com/v1/forecast?' + params.toString());
  if (!response.ok) throw new Error('No se pudo consultar el clima.');
  return response.json();
}
const weatherDescription = code => code === 0 ? 'Despejado' : code <= 3 ? 'Nublado' : code <= 48 ? 'Neblina' : code <= 67 ? 'Lluvia' : code <= 77 ? 'Nieve' : code <= 82 ? 'Chaparrones' : code <= 86 ? 'Nieve' : 'Tormenta';
async function showWeather(lat, lng, pointName) {
  modal(modalHeader('Clima en vivo', pointName ? '📍 ' + escapeHtml(pointName) : 'Según tu ubicación') + '<div class="modal-info">Consultando pronóstico…</div>');
  try {
    const weather = await getWeather(lat, lng), current = weather.current, d = weather.daily;
    const rain = current.precipitation ?? 0, wind = current.wind_speed_10m ?? 0;
    const good = wind <= 22 && rain < 1 && current.weather_code < 95;
    const forecast = d.time.map((date, index) => '<div class="forecast-day">' + formatDate(date, { weekday: 'short' }) + '<b>' + Math.round(d.temperature_2m_min[index]) + '° / ' + Math.round(d.temperature_2m_max[index]) + '°</b>' + Math.round(d.precipitation_probability_max[index] || 0) + '% lluvia<br>Viento ' + Math.round(d.wind_speed_10m_max[index]) + '</div>').join('');
    $('#modal-root').innerHTML = '<div class="modal-backdrop"><div class="modal-sheet"><div class="modal-grabber"></div>' + modalHeader('Clima en vivo', (pointName ? '📍 ' + escapeHtml(pointName) : 'Según tu ubicación') + ' · ' + weatherDescription(current.weather_code)) + '<div class="detail-grid"><div class="weather-tile"><div class="weather-value">' + Math.round(current.temperature_2m) + '°C</div><div class="weather-label">Temperatura</div></div><div class="weather-tile"><div class="weather-value">' + Math.round(wind) + ' km/h</div><div class="weather-label">Viento · ' + Math.round(current.wind_direction_10m) + '°</div></div><div class="weather-tile"><div class="weather-value">' + Math.round(current.surface_pressure) + ' hPa</div><div class="weather-label">Presión</div></div><div class="weather-tile"><div class="weather-value">' + Number(rain).toFixed(1) + ' mm</div><div class="weather-label">Lluvia actual</div></div></div><div class="weather-alert ' + (good ? 'good' : 'bad') + '">' + (good ? '✓ Buenas condiciones para pescar ahora.' : '⚠ Condiciones poco favorables. Revisá viento y lluvia antes de salir.') + '</div><div class="detail-section"><h3>Pronóstico · 3 días</h3><div class="forecast-row">' + forecast + '</div></div></div></div>';
    $('.modal-backdrop').addEventListener('click', event => { if (event.target.classList.contains('modal-backdrop')) closeModal(); });
  } catch { $('#modal-root').innerHTML = '<div class="modal-backdrop"><div class="modal-sheet"><div class="modal-grabber"></div>' + modalHeader('Clima no disponible') + '<div class="modal-info">No pudimos conectar con Open-Meteo. Revisá tu conexión e intentá de nuevo.</div></div></div>'; $('.modal-backdrop').addEventListener('click', event => { if (event.target.classList.contains('modal-backdrop')) closeModal(); }); }
}
async function openPointDetail(point) {
  const fish = speciesOf(point.species), moon = moonInfo(localDate());
  const tides = data.tides.filter(item => item.pointId === point.id).sort((a, b) => b.date.localeCompare(a.date));
  const catches = data.catches.filter(item => item.pointId === point.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const tideHtml = tides.length ? tides.slice(0, 3).map(entry => '<p><b>' + formatDate(entry.date) + '</b> · ' + [entry.high1 && 'Pleamar ' + entry.high1, entry.low1 && 'Bajamar ' + entry.low1, entry.high2 && 'Pleamar ' + entry.high2, entry.low2 && 'Bajamar ' + entry.low2].filter(Boolean).join(' · ') + ' · ' + moonInfo(entry.date).icon + ' ' + moonInfo(entry.date).name + '</p>').join('') : '<p>No hay tabla cargada para este punto.</p>';
  const catchHtml = catches.length ? catches.slice(0, 5).map(item => '<p>' + speciesOf(item.species).icon + ' <b>' + speciesOf(item.species).name + '</b>' + (item.size ? ' · ' + escapeHtml(item.size) : '') + ' · ' + formatDate(item.date, { day: 'numeric', month: 'short' }) + '</p>').join('') : '<p>Aún no hay capturas registradas acá.</p>';
  const photos = catches.filter(item => item.photo);
  const photoHtml = photos.length ? '<div class="point-photo-grid">' + photos.map(item => '<figure class="point-photo-card"><img src="' + escapeHtml(item.photo) + '" alt="' + escapeHtml(speciesOf(item.species).name) + ' capturada en ' + escapeHtml(point.name) + '" loading="lazy"><figcaption><b>' + speciesOf(item.species).name + '</b><span>' + formatDate(item.date, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</span></figcaption></figure>').join('') + '</div>' : '<p>Aún no hay fotos cargadas en este punto.</p>';
  modal(modalHeader(escapeHtml(point.name), fish.icon + ' ' + fish.name + ' · cargado ' + formatDate(point.date)) + '<div class="modal-info">⌖ ' + point.lat.toFixed(5) + ', ' + point.lng.toFixed(5) + (point.notes ? '<br>' + escapeHtml(point.notes) : '') + '</div><div class="detail-section"><h3>Clima</h3><div id="point-weather" class="modal-info">Consultando clima…</div></div><div class="detail-section"><h3>Mareas y luna</h3>' + tideHtml + '</div><div class="detail-section"><h3>Fotos · ' + photos.length + '</h3>' + photoHtml + '</div><div class="detail-section"><h3>Capturas en este punto</h3>' + catchHtml + '</div><div class="modal-actions"><button id="point-add-catch" class="primary-button">＋ Captura</button><button id="point-view-weather" class="secondary-button">Clima 3 días</button></div><div class="modal-actions"><button id="point-edit-tides" class="secondary-button">Cargar mareas</button><button id="point-delete" class="danger-button">Eliminar punto</button></div>');
  getWeather(point.lat, point.lng).then(weather => { const current = weather.current, good = current.wind_speed_10m <= 22 && current.precipitation < 1 && current.weather_code < 95; const el = $('#point-weather'); if (!el) return; el.innerHTML = Math.round(current.temperature_2m) + '°C · viento ' + Math.round(current.wind_speed_10m) + ' km/h · presión ' + Math.round(current.surface_pressure) + ' hPa · lluvia ' + Number(current.precipitation).toFixed(1) + ' mm<div class="weather-alert ' + (good ? 'good' : 'bad') + '">' + (good ? '✓ Buena ventana para pescar' : '⚠ Condiciones poco favorables') + '</div>'; }).catch(() => { const el = $('#point-weather'); if (el) el.textContent = 'Clima no disponible sin conexión.'; });
  $('#point-add-catch').onclick = () => openCatchForm(point.id);
  $('#point-view-weather').onclick = () => showWeather(point.lat, point.lng, point.name);
  $('#point-edit-tides').onclick = () => { closeModal(); switchTab('mareas'); $('#tide-place').value = point.id; $('#tide-date').value = localDate(); loadTideForm(); };
  $('#point-delete').onclick = () => { if (confirm('¿Eliminar este punto y las tablas de marea asociadas?')) { data.points = data.points.filter(item => item.id !== point.id); data.tides = data.tides.filter(item => item.pointId !== point.id); save(); closeModal(); refreshAll(); showToast('Punto eliminado'); } };
}
function refreshAll() { refreshPointSelects(); renderMap(); renderCaptures(); renderTides(); renderShops(); renderSearch(); }

$('.bottom-nav').addEventListener('click', event => { const button = event.target.closest('[data-tab]'); if (button) switchTab(button.dataset.tab); });
$('#header-locate').onclick = getLocation;
$('#header-weather').onclick = () => { if (userPosition) showWeather(userPosition.lat, userPosition.lng); else if (navigator.geolocation) navigator.geolocation.getCurrentPosition(position => { userPosition = { lat: position.coords.latitude, lng: position.coords.longitude }; $('#gps-status').classList.add('live'); $('#gps-status').innerHTML = '<i></i> GPS activo'; renderMap(); showWeather(userPosition.lat, userPosition.lng); }, () => showToast('Permití la ubicación para consultar el clima.'), { enableHighAccuracy: true, timeout: 12000 }); else showToast('Geolocalización no disponible.'); };
$('#add-point-btn').onclick = () => startMapPick('point');
$('#cancel-map-pick').onclick = () => { mapPickMode = null; $('#map-hint').classList.add('hidden'); };
$('#map-species-filter').addEventListener('change', renderMap);
$('#map-sort').addEventListener('change', event => { if (event.target.value === 'near' && !userPosition) getLocation(); renderMap(); });
$('#add-catch-btn').onclick = () => openCatchForm();
$('#catch-species-filter').innerHTML = '<option value="all">Todas las especies</option>' + SPECIES.map(item => '<option value="' + item.id + '">' + item.name + '</option>').join('');
['#catch-species-filter', '#catch-place-filter', '#catch-date-from', '#catch-date-to'].forEach(selector => $(selector).addEventListener('change', renderCaptures));
$('#clear-catch-filters').onclick = () => { $('#catch-species-filter').value = 'all'; $('#catch-place-filter').value = 'all'; $('#catch-date-from').value = ''; $('#catch-date-to').value = ''; renderCaptures(); };
$('#add-shop-btn').onclick = chooseShopLocation;
$('#toggle-shops').onclick = () => { data.showShops = !data.showShops; save(); renderMap(); renderShops(); };
$('#shop-search').addEventListener('input', renderShops);
$('#tide-place').addEventListener('change', loadTideForm); $('#tide-date').addEventListener('change', () => { loadTideForm(); loadAutomaticTides(); }); $('#save-tide-btn').onclick = saveTide;
$('#global-search').addEventListener('input', renderSearch); $('#clear-search').onclick = () => { $('#global-search').value = ''; renderSearch(); };
$('#nearby-search').onclick = toggleNearby;
$('#modal-root').addEventListener('click', event => {
  if (event.target.closest('[data-close]')) closeModal();
  const pointDetail = event.target.closest('[data-popup-detail]'); if (pointDetail) { const point = byId(data.points, pointDetail.dataset.popupDetail); if (point) openPointDetail(point); }
  const pointCatch = event.target.closest('[data-popup-catch]'); if (pointCatch) { const id = pointCatch.dataset.popupCatch; openCatchForm(id); }
});
$('#map').addEventListener('click', event => {
  const detailButton = event.target.closest('[data-popup-detail]'), catchButton = event.target.closest('[data-popup-catch]');
  if (detailButton) { const point = byId(data.points, detailButton.dataset.popupDetail); if (point) openPointDetail(point); }
  if (catchButton) openCatchForm(catchButton.dataset.popupCatch);
});
document.addEventListener('click', event => {
  const deleteCatch = event.target.closest('[data-delete-catch]'); if (deleteCatch) { data.catches = data.catches.filter(item => item.id !== deleteCatch.dataset.deleteCatch); save(); renderCaptures(); showToast('Captura eliminada'); }
  const deleteTide = event.target.closest('[data-delete-tide]'); if (deleteTide) { data.tides = data.tides.filter(item => item.id !== deleteTide.dataset.deleteTide); save(); renderTides(); showToast('Tabla eliminada'); }
  const deleteShop = event.target.closest('[data-delete-shop]'); if (deleteShop) { data.shops = data.shops.filter(item => item.id !== deleteShop.dataset.deleteShop); save(); refreshAll(); showToast('Tienda eliminada'); }
  const focusShop = event.target.closest('[data-focus-shop]'); if (focusShop) { const shop = byId(data.shops, focusShop.dataset.focusShop); if (shop) { switchTab('mapa'); map.setView([shop.lat, shop.lng], 13); } }
  const result = event.target.closest('[data-result-kind]'); if (result) { if (result.dataset.resultKind === 'point') { const point = byId(data.points, result.dataset.resultId); switchTab('mapa'); if (point) { map.setView([point.lat, point.lng], 13); openPointDetail(point); } } else { const shop = byId(data.shops, result.dataset.resultId); switchTab('mapa'); if (shop) map.setView([shop.lat, shop.lng], 13); } }
});
$('#catch-date-from').max = localDate(); $('#catch-date-to').max = localDate(); $('#tide-date').value = localDate();
initMap(); refreshAll();
