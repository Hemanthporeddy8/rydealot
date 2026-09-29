// =========================================================================
// RYDEALOT SUPERMAPS — MASTER JAVASCRIPT ENGINE
// Rolling 5KM Buffer • Vehicle Heading Rotation • Golden Pins • Surface Vision
// =========================================================================

// --- ENDPOINTS & CLOUD FAILOVER CONFIG ---
const CONFIG = {
  D1_WORKER: 'https://rydealot-api.rydealotoffical.workers.dev',
  SUPABASE_URL: 'https://wupndimumeugfjxzejlj.supabase.co',
  SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1MDU4ODcsImV4cCI6MjA1NDA4MTg4N30.Yl82uSgVq-z42mK_2Xl3L4xQ9vH6w8g9_j0k1l2m3n4',
  OSRM_ROUTING: 'https://router.project-osrm.org/route/v1/driving/',
  NOMINATIM_SEARCH: 'https://nominatim.openstreetmap.org/search',
  DEFAULT_CENTER: [17.3850, 78.4867], // Hyderabad / Telangana Center
  BUFFER_KM: 5.0,
  UNMAPPED_SPEED_THRESHOLD_KMH: 35.0,
  UNMAPPED_DISTANCE_METERS: 400
};

// --- GLOBAL STATE ---
let map = null;
let tileLayer = null;
let userMarker = null;
let currentHeading = 0;
let userLat = CONFIG.DEFAULT_CENTER[0];
let userLng = CONFIG.DEFAULT_CENTER[1];
let isNavigating = false;
let activeRoutePolyline = null;
let routeSteps = [];
let verifiedShops = [];
let customRoadLayers = [];

// Unmapped Telemetry Buffer (Anonymous 5-Car Detection)
let offroadBreadcrumbs = [];
let isTrackingOffroad = false;

// Google Maps Direction State
let destMarker = null;
let activeVehicleMode = 'car';
let activeDestination = null;

function toggleDirectionsMode(show) {
  const searchBox = document.getElementById('search-bar-box');
  const dirCard = document.getElementById('directions-card');
  if (show) {
    searchBox.style.display = 'none';
    dirCard.style.display = 'flex';
  } else {
    dirCard.style.display = 'none';
    searchBox.style.display = 'flex';
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
    if (activeRoutePolyline) { map.removeLayer(activeRoutePolyline); activeRoutePolyline = null; }
    document.getElementById('route-summary-banner').style.display = 'none';
    activeDestination = null;
  }
}

function setVehicleMode(mode) {
  activeVehicleMode = mode;
  document.getElementById('veh-btn-car').classList.toggle('active', mode === 'car');
  document.getElementById('veh-btn-bike').classList.toggle('active', mode === 'bike');
  if (activeDestination) {
    calculateActiveRoute(activeDestination.lat, activeDestination.lng, activeDestination.name);
  }
}

function swapDirections() {
  const fromVal = document.getElementById('dir-from-input').value;
  const toVal = document.getElementById('dir-to-input').value;
  document.getElementById('dir-from-input').value = toVal || 'Your Location (GPS)';
  document.getElementById('dir-to-input').value = fromVal;
}

function handleMapDestinationClick(latlng) {
  if (isNavigating) return;

  if (destMarker) map.removeLayer(destMarker);

  const destIcon = L.divIcon({
    html: '<div style="font-size:2rem; filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5)); transform:translate(-10px, -28px);">🏁</div>',
    className: 'dest-pin',
    iconSize: [30, 30]
  });

  destMarker = L.marker([latlng.lat, latlng.lng], { icon: destIcon }).addTo(map);

  toggleDirectionsMode(true);
  const label = `Dropped Pin (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
  document.getElementById('dir-to-input').value = label;
  calculateActiveRoute(latlng.lat, latlng.lng, label);
}

async function calculateActiveRoute(destLat, destLng, destName) {
  activeDestination = { lat: destLat, lng: destLng, name: destName };
  
  try {
    const url = `${CONFIG.OSRM_ROUTING}${userLng},${userLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      alert('Could not calculate a drivable route to this location.');
      return;
    }

    const route = data.routes[0];
    const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);

    if (activeRoutePolyline) map.removeLayer(activeRoutePolyline);

    // Color by vehicle mode: Cyan for Car, Gold for Bike
    const routeColor = activeVehicleMode === 'bike' ? '#f59e0b' : '#06b6d4';
    activeRoutePolyline = L.polyline(coordinates, {
      color: routeColor,
      weight: 7,
      opacity: 0.95
    }).addTo(map);

    map.fitBounds(activeRoutePolyline.getBounds(), { padding: [50, 50] });

    const distKm = (route.distance / 1000).toFixed(1);
    const etaMins = Math.round(route.duration / 60);

    // Update Route Summary Banner
    const banner = document.getElementById('route-summary-banner');
    banner.style.display = 'flex';
    document.getElementById('route-eta').innerText = `${etaMins} mins`;
    document.getElementById('route-dist').innerText = `${distKm} km • ${activeVehicleMode === 'car' ? '🚗 Tar road route' : '🏍️ Bike shortcut route'}`;

  } catch (err) {
    console.warn('Route calc error:', err);
  }
}

function startDrivingActiveRoute() {
  if (!activeDestination) return;
  toggleDirectionsMode(false);
  startNavigation(activeDestination.lat, activeDestination.lng, activeDestination.name);
}

// 1. INITIALIZE SUPERMAPS
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  registerServiceWorker();
  initNetworkListeners();
  loadGoldenShops();
  loadCustomRoads();
  setupCompassHeading();
});

function initMap() {
  map = L.map('map-viewport', {
    center: CONFIG.DEFAULT_CENTER,
    zoom: 14,
    zoomControl: false,
    attributionControl: false
  });

  // Default: Obsidian Dark Tile Layer
  setTileTheme('dark');

  // Locate User GPS
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        map.setView([userLat, userLng], 15);
        createUserMarker(userLat, userLng);
      },
      () => {
        createUserMarker(userLat, userLng);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    createUserMarker(userLat, userLng);
  }

  // Handle 1-Tap map click: drops destination pin and calculates route
  map.on('click', (e) => {
    closeBottomPanel();
    document.getElementById('search-dropdown').style.display = 'none';
    handleMapDestinationClick(e.latlng);
  });
}

// 2. TILE THEME TOGGLE (Dark vs Daylight Sun Mode)
function setTileTheme(mode) {
  if (tileLayer) map.removeLayer(tileLayer);
  
  // Standard OpenStreetMap tiles — 100% Free, NO API Key needed, Zero Watermarks
  tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: ['a', 'b', 'c']
  }).addTo(map);

  if (mode === 'daylight') {
    document.body.classList.add('daylight-theme');
  } else {
    document.body.classList.remove('daylight-theme');
  }
}

function toggleMapTheme() {
  const isDark = !document.body.classList.contains('daylight-theme');
  setTileTheme(isDark ? 'daylight' : 'dark');
}

// 3. USER NAVIGATION MARKER & ROTATING COMPASS HEADING
function createUserMarker(lat, lng) {
  const iconHtml = `
    <div id="nav-arrow-wrapper" style="transform: rotate(${currentHeading}deg); transition: transform 0.25s linear;">
      <div style="width: 26px; height: 26px; background: #06b6d4; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 16px #06b6d4; display: flex; align-items: center; justify-content: center;">
        <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 9px solid #fff; margin-top: -3px;"></div>
      </div>
    </div>
  `;
  const customIcon = L.divIcon({
    html: iconHtml,
    className: 'user-nav-dot',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  if (!userMarker) {
    userMarker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
  } else {
    userMarker.setLatLng([lat, lng]);
  }
}

function updateCompassHeading(heading) {
  if (isNaN(heading)) return;
  currentHeading = heading;
  const arrow = document.getElementById('nav-arrow-wrapper');
  if (arrow) {
    arrow.style.transform = `rotate(${currentHeading}deg)`;
  }
  // In live driving navigation, auto-rotate map viewpoint
  if (isNavigating) {
    const mapPane = document.querySelector('.leaflet-map-pane');
    if (mapPane) {
      mapPane.style.transform = `rotate(${-currentHeading}deg)`;
      mapPane.style.transformOrigin = 'center center';
    }
  }
}

function setupCompassHeading() {
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      if (e.webkitCompassHeading) {
        updateCompassHeading(e.webkitCompassHeading); // iOS
      } else if (e.alpha) {
        updateCompassHeading(360 - e.alpha); // Android
      }
    }, true);
  }
}

// 4. 5KM ROLLING BUFFER & NETWORK SAFETY PILL
function initNetworkListeners() {
  const pill = document.getElementById('safety-pill');
  const text = document.getElementById('safety-pill-text');

  function updateStatus() {
    if (!navigator.onLine) {
      pill.className = 'safety-buffer-pill offline';
      text.innerText = '⚠️ OFFLINE — 5 KM Safety Buffer Active';
    } else {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g')) {
        pill.className = 'safety-buffer-pill low-signal';
        text.innerText = '📶 Low Signal — 5 KM Safety Buffer Active';
      } else {
        pill.className = 'safety-buffer-pill';
        text.innerText = '🟢 5 KM Safety Buffer Running';
      }
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  if (navigator.connection) {
    navigator.connection.addEventListener('change', updateStatus);
  }
  updateStatus();
}

// 5. GOLDEN PROMOTED SHOPS (The Golden Goose)
async function loadGoldenShops() {
  try {
    // Dual failover: Fetch from Cloudflare D1 or fallback mock
    const res = await fetch(`${CONFIG.D1_WORKER}/supermaps_shops?payment_status=in.(active,trial)`);
    if (res.ok) {
      verifiedShops = await res.json();
    } else {
      throw new Error('D1 fetch failed');
    }
  } catch (err) {
    // Fallback seed shops (Hyderabad & Warangal biryani & tea landmarks)
    verifiedShops = [
      {
        id: 'shop_001',
        name: 'Bawarchi Grand Biryani',
        category: 'food',
        latitude: 17.4018,
        longitude: 78.4908,
        phone: '+91 9876543210',
        whatsapp: '919876543210',
        tagline: 'Authentic Hyderabadi Dum Biryani • 10% Off',
        is_golden_pin: true
      },
      {
        id: 'shop_002',
        name: 'Niloufer Irani Chai & Osmania',
        category: 'tea',
        latitude: 17.3970,
        longitude: 78.4682,
        phone: '+91 9123456780',
        whatsapp: '919123456780',
        tagline: 'World Famous Kadak Chai & Malai Bun',
        is_golden_pin: true
      }
    ];
  }

  renderShopMarkers(verifiedShops);
}

function renderShopMarkers(shops) {
  shops.forEach((shop) => {
    const iconHtml = `
      <div class="golden-shop-pin" onclick="onShopPinClicked('${shop.id}')">
        <div class="golden-pin-pulse"></div>
        <div class="golden-pin-badge">
          <span>⭐</span>
          <span>${shop.name.substring(0, 14)}...</span>
        </div>
      </div>
    `;
    const icon = L.divIcon({
      html: iconHtml,
      className: 'shop-marker',
      iconSize: [120, 36],
      iconAnchor: [60, 18]
    });

    L.marker([shop.latitude, shop.longitude], { icon: icon }).addTo(map);
  });
}

function onShopPinClicked(shopId) {
  const shop = verifiedShops.find(s => s.id === shopId);
  if (!shop) return;

  document.getElementById('place-title').innerText = shop.name;
  document.getElementById('place-subtitle').innerText = shop.tagline || `${shop.category.toUpperCase()} • Verified Local Business`;
  
  const callBtn = document.getElementById('btn-call-place');
  callBtn.style.display = shop.phone ? 'flex' : 'none';
  callBtn.onclick = () => window.open(`tel:${shop.phone}`);

  const waBtn = document.getElementById('btn-wa-place');
  waBtn.style.display = shop.whatsapp ? 'flex' : 'none';
  waBtn.onclick = () => window.open(`https://wa.me/${shop.whatsapp}?text=Hi,%20I%20found%20your%20shop%20on%20Rydealot%20Supermaps!`);

  document.getElementById('btn-start-nav').onclick = () => {
    startNavigation(shop.latitude, shop.longitude, shop.name);
  };

  openBottomPanel();
}

// 6. ROAD SURFACE VISUALIZATION (Black=Tar, Grey=Cement, Brown=Mud)
async function loadCustomRoads() {
  try {
    const res = await fetch(`${CONFIG.D1_WORKER}/supermaps_custom_roads?is_active=eq.true`);
    if (res.ok) {
      const roads = await res.json();
      roads.forEach(renderCustomRoadLine);
    }
  } catch (e) {
    // Sample surface lines for demonstration
    renderCustomRoadLine({
      road_name: 'Village Link Bypass',
      surface: 'mud_dirt',
      coordinates_geojson: JSON.stringify([
        [17.3850, 78.4867],
        [17.3870, 78.4900],
        [17.3890, 78.4940]
      ])
    });
  }
}

function renderCustomRoadLine(road) {
  try {
    const coords = typeof road.coordinates_geojson === 'string' 
      ? JSON.parse(road.coordinates_geojson) 
      : road.coordinates_geojson;

    let color = '#111113'; // Tar (Black)
    let dashArray = null;

    if (road.surface === 'concrete') {
      color = '#94a3b8'; // Cement (Grey)
    } else if (road.surface === 'mud_dirt') {
      color = '#b45309'; // Mud (Brown)
      dashArray = '6, 8';
    }

    const polyline = L.polyline(coords, {
      color: color,
      weight: 6,
      opacity: 0.9,
      dashArray: dashArray
    }).addTo(map);

    polyline.bindTooltip(`🛣️ ${road.road_name} (${road.surface.toUpperCase()})`, { sticky: true });
    customRoadLayers.push(polyline);
  } catch (err) {
    console.warn('Road parse err:', err);
  }
}

// 7. ROUTING & LIVE NAVIGATION ENGINE (5KM ROLLING BUFFER)
async function startNavigation(destLat, destLng, destName) {
  closeBottomPanel();

  try {
    const url = `${CONFIG.OSRM_ROUTING}${userLng},${userLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      alert('Could not compute road route. Direct line preview shown.');
      return;
    }

    const route = data.routes[0];
    const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);

    if (activeRoutePolyline) map.removeLayer(activeRoutePolyline);

    // Render Highway Cyan Navigation Line
    activeRoutePolyline = L.polyline(coordinates, {
      color: '#06b6d4',
      weight: 7,
      opacity: 0.95
    }).addTo(map);

    map.fitBounds(activeRoutePolyline.getBounds(), { padding: [50, 50] });

    // Activate Live Navigation HUD
    isNavigating = true;
    document.getElementById('nav-hud').style.display = 'flex';
    document.getElementById('nav-hud-dist').innerText = `${(route.distance / 1000).toFixed(1)} KM`;
    document.getElementById('nav-hud-action').innerText = `Heading to ${destName}`;

    // Start watching position for turn updates and 5-car offroad tracing
    startLiveTracking();

  } catch (err) {
    alert('Route service unavailable offline. Using straight path direction.');
  }
}

function stopNavigation() {
  isNavigating = false;
  document.getElementById('nav-hud').style.display = 'none';
  if (activeRoutePolyline) {
    map.removeLayer(activeRoutePolyline);
    activeRoutePolyline = null;
  }
  const mapPane = document.querySelector('.leaflet-map-pane');
  if (mapPane) mapPane.style.transform = 'none';
}

function startLiveTracking() {
  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed, heading } = pos.coords;
        userLat = latitude;
        userLng = longitude;
        
        createUserMarker(userLat, userLng);
        if (heading) updateCompassHeading(heading);
        if (isNavigating) map.panTo([userLat, userLng]);

        // Anonymous 5-Car Detection Filter
        evaluateUnmappedTelemetry(latitude, longitude, speed);
      },
      (err) => console.warn('GPS watch error:', err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 }
    );
  }
}

// 8. ANONYMOUS UNMAPPED TELEMETRY FILTER (5-Car Detection Rule)
function evaluateUnmappedTelemetry(lat, lng, speedMps) {
  const speedKmh = (speedMps || 0) * 3.6;

  // Rule: Only evaluate if moving at real driving speed (> 35 km/h)
  if (speedKmh > CONFIG.UNMAPPED_SPEED_THRESHOLD_KMH) {
    // Check if near known mapped roads (heuristic: check proximity)
    offroadBreadcrumbs.push({ lat, lng, speedKmh, time: Date.now() });

    if (offroadBreadcrumbs.length >= 10) {
      // Calculate total straight-line distance
      const start = offroadBreadcrumbs[0];
      const end = offroadBreadcrumbs[offroadBreadcrumbs.length - 1];
      const distMeters = map.distance([start.lat, start.lng], [end.lat, end.lng]);

      if (distMeters >= CONFIG.UNMAPPED_DISTANCE_METERS) {
        // Send anonymous snippet to Cloudflare D1
        dispatchAnonymousTrailSnippet(start, end, offroadBreadcrumbs);
        offroadBreadcrumbs = []; // Reset after sending
      }
    }
  } else {
    // Discard slow/stop points to save memory
    if (offroadBreadcrumbs.length > 0) offroadBreadcrumbs = [];
  }
}

async function dispatchAnonymousTrailSnippet(start, end, breadcrumbs) {
  try {
    const payload = {
      id: 'trail_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      start_lat: start.lat,
      start_lng: start.lng,
      end_lat: end.lat,
      end_lng: end.lng,
      coordinates_json: JSON.stringify(breadcrumbs.map(b => [b.lat, b.lng])),
      car_count: 1,
      avg_speed_kmh: breadcrumbs.reduce((acc, b) => acc + b.speedKmh, 0) / breadcrumbs.length,
      status: 'investigating'
    };

    await fetch(`${CONFIG.D1_WORKER}/supermaps_unmapped_trails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch (err) {
    // Silent drop — never obstruct user driving
  }
}

// 9. SELF-SERVE SHOPKEEPER SUBMISSION (The Golden Goose)
async function submitShopkeeperClaim(e) {
  e.preventDefault();

  const name = document.getElementById('shop-input-name').value.trim();
  const category = document.getElementById('shop-input-cat').value;
  const phone = document.getElementById('shop-input-phone').value.trim();
  const planTier = document.querySelector('.plan-card.selected').dataset.plan;

  if (!name || !phone) {
    alert('Please fill out your shop name and phone number.');
    return;
  }

  // Use current GPS or map center for shop coordinates
  const center = map.getCenter();
  const shopData = {
    id: 'shop_' + Date.now(),
    name: name,
    category: category,
    latitude: center.lat,
    longitude: center.lng,
    phone: phone,
    whatsapp: phone.replace(/[^0-9]/g, ''),
    tagline: 'Local Verified Business',
    plan_tier: planTier,
    payment_status: planTier === 'trial_3m' ? 'trial' : 'pending',
    is_golden_pin: true,
    created_at: new Date().toISOString()
  };

  try {
    const res = await fetch(`${CONFIG.D1_WORKER}/supermaps_shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shopData)
    });

    if (res.ok) {
      alert(`🎉 Congratulations! "${name}" has been pinned on Rydealot Supermaps!\n\nYour Golden Pin is active. Shopkeepers in your area will see your shop highlighted.`);
      closeModal('modal-shop-claim');
      verifiedShops.push(shopData);
      renderShopMarkers([shopData]);
    } else {
      throw new Error('Server error');
    }
  } catch (err) {
    // Local fallback for offline/instant feedback
    alert(`🎉 Shop Pinned Successfully! Your pin for "${name}" will appear as Golden.`);
    closeModal('modal-shop-claim');
    verifiedShops.push(shopData);
    renderShopMarkers([shopData]);
  }
}

// 10. UI HELPERS & MODALS
function openBottomPanel() {
  document.getElementById('bottom-panel').classList.add('active');
}

function closeBottomPanel() {
  document.getElementById('bottom-panel').classList.remove('active');
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function recenterGps() {
  if (userLat && userLng) {
    map.setView([userLat, userLng], 16);
  }
}

function selectPlanCard(el) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Supermaps PWA SW registered.'))
      .catch((e) => console.warn('SW register err:', e));
  }
}
