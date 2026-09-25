CREATE TABLE public.user_locations (
  user_id uuid PRIMARY KEY,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  location_at timestamptz,
  last_login_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_locations TO authenticated;
GRANT ALL ON public.user_locations TO service_role;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_manmadha(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND username = 'manmadha')
$$;

CREATE POLICY "Owner inserts own location" ON public.user_locations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner updates own location" ON public.user_locations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner or Manmadha reads" ON public.user_locations FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_manmadha(auth.uid()));