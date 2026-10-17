-- =========================================================================
-- RYDEALOT SUPERMAPS — DATABASE SCHEMA (Supabase & Cloudflare D1 Compatible)
-- =========================================================================

-- 1. LOCAL SHOPKEEPER PROMOTED PINS (The Golden Goose)
CREATE TABLE IF NOT EXISTS supermaps_shops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,           -- 'food', 'tea', 'kirana', 'salon', 'medical', 'auto', 'repair', 'services'
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    address TEXT,
    photo_url TEXT,
    tagline TEXT,
    plan_tier TEXT DEFAULT 'trial_3m', -- 'trial_3m', 'pro_6m', 'annual_1y'
    amount_paid REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending', -- 'trial', 'pending', 'active', 'expired'
    is_golden_pin BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Index for spatial range searches
CREATE INDEX IF NOT EXISTS idx_supermaps_shops_coords 
ON supermaps_shops(latitude, longitude);

-- 2. ANONYMOUS UNMAPPED ROAD TRAILS (5-Car Detection Engine)
CREATE TABLE IF NOT EXISTS supermaps_unmapped_trails (
    id TEXT PRIMARY KEY,
    start_lat REAL NOT NULL,
    start_lng REAL NOT NULL,
    end_lat REAL NOT NULL,
    end_lng REAL NOT NULL,
    coordinates_json TEXT NOT NULL,    -- Array of [lat, lng, speed] breadcrumbs
    car_count INTEGER DEFAULT 1,       -- Increments when unique vehicles drive the same path
    avg_speed_kmh REAL NOT NULL,
    status TEXT DEFAULT 'investigating', -- 'investigating', 'ready_for_review', 'verified_published', 'dismissed'
    satellite_verified BOOLEAN DEFAULT FALSE,
    first_detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_unmapped_trails_status 
ON supermaps_unmapped_trails(status);

-- 3. PROPRIETARY HIGHWAYS & CUSTOM ROADS (Admin Published)
CREATE TABLE IF NOT EXISTS supermaps_custom_roads (
    id TEXT PRIMARY KEY,
    road_name TEXT NOT NULL,
    road_type TEXT NOT NULL,           -- 'highway_4lane', 'highway_2lane', 'bypass', 'arterial', 'village_connector'
    surface TEXT NOT NULL DEFAULT 'asphalt', -- 'asphalt' (Black), 'concrete' (Grey), 'mud_dirt' (Brown)
    coordinates_geojson TEXT NOT NULL, -- GeoJSON LineString coordinates
    speed_limit INTEGER DEFAULT 80,
    is_toll BOOLEAN DEFAULT FALSE,
    toll_amount REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_by TEXT DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. ROAD OBSTACLES & HAZARDS (Dormant Engine - Ready for B2B)
CREATE TABLE IF NOT EXISTS supermaps_road_obstacles (
    id TEXT PRIMARY KEY,
    obstacle_type TEXT NOT NULL,       -- 'pothole', 'roadblock', 'waterlogging', 'police_check', 'diversion'
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    reported_by_driver_id TEXT,
    verified_by_driver_id TEXT,
    consensus_confirmed BOOLEAN DEFAULT FALSE,
    reward_disbursed BOOLEAN DEFAULT FALSE,
    reward_amount REAL DEFAULT 5.0,
    status TEXT DEFAULT 'pending',     -- 'pending', 'confirmed', 'cleared'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- 5. COMMUNITY SHORTCUTS ENGINE (Bounty & Vehicle Intelligence - Supermaps Admin Managed)
CREATE TABLE IF NOT EXISTS supermaps_community_shortcuts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    creator_rider_id TEXT NOT NULL,
    creator_app TEXT DEFAULT 'rydealot',   -- 'rydealot', 'sage', 'grocery', etc.
    vehicle_type TEXT DEFAULT 'bike',      -- 'bike' (2-wheeler only) or 'all' (car & bike)
    start_lat REAL NOT NULL,
    start_lng REAL NOT NULL,
    end_lat REAL NOT NULL,
    end_lng REAL NOT NULL,
    coordinates_json TEXT NOT NULL,        -- Array of [lng, lat]
    time_saved_mins INTEGER DEFAULT 5,
    distance_meters INTEGER DEFAULT 500,
    rides_completed_count INTEGER DEFAULT 0, -- Counter of trips completed through shortcut
    rides_needed_for_payout INTEGER DEFAULT 10, -- Fixed threshold: 10 rides
    payout_bounty_amount REAL DEFAULT 10.0, -- ₹10 fixed bounty
    payout_status TEXT DEFAULT 'pending_rides', -- 'pending_rides', 'eligible', 'approved_paid', 'rejected'
    payout_approved_at TIMESTAMP,
    closed_reports_count INTEGER DEFAULT 0, -- Rider reports: "Road closed / Gate locked"
    status TEXT DEFAULT 'active',          -- 'active', 'temporarily_closed', 'deactivated'
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shortcuts_coords 
ON supermaps_community_shortcuts(start_lat, start_lng, status);

CREATE INDEX IF NOT EXISTS idx_shortcuts_payout 
ON supermaps_community_shortcuts(payout_status, rides_completed_count);

CREATE TABLE IF NOT EXISTS supermaps_shortcut_rides (
    id TEXT PRIMARY KEY,
    shortcut_id TEXT NOT NULL,
    rider_id TEXT NOT NULL,
    ride_id TEXT,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. BUSINESS OWNERSHIP TRANSFER CLAIMS (48-Hour Dispute Engine)
CREATE TABLE IF NOT EXISTS supermaps_shop_transfers (
    id TEXT PRIMARY KEY,
    old_shop_name TEXT NOT NULL,
    new_shop_name TEXT NOT NULL,
    category TEXT NOT NULL,
    pan TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    fee_amount REAL DEFAULT 5.0,
    status TEXT DEFAULT 'dispute_window_48h', -- 'dispute_window_48h', 'approved_transferred', 'rejected'
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shop_transfers_status 
ON supermaps_shop_transfers(status);

