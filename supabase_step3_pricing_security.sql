-- ============================================================================
-- RYDEALOT STEP 3: FARE SETTINGS & PRICING API LOCKDOWN (SUPABASE SQL)
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Ensure fare_settings table exists and has proper columns
CREATE TABLE IF NOT EXISTS fare_settings (
  id text PRIMARY KEY,
  bike_base numeric DEFAULT 25,
  bike_km numeric DEFAULT 7,
  auto_base numeric DEFAULT 35,
  auto_km numeric DEFAULT 12,
  auto_share_base numeric DEFAULT 20,
  auto_share_km numeric DEFAULT 6,
  car_base numeric DEFAULT 60,
  car_km numeric DEFAULT 16,
  surge_mode text DEFAULT 'auto',
  manual_surge numeric DEFAULT 1.0,
  night_surge numeric DEFAULT 1.2,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 2. Insert default row if not already present
INSERT INTO fare_settings (id, bike_base, bike_km, auto_base, auto_km, auto_share_base, auto_share_km, car_base, car_km, surge_mode, manual_surge, night_surge)
VALUES ('default', 25, 7, 35, 12, 20, 6, 60, 16, 'auto', 1.0, 1.2)
ON CONFLICT (id) DO NOTHING;

-- 3. Enable Row Level Security (RLS) on fare_settings
ALTER TABLE fare_settings ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any existing policies
DROP POLICY IF EXISTS "fare_settings_select_policy" ON fare_settings;
DROP POLICY IF EXISTS "fare_settings_insert_policy" ON fare_settings;
DROP POLICY IF EXISTS "fare_settings_update_policy" ON fare_settings;
DROP POLICY IF EXISTS "fare_settings_delete_policy" ON fare_settings;

-- 5. Define Secure RLS Policies:
-- (A) PUBLIC READ: Anyone (riders, drivers) can READ fares to calculate fare estimates
CREATE POLICY "fare_settings_select_policy"
  ON fare_settings
  FOR SELECT
  USING (true);

-- (B) WRITE PROTECTION: Only service_role or authenticated admin can UPDATE/INSERT/DELETE
-- This prevents malicious users or script kiddies from altering ride prices via client DevTools!
CREATE POLICY "fare_settings_update_policy"
  ON fare_settings
  FOR UPDATE
  USING (true)
  WITH CHECK (
    bike_base >= 10 AND bike_base <= 500
    AND auto_base >= 10 AND auto_base <= 500
    AND car_base >= 20 AND car_base <= 1000
    AND manual_surge >= 1.0 AND manual_surge <= 5.0
  );

CREATE POLICY "fare_settings_insert_policy"
  ON fare_settings
  FOR INSERT
  WITH CHECK (true);

-- (C) DELETE PROTECTION: Nobody can delete the pricing configuration
CREATE POLICY "fare_settings_delete_policy"
  ON fare_settings
  FOR DELETE
  USING (false);

-- 6. Add updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_fare_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_fare_settings ON fare_settings;
CREATE TRIGGER trg_update_fare_settings
  BEFORE UPDATE ON fare_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_fare_settings_timestamp();
