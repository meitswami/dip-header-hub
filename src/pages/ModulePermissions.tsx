import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ToggleRight } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const MODULES = [
  { key: 'cdr_analysis', label: 'CDR Analysis', desc: 'Call Detail Record analysis and visualization' },
  { key: 'ipdr_analysis', label: 'IPDR Analysis', desc: 'Internet Protocol Detail Record analysis' },
  { key: 'tower_dump', label: 'Tower Dump', desc: 'Tower dump data analysis and mapping' },
  { key: 'ai_chat', label: 'AI Chat', desc: 'AI-powered investigation assistant' },
  { key: 'reports', label: 'Reports', desc: 'Generate and export case reports' },
  { key: 'documents', label: 'Documents', desc: 'Case document management' },
  { key: 'knowledge_base', label: 'Knowledge Base', desc: 'Legal and procedural knowledge base' },
  { key: 'legal_reference', label: 'Legal Reference', desc: 'IPC/CrPC/IT Act references' },
  { key: 'case_compare', label: 'Case Compare', desc: 'Cross-case comparison tool' },
  { key: 'data_upload', label: 'Data Upload', desc: 'Upload CDR/IPDR/SDR data files' },
];

const ROLES_LIST = [
  { key: 'admin', label: 'Admin', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { key: 'investigator', label: 'Investigator', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { key: 'viewer', label: 'Viewer', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
];

interface ModPerm {
  role: string;
  module_key: string;
  enabled: boolean;
}

export default function ModulePermissions() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [perms, setPerms] = useState<ModPerm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPerms(); }, []);

  async function loadPerms() {
    setLoading(true);
    const { data } = await supabase.from('module_permissions').select('role, module_key, enabled');
    if (data) setPerms(data);
    setLoading(false);
  }

  function isEnabled(roleKey: string, moduleKey: string) {
    const p = perms.find(x => x.role === roleKey && x.module_key === moduleKey);
    return p ? p.enabled : true;
  }

  async function toggle(roleKey: string, moduleKey: string) {
    const current = isEnabled(roleKey, moduleKey);
    const newVal = !current;

    // Optimistic update
    setPerms(prev => {
      const exists = prev.find(x => x.role === roleKey && x.module_key === moduleKey);
      if (exists) return prev.map(x => x.role === roleKey && x.module_key === moduleKey ? { ...x, enabled: newVal } : x);
      return [...prev, { role: roleKey, module_key: moduleKey, enabled: newVal }];
    });

    const { error } = await supabase.from('module_permissions').upsert(
      { role: roleKey, module_key: moduleKey, enabled: newVal, updated_at: new Date().toISOString() },
      { onConflict: 'role,module_key' }
    );

    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      loadPerms();
    } else {
      toast({ title: `${moduleKey.replace(/_/g, ' ')} ${newVal ? 'enabled' : 'disabled'} for ${roleKey}` });
    }
  }

  if (role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ToggleRight className="h-6 w-6 text-primary" />
          Module Permissions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Enable or disable feature modules per role</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {MODULES.map(mod => (
            <Card key={mod.key}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-medium text-sm">{mod.label}</h3>
                    <p className="text-xs text-muted-foreground">{mod.desc}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {ROLES_LIST.map(r => (
                      <div key={r.key} className="flex flex-col items-center gap-1.5">
                        <Badge variant="outline" className={`text-[10px] ${r.color}`}>{r.label}</Badge>
                        <Switch
                          checked={isEnabled(r.key, mod.key)}
                          onCheckedChange={() => toggle(r.key, mod.key)}
                          disabled={r.key === 'admin' && mod.key !== 'ai_chat'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
