
-- Training logs for AI case understanding
CREATE TABLE public.case_training_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  trained_by uuid NOT NULL,
  data_snapshot_hash text NOT NULL,
  case_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  data_counts jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.case_training_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_logs_select" ON public.case_training_logs
  FOR SELECT USING (is_case_member_or_admin(case_id));

CREATE POLICY "training_logs_insert" ON public.case_training_logs
  FOR INSERT WITH CHECK (is_case_member_or_admin(case_id) AND trained_by = auth.uid());

CREATE POLICY "training_logs_delete" ON public.case_training_logs
  FOR DELETE USING (is_case_member_or_admin(case_id));

-- Index for fast lookups
CREATE INDEX idx_training_logs_case ON public.case_training_logs(case_id, created_at DESC);
