-- ─────────────────────────────────────────────────────────────────────
-- FIX BOOKINGS STATUS CONSTRAINT
-- Add missing status values to match frontend usage
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    -- Update the check constraint on bookings.status to include all frontend statuses
    ALTER TABLE public.bookings
    DROP CONSTRAINT IF EXISTS bookings_status_check,
    ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('draft', 'pending', 'approved', 'confirmed', 'assigned', 'started', 'completed', 'closed', 'cancelled'));

    -- Update any existing 'paused' status to 'assigned' or keep as is if you want to preserve it
    -- For now, let's keep paused if it exists, but the frontend doesn't use it
    -- ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'draft';
END $$;

-- Update the status column default if needed
ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'draft';

-- Update any existing paused status to a valid frontend status (optional)
-- UPDATE public.bookings SET status = 'assigned' WHERE status = 'paused';