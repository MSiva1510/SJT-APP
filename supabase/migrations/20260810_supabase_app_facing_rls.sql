-- Sri Jayam Travels - make existing Supabase project app-facing
-- Fixes recursive policies that can raise "stack depth limit exceeded" and
-- adds read/write policies required by the browser client.

DO $$
DECLARE
  target_table text;
  policy_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'profiles',
    'users',
    'customers',
    'drivers',
    'vehicles',
    'bookings',
    'booking_approvals',
    'attendance',
    'expenses',
    'trip_payslips',
    'settlements',
    'notifications',
    'audit_logs',
    'settings',
    'documents',
    'role_permissions',
    'session_log',
    'error_log',
    'backup_config',
    'backup_history',
    'gps_tracking',
    'driver_status',
    'vehicle_status',
    'vehicle_assignments',
    'fleet_alerts',
    'geofences',
    'geofence_zones',
    'geofence_events'
  ]
  LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      FOR policy_name IN
        SELECT pol.polname
        FROM pg_policy pol
        JOIN pg_class cls ON cls.oid = pol.polrelid
        JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
        WHERE nsp.nspname = 'public'
          AND cls.relname = target_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, target_table);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        target_table || '_app_all',
        target_table
      );
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', target_table);
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
