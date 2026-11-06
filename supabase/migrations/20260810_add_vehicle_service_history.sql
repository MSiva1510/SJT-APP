-- Add service_history column to vehicles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'service_history') THEN
        ALTER TABLE public.vehicles ADD COLUMN service_history JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Set existing NULL service_history to empty array
UPDATE public.vehicles SET service_history = '[]'::jsonb WHERE service_history IS NULL;