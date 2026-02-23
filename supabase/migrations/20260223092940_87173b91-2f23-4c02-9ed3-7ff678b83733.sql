
-- Module permissions per role
CREATE TABLE public.module_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL,
  module_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(role, module_key)
);

ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage module permissions"
  ON public.module_permissions FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated users can read module permissions"
  ON public.module_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- User groups
CREATE TABLE public.user_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage groups"
  ON public.user_groups FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated users can read groups"
  ON public.user_groups FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Group memberships
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.user_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  added_by UUID REFERENCES auth.users(id),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage group members"
  ON public.group_members FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated users can read group members"
  ON public.group_members FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Seed default module permissions for all roles
INSERT INTO public.module_permissions (role, module_key, enabled) VALUES
  ('admin', 'cdr_analysis', true),
  ('admin', 'ipdr_analysis', true),
  ('admin', 'tower_dump', true),
  ('admin', 'ai_chat', true),
  ('admin', 'reports', true),
  ('admin', 'documents', true),
  ('admin', 'knowledge_base', true),
  ('admin', 'legal_reference', true),
  ('admin', 'case_compare', true),
  ('admin', 'data_upload', true),
  ('investigator', 'cdr_analysis', true),
  ('investigator', 'ipdr_analysis', true),
  ('investigator', 'tower_dump', true),
  ('investigator', 'ai_chat', true),
  ('investigator', 'reports', true),
  ('investigator', 'documents', true),
  ('investigator', 'knowledge_base', true),
  ('investigator', 'legal_reference', true),
  ('investigator', 'case_compare', true),
  ('investigator', 'data_upload', true),
  ('viewer', 'cdr_analysis', true),
  ('viewer', 'ipdr_analysis', true),
  ('viewer', 'tower_dump', true),
  ('viewer', 'ai_chat', false),
  ('viewer', 'reports', true),
  ('viewer', 'documents', true),
  ('viewer', 'knowledge_base', true),
  ('viewer', 'legal_reference', true),
  ('viewer', 'case_compare', false),
  ('viewer', 'data_upload', false);
