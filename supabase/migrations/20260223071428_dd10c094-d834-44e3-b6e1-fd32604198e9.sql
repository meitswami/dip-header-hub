
-- =============================================
-- DIP — Full Database Schema (no pgvector)
-- =============================================

-- 1. Role enum & user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'investigator', 'viewer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1 $$;

CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  badge_number TEXT,
  department TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investigator');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Cases
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, fir_number TEXT, sections TEXT, complainant TEXT, accused TEXT, description TEXT,
  status TEXT NOT NULL DEFAULT 'active', case_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- 4. Case assignments
CREATE TABLE public.case_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, user_id)
);
ALTER TABLE public.case_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_case_member(_user_id UUID, _case_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.case_assignments WHERE user_id = _user_id AND case_id = _case_id)
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') $$;

CREATE POLICY "Users can view assigned cases" ON public.cases FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), id));
CREATE POLICY "Investigators can create cases" ON public.cases FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'investigator'));
CREATE POLICY "Members can update cases" ON public.cases FOR UPDATE TO authenticated USING (public.is_case_member(auth.uid(), id));
CREATE POLICY "Members can view assignments" ON public.case_assignments FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can assign" ON public.case_assignments FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));

-- 5. CDR Records
CREATE TABLE public.cdr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  file_id UUID, calling_number TEXT, called_number TEXT, call_date TIMESTAMPTZ, duration INTEGER,
  call_type TEXT, imei TEXT, imsi TEXT, cell_id TEXT, tower_location TEXT,
  tower_lat DOUBLE PRECISION, tower_lng DOUBLE PRECISION, operator TEXT, roaming TEXT,
  raw_data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cdr_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cdr_case ON public.cdr_records(case_id);
CREATE INDEX idx_cdr_calling ON public.cdr_records(calling_number);
CREATE INDEX idx_cdr_called ON public.cdr_records(called_number);
CREATE INDEX idx_cdr_date ON public.cdr_records(call_date);
CREATE INDEX idx_cdr_imei ON public.cdr_records(imei);
CREATE POLICY "Case members can view CDR" ON public.cdr_records FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can insert CDR" ON public.cdr_records FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can delete CDR" ON public.cdr_records FOR DELETE TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 6. IPDR Records
CREATE TABLE public.ipdr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  file_id UUID, source_ip TEXT, destination_ip TEXT, source_port INTEGER, destination_port INTEGER,
  protocol TEXT, data_volume BIGINT, session_start TIMESTAMPTZ, session_end TIMESTAMPTZ,
  imei TEXT, imsi TEXT, msisdn TEXT, cell_id TEXT, tower_location TEXT,
  tower_lat DOUBLE PRECISION, tower_lng DOUBLE PRECISION, raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ipdr_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ipdr_case ON public.ipdr_records(case_id);
CREATE POLICY "Case members can view IPDR" ON public.ipdr_records FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can insert IPDR" ON public.ipdr_records FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can delete IPDR" ON public.ipdr_records FOR DELETE TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 7. Tower Dump Records
CREATE TABLE public.tower_dump_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  file_id UUID, mobile_number TEXT, imei TEXT, imsi TEXT, cell_id TEXT, tower_location TEXT,
  tower_lat DOUBLE PRECISION, tower_lng DOUBLE PRECISION, event_time TIMESTAMPTZ,
  duration INTEGER, call_type TEXT, raw_data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tower_dump_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tower_case ON public.tower_dump_records(case_id);
CREATE POLICY "Case members can view tower dumps" ON public.tower_dump_records FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can insert tower dumps" ON public.tower_dump_records FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can delete tower dumps" ON public.tower_dump_records FOR DELETE TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 8. SDR Records
CREATE TABLE public.sdr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  file_id UUID, mobile_number TEXT, subscriber_name TEXT, address TEXT, id_type TEXT,
  id_number TEXT, activation_date DATE, operator TEXT, circle TEXT, raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sdr_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sdr_case ON public.sdr_records(case_id);
CREATE INDEX idx_sdr_number ON public.sdr_records(mobile_number);
CREATE POLICY "Case members can view SDR" ON public.sdr_records FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can insert SDR" ON public.sdr_records FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can delete SDR" ON public.sdr_records FOR DELETE TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 9. Aliases
CREATE TABLE public.aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL, alias_name TEXT NOT NULL, photo_url TEXT,
  confidence TEXT DEFAULT 'medium', created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view aliases" ON public.aliases FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can manage aliases" ON public.aliases FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can update aliases" ON public.aliases FOR UPDATE TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can delete aliases" ON public.aliases FOR DELETE TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 10. Person Profiles
CREATE TABLE public.person_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, role TEXT DEFAULT 'suspect', phone_numbers TEXT[], photo_url TEXT,
  notes TEXT, created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.person_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view persons" ON public.person_profiles FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can manage persons" ON public.person_profiles FOR ALL TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 11. Evidence Logs
CREATE TABLE public.evidence_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL, file_path TEXT, file_size BIGINT, file_hash TEXT,
  upload_type TEXT NOT NULL, record_count INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.evidence_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view evidence" ON public.evidence_logs FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can insert evidence" ON public.evidence_logs FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Investigators can delete evidence" ON public.evidence_logs FOR DELETE TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 12. Investigation Insights
CREATE TABLE public.investigation_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL, description TEXT, insight_type TEXT NOT NULL, severity TEXT DEFAULT 'info',
  data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.investigation_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view insights" ON public.investigation_insights FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "System can insert insights" ON public.investigation_insights FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));

-- 13. Chat Logs
CREATE TABLE public.chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id), role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL, sql_query TEXT, result_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view chats" ON public.chat_logs FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Members can insert chats" ON public.chat_logs FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));

-- 14. Case Tasks
CREATE TABLE public.case_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'pending',
  assigned_to UUID REFERENCES auth.users(id), created_by UUID REFERENCES auth.users(id),
  due_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.case_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view tasks" ON public.case_tasks FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Members can manage tasks" ON public.case_tasks FOR ALL TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 15. Activity Logs
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id), action TEXT NOT NULL, details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view activity" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Members can log activity" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));

-- 16. Case Documents
CREATE TABLE public.case_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL, file_path TEXT NOT NULL, file_type TEXT, file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view docs" ON public.case_documents FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Members can upload docs" ON public.case_documents FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Members can delete docs" ON public.case_documents FOR DELETE TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 17. Geofences
CREATE TABLE public.geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  radius_meters DOUBLE PRECISION NOT NULL DEFAULT 500,
  created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view geofences" ON public.geofences FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Members can manage geofences" ON public.geofences FOR ALL TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- 18. Geofence Alerts
CREATE TABLE public.geofence_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofence_id UUID REFERENCES public.geofences(id) ON DELETE CASCADE NOT NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  record_type TEXT NOT NULL, record_id UUID NOT NULL, phone_number TEXT,
  event_time TIMESTAMPTZ, distance_meters DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.geofence_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view geofence alerts" ON public.geofence_alerts FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "System can insert alerts" ON public.geofence_alerts FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));

-- 19. Case Training Logs
CREATE TABLE public.case_training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  training_data JSONB, status TEXT NOT NULL DEFAULT 'pending',
  trained_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.case_training_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view training" ON public.case_training_logs FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Members can train" ON public.case_training_logs FOR INSERT TO authenticated WITH CHECK (public.is_case_member(auth.uid(), case_id));

-- 20. Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL, message TEXT, read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- 21. Knowledge Base Documents
CREATE TABLE public.knowledge_base_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, file_path TEXT, file_type TEXT, content TEXT,
  uploaded_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_base_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view KB docs" ON public.knowledge_base_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage KB" ON public.knowledge_base_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'investigator'));

-- 22. Knowledge Base Chunks (no vector for now)
CREATE TABLE public.knowledge_base_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.knowledge_base_documents(id) ON DELETE CASCADE NOT NULL,
  chunk_text TEXT NOT NULL, chunk_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_base_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view KB chunks" ON public.knowledge_base_chunks FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can manage KB chunks" ON public.knowledge_base_chunks FOR ALL TO authenticated USING (true);

-- 23. Case Notes
CREATE TABLE public.case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id), content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Case members can view notes" ON public.case_notes FOR SELECT TO authenticated USING (public.is_case_member(auth.uid(), case_id));
CREATE POLICY "Members can manage notes" ON public.case_notes FOR ALL TO authenticated USING (public.is_case_member(auth.uid(), case_id));

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_case_tasks_updated_at BEFORE UPDATE ON public.case_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_case_notes_updated_at BEFORE UPDATE ON public.case_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES
  ('evidence', 'evidence', false, 52428800),
  ('knowledge-base', 'knowledge-base', false, 52428800),
  ('case-documents', 'case-documents', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "evidence_select" ON storage.objects FOR SELECT USING (bucket_id = 'evidence' AND auth.uid() IS NOT NULL);
CREATE POLICY "evidence_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'evidence' AND auth.uid() IS NOT NULL);
CREATE POLICY "evidence_delete" ON storage.objects FOR DELETE USING (bucket_id = 'evidence' AND auth.uid() IS NOT NULL);
CREATE POLICY "kb_select" ON storage.objects FOR SELECT USING (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);
CREATE POLICY "kb_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);
CREATE POLICY "kb_delete" ON storage.objects FOR DELETE USING (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);
CREATE POLICY "casedocs_select" ON storage.objects FOR SELECT USING (bucket_id = 'case-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "casedocs_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'case-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "casedocs_delete" ON storage.objects FOR DELETE USING (bucket_id = 'case-documents' AND auth.uid() IS NOT NULL);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_tasks;
