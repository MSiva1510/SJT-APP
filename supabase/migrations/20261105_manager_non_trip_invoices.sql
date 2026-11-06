CREATE TABLE IF NOT EXISTS public.manager_non_trip_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE DEFAULT (
    'SJT-' || to_char(current_date, 'YYMM') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  customer_name text NOT NULL,
  customer_contact text,
  invoice_date date NOT NULL DEFAULT current_date,
  description text NOT NULL,
  total_fare numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_fare >= 0),
  invoice_toll numeric(12, 2) NOT NULL DEFAULT 0 CHECK (invoice_toll >= 0),
  invoice_bata numeric(12, 2) NOT NULL DEFAULT 0 CHECK (invoice_bata >= 0),
  invoice_fuel numeric(12, 2) NOT NULL DEFAULT 0 CHECK (invoice_fuel >= 0),
  invoice_parking numeric(12, 2) NOT NULL DEFAULT 0 CHECK (invoice_parking >= 0),
  invoice_extras numeric(12, 2) NOT NULL DEFAULT 0 CHECK (invoice_extras >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manager_non_trip_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manager_non_trip_invoices FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.manager_non_trip_invoices TO authenticated;

DROP POLICY IF EXISTS manager_non_trip_invoices_staff_all
  ON public.manager_non_trip_invoices;
CREATE POLICY manager_non_trip_invoices_staff_all
  ON public.manager_non_trip_invoices
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager')
    )
  );
