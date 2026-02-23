
-- =============================================
-- DIGITAL INVESTIGATION PLATFORM - FULL SCHEMA
-- =============================================

-- 1. Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'investigator', 'viewer');

-- 2. Case status enum
CREATE TYPE public.case_status AS ENUM ('active', 'closed', 'archived', 'pending');

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  badge_number TEXT,
  department TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Cases table
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  fir_number TEXT,
  sections TEXT,
  case_date DATE,
  complainant TEXT,
  accused TEXT,
  status case_status NOT NULL DEFAULT 'active',
  description TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- 6. Case assignments
CREATE TABLE public.case_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, user_id)
);
ALTER TABLE public.case_assignments ENABLE ROW LEVEL SECURITY;

-- 7. CDR records
CREATE TABLE public.cdr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  calling_number TEXT,
  called_number TEXT,
  call_date TIMESTAMPTZ,
  duration INTEGER,
  call_type TEXT,
  imei TEXT,
  imsi TEXT,
  cell_id TEXT,
  location TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  operator TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cdr_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cdr_case ON public.cdr_records(case_id);
CREATE INDEX idx_cdr_calling ON public.cdr_records(calling_number);
CREATE INDEX idx_cdr_called ON public.cdr_records(called_number);
CREATE INDEX idx_cdr_imei ON public.cdr_records(imei);
CREATE INDEX idx_cdr_date ON public.cdr_records(call_date);

-- 8. IPDR records
CREATE TABLE public.ipdr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  ip_address TEXT,
  source_port INTEGER,
  destination_ip TEXT,
  destination_port INTEGER,
  protocol TEXT,
  timestamp TIMESTAMPTZ,
  bytes_transferred BIGINT,
  duration INTEGER,
  cell_id TEXT,
  location TEXT,
  imei TEXT,
  msisdn TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ipdr_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ipdr_case ON public.ipdr_records(case_id);
CREATE INDEX idx_ipdr_msisdn ON public.ipdr_records(msisdn);

-- 9. Tower dump records
CREATE TABLE public.tower_dump_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  cell_id TEXT,
  imei TEXT,
  imsi TEXT,
  msisdn TEXT,
  timestamp TIMESTAMPTZ,
  location TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  duration INTEGER,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tower_dump_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tower_case ON public.tower_dump_records(case_id);
CREATE INDEX idx_tower_cell ON public.tower_dump_records(cell_id);

-- 10. SDR records
CREATE TABLE public.sdr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT,
  subscriber_name TEXT,
  address TEXT,
  activation_date DATE,
  operator TEXT,
  plan_type TEXT,
  id_proof_type TEXT,
  id_proof_number TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sdr_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sdr_case ON public.sdr_records(case_id);
CREATE INDEX idx_sdr_phone ON public.sdr_records(phone_number);

-- 11. Aliases
CREATE TABLE public.aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  alias_name TEXT NOT NULL,
  photo_url TEXT,
  confidence REAL DEFAULT 0.5,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.aliases ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_alias_case ON public.aliases(case_id);
CREATE INDEX idx_alias_phone ON public.aliases(phone_number);

-- 12. Person profiles
CREATE TABLE public.person_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role_in_case TEXT,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.person_profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_person_case ON public.person_profiles(case_id);

-- 13. Evidence logs
CREATE TABLE public.evidence_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  upload_type TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.evidence_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_evidence_case ON public.evidence_logs(case_id);

-- 14. Chat logs
CREATE TABLE public.chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  message TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  sql_query TEXT,
  result_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_chat_case ON public.chat_logs(case_id);

-- 15. Investigation insights
CREATE TABLE public.investigation_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.investigation_insights ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_insight_case ON public.investigation_insights(case_id);

-- =============================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- =============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_case_member(_case_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = _case_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_case_member_or_admin(_case_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_case_member(_case_id)
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles: anyone authenticated can read, users update own
CREATE POLICY "Anyone can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Admin can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "System inserts profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- User roles: admin manages, all read own
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Admin manages roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin updates roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admin deletes roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin());

-- Cases: admin sees all, members see assigned
CREATE POLICY "Cases select" ON public.cases FOR SELECT TO authenticated USING (public.is_admin() OR public.is_case_member(id));
CREATE POLICY "Cases insert" ON public.cases FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'investigator'));
CREATE POLICY "Cases update" ON public.cases FOR UPDATE TO authenticated USING (public.is_case_member_or_admin(id));
CREATE POLICY "Cases delete" ON public.cases FOR DELETE TO authenticated USING (public.is_admin() OR created_by = auth.uid());

-- Case assignments
CREATE POLICY "Assignments select" ON public.case_assignments FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "Assignments insert" ON public.case_assignments FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.cases WHERE id = case_id AND created_by = auth.uid()));
CREATE POLICY "Assignments delete" ON public.case_assignments FOR DELETE TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.cases WHERE id = case_id AND created_by = auth.uid()));

-- CDR, IPDR, Tower, SDR: case member or admin
CREATE POLICY "cdr select" ON public.cdr_records FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "cdr insert" ON public.cdr_records FOR INSERT TO authenticated WITH CHECK (public.is_case_member_or_admin(case_id));
CREATE POLICY "cdr update" ON public.cdr_records FOR UPDATE TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "cdr delete" ON public.cdr_records FOR DELETE TO authenticated USING (public.is_case_member_or_admin(case_id));

CREATE POLICY "ipdr select" ON public.ipdr_records FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "ipdr insert" ON public.ipdr_records FOR INSERT TO authenticated WITH CHECK (public.is_case_member_or_admin(case_id));
CREATE POLICY "ipdr update" ON public.ipdr_records FOR UPDATE TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "ipdr delete" ON public.ipdr_records FOR DELETE TO authenticated USING (public.is_case_member_or_admin(case_id));

CREATE POLICY "tower select" ON public.tower_dump_records FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "tower insert" ON public.tower_dump_records FOR INSERT TO authenticated WITH CHECK (public.is_case_member_or_admin(case_id));
CREATE POLICY "tower update" ON public.tower_dump_records FOR UPDATE TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "tower delete" ON public.tower_dump_records FOR DELETE TO authenticated USING (public.is_case_member_or_admin(case_id));

CREATE POLICY "sdr select" ON public.sdr_records FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "sdr insert" ON public.sdr_records FOR INSERT TO authenticated WITH CHECK (public.is_case_member_or_admin(case_id));
CREATE POLICY "sdr update" ON public.sdr_records FOR UPDATE TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "sdr delete" ON public.sdr_records FOR DELETE TO authenticated USING (public.is_case_member_or_admin(case_id));

-- Aliases
CREATE POLICY "aliases select" ON public.aliases FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "aliases insert" ON public.aliases FOR INSERT TO authenticated WITH CHECK (public.is_case_member_or_admin(case_id));
CREATE POLICY "aliases update" ON public.aliases FOR UPDATE TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "aliases delete" ON public.aliases FOR DELETE TO authenticated USING (public.is_case_member_or_admin(case_id));

-- Person profiles
CREATE POLICY "persons select" ON public.person_profiles FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "persons insert" ON public.person_profiles FOR INSERT TO authenticated WITH CHECK (public.is_case_member_or_admin(case_id));
CREATE POLICY "persons update" ON public.person_profiles FOR UPDATE TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "persons delete" ON public.person_profiles FOR DELETE TO authenticated USING (public.is_case_member_or_admin(case_id));

-- Evidence logs
CREATE POLICY "evidence select" ON public.evidence_logs FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "evidence insert" ON public.evidence_logs FOR INSERT TO authenticated WITH CHECK (public.is_case_member_or_admin(case_id) AND uploaded_by = auth.uid());
CREATE POLICY "evidence delete" ON public.evidence_logs FOR DELETE TO authenticated USING (public.is_admin() OR uploaded_by = auth.uid());

-- Chat logs
CREATE POLICY "chat select" ON public.chat_logs FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "chat insert" ON public.chat_logs FOR INSERT TO authenticated WITH CHECK (public.is_case_member_or_admin(case_id) AND user_id = auth.uid());

-- Investigation insights
CREATE POLICY "insights select" ON public.investigation_insights FOR SELECT TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "insights insert" ON public.investigation_insights FOR INSERT TO authenticated WITH CHECK (public.is_case_member_or_admin(case_id));
CREATE POLICY "insights update" ON public.investigation_insights FOR UPDATE TO authenticated USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "insights delete" ON public.investigation_insights FOR DELETE TO authenticated USING (public.is_case_member_or_admin(case_id));

-- Storage bucket for evidence files
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false);

CREATE POLICY "Evidence upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Evidence read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'evidence');

CREATE POLICY "Evidence delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
