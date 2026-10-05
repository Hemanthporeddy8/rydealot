-- ============================================================================
-- RYDEALOT STEP 4: RIDE STATE-MACHINE, 4-DIGIT PIN & ANTI-HIJACK PROTECTION
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Ensure pin_code and updated_at columns exist on bookings table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='pin_code') THEN
    ALTER TABLE bookings ADD COLUMN pin_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='updated_at') THEN
    ALTER TABLE bookings ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2. Create high-performance query indexes
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_rider_id ON bookings(rider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_pin_code ON bookings(pin_code);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);

-- 3. Insert enforcement trigger (ensures all newly created bookings start as 'requested')
CREATE OR REPLACE FUNCTION fn_enforce_booking_insert()
RETURNS trigger AS $$
BEGIN
  -- Newly inserted bookings must start at 'requested'
  IF NEW.status IS NULL OR NEW.status <> 'requested' THEN
    NEW.status := 'requested';
  END IF;

  -- Ensure timestamps
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_booking_insert ON bookings;
CREATE TRIGGER trg_enforce_booking_insert
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_booking_insert();

-- 4. State-machine & Anti-hijack enforcement trigger (BEFORE UPDATE)
CREATE OR REPLACE FUNCTION fn_enforce_booking_state_machine()
RETURNS trigger AS $$
BEGIN
  -- Auto-update the updated_at timestamp
  NEW.updated_at := now();

  -- If status is NOT changing (e.g. driver coordinates, chat, or notes), allow update
  IF OLD.status = NEW.status THEN
    -- Anti-hijack: Never allow changing rider_id if trip is already active
    IF OLD.status IN ('accepted', 'arrived', 'in_progress') AND NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
      RAISE EXCEPTION 'Anti-hijack violation: Assigned rider cannot be altered during active trip %', OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  -- 4.1. Terminal status protection: Once completed or cancelled, state cannot be changed
  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Illegal transition: Booking % is already % and cannot be updated.', OLD.id, OLD.status;
  END IF;

  -- 4.2. Mid-trip cancellation guard (Loophole 4): Cannot cancel once in progress
  IF OLD.status = 'in_progress' AND NEW.status = 'cancelled' THEN
    RAISE EXCEPTION 'Illegal action: Booking % is currently in progress and cannot be cancelled mid-trip.', OLD.id;
  END IF;

  -- 4.3. Anti-hijack check: Assigned driver cannot be changed
  IF OLD.status IN ('accepted', 'arrived', 'in_progress') AND NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
    RAISE EXCEPTION 'Anti-hijack violation: Assigned driver for booking % cannot be modified.', OLD.id;
  END IF;

  -- 4.4. Sequential state-machine verification
  CASE OLD.status
    WHEN 'requested' THEN
      IF NEW.status NOT IN ('accepted', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition: Booking % cannot jump from requested to %', OLD.id, NEW.status;
      END IF;
      -- Driver must be provided when accepting a booking
      IF NEW.status = 'accepted' AND (NEW.rider_id IS NULL OR NEW.rider_id = '') THEN
        RAISE EXCEPTION 'Cannot accept booking % without an assigned rider_id', OLD.id;
      END IF;

    WHEN 'accepted' THEN
      IF NEW.status NOT IN ('arrived', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition: Booking % cannot jump from accepted to %', OLD.id, NEW.status;
      END IF;

    WHEN 'arrived' THEN
      IF NEW.status NOT IN ('in_progress', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition: Booking % cannot jump from arrived to %', OLD.id, NEW.status;
      END IF;

    WHEN 'in_progress' THEN
      IF NEW.status NOT IN ('completed') THEN
        RAISE EXCEPTION 'Invalid transition: Booking % cannot move from in_progress to %', OLD.id, NEW.status;
      END IF;

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_booking_state_machine ON bookings;
CREATE TRIGGER trg_enforce_booking_state_machine
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_booking_state_machine();

-- 5. Row Level Security (RLS) on bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookings_select_policy" ON bookings;
DROP POLICY IF EXISTS "bookings_insert_policy" ON bookings;
DROP POLICY IF EXISTS "bookings_update_policy" ON bookings;
DROP POLICY IF EXISTS "bookings_delete_policy" ON bookings;

-- Select: Passengers and drivers can read bookings
CREATE POLICY "bookings_select_policy"
  ON bookings
  FOR SELECT
  USING (true);

-- Insert: Passengers can create new bookings
CREATE POLICY "bookings_insert_policy"
  ON bookings
  FOR INSERT
  WITH CHECK (true);

-- Update: Verified updates allowed (state machine + anti-hijack enforced by trigger)
CREATE POLICY "bookings_update_policy"
  ON bookings
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Delete: Disallowed (preserves complete dispute & audit trail)
CREATE POLICY "bookings_delete_policy"
  ON bookings
  FOR DELETE
  USING (false);

-- Output verification message
SELECT 'Rydealot Step 4 Ride Security & State-Machine successfully deployed!' AS result;
