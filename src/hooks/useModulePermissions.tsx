import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Maps module_key to route path
const MODULE_ROUTE_MAP: Record<string, string> = {
  data_upload: '/upload',
  ai_chat: '/chat',
  reports: '/reports',
  documents: '/documents',
  knowledge_base: '/knowledge-base',
  legal_reference: '/legal',
  case_compare: '/compare',
};

export function useModulePermissions() {
  const { user, role } = useAuth();
  const [allowedModules, setAllowedModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !role) { setLoading(false); return; }

    // Admins always have access to everything
    if (role === 'admin') {
      setAllowedModules(new Set(Object.keys(MODULE_ROUTE_MAP).concat([
        'cdr_analysis', 'ipdr_analysis', 'tower_dump',
      ])));
      setLoading(false);
      return;
    }

    // Fetch role-level permissions, group memberships, and group-level permissions
    const [rolePermsRes, groupMembersRes] = await Promise.all([
      supabase.from('module_permissions').select('module_key, enabled').eq('role', role),
      supabase.from('group_members').select('group_id').eq('user_id', user.id),
    ]);

    const rolePerms = rolePermsRes.data || [];
    const userGroupIds = (groupMembersRes.data || []).map(m => m.group_id);

    let groupPerms: { module_key: string; enabled: boolean }[] = [];
    if (userGroupIds.length > 0) {
      const { data } = await supabase
        .from('group_module_permissions')
        .select('module_key, enabled')
        .in('group_id', userGroupIds);
      groupPerms = data || [];
    }

    // Build effective permissions:
    // 1. Start with all modules enabled by default
    // 2. Apply role-level overrides
    // 3. Apply group-level overrides (if ANY group grants access, it's enabled)
    const allModuleKeys = [
      'cdr_analysis', 'ipdr_analysis', 'tower_dump', 'ai_chat',
      'reports', 'documents', 'knowledge_base', 'legal_reference',
      'case_compare', 'data_upload',
    ];

    const effective = new Set<string>();

    for (const key of allModuleKeys) {
      // Role-level: default true if no record
      const rolePerm = rolePerms.find(p => p.module_key === key);
      const roleEnabled = rolePerm ? rolePerm.enabled : true;

      // Group-level: if any group explicitly enables it, override role denial
      const groupPermsForModule = groupPerms.filter(p => p.module_key === key);
      const groupGranted = groupPermsForModule.some(p => p.enabled);

      // Effective: enabled by role OR explicitly granted by any group
      if (roleEnabled || groupGranted) {
        effective.add(key);
      }
    }

    setAllowedModules(effective);
    setLoading(false);
  }, [user, role]);

  useEffect(() => { load(); }, [load]);

  const isModuleAllowed = useCallback((moduleKey: string) => {
    if (loading) return true; // Show everything while loading
    return allowedModules.has(moduleKey);
  }, [allowedModules, loading]);

  const isRouteAllowed = useCallback((path: string) => {
    if (loading) return true;
    // Find module key for this route
    const entry = Object.entries(MODULE_ROUTE_MAP).find(([, route]) => path === route || path.startsWith(route + '/'));
    if (!entry) return true; // Routes not mapped to modules are always allowed
    return allowedModules.has(entry[0]);
  }, [allowedModules, loading]);

  return { isModuleAllowed, isRouteAllowed, loading, reload: load };
}
