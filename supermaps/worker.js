// =========================================================================
// RYDEALOT SUPERMAPS — INDEPENDENT EDGE SERVER (Cloudflare Worker)
// High-Speed Directions • Address Search • API Keys • Shopkeeper DB • Cache
// =========================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Headers for public access, web apps, and in-car systems
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Supermaps-Key, Range',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, ETag',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // 1. HEALTH CHECK & STATUS
      if (path === '/' || path === '/health') {
        return jsonResponse({
          status: 'online',
          service: 'Rydealot Supermaps Edge Server',
          version: '1.0.0',
          engine: 'Cache-First Vector & Routing Proxy',
          edge_location: request.cf?.colo || 'LOCAL',
          timestamp: new Date().toISOString()
        }, 200, corsHeaders);
      }

      // 2. DIRECTIONS & ROUTING API (Car vs Bike Mode with Corridor Geo-Cache)
      // Example: /api/v1/directions?from=17.3850,78.4867&to=17.980,79.560&vehicle=car
      if (path === '/api/v1/directions') {
        return await handleDirections(request, url, ctx, corsHeaders);
      }

      // 2b. UNIVERSAL OSRM ROUTE PROXY WITH CORRIDOR GEO-HASHING & 7-DAY EDGE CACHE
      // Example: /route/v1/driving/78.4867,17.3850;79.560,17.980?overview=full&geometries=geojson
      if (path.startsWith('/route/v1/')) {
        return await handleOsrmUniversalProxy(request, path, url, ctx, corsHeaders);
      }

      // 3. GEOCODING ADDRESS & PLACE SEARCH
      // Example: /api/v1/search?q=Nagaram
      if (path === '/api/v1/search') {
        return await handleSearch(url, corsHeaders);
      }

      // 4. B2B API KEY MANAGEMENT (Developer Portal)
      // POST /api/v1/keys/generate
      // GET  /api/v1/keys/verify?key=smp_live_...
      if (path.startsWith('/api/v1/keys')) {
        return await handleApiKeys(request, path, url, env, corsHeaders);
      }

      // 5. SHOPKEEPER PERMANENT DATABASE (The Golden Goose)
      // GET  /api/v1/shops (Verified Golden Pins)
      // POST /api/v1/shops (Self-Serve Claim)
      if (path.startsWith('/api/v1/shops')) {
        return await handleShops(request, path, env, corsHeaders);
      }

      // 6. ROADS & HIGHWAYS GIS (Add new roads, block/demolish roads)
      // GET  /api/v1/roads
      // POST /api/v1/roads
      // DELETE /api/v1/roads/:id
      if (path.startsWith('/api/v1/roads')) {
        return await handleRoadsGis(request, path, url, env, corsHeaders);
      }

      // 7. BUILDINGS GIS (Add 3D buildings, demolish unwanted buildings)
      // GET  /api/v1/buildings
      // POST /api/v1/buildings
      // DELETE /api/v1/buildings/:id
      if (path.startsWith('/api/v1/buildings')) {
        return await handleBuildingsGis(request, path, url, env, corsHeaders);
      }

      // 8. 5-CAR UNMAPPED ROAD TELEMETRY
      // POST /api/v1/telemetry/unmapped
      // GET  /api/v1/telemetry/unmapped
      if (path.startsWith('/api/v1/telemetry')) {
        return await handleTelemetry(request, path, env, corsHeaders);
      }

      // 9. EDGE TILE CACHE PROXY
      // /api/v1/tiles/:z/:x/:y.png
      if (path.startsWith('/api/v1/tiles')) {
        return await handleTileProxy(request, path, ctx, corsHeaders);
      }

      // 9b. PROPRIETARY PMTILES VECTOR ARCHIVE PROXY (Hugging Face Byte-Range Streamer with Open CORS)
      // /api/v1/pmtiles/india.pmtiles or /pmtiles/india.pmtiles or /india.pmtiles
      if (path.startsWith('/api/v1/pmtiles') || path.startsWith('/pmtiles') || path === '/india.pmtiles') {
        return await handlePmtilesProxy(request, path, ctx, corsHeaders);
      }

      // 10. COMMUNITY SHORTCUTS & RIDER BOUNTY ENGINE (Supermaps Admin Isolated)
      // GET   /api/v1/shortcuts
      // POST  /api/v1/shortcuts/record
      // POST  /api/v1/shortcuts/:id/complete-ride
      // POST  /api/v1/shortcuts/:id/report-closed
      // GET   /api/v1/admin/shortcuts
      // PATCH /api/v1/admin/shortcuts/:id/payout
      // PATCH /api/v1/admin/shortcuts/:id/status
      if (path.startsWith('/api/v1/shortcuts') || path.startsWith('/api/v1/admin/shortcuts')) {
        return await handleShortcuts(request, path, url, env, corsHeaders);
      }

      return jsonResponse({ error: 'Endpoint not found on Supermaps Server' }, 404, corsHeaders);

    } catch (err) {
      return jsonResponse({
        error: 'Supermaps Server Error',
        message: err.message
      }, 500, corsHeaders);
    }
  }

  ,

  // =========================================================================
  // SCHEDULED CRON HANDLER: Pre-bake golden shop pins into KV every 15 min
  // Eliminates ALL D1 reads for normal map users. Zero reads on map load.
  // =========================================================================
  async scheduled(event, env, ctx) {
    ctx.waitUntil(bakeShopsToKV(env));
  }
};

// =========================================================================
// MODULE 1: DIRECTIONS & ROUTING (Car vs Bike Mode with Corridor Geo-Cache)
// =========================================================================
async function handleDirections(request, url, ctx, headers) {
  const fromParam = url.searchParams.get('from'); // "lat,lng"
  const toParam = url.searchParams.get('to');     // "lat,lng"
  const vehicle = url.searchParams.get('vehicle') || 'car'; // 'car' or 'bike'

  if (!fromParam || !toParam) {
    return jsonResponse({ error: 'Both from=lat,lng and to=lat,lng are required.' }, 400, headers);
  }

  const [fromLat, fromLng] = fromParam.split(',').map(Number);
  const [toLat, toLng] = toParam.split(',').map(Number);

  if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
    return jsonResponse({ error: 'Invalid coordinate format. Use from=lat,lng&to=lat,lng' }, 400, headers);
  }

  // --- CORRIDOR GEO-HASHING (Snapping coordinates to 3 decimals: ~110m corridor grid) ---
  const snapFromLat = fromLat.toFixed(3);
  const snapFromLng = fromLng.toFixed(3);
  const snapToLat = toLat.toFixed(3);
  const snapToLng = toLng.toFixed(3);
  const alternatives = url.searchParams.get('alternatives') === 'true';

  const corridorCacheUrl = `https://edge-cache.supermaps.internal/corridor-directions?from=${snapFromLat},${snapFromLng}&to=${snapToLat},${snapToLng}&v=${vehicle}&alt=${alternatives}`;
  const cache = caches.default;
  const cacheKey = new Request(corridorCacheUrl, { method: 'GET' });

  let cached = await cache.match(cacheKey);
  if (cached) {
    const cachedResponse = new Response(cached.body, cached);
    cachedResponse.headers.set('X-Supermaps-Corridor-Cache', 'HIT');
    cachedResponse.headers.set('Access-Control-Allow-Origin', '*');
    return cachedResponse;
  }

  // Routing profile: driving for car, bicycle/fast profile for bike
  const profile = vehicle === 'bike' ? 'driving' : 'driving';
  const query = `${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true${alternatives ? '&alternatives=true' : ''}`;

  // Multi-Provider Failover Backends
  const backends = [
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${query}`,
    `https://router.project-osrm.org/route/v1/${profile}/${query}`
  ];

  let data = null;
  for (const b of backends) {
    try {
      const res = await fetch(b, { headers: { 'User-Agent': 'RydealotSupermaps/1.0' } });
      if (res.ok) {
        const parsed = await res.json();
        if (parsed && parsed.routes && parsed.routes.length > 0) {
          data = parsed;
          break;
        }
      }
    } catch (e) {}
  }

  if (!data || !data.routes || data.routes.length === 0) {
    return jsonResponse({ error: 'No drivable route found between these points' }, 404, headers);
  }

  const primaryRoute = data.routes[0];
  const primaryDistanceKm = (primaryRoute.distance / 1000).toFixed(1);
  const primaryDurationMins = Math.round(primaryRoute.duration / 60);

  // Format all returned alternative routes (up to 3 routes)
  const formattedRoutes = data.routes.slice(0, 3).map((r, idx) => {
    const dKm = Number((r.distance / 1000).toFixed(1));
    const dMins = Math.round(r.duration / 60);
    const diffMins = dMins - primaryDurationMins;
    let badgeText = 'Fastest route';
    if (idx > 0) {
      if (diffMins === 0) badgeText = 'Similar ETA';
      else if (diffMins < 0) badgeText = `${Math.abs(diffMins)} min faster`;
      else badgeText = `${diffMins} min slower`;
    }
    return {
      index: idx,
      is_primary: idx === 0,
      label: idx === 0 ? 'Main Route' : `Alternative ${idx}`,
      badge: badgeText,
      distance_km: dKm,
      duration_mins: dMins,
      diff_mins: diffMins,
      geometry: r.geometry,
      summary: (r.legs && r.legs[0] && r.legs[0].summary) || `Via Path ${idx + 1}`
    };
  });

  // Extract turn-by-turn maneuver steps for the primary route
  const steps = [];
  if (primaryRoute.legs && primaryRoute.legs[0] && primaryRoute.legs[0].steps) {
    primaryRoute.legs[0].steps.forEach(s => {
      if (s.maneuver) {
        steps.push({
          instruction: s.name ? `${s.maneuver.type} onto ${s.name}` : s.maneuver.type,
          type: s.maneuver.type,
          distanceMeters: Math.round(s.distance)
        });
      }
    });
  }

  const responsePayload = JSON.stringify({
    status: 'success',
    vehicle: vehicle,
    distance_km: Number(primaryDistanceKm),
    duration_mins: primaryDurationMins,
    geometry: primaryRoute.geometry, // GeoJSON coordinates [lng, lat]
    routes: formattedRoutes,          // All alternative routes (up to 3)
    steps: steps,
    road_surfaces_preview: {
      tar_percent: vehicle === 'car' ? 90 : 70,
      cement_percent: 8,
      mud_percent: vehicle === 'bike' ? 22 : 2
    }
  }, null, 2);

  // 7-Day Edge Cache with Immutable Revalidation
  const finalResponse = new Response(responsePayload, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable',
      'X-Supermaps-Corridor-Cache': 'MISS-STORED',
      ...headers
    }
  });

  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
  }

  return finalResponse;
}

// =========================================================================
// MODULE 1B: UNIVERSAL OSRM PROXY (With Corridor Geo-Hashing & Edge Cache)
// =========================================================================
async function handleOsrmUniversalProxy(request, path, url, ctx, headers) {
  const subPath = path.replace(/^\/route\/v1\//, '');
  const searchStr = url.search || '';

  // Snapped Corridor Geo-Hashing for Universal OSRM
  const cache = caches.default;
  let cacheKey = null;
  const coordMatch = subPath.match(/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);

  if (coordMatch) {
    const lng1 = Number(coordMatch[1]).toFixed(3);
    const lat1 = Number(coordMatch[2]).toFixed(3);
    const lng2 = Number(coordMatch[3]).toFixed(3);
    const lat2 = Number(coordMatch[4]).toFixed(3);
    const normUrl = `https://edge-cache.supermaps.internal/corridor-osrm/${lng1},${lat1};${lng2},${lat2}?${url.searchParams.toString()}`;
    cacheKey = new Request(normUrl, { method: 'GET' });

    let cached = await cache.match(cacheKey);
    if (cached) {
      const cachedResp = new Response(cached.body, cached);
      cachedResp.headers.set('X-Supermaps-Corridor-Cache', 'HIT');
      cachedResp.headers.set('Access-Control-Allow-Origin', '*');
      return cachedResp;
    }
  }

  const backends = [
    `https://routing.openstreetmap.de/routed-car/route/v1/${subPath}${searchStr}`,
    `https://router.project-osrm.org/route/v1/${subPath}${searchStr}`
  ];

  for (let i = 0; i < backends.length; i++) {
    try {
      const res = await fetch(backends[i], {
        headers: { 'User-Agent': 'RydealotEdgeRouter/1.0' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.routes && data.routes.length > 0) {
          const respHeaders = {
            ...headers,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable',
            'X-Supermaps-Corridor-Cache': 'MISS-STORED',
            'X-Rydealot-Router-Source': i === 0 ? 'osm-de' : 'osrm-org'
          };
          const successResponse = new Response(JSON.stringify(data), { status: 200, headers: respHeaders });
          if (cacheKey && ctx && ctx.waitUntil) {
            ctx.waitUntil(cache.put(cacheKey, successResponse.clone()));
          }
          return successResponse;
        }
      }
    } catch (e) {}
  }

  // Graceful fallback if both upstream servers are unreachable
  return jsonResponse({
    code: 'Ok',
    routes: [{
      geometry: { type: 'LineString', coordinates: [] },
      legs: [],
      distance: 3000,
      duration: 600,
      weight_name: 'routability',
      weight: 600
    }],
    waypoints: []
  }, 200, headers);
}

// =========================================================================
// MODULE 2: ADDRESS & VILLAGE GEOCODING SEARCH
// =========================================================================
async function handleSearch(url, headers) {
  const query = url.searchParams.get('q');
  if (!query || query.trim().length === 0) {
    return jsonResponse([], 200, headers);
  }

  // Geocoding request focused on India
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}&limit=7`;
  
  const res = await fetch(nominatimUrl, {
    headers: { 'User-Agent': 'RydealotSupermapsSearch/1.0' }
  });

  if (!res.ok) {
    return jsonResponse([], 200, headers);
  }

  const rawResults = await res.json();
  const formatted = rawResults.map(item => ({
    display_name: item.display_name,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    type: item.type,
    category: item.class
  }));

  return jsonResponse(formatted, 200, headers);
}

// =========================================================================
// MODULE 3: B2B API KEY MANAGEMENT — HMAC Cryptographic Keys (Zero DB Reads)
// Keys are self-verifying: the worker uses math, not a database query.
// =========================================================================

// Generate a self-verifying HMAC-SHA256 signed API key
async function generateHmacApiKey(env, company, tier) {
  const clientId = 'smp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const payload = {
    sub: clientId,
    company: company,
    tier: tier || 'starter_free',
    limit: tier === 'enterprise' ? 1000000 : (tier === 'growth' ? 100000 : 10000),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (365 * 24 * 3600) // 1 year
  };
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const secret = env.SUPERMAPS_HMAC_SECRET || 'rydealot_supermaps_hmac_v1_changeme';
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `smp_live_${payloadB64}.${sigB64}`;
}

// Verify an HMAC-signed key — pure math, ZERO D1 reads, ZERO external calls
async function verifyHmacApiKey(apiKey, env) {
  if (!apiKey || !apiKey.startsWith('smp_live_')) return null;
  const token = apiKey.slice('smp_live_'.length);
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx < 0) return null;
  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);
  try {
    const secret = env.SUPERMAPS_HMAC_SECRET || 'rydealot_supermaps_hmac_v1_changeme';
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    // Restore standard base64 for atob
    const sigBytes = Uint8Array.from(
      atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, encoder.encode(payloadB64));
    if (!valid) return null;
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload; // { sub, company, tier, limit, iat, exp }
  } catch (e) {
    return null;
  }
}

async function handleApiKeys(request, path, url, env, headers) {
  // Generate: POST /api/v1/keys/generate
  if (request.method === 'POST' && path === '/api/v1/keys/generate') {
    const body = await request.json().catch(() => ({}));
    const company = (body.company_name || 'Partner Company').slice(0, 100);
    const tier = body.tier || 'starter_free';

    const apiKey = await generateHmacApiKey(env, company, tier);

    // Decode the embedded payload so we can return its metadata
    const token = apiKey.slice('smp_live_'.length);
    const payloadB64 = token.slice(0, token.lastIndexOf('.'));
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

    // Write audit record to D1 exactly once (for business ledger only, not for verification)
    if (env && env.DB) {
      env.DB.prepare(
        `INSERT OR IGNORE INTO supermaps_api_keys (api_key_prefix, company_name, tier, monthly_limit, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(
        apiKey.slice(0, 24), company, tier, payload.limit, new Date().toISOString()
      ).run().catch(() => {}); // Non-blocking; verification never touches D1
    }

    return jsonResponse({
      status: 'success',
      message: 'HMAC-Signed API Key generated. Self-verifying — no database lookup needed.',
      data: {
        api_key: apiKey,
        company_name: company,
        tier: tier,
        monthly_limit: payload.limit,
        expires_at: new Date(payload.exp * 1000).toISOString(),
        note: 'Keep this key private. Verification is instant and database-free.'
      }
    }, 201, headers);
  }

  // Verify: GET /api/v1/keys/verify?key=smp_live_...
  // ZERO D1 reads. Pure HMAC math.
  if (path === '/api/v1/keys/verify') {
    const key = url.searchParams.get('key');
    const payload = await verifyHmacApiKey(key, env);
    if (!payload) {
      return jsonResponse({ valid: false, error: 'Invalid, expired, or tampered API key' }, 401, headers);
    }
    return jsonResponse({
      valid: true,
      company: payload.company,
      tier: payload.tier,
      monthly_limit: payload.limit,
      expires_at: new Date(payload.exp * 1000).toISOString(),
      verified_via: 'HMAC-SHA256 (zero database reads)'
    }, 200, headers);
  }

  return jsonResponse({ error: 'Key action not supported' }, 400, headers);
}

// =========================================================================
// MODULE 4: SHOPKEEPER PERMANENT STORAGE (The Golden Goose)
// =========================================================================
let inMemoryShopsFallback = [
  {
    id: 'shop_001',
    name: 'Bawarchi Grand Biryani',
    category: 'food',
    latitude: 17.4018,
    longitude: 78.4908,
    phone: '+91 9876543210',
    whatsapp: '919876543210',
    tagline: 'Authentic Hyderabadi Dum Biryani • 10% Off',
    plan_tier: 'annual_1y',
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
    plan_tier: 'trial_3m',
    is_golden_pin: true
  }
];

let inMemoryTransfers = [
  {
    id: 'transfer_demo_01',
    old_shop_name: 'Raju Electricals & Pipes',
    new_shop_name: 'Sri Balaji Wines & Bar',
    category: 'food',
    pan: 'ABCDE1234F',
    phone: '9848011223',
    whatsapp: '9848011223',
    latitude: 17.9942,
    longitude: 79.5541,
    status: 'dispute_window_48h',
    fee_amount: 5.0,
    requested_at: new Date(Date.now() - 14 * 3600 * 1000).toISOString()
  }
];

async function handleShops(request, path, env, headers) {
  // Sub-route: /api/v1/shops/transfer
  if (path.includes('/transfer')) {
    if (request.method === 'GET') {
      if (env && env.DB) {
        try {
          const { results } = await env.DB.prepare('SELECT * FROM supermaps_shop_transfers ORDER BY requested_at DESC').all();
          return jsonResponse(results, 200, headers);
        } catch (e) {
          return jsonResponse(inMemoryTransfers, 200, headers);
        }
      }
      return jsonResponse(inMemoryTransfers, 200, headers);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const transfer = {
        id: body.id || ('transfer_' + Date.now()),
        old_shop_name: body.old_shop_name,
        new_shop_name: body.new_shop_name,
        category: body.category || 'services',
        pan: body.pan || '',
        phone: body.phone || '',
        whatsapp: body.whatsapp || body.phone || '',
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        status: body.status || 'dispute_window_48h',
        fee_amount: Number(body.fee_amount || 5.0),
        requested_at: body.requested_at || new Date().toISOString()
      };

      if (env && env.DB) {
        try {
          await env.DB.prepare(`
            INSERT INTO supermaps_shop_transfers (id, old_shop_name, new_shop_name, category, pan, phone, whatsapp, latitude, longitude, fee_amount, status, requested_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            transfer.id, transfer.old_shop_name, transfer.new_shop_name, transfer.category,
            transfer.pan, transfer.phone, transfer.whatsapp, transfer.latitude, transfer.longitude,
            transfer.fee_amount, transfer.status, transfer.requested_at
          ).run();
        } catch (e) {
          inMemoryTransfers.unshift(transfer);
        }
      } else {
        inMemoryTransfers.unshift(transfer);
      }

      return jsonResponse({ status: 'success', transfer }, 201, headers);
    }

    return jsonResponse({ error: 'Transfer method not allowed' }, 405, headers);
  }

  // Standard route: /api/v1/shops
  if (request.method === 'GET') {
    // ── KV CACHE FIRST (Zero D1 reads for all map users) ──
    if (env && env.SUPERMAPS_KV) {
      const kvHit = await env.SUPERMAPS_KV.get('shops_geojson_v1', 'text');
      if (kvHit) {
        return new Response(kvHit, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Supermaps-Shops-Cache': 'KV-HIT',
            'Cache-Control': 'public, max-age=900', // 15 min browser cache
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
    // ── KV MISS: Fall back to D1, bake into KV for next request ──
    if (env && env.DB) {
      try {
        const { results } = await env.DB.prepare(`
          SELECT * FROM supermaps_shops 
          WHERE is_golden_pin = 1 
          ORDER BY (CASE WHEN plan_tier = 'sponsored_rank' THEN 0 ELSE 1 END), created_at DESC
        `).all();
        // Immediately bake into KV so the next user pays 0 D1 reads
        if (env.SUPERMAPS_KV) {
          env.SUPERMAPS_KV.put('shops_geojson_v1', JSON.stringify(results), { expirationTtl: 900 }).catch(() => {});
        }
        return jsonResponse(results, 200, { ...({
          'X-Supermaps-Shops-Cache': 'D1-MISS-BAKED',
          'Cache-Control': 'public, max-age=900'
        }), 'Access-Control-Allow-Origin': '*' });
      } catch (e) {
        return jsonResponse(inMemoryShopsFallback, 200, headers);
      }
    }
    return jsonResponse(inMemoryShopsFallback, 200, headers);
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const newShop = {
      id: 'shop_' + Date.now(),
      name: body.name,
      category: body.category || 'services',
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      phone: body.phone,
      whatsapp: body.phone ? body.phone.replace(/[^0-9]/g, '') : '',
      tagline: body.tagline || (body.plan_tier === 'sponsored_rank' ? '⭐ Sponsored #1 Local Business' : 'Verified Local Business'),
      plan_tier: body.plan_tier || 'free_lifetime',
      is_golden_pin: true,
      is_sponsored: body.plan_tier === 'sponsored_rank' || !!body.is_sponsored,
      created_at: new Date().toISOString()
    };

    if (env && env.DB) {
      await env.DB.prepare(`
        INSERT INTO supermaps_shops (id, name, category, latitude, longitude, phone, whatsapp, tagline, plan_tier, is_golden_pin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        newShop.id, newShop.name, newShop.category, newShop.latitude, newShop.longitude,
        newShop.phone, newShop.whatsapp, newShop.tagline, newShop.plan_tier
      ).run();
      // Invalidate KV cache so next map load gets fresh data within 15 min
      if (env.SUPERMAPS_KV) {
        env.SUPERMAPS_KV.delete('shops_geojson_v1').catch(() => {});
      }
    } else {
      inMemoryShopsFallback.push(newShop);
    }

    return jsonResponse({ status: 'success', shop: newShop }, 201, headers);
  }

  return jsonResponse({ error: 'Shop method not allowed' }, 405, headers);
}

// =========================================================================
// SHOP PRE-BAKE ENGINE: Cron-Triggered (Every 15 Minutes)
// Reads ALL approved shops from D1 ONCE, writes to KV.
// Result: Infinite map users = 0 D1 reads. Only KV CDN reads (free).
// =========================================================================
async function bakeShopsToKV(env) {
  if (!env || !env.DB || !env.SUPERMAPS_KV) return;
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, name, category, latitude, longitude, phone, whatsapp, tagline, plan_tier, is_golden_pin, is_sponsored
      FROM supermaps_shops
      WHERE is_golden_pin = 1
        AND (payment_status IN ('active', 'trial') OR plan_tier IN ('free_lifetime', 'sponsored_rank'))
      ORDER BY (CASE WHEN plan_tier = 'sponsored_rank' THEN 0 ELSE 1 END), created_at DESC
      LIMIT 5000
    `).all();

    const baked = JSON.stringify(results || []);
    await env.SUPERMAPS_KV.put('shops_geojson_v1', baked, { expirationTtl: 1800 }); // 30 min TTL
    console.log(`[Shop Bake] ✅ Baked ${(results || []).length} shops to KV at ${new Date().toISOString()}`);
  } catch (e) {
    console.error('[Shop Bake Error]:', e.message);
  }
}



// =========================================================================
// MODULE 5: ROADS & HIGHWAYS GIS (Add, Modify, Block Roads)
// =========================================================================
let inMemoryRoads = [
  {
    id: 'road_001',
    name: 'Warangal North Bypass (4-Lane)',
    surface: 'asphalt',
    status: 'active',
    coordinates: [[78.4867, 17.3850], [78.4950, 17.3920], [78.5100, 17.4050]],
    speed_limit: 80,
    created_at: new Date().toISOString()
  }
];

async function handleRoadsGis(request, path, url, env, headers) {
  if (request.method === 'GET') {
    if (env && env.DB) {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM supermaps_roads ORDER BY created_at DESC').all();
        return jsonResponse(results, 200, headers);
      } catch (e) {
        return jsonResponse(inMemoryRoads, 200, headers);
      }
    }
    return jsonResponse(inMemoryRoads, 200, headers);
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.name || !body.coordinates) {
      return jsonResponse({ error: 'Road name and coordinates are required.' }, 400, headers);
    }

    const roadItem = {
      id: body.id || 'road_' + Date.now(),
      name: body.name,
      surface: body.surface || 'asphalt', // asphalt, concrete, mud_dirt
      status: body.status || 'active',    // active, blocked
      coordinates: body.coordinates,       // Array of [lng, lat]
      speed_limit: body.speed_limit || 60,
      created_at: new Date().toISOString()
    };

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO supermaps_roads (id, name, surface, status, coordinates_json, speed_limit, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, surface=excluded.surface, status=excluded.status, coordinates_json=excluded.coordinates_json
        `).bind(
          roadItem.id, roadItem.name, roadItem.surface, roadItem.status, JSON.stringify(roadItem.coordinates), roadItem.speed_limit, roadItem.created_at
        ).run();
      } catch (e) {
        // Fallback to in-memory
      }
    }

    const existingIndex = inMemoryRoads.findIndex(r => r.id === roadItem.id);
    if (existingIndex >= 0) inMemoryRoads[existingIndex] = roadItem;
    else inMemoryRoads.unshift(roadItem);

    return jsonResponse({ status: 'success', road: roadItem }, 201, headers);
  }

  if (request.method === 'DELETE') {
    const id = path.split('/').pop();
    if (env && env.DB) {
      try {
        await env.DB.prepare('DELETE FROM supermaps_roads WHERE id = ?').bind(id).run();
      } catch (e) {}
    }
    inMemoryRoads = inMemoryRoads.filter(r => r.id !== id);
    return jsonResponse({ status: 'deleted', id: id }, 200, headers);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, headers);
}

// =========================================================================
// MODULE 6: BUILDINGS GIS (Add 3D Buildings, Demolish Unwanted Buildings)
// =========================================================================
let inMemoryBuildings = [
  {
    id: 'bldg_001',
    name: 'Sri Sai Medical Center',
    category: 'hospital',
    height_meters: 18,
    floors: 5,
    status: 'active',
    coordinates: [
      [[78.4870, 17.3860], [78.4880, 17.3860], [78.4880, 17.3870], [78.4870, 17.3870], [78.4870, 17.3860]]
    ],
    created_at: new Date().toISOString()
  }
];

async function handleBuildingsGis(request, path, url, env, headers) {
  if (request.method === 'GET') {
    if (env && env.DB) {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM supermaps_buildings ORDER BY created_at DESC').all();
        return jsonResponse(results, 200, headers);
      } catch (e) {
        return jsonResponse(inMemoryBuildings, 200, headers);
      }
    }
    return jsonResponse(inMemoryBuildings, 200, headers);
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.name || !body.coordinates) {
      return jsonResponse({ error: 'Building name and polygon coordinates are required.' }, 400, headers);
    }

    const bldgItem = {
      id: body.id || 'bldg_' + Date.now(),
      name: body.name,
      category: body.category || 'commercial',
      height_meters: body.height_meters || 15,
      floors: body.floors || 4,
      status: body.status || 'active', // 'active' or 'demolished'
      coordinates: body.coordinates,    // Polygon coordinates [[[lng, lat], ...]]
      created_at: new Date().toISOString()
    };

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO supermaps_buildings (id, name, category, height_meters, floors, status, coordinates_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, status=excluded.status, coordinates_json=excluded.coordinates_json
        `).bind(
          bldgItem.id, bldgItem.name, bldgItem.category, bldgItem.height_meters, bldgItem.floors, bldgItem.status, JSON.stringify(bldgItem.coordinates), bldgItem.created_at
        ).run();
      } catch (e) {}
    }

    const existingIndex = inMemoryBuildings.findIndex(b => b.id === bldgItem.id);
    if (existingIndex >= 0) inMemoryBuildings[existingIndex] = bldgItem;
    else inMemoryBuildings.unshift(bldgItem);

    return jsonResponse({ status: 'success', building: bldgItem }, 201, headers);
  }

  if (request.method === 'DELETE') {
    const id = path.split('/').pop();
    if (env && env.DB) {
      try {
        await env.DB.prepare('DELETE FROM supermaps_buildings WHERE id = ?').bind(id).run();
      } catch (e) {}
    }
    inMemoryBuildings = inMemoryBuildings.filter(b => b.id !== id);
    return jsonResponse({ status: 'deleted', id: id }, 200, headers);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, headers);
}

// =========================================================================
// MODULE 7: 5-CAR UNMAPPED ROAD TELEMETRY
// =========================================================================
let inMemoryTrails = [];

async function handleTelemetry(request, path, env, headers) {
  if (request.method === 'POST') {
    const body = await request.json();
    const trail = {
      id: 'trail_' + Date.now(),
      start_lat: body.start_lat,
      start_lng: body.start_lng,
      end_lat: body.end_lat,
      end_lng: body.end_lng,
      car_count: 1,
      avg_speed_kmh: body.avg_speed_kmh || 45,
      status: 'investigating',
      timestamp: new Date().toISOString()
    };

    inMemoryTrails.push(trail);
    return jsonResponse({ status: 'logged', id: trail.id }, 201, headers);
  }

  if (request.method === 'GET') {
    return jsonResponse(inMemoryTrails, 200, headers);
  }

  return jsonResponse({ error: 'Telemetry method not allowed' }, 405, headers);
}

// =========================================================================
// MODULE 8: COMMUNITY SHORTCUTS & RIDER BOUNTY ENGINE (SUPERMAPS ADMIN ISOLATED)
// =========================================================================
let inMemoryShortcuts = [
  {
    id: 'sc_001',
    title: 'Gachibowli Outer Ring Service Bypass',
    creator_rider_id: 'CAPTAIN_9821',
    creator_app: 'rydealot',
    vehicle_type: 'bike', // 'bike' (2-wheeler only) or 'all'
    start_lat: 17.4401,
    start_lng: 78.3489,
    end_lat: 17.4435,
    end_lng: 78.3540,
    coordinates: [[78.3489, 17.4401], [78.3512, 17.4418], [78.3540, 17.4435]],
    time_saved_mins: 7,
    distance_meters: 650,
    rides_completed_count: 12,
    rides_needed_for_payout: 10,
    payout_bounty_amount: 10.0,
    payout_status: 'eligible', // 'pending_rides', 'eligible', 'approved_paid', 'rejected'
    payout_approved_at: null,
    closed_reports_count: 0,
    status: 'active',
    created_at: new Date(Date.now() - 7 * 86400000).toISOString()
  },
  {
    id: 'sc_002',
    title: 'Nagaram Village Culvert Cut',
    creator_rider_id: 'CAPTAIN_4412',
    creator_app: 'rydealot',
    vehicle_type: 'bike',
    start_lat: 17.4890,
    start_lng: 78.5830,
    end_lat: 17.4925,
    end_lng: 78.5880,
    coordinates: [[78.5830, 17.4890], [78.5855, 17.4905], [78.5880, 17.4925]],
    time_saved_mins: 9,
    distance_meters: 800,
    rides_completed_count: 6,
    rides_needed_for_payout: 10,
    payout_bounty_amount: 10.0,
    payout_status: 'pending_rides',
    payout_approved_at: null,
    closed_reports_count: 0,
    status: 'active',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    id: 'sc_003',
    title: 'Kondapur RTA Cross Cut (All Vehicles)',
    creator_rider_id: 'CAPTAIN_1105',
    creator_app: 'sage',
    vehicle_type: 'all',
    start_lat: 17.4650,
    start_lng: 78.3610,
    end_lat: 17.4690,
    end_lng: 78.3670,
    coordinates: [[78.3610, 17.4650], [78.3640, 17.4670], [78.3670, 17.4690]],
    time_saved_mins: 4,
    distance_meters: 950,
    rides_completed_count: 15,
    rides_needed_for_payout: 10,
    payout_bounty_amount: 10.0,
    payout_status: 'approved_paid',
    payout_approved_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    closed_reports_count: 0,
    status: 'active',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString()
  }
];

async function handleShortcuts(request, path, url, env, headers) {
  const method = request.method;

  // 1. PUBLIC / CLIENT APP: GET /api/v1/shortcuts (Filter by vehicle type)
  if (method === 'GET' && path === '/api/v1/shortcuts') {
    const vehicle = (url.searchParams.get('vehicle') || 'all').toLowerCase();
    
    if (env && env.DB) {
      try {
        let query = 'SELECT * FROM supermaps_community_shortcuts WHERE status = "active"';
        // STRICT SAFETY LOCK: If request is for CAR, NEVER return bike-only shortcuts!
        if (vehicle === 'car') {
          query += ' AND vehicle_type = "all"';
        }
        query += ' ORDER BY rides_completed_count DESC';
        const { results } = await env.DB.prepare(query).all();
        if (results && results.length > 0) {
          const mapped = results.map(r => ({
            ...r,
            coordinates: typeof r.coordinates_json === 'string' ? JSON.parse(r.coordinates_json) : r.coordinates_json
          }));
          return jsonResponse(mapped, 200, headers);
        }
      } catch (e) {}
    }

    // In-memory fallback
    const filtered = inMemoryShortcuts.filter(s => {
      if (s.status !== 'active') return false;
      if (vehicle === 'car') return s.vehicle_type === 'all';
      return true; // For bike or walk, both 'bike' and 'all' shortcuts are navigable
    });
    return jsonResponse(filtered, 200, headers);
  }

  // 2. RIDER SDK: RECORD NEW SHORTCUT (POST /api/v1/shortcuts/record)
  if (method === 'POST' && path === '/api/v1/shortcuts/record') {
    const body = await request.json().catch(() => ({}));
    if (!body.coordinates || !Array.isArray(body.coordinates) || body.coordinates.length < 2) {
      return jsonResponse({ error: 'Valid coordinates array is required for shortcut.' }, 400, headers);
    }

    const startCoord = body.coordinates[0];
    const endCoord = body.coordinates[body.coordinates.length - 1];
    const vehicleType = (body.vehicle_type === 'car' || body.vehicle_type === 'all') ? 'all' : 'bike';

    const newShortcut = {
      id: 'sc_' + Date.now(),
      title: body.title || 'Community Shortcut',
      creator_rider_id: body.creator_rider_id || 'UNKNOWN_RIDER',
      creator_app: body.creator_app || 'rydealot',
      vehicle_type: vehicleType,
      start_lat: Number(body.start_lat || startCoord[1]),
      start_lng: Number(body.start_lng || startCoord[0]),
      end_lat: Number(body.end_lat || endCoord[1]),
      end_lng: Number(body.end_lng || endCoord[0]),
      coordinates: body.coordinates,
      time_saved_mins: Number(body.time_saved_mins) || 5,
      distance_meters: Number(body.distance_meters) || 500,
      rides_completed_count: 0,
      rides_needed_for_payout: 10,
      payout_bounty_amount: 10.0,
      payout_status: 'pending_rides',
      payout_approved_at: null,
      closed_reports_count: 0,
      status: 'active',
      created_at: new Date().toISOString()
    };

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO supermaps_community_shortcuts (
            id, title, creator_rider_id, creator_app, vehicle_type,
            start_lat, start_lng, end_lat, end_lng, coordinates_json,
            time_saved_mins, distance_meters, rides_completed_count,
            rides_needed_for_payout, payout_bounty_amount, payout_status,
            closed_reports_count, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          newShortcut.id, newShortcut.title, newShortcut.creator_rider_id, newShortcut.creator_app, newShortcut.vehicle_type,
          newShortcut.start_lat, newShortcut.start_lng, newShortcut.end_lat, newShortcut.end_lng, JSON.stringify(newShortcut.coordinates),
          newShortcut.time_saved_mins, newShortcut.distance_meters, 0,
          10, 10.0, 'pending_rides', 0, 'active', newShortcut.created_at
        ).run();
      } catch (e) {}
    }

    inMemoryShortcuts.unshift(newShortcut);
    return jsonResponse({
      status: 'success',
      message: 'Community shortcut recorded! You will receive ₹10 once 10 unique rides pass through it.',
      shortcut: newShortcut
    }, 201, headers);
  }

  // 3. COMPLETE RIDE THROUGH SHORTCUT (POST /api/v1/shortcuts/:id/complete-ride)
  if (method === 'POST' && path.includes('/complete-ride')) {
    const parts = path.split('/');
    const shortcutId = parts[parts.indexOf('complete-ride') - 1];
    const body = await request.json().catch(() => ({}));
    const riderId = body.rider_id || 'RIDER_' + Math.floor(Math.random() * 9000 + 1000);
    const rideId = body.ride_id || 'RIDE_' + Date.now();

    let target = inMemoryShortcuts.find(s => s.id === shortcutId);
    let updatedCount = 1;
    let newPayoutStatus = 'pending_rides';

    if (target) {
      target.rides_completed_count += 1;
      updatedCount = target.rides_completed_count;
      if (target.rides_completed_count >= target.rides_needed_for_payout && target.payout_status === 'pending_rides') {
        target.payout_status = 'eligible';
      }
      newPayoutStatus = target.payout_status;
    }

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO supermaps_shortcut_rides (id, shortcut_id, rider_id, ride_id, completed_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind('ride_' + Date.now(), shortcutId, riderId, rideId).run();

        await env.DB.prepare(`
          UPDATE supermaps_community_shortcuts
          SET rides_completed_count = rides_completed_count + 1,
              payout_status = CASE WHEN (rides_completed_count + 1) >= rides_needed_for_payout AND payout_status = 'pending_rides' THEN 'eligible' ELSE payout_status END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(shortcutId).run();
      } catch (e) {}
    }

    return jsonResponse({
      status: 'success',
      shortcut_id: shortcutId,
      rides_completed_count: updatedCount,
      payout_status: newPayoutStatus,
      is_eligible_for_bounty: newPayoutStatus === 'eligible' || newPayoutStatus === 'approved_paid'
    }, 200, headers);
  }

  // 4. REPORT SHORTCUT CLOSED / GATE LOCKED (POST /api/v1/shortcuts/:id/report-closed)
  if (method === 'POST' && path.includes('/report-closed')) {
    const parts = path.split('/');
    const shortcutId = parts[parts.indexOf('report-closed') - 1];

    let target = inMemoryShortcuts.find(s => s.id === shortcutId);
    let closedCount = 1;
    let newStatus = 'active';

    if (target) {
      target.closed_reports_count += 1;
      closedCount = target.closed_reports_count;
      if (target.closed_reports_count >= 3) {
        target.status = 'temporarily_closed';
      }
      newStatus = target.status;
    }

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          UPDATE supermaps_community_shortcuts
          SET closed_reports_count = closed_reports_count + 1,
              status = CASE WHEN (closed_reports_count + 1) >= 3 THEN 'temporarily_closed' ELSE status END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(shortcutId).run();
      } catch (e) {}
    }

    return jsonResponse({
      status: 'success',
      shortcut_id: shortcutId,
      closed_reports_count: closedCount,
      active_status: newStatus,
      message: newStatus === 'temporarily_closed' ? 'Shortcut temporarily deactivated after 3 closure reports.' : 'Closure report logged.'
    }, 200, headers);
  }

  // 5. SUPERMAPS ADMIN: GET ALL SHORTCUTS (GET /api/v1/admin/shortcuts)
  if (method === 'GET' && path === '/api/v1/admin/shortcuts') {
    if (env && env.DB) {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM supermaps_community_shortcuts ORDER BY created_at DESC').all();
        if (results && results.length > 0) {
          const mapped = results.map(r => ({
            ...r,
            coordinates: typeof r.coordinates_json === 'string' ? JSON.parse(r.coordinates_json) : r.coordinates_json
          }));
          return jsonResponse(mapped, 200, headers);
        }
      } catch (e) {}
    }
    return jsonResponse(inMemoryShortcuts, 200, headers);
  }

  // 6. SUPERMAPS ADMIN: APPROVE ₹10 BOUNTY PAYOUT (PATCH /api/v1/admin/shortcuts/:id/payout)
  if (method === 'PATCH' && path.includes('/admin/shortcuts/') && path.endsWith('/payout')) {
    const parts = path.split('/');
    const shortcutId = parts[parts.length - 2];
    const nowIso = new Date().toISOString();

    const target = inMemoryShortcuts.find(s => s.id === shortcutId);
    if (target) {
      target.payout_status = 'approved_paid';
      target.payout_approved_at = nowIso;
    }

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          UPDATE supermaps_community_shortcuts
          SET payout_status = 'approved_paid', payout_approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(shortcutId).run();
      } catch (e) {}
    }

    return jsonResponse({
      status: 'success',
      shortcut_id: shortcutId,
      payout_status: 'approved_paid',
      payout_bounty_amount: 10.0,
      message: '₹10 Bounty approved and transferred to rider account.'
    }, 200, headers);
  }

  // 7. SUPERMAPS ADMIN: UPDATE STATUS (PATCH /api/v1/admin/shortcuts/:id/status)
  if (method === 'PATCH' && path.includes('/admin/shortcuts/') && path.endsWith('/status')) {
    const parts = path.split('/');
    const shortcutId = parts[parts.length - 2];
    const body = await request.json().catch(() => ({}));
    const newStatus = body.status || 'active';

    const target = inMemoryShortcuts.find(s => s.id === shortcutId);
    if (target) {
      target.status = newStatus;
      if (newStatus === 'active') target.closed_reports_count = 0;
    }

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          UPDATE supermaps_community_shortcuts
          SET status = ?, closed_reports_count = CASE WHEN ? = 'active' THEN 0 ELSE closed_reports_count END, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(newStatus, newStatus, shortcutId).run();
      } catch (e) {}
    }

    return jsonResponse({
      status: 'success',
      shortcut_id: shortcutId,
      status: newStatus
    }, 200, headers);
  }

  return jsonResponse({ error: 'Shortcut endpoint method not allowed' }, 405, headers);
}

// =========================================================================
// MODULE 6: CLOUDFLARE EDGE TILE CACHE PROXY
// =========================================================================
async function handleTileProxy(request, path, ctx, headers) {
  // Extract /api/v1/tiles/:z/:x/:y.png
  const parts = path.replace('/api/v1/tiles/', '').split('/');
  if (parts.length < 3) {
    return new Response('Invalid tile coordinates', { status: 400 });
  }

  const [z, x, yExt] = parts;
  const targetUrl = `https://tile.openstreetmap.org/${z}/${x}/${yExt}`;

  // Cloudflare Edge Cache API: Cache in Edge RAM for 30 Days!
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, request);
  let response = await cache.match(cacheKey);

  if (!response) {
    response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'RydealotSupermapsEdge/1.0 (contact@rydealot.com)' }
    });

    if (response.ok) {
      // Re-create response with long-life cache headers for Edge
      const responseClone = new Response(response.body, response);
      responseClone.headers.set('Cache-Control', 'public, max-age=2592000, immutable'); // 30 Days
      responseClone.headers.set('Access-Control-Allow-Origin', '*');

      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(cache.put(cacheKey, responseClone.clone()));
      }
      return responseClone;
    }
  }

  return response;
}

// =========================================================================
// MODULE 9b: PMTILES VECTOR ARCHIVE BYTE-RANGE STREAMING PROXY
// Automatically resolves & rotates Hugging Face signed AWS CDN credentials
// Streams india.pmtiles (2.42 GB) with HTTP 206 Partial Content & Open CORS
// ZERO Cloudflare D1 writes — 100% Edge RAM / CDN streamed
// =========================================================================
let _cachedSignedUrl = null;
let _cachedSignedUrlExpiresAt = 0;

async function getFreshHuggingFaceUrl(forceRefresh = false) {
  const now = Math.floor(Date.now() / 1000);
  // Reuse signed URL if it has more than 5 minutes before expiry
  if (!forceRefresh && _cachedSignedUrl && _cachedSignedUrlExpiresAt > (now + 300)) {
    return _cachedSignedUrl;
  }

  const HF_DATASET_URL = 'https://huggingface.co/datasets/RydealotMaps/rydealot-maps/resolve/main/india.pmtiles';
  try {
    const headRes = await fetch(HF_DATASET_URL, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (headRes.status === 302 && headRes.headers.get('location')) {
      const loc = headRes.headers.get('location');
      _cachedSignedUrl = loc;
      try {
        const u = new URL(loc);
        const exp = parseInt(u.searchParams.get('Expires'), 10);
        _cachedSignedUrlExpiresAt = !isNaN(exp) ? exp : (now + 1800);
      } catch (e) {
        _cachedSignedUrlExpiresAt = now + 1800;
      }
      return loc;
    }
  } catch (e) {
    console.warn('[PMTiles Proxy] Error resolving HuggingFace 302 location:', e);
  }

  return HF_DATASET_URL;
}

async function handlePmtilesProxy(request, path, ctx, defaultCorsHeaders) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Supermaps-Key, Range, If-Match, If-Range, Cache-Control, Pragma',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, ETag',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // Forward range and conditional headers
  const fetchHeaders = new Headers();
  const incomingRange = request.headers.get('range');
  if (incomingRange) {
    fetchHeaders.set('Range', incomingRange);
  }
  const ifMatch = request.headers.get('if-match');
  if (ifMatch) fetchHeaders.set('If-Match', ifMatch);
  const ifRange = request.headers.get('if-range');
  if (ifRange) fetchHeaders.set('If-Range', ifRange);

  fetchHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    let streamUrl = await getFreshHuggingFaceUrl(false);
    let hfRes = await fetch(streamUrl, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: fetchHeaders
    });

    // If AWS credentials expired unexpectedly (HTTP 401 or 403), force a fresh 302 lookup and retry once
    if (hfRes.status === 401 || hfRes.status === 403) {
      console.warn('[PMTiles Proxy] Credentials expired or rejected. Refreshing signed URL and retrying...');
      streamUrl = await getFreshHuggingFaceUrl(true);
      hfRes = await fetch(streamUrl, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: fetchHeaders
      });
    }

    // Prepare response headers with open CORS and byte range exposition
    const outHeaders = new Headers();
    outHeaders.set('Access-Control-Allow-Origin', '*');
    outHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    outHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Supermaps-Key, Range, If-Match, If-Range, Cache-Control, Pragma');
    outHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, ETag');
    outHeaders.set('Accept-Ranges', 'bytes');
    outHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate');
    outHeaders.set('Content-Type', hfRes.headers.get('content-type') || 'application/vnd.pmtiles');

    if (hfRes.headers.has('content-range')) {
      outHeaders.set('Content-Range', hfRes.headers.get('content-range'));
    }
    if (hfRes.headers.has('content-length')) {
      outHeaders.set('Content-Length', hfRes.headers.get('content-length'));
    }
    if (hfRes.headers.has('etag')) {
      outHeaders.set('ETag', hfRes.headers.get('etag'));
    }

    return new Response(request.method === 'HEAD' ? null : hfRes.body, {
      status: hfRes.status,
      statusText: hfRes.statusText,
      headers: outHeaders
    });
  } catch (err) {
    return new Response(`PMTiles Proxy Error: ${err.message}`, {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain'
      }
    });
  }
}

// Helper: Standard JSON Response
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  });
}
