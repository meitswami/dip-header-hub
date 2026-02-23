
CREATE TABLE public.case_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'detail',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_notes_select" ON public.case_notes FOR SELECT USING (is_case_member_or_admin(case_id));
CREATE POLICY "case_notes_insert" ON public.case_notes FOR INSERT WITH CHECK (is_case_member_or_admin(case_id) AND created_by = auth.uid());
CREATE POLICY "case_notes_update" ON public.case_notes FOR UPDATE USING (is_case_member_or_admin(case_id) AND created_by = auth.uid());
CREATE POLICY "case_notes_delete" ON public.case_notes FOR DELETE USING (is_case_member_or_admin(case_id) AND created_by = auth.uid());

CREATE TRIGGER update_case_notes_updated_at BEFORE UPDATE ON public.case_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
