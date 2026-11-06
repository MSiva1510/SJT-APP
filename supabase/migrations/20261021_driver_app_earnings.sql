-- ─────────────────────────────────────────────────────────────────────────────
-- Driver app earnings — make trip_payslips usable end to end.
--
-- Live public.trip_payslips has exactly six columns:
--   id, driver_id, trip_id, net_amount, driver_earnings, created_at
--
-- Discovery: trip_id carries a legacy FK (trip_payslips_trip_id_fkey) to the
-- `trips` table. That table is EMPTY and no live code writes to it (the web
-- dashboard reads trip_payslips with `select('*')` and never joins trips). The
-- driver app's trips come from public.bookings, so payslips must be keyed by
-- the booking id. The legacy FK therefore blocks every useful insert.
--
-- This migration:
--   1. Grants SELECT/INSERT/UPDATE on trip_payslips to the app roles.
--   2. Drops the legacy trip_id -> trips FK so trip_id may hold a booking id.
--   3. Adds a unique index on trip_id so a completed booking yields one payslip.
--   4. Installs a trigger on public.bookings that creates a trip_payslips row
--      the moment a booking transitions to 'completed' with a driver assigned.
--   5. Backfills payslips for bookings that completed before the trigger.
--
-- All steps are idempotent and no-op safely when a table/column is absent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Privileges (RLS policies are managed separately). ─────────────────────────
DO $$
BEGIN
  IF to_regclass('public.trip_payslips') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.trip_payslips TO anon, authenticated';
  END IF;
END $$;

-- 2. Relax the legacy FK so trip_id can reference a booking. ───────────────────
DO $$
BEGIN
  IF to_regclass('public.trip_payslips') IS NOT NULL THEN
    -- Drop by discovered name if present (idempotent).
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'trip_payslips_trip_id_fkey'
        AND conrelid = 'public.trip_payslips'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE public.trip_payslips '
           || 'DROP CONSTRAINT trip_payslips_trip_id_fkey';
    END IF;
  END IF;
END $$;

-- 3. One payslip per trip (trip_id now stores the booking id). ─────────────────
DO $$
BEGIN
  IF to_regclass('public.trip_payslips') IS NOT NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS trip_payslips_trip_id_key '
         || 'ON public.trip_payslips (trip_id)';
  END IF;
END $$;

-- 4. Auto-generate a payslip when a booking completes. ────────────────────────
CREATE OR REPLACE FUNCTION public.sjt_create_trip_payslip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fare numeric := 0;
  v_has_trip_fare boolean := false;
  v_has_base_fare boolean := false;
BEGIN
  -- Only act on the assigned→completed transition with a driver present.
  IF NEW.status <> 'completed' OR NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW; -- already completed; don't re-create
  END IF;

  -- Compute a fare value from whichever booking fare columns actually exist.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings'
      AND column_name = 'total_fare'
  ) INTO v_has_trip_fare;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings'
      AND column_name = 'base_fare'
  ) INTO v_has_base_fare;

  IF v_has_trip_fare THEN
    EXECUTE 'SELECT COALESCE(NEW.total_fare, 0)' INTO v_fare USING NEW;
  ELSIF v_has_base_fare THEN
    EXECUTE 'SELECT COALESCE(NEW.base_fare, 0)' INTO v_fare USING NEW;
  ELSE
    v_fare := 0;
  END IF;

  INSERT INTO public.trip_payslips (driver_id, trip_id, net_amount, driver_earnings)
  VALUES (NEW.driver_id, NEW.id, v_fare, v_fare)
  ON CONFLICT (trip_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  -- Never let a payslip write break the booking status update.
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sjt_create_trip_payslip ON public.bookings;
CREATE TRIGGER trg_sjt_create_trip_payslip
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sjt_create_trip_payslip();

-- 5. Backfill payslips for bookings that completed before the trigger existed. ─
DO $$
DECLARE
  v_has_trip_fare boolean := false;
  v_has_base_fare boolean := false;
  v_fare_expr text;
BEGIN
  IF to_regclass('public.trip_payslips') IS NULL
     OR to_regclass('public.bookings') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings'
      AND column_name = 'total_fare'
  ) INTO v_has_trip_fare;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings'
      AND column_name = 'base_fare'
  ) INTO v_has_base_fare;

  IF v_has_trip_fare THEN
    v_fare_expr := 'COALESCE(b.total_fare, 0)';
  ELSIF v_has_base_fare THEN
    v_fare_expr := 'COALESCE(b.base_fare, 0)';
  ELSE
    v_fare_expr := '0';
  END IF;

  EXECUTE format($fmt$
    INSERT INTO public.trip_payslips (driver_id, trip_id, net_amount, driver_earnings)
    SELECT b.driver_id, b.id, %s, %s
    FROM public.bookings b
    WHERE b.status = 'completed'
      AND b.driver_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.trip_payslips p WHERE p.trip_id = b.id
      )
    ON CONFLICT (trip_id) DO NOTHING
  $fmt$, v_fare_expr, v_fare_expr);
EXCEPTION WHEN undefined_column OR undefined_table THEN
  NULL; -- schema differs; skip safely
END $$;
