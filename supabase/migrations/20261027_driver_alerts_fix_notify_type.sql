-- ─────────────────────────────────────────────────────────────────────────────
-- Fix for 20261027_driver_alerts.sql: office notifications were never created.
--
-- Live public.notifications has notifications_type_check:
--   type IN ('info', 'warning', 'error', 'success')
-- driver_raise_alert() wrote type 'SOS_ALERT' / 'VEHICLE_ISSUE', so every
-- insert hit check_violation, which the function deliberately swallows (the
-- alert row is kept). Result seen on 2026-10-27: SOS saved, no admin/manager
-- notification.
--
-- Change: SOS → type 'error', vehicle issue → type 'warning'; the kind of
-- alert stays visible via icon (🆘 / 🔧), category 'fleet', title, and the new
-- related_entity = 'fleet_alert'. Nothing else in the function changes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.driver_raise_alert(
  p_alert_type  text,                 -- 'sos' | 'vehicle_issue'
  p_category    text DEFAULT NULL,    -- issue category shown to the driver
  p_description text DEFAULT NULL,
  p_booking_id  text DEFAULT NULL,
  p_latitude    double precision DEFAULT NULL,
  p_longitude   double precision DEFAULT NULL,
  p_accuracy    double precision DEFAULT NULL,
  p_photo_url   text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_driver_id    text;
  v_driver_name  text;
  v_vehicle_id   text;
  v_booking_ref  text;
  v_priority     text;
  v_title        text;
  v_description  text := nullif(left(btrim(coalesce(p_description, '')), 2000), '');
  v_category     text := nullif(left(btrim(coalesce(p_category, '')), 80), '');
  v_location     jsonb;
  v_photo_url    text := nullif(btrim(coalesce(p_photo_url, '')), '');
  v_alert_id     text;
  v_office       record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_alert_type NOT IN ('sos', 'vehicle_issue') THEN
    RAISE EXCEPTION 'unknown alert type: %', p_alert_type USING ERRCODE = '22023';
  END IF;

  SELECT d.id::text, d.name INTO v_driver_id, v_driver_name
  FROM public.drivers d
  WHERE d.profile_id = v_uid
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'no driver record for this account' USING ERRCODE = '42501';
  END IF;

  -- Only link a booking that belongs to this driver; silently drop others.
  IF nullif(btrim(coalesce(p_booking_id, '')), '') IS NOT NULL THEN
    SELECT b.vehicle_id::text, b.booking_no::text INTO v_vehicle_id, v_booking_ref
    FROM public.bookings b
    WHERE b.id::text = btrim(p_booking_id)
      AND b.driver_id::text = v_driver_id
    LIMIT 1;
  END IF;

  -- Photos must be the driver's own upload in the documents bucket.
  IF v_photo_url IS NOT NULL
     AND position(('/driver-documents/' || v_uid::text || '/') IN v_photo_url) = 0 THEN
    v_photo_url := NULL;
  END IF;

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL
     AND p_latitude BETWEEN -90 AND 90 AND p_longitude BETWEEN -180 AND 180 THEN
    v_location := jsonb_build_object(
      'latitude', p_latitude, 'longitude', p_longitude, 'accuracy', p_accuracy
    );
  END IF;

  IF p_alert_type = 'sos' THEN
    v_priority := 'critical';
    v_title := 'SOS: ' || coalesce(v_driver_name, 'Driver') || ' needs help';
  ELSE
    v_priority := CASE WHEN v_category ILIKE 'accident%' THEN 'critical' ELSE 'high' END;
    v_title := 'Vehicle issue: ' || coalesce(v_category, 'Other')
            || ' — ' || coalesce(v_driver_name, 'Driver');
  END IF;

  -- De-duplicate repeated taps: reuse the same driver's alert of the same
  -- type (and issue category) from the last 60 s.
  SELECT fa.id::text INTO v_alert_id
  FROM public.fleet_alerts fa
  WHERE fa.driver_id::text = v_driver_id
    AND fa.alert_type = p_alert_type
    AND coalesce(fa.category, '') = coalesce(v_category, '')
    AND fa.detected_at > now() - interval '60 seconds'
  ORDER BY fa.detected_at DESC
  LIMIT 1;
  IF v_alert_id IS NOT NULL THEN
    RETURN v_alert_id;
  END IF;

  EXECUTE format(
    'INSERT INTO public.fleet_alerts
       (driver_id, vehicle_id, alert_type, priority, status, title, description,
        location, detected_at, source, category, booking_ref, photo_url)
     VALUES (%L, %L, %L, %L, ''open'', %L, %L, %L, now(), ''driver_app'', %L, %L, %L)
     RETURNING id::text',
    v_driver_id, v_vehicle_id, p_alert_type, v_priority, v_title, v_description,
    v_location, v_category, v_booking_ref, v_photo_url
  ) INTO v_alert_id;

  -- Notify the office. Never let a notification problem lose the alert.
  BEGIN
    FOR v_office IN
      SELECT p.id FROM public.profiles p WHERE p.role IN ('admin', 'manager')
    LOOP
      EXECUTE format(
        'INSERT INTO public.notifications
           (user_id, type, title, message, icon, category, priority,
            related_entity, related_id, action_url, status, is_read)
         VALUES (%L, %L, %L, %L, %L, ''fleet'', %L, ''fleet_alert'', %L, ''/dashboard'', ''unread'', false)',
        v_office.id,
        -- notifications_type_check only allows info / warning / error / success.
        CASE WHEN p_alert_type = 'sos' THEN 'error' ELSE 'warning' END,
        v_title,
        concat_ws(' · ',
          v_description,
          CASE WHEN v_booking_ref IS NOT NULL THEN 'Trip ' || v_booking_ref END,
          CASE WHEN v_location IS NOT NULL THEN
            'Location ' || round(p_latitude::numeric, 5) || ', ' || round(p_longitude::numeric, 5)
          END),
        CASE WHEN p_alert_type = 'sos' THEN '🆘' ELSE '🔧' END,
        CASE WHEN v_priority = 'critical' THEN 'urgent' ELSE 'high' END,
        v_alert_id
      );
    END LOOP;
  EXCEPTION WHEN undefined_column OR undefined_table OR invalid_text_representation
                 OR check_violation OR not_null_violation THEN
    RAISE WARNING 'driver_raise_alert: office notification skipped (%)', SQLERRM;
  END;

  RETURN v_alert_id;
END $$;

REVOKE ALL ON FUNCTION public.driver_raise_alert(
  text, text, text, text, double precision, double precision, double precision, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_raise_alert(
  text, text, text, text, double precision, double precision, double precision, text
) TO authenticated;
