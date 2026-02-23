
-- Activity/Audit log for case collaboration
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select" ON public.activity_logs FOR SELECT USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "activity_logs_insert" ON public.activity_logs FOR INSERT WITH CHECK (public.is_case_member_or_admin(case_id) AND user_id = auth.uid());

CREATE INDEX idx_activity_logs_case ON public.activity_logs(case_id, created_at DESC);

-- Case tasks for collaboration
CREATE TABLE public.case_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID,
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.case_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_tasks_select" ON public.case_tasks FOR SELECT USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "case_tasks_insert" ON public.case_tasks FOR INSERT WITH CHECK (public.is_case_member_or_admin(case_id) AND created_by = auth.uid());
CREATE POLICY "case_tasks_update" ON public.case_tasks FOR UPDATE USING (public.is_case_member_or_admin(case_id));
CREATE POLICY "case_tasks_delete" ON public.case_tasks FOR DELETE USING (public.is_case_member_or_admin(case_id));

CREATE TRIGGER update_case_tasks_updated_at BEFORE UPDATE ON public.case_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE USING (user_id = auth.uid());

CREATE INDEX idx_notifications_user ON public.notifications(user_id, read, created_at DESC);

-- Enable realtime for notifications and activity logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
