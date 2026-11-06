-- Business-wide WhatsApp quota shared by all managers and admins.
CREATE TABLE IF NOT EXISTS public.manager_whatsapp_daily_usage (
  usage_date date PRIMARY KEY,
  sent_count integer NOT NULL CHECK (sent_count BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manager_whatsapp_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manager_whatsapp_daily_usage FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.manager_whatsapp_consume_daily_limit(
  p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_actor_id
      AND role IN ('admin', 'manager')
      AND coalesce(status::text, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active managers can send WhatsApp messages'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.manager_whatsapp_daily_usage (usage_date, sent_count)
  VALUES (v_today, 1)
  ON CONFLICT (usage_date) DO UPDATE
    SET sent_count = public.manager_whatsapp_daily_usage.sent_count + 1,
        updated_at = now()
    WHERE public.manager_whatsapp_daily_usage.sent_count < 10
  RETURNING sent_count INTO v_count;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'The daily WhatsApp limit of 10 messages has been reached'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.manager_whatsapp_consume_daily_limit(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manager_whatsapp_consume_daily_limit(uuid)
  TO service_role;
