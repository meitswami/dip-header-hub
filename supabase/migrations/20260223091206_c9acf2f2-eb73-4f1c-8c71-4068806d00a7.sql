
-- =============================================
-- Phase 1: RBAC, Procurement, Messaging Schema
-- =============================================

-- 1. Add case_role to case_assignments
ALTER TABLE public.case_assignments 
  ADD COLUMN IF NOT EXISTS case_role text NOT NULL DEFAULT 'analyst';

-- 2. Add UPDATE/DELETE policies for case_assignments (CIO/admin can manage)
CREATE POLICY "CIO can update assignments"
  ON public.case_assignments FOR UPDATE
  USING (
    (SELECT ca.case_role FROM public.case_assignments ca WHERE ca.user_id = auth.uid() AND ca.case_id = case_assignments.case_id LIMIT 1) = 'case_incharge'
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "CIO can delete assignments"
  ON public.case_assignments FOR DELETE
  USING (
    (SELECT ca.case_role FROM public.case_assignments ca WHERE ca.user_id = auth.uid() AND ca.case_id = case_assignments.case_id LIMIT 1) = 'case_incharge'
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- 3. get_case_role function
CREATE OR REPLACE FUNCTION public.get_case_role(_user_id uuid, _case_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT case_role FROM public.case_assignments 
  WHERE user_id = _user_id AND case_id = _case_id LIMIT 1
$$;

-- 4. Create data_procurements table
CREATE TABLE public.data_procurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  evidence_log_id uuid REFERENCES public.evidence_logs(id) ON DELETE SET NULL,
  procured_by uuid,
  phone_number text,
  data_type text NOT NULL,
  operator_name text,
  request_ref_no text,
  period_from date,
  period_to date,
  status text NOT NULL DEFAULT 'pending_upload',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_procurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Case members can view procurements"
  ON public.data_procurements FOR SELECT
  USING (is_case_member(auth.uid(), case_id));

CREATE POLICY "Procurement/CIO can insert procurements"
  ON public.data_procurements FOR INSERT
  WITH CHECK (
    get_case_role(auth.uid(), case_id) IN ('procurement', 'case_incharge')
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Procurement/CIO can update procurements"
  ON public.data_procurements FOR UPDATE
  USING (
    get_case_role(auth.uid(), case_id) IN ('procurement', 'case_incharge')
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- 5. Create staff_messages table
CREATE TABLE public.staff_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid,
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  attachment_data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_messages ENABLE ROW LEVEL SECURITY;

-- DMs: sender or recipient can see. Case messages: case members can see.
CREATE POLICY "Users can view their messages"
  ON public.staff_messages FOR SELECT
  USING (
    sender_id = auth.uid()
    OR recipient_id = auth.uid()
    OR (case_id IS NOT NULL AND is_case_member(auth.uid(), case_id))
  );

CREATE POLICY "Authenticated users can send messages"
  ON public.staff_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update own messages"
  ON public.staff_messages FOR UPDATE
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Enable realtime for staff_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_messages;

-- 6. Create data_access_grants table
CREATE TABLE public.data_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  evidence_log_id uuid NOT NULL REFERENCES public.evidence_logs(id) ON DELETE CASCADE,
  granted_to uuid NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(evidence_log_id, granted_to)
);

ALTER TABLE public.data_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Granted users can view grants"
  ON public.data_access_grants FOR SELECT
  USING (
    granted_to = auth.uid()
    OR granted_by = auth.uid()
    OR is_case_member(auth.uid(), case_id)
  );

CREATE POLICY "CIO/Procurement can manage grants"
  ON public.data_access_grants FOR INSERT
  WITH CHECK (
    get_case_role(auth.uid(), case_id) IN ('procurement', 'case_incharge')
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "CIO/Procurement can delete grants"
  ON public.data_access_grants FOR DELETE
  USING (
    get_case_role(auth.uid(), case_id) IN ('procurement', 'case_incharge')
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- 7. Alter notifications table
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_type text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS sender_id uuid,
  ADD COLUMN IF NOT EXISTS link text;

-- 8. Notification trigger: new case assignment
CREATE OR REPLACE FUNCTION public.notify_case_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _case_title text;
BEGIN
  SELECT title INTO _case_title FROM public.cases WHERE id = NEW.case_id;
  INSERT INTO public.notifications (user_id, title, message, case_id, notification_type, link)
  VALUES (
    NEW.user_id,
    'Case Assignment',
    'You were added to case "' || COALESCE(_case_title, 'Unknown') || '" as ' || NEW.case_role,
    NEW.case_id,
    'case_assigned',
    '/cases/' || NEW.case_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_case_assignment
  AFTER INSERT ON public.case_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_case_assignment();

-- 9. Notification trigger: new message
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _sender_name text;
BEGIN
  SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;
  -- Direct message notification
  IF NEW.recipient_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, case_id, notification_type, sender_id, link)
    VALUES (
      NEW.recipient_id,
      'New Message',
      'New message from ' || COALESCE(_sender_name, 'Unknown'),
      NEW.case_id,
      'message_received',
      NEW.sender_id,
      '/messages'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.staff_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_message();

-- 10. Notification trigger: data procurement added
CREATE OR REPLACE FUNCTION public.notify_data_procurement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _procurer_name text;
  _member record;
BEGIN
  SELECT full_name INTO _procurer_name FROM public.profiles WHERE id = NEW.procured_by;
  -- Notify CIO and other team members
  FOR _member IN
    SELECT user_id FROM public.case_assignments
    WHERE case_id = NEW.case_id AND user_id != NEW.procured_by
      AND case_role IN ('case_incharge', 'analyst')
  LOOP
    INSERT INTO public.notifications (user_id, title, message, case_id, notification_type, sender_id, link)
    VALUES (
      _member.user_id,
      'New Data Added',
      NEW.data_type || ' for ' || COALESCE(NEW.phone_number, 'unknown') || ' added by ' || COALESCE(_procurer_name, 'Unknown'),
      NEW.case_id,
      'data_added',
      NEW.procured_by,
      '/cases/' || NEW.case_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_data_procurement
  AFTER INSERT ON public.data_procurements
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_data_procurement();

-- 11. Notification trigger: data access granted
CREATE OR REPLACE FUNCTION public.notify_data_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _granter_name text;
  _file_name text;
BEGIN
  SELECT full_name INTO _granter_name FROM public.profiles WHERE id = NEW.granted_by;
  SELECT file_name INTO _file_name FROM public.evidence_logs WHERE id = NEW.evidence_log_id;
  INSERT INTO public.notifications (user_id, title, message, case_id, notification_type, sender_id, link)
  VALUES (
    NEW.granted_to,
    'Data Shared With You',
    'File "' || COALESCE(_file_name, 'Unknown') || '" shared by ' || COALESCE(_granter_name, 'Unknown'),
    NEW.case_id,
    'data_shared',
    NEW.granted_by,
    '/cases/' || NEW.case_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_data_grant
  AFTER INSERT ON public.data_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_data_grant();
