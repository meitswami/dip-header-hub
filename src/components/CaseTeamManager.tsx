import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Trash2, Shield, UserCheck, Upload as UploadIcon, Eye, Loader2 } from 'lucide-react';

interface Member {
  id: string;
  user_id: string;
  case_role: string;
  full_name: string;
}

interface StaffProfile {
  id: string;
  full_name: string;
}

const ROLE_LABELS: Record<string, string> = {
  case_incharge: 'Case Incharge (CIO)',
  procurement: 'Procurement',
  analyst: 'Analyst',
  viewer: 'Viewer',
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  case_incharge: <Shield className="h-3.5 w-3.5" />,
  procurement: <UploadIcon className="h-3.5 w-3.5" />,
  analyst: <UserCheck className="h-3.5 w-3.5" />,
  viewer: <Eye className="h-3.5 w-3.5" />,
};

const ROLE_COLORS: Record<string, string> = {
  case_incharge: 'bg-primary/15 text-primary border-primary/30',
  procurement: 'bg-warning/15 text-warning border-warning/30',
  analyst: 'bg-success/15 text-success border-success/30',
  viewer: 'bg-muted text-muted-foreground border-border',
};

export default function CaseTeamManager({ caseId }: { caseId: string }) {
  const { user, role: systemRole } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [allStaff, setAllStaff] = useState<StaffProfile[]>([]);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedRole, setSelectedRole] = useState('analyst');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);

  const canManage = myRole === 'case_incharge' || systemRole === 'admin';

  useEffect(() => {
    loadMembers();
    loadStaff();
  }, [caseId]);

  async function loadMembers() {
    setLoading(true);
    const { data } = await supabase
      .from('case_assignments')
      .select('id, user_id, case_role')
      .eq('case_id', caseId);

    if (data) {
      // Fetch profile names for members
      const userIds = data.map(d => d.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const profileMap: Record<string, string> = {};
      profiles?.forEach(p => { profileMap[p.id] = p.full_name; });

      const mapped = data.map(d => ({
        ...d,
        full_name: profileMap[d.user_id] || 'Unknown',
      }));
      setMembers(mapped);

      // Set my role
      const mine = data.find(d => d.user_id === user?.id);
      setMyRole(mine?.case_role || null);
    }
    setLoading(false);
  }

  async function loadStaff() {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
    if (data) setAllStaff(data);
  }

  async function addMember() {
    if (!selectedStaff || !caseId) return;
    // Check if already a member
    if (members.some(m => m.user_id === selectedStaff)) {
      toast({ title: 'Already a member', variant: 'destructive' });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('case_assignments').insert({
      case_id: caseId,
      user_id: selectedStaff,
      case_role: selectedRole,
    });
    if (error) {
      toast({ title: 'Error adding member', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Member added' });
      setSelectedStaff('');
      await loadMembers();
    }
    setAdding(false);
  }

  async function updateRole(assignmentId: string, newRole: string) {
    const { error } = await supabase
      .from('case_assignments')
      .update({ case_role: newRole })
      .eq('id', assignmentId);
    if (error) {
      toast({ title: 'Error updating role', description: error.message, variant: 'destructive' });
    } else {
      await loadMembers();
    }
  }

  async function removeMember(assignmentId: string, memberRole: string) {
    if (memberRole === 'case_incharge') {
      toast({ title: 'Cannot remove Case Incharge', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('case_assignments').delete().eq('id', assignmentId);
    if (error) {
      toast({ title: 'Error removing member', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Member removed' });
      await loadMembers();
    }
  }

  const availableStaff = allStaff.filter(s => !members.some(m => m.user_id === s.id));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" /> Case Team ({members.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Members list */}
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {m.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.full_name}</p>
                      <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[m.case_role] || ''}`}>
                        {ROLE_ICONS[m.case_role]} {ROLE_LABELS[m.case_role] || m.case_role}
                      </Badge>
                    </div>
                  </div>
                  {canManage && m.case_role !== 'case_incharge' && (
                    <div className="flex items-center gap-2">
                      <Select value={m.case_role} onValueChange={v => updateRole(m.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="procurement">Procurement</SelectItem>
                          <SelectItem value="analyst">Analyst</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMember(m.id, m.case_role)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add member */}
            {canManage && (
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger className="flex-1 h-9">
                    <SelectValue placeholder="Select staff member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStaff.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="w-32 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="procurement">Procurement</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={addMember} disabled={!selectedStaff || adding}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
