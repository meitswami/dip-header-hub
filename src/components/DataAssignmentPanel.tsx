import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Share2, Loader2, FileSpreadsheet } from 'lucide-react';

interface EvidenceFile {
  id: string;
  file_name: string;
  upload_type: string;
  created_at: string;
}

interface TeamMember {
  user_id: string;
  case_role: string;
  full_name: string;
}

interface Grant {
  evidence_log_id: string;
  granted_to: string;
}

export default function DataAssignmentPanel({ caseId }: { caseId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [caseId]);

  async function load() {
    setLoading(true);
    const [filesRes, assignRes, grantsRes] = await Promise.all([
      supabase.from('evidence_logs').select('id, file_name, upload_type, created_at').eq('case_id', caseId).order('created_at', { ascending: false }),
      supabase.from('case_assignments').select('user_id, case_role').eq('case_id', caseId),
      supabase.from('data_access_grants').select('evidence_log_id, granted_to').eq('case_id', caseId),
    ]);

    if (filesRes.data) setFiles(filesRes.data);
    if (grantsRes.data) setGrants(grantsRes.data);

    if (assignRes.data) {
      const userIds = assignRes.data.map(a => a.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
      const nameMap: Record<string, string> = {};
      profiles?.forEach(p => { nameMap[p.id] = p.full_name; });
      setMembers(assignRes.data.filter(a => a.case_role !== 'case_incharge').map(a => ({
        ...a, full_name: nameMap[a.user_id] || 'Unknown',
      })));
    }

    // Build initial selections from existing grants
    const sel: Record<string, Set<string>> = {};
    grantsRes.data?.forEach(g => {
      if (!sel[g.evidence_log_id]) sel[g.evidence_log_id] = new Set();
      sel[g.evidence_log_id].add(g.granted_to);
    });
    setSelections(sel);
    setLoading(false);
  }

  function toggleGrant(fileId: string, userId: string) {
    setSelections(prev => {
      const next = { ...prev };
      if (!next[fileId]) next[fileId] = new Set();
      const s = new Set(next[fileId]);
      if (s.has(userId)) s.delete(userId); else s.add(userId);
      next[fileId] = s;
      return next;
    });
  }

  async function saveGrants() {
    setSaving(true);
    try {
      // Delete all current grants for this case
      await supabase.from('data_access_grants').delete().eq('case_id', caseId);

      // Insert new grants
      const inserts: { case_id: string; evidence_log_id: string; granted_to: string; granted_by: string }[] = [];
      Object.entries(selections).forEach(([fileId, users]) => {
        users.forEach(uid => {
          inserts.push({ case_id: caseId, evidence_log_id: fileId, granted_to: uid, granted_by: user!.id });
        });
      });

      if (inserts.length > 0) {
        const { error } = await supabase.from('data_access_grants').insert(inserts);
        if (error) throw error;
      }

      toast({ title: 'Access grants saved', description: `${inserts.length} access rules applied` });
    } catch (err: any) {
      toast({ title: 'Error saving grants', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  }

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (files.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Share2 className="h-5 w-5" /> Data Access Assignments
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-medium">File</th>
                {members.map(m => (
                  <th key={m.user_id} className="text-center py-2 px-2 font-medium">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs truncate max-w-20">{m.full_name}</span>
                      <Badge variant="outline" className="text-[9px]">{m.case_role}</Badge>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium truncate max-w-40">{f.file_name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{f.upload_type}</p>
                      </div>
                    </div>
                  </td>
                  {members.map(m => (
                    <td key={m.user_id} className="text-center py-2 px-2">
                      <Checkbox
                        checked={selections[f.id]?.has(m.user_id) || false}
                        onCheckedChange={() => toggleGrant(f.id, m.user_id)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end pt-3">
          <Button onClick={saveGrants} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Access Grants
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
