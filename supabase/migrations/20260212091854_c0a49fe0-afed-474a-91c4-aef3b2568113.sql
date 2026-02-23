-- Create geofences table for user-defined geographic zones
CREATE TABLE public.geofences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  zone_type TEXT NOT NULL DEFAULT 'circle', -- 'circle' or 'polygon'
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION,
  polygon_coords JSONB, -- array of [lat, lng] for polygon
  color TEXT DEFAULT '#ef4444',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geofences_select" ON public.geofences FOR SELECT USING (is_case_member_or_admin(case_id));
CREATE POLICY "geofences_insert" ON public.geofences FOR INSERT WITH CHECK (is_case_member_or_admin(case_id) AND created_by = auth.uid());
CREATE POLICY "geofences_update" ON public.geofences FOR UPDATE USING (is_case_member_or_admin(case_id));
CREATE POLICY "geofences_delete" ON public.geofences FOR DELETE USING (is_case_member_or_admin(case_id));

-- Create geofence alerts table
CREATE TABLE public.geofence_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  geofence_id UUID NOT NULL REFERENCES public.geofences(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL, -- 'cdr' or 'tower'
  record_id UUID NOT NULL,
  phone_number TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  event_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.geofence_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts_select" ON public.geofence_alerts FOR SELECT USING (is_case_member_or_admin(case_id));
CREATE POLICY "alerts_insert" ON public.geofence_alerts FOR INSERT WITH CHECK (is_case_member_or_admin(case_id));
CREATE POLICY "alerts_delete" ON public.geofence_alerts FOR DELETE USING (is_case_member_or_admin(case_id));