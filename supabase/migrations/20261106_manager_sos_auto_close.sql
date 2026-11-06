-- Managers acknowledge SOS alerts; they remain visible until the day after
-- tomorrow in India, then a database schedule closes them automatically.

ALTER TABLE public.fleet_alerts
  ADD COLUMN IF NOT EXISTS manager_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_close_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE OR REPLACE FUNCTION public.manager_acknowledge_sos_alert(p_alert_id text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_close_at timestamptz;
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
      AND coalesce(status::text, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active managers can acknowledge SOS alerts'
      USING ERRCODE = '42501';
  END IF;

  v_close_at :=
    (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '2 days')
    AT TIME ZONE 'Asia/Kolkata';

  UPDATE public.fleet_alerts
  SET status = 'acknowledged',
      manager_checked_at = now(),
      auto_close_at = v_close_at,
      updated_at = now()
  WHERE id::text = p_alert_id
    AND alert_type = 'sos'
    AND status IN ('open', 'in_progress')
  RETURNING auto_close_at INTO v_close_at;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'SOS alert was not found or was already acknowledged'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_close_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_expired_acknowledged_sos_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_closed integer;
BEGIN
  UPDATE public.fleet_alerts
  SET status = 'resolved',
      resolved_at = now(),
      updated_at = now()
  WHERE alert_type = 'sos'
    AND status = 'acknowledged'
    AND auto_close_at IS NOT NULL
    AND auto_close_at <= now();

  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$$;

REVOKE ALL ON FUNCTION public.manager_acknowledge_sos_alert(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_acknowledge_sos_alert(text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.close_expired_acknowledged_sos_alerts()
  FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job
    WHERE jobname = 'close-expired-acknowledged-sos-alerts'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'close-expired-acknowledged-sos-alerts',
    '*/5 * * * *',
    'SELECT public.close_expired_acknowledged_sos_alerts();'
  );
END;
$$;
