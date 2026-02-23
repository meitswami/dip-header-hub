
-- Create group_module_permissions table
CREATE TABLE public.group_module_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.user_groups(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE(group_id, module_key)
);

-- Enable RLS
ALTER TABLE public.group_module_permissions ENABLE ROW LEVEL SECURITY;

-- Admin can read/write group module permissions
CREATE POLICY "Admins can manage group module permissions"
ON public.group_module_permissions
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- All authenticated users can read group module permissions (needed for permission checks)
CREATE POLICY "Authenticated users can read group module permissions"
ON public.group_module_permissions
FOR SELECT
USING (auth.uid() IS NOT NULL);
