import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Search, Loader2, Pencil, Shield } from 'lucide-react';

interface Staff {
  id: string;
  full_name: string;
  department: string | null;
  badge_number: string | null;
  phone: string | null;
  rank: string | null;
  designation: string | null;
  system_role?: string;
}

const RANKS = [
  'Director General of Police (DGP)',
  'Additional DGP',
  'Inspector General (IG)',
  'Deputy Inspector General (DIG)',
  'Superintendent of Police (SP)',
  'Additional SP',
  'Deputy SP (DSP)',
  'Inspector',
  'Sub-Inspector (SI)',
  'Assistant Sub-Inspector (ASI)',
  'Head Constable',
  'Constable',
  'Cyber Cell Officer',
  'Technical Analyst',
  'Other',
];

export default function StaffManagement() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', department: '', badge_number: '', phone: '', rank: '', designation: '' });
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => { loadStaff(); }, []);

  async function loadStaff() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, department, badge_number, phone, rank, designation')
      .order('full_name');

    if (profiles) {
      // Get system roles
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');
      const roleMap: Record<string, string> = {};
      roles?.forEach(r => { roleMap[r.user_id] = r.role; });

      setStaff(profiles.map(p => ({ ...p, system_role: roleMap[p.id] || 'viewer' })));
    }
    setLoading(false);
  }

  function openEdit(s: Staff) {
    setEditingStaff(s);
    setEditForm({
      full_name: s.full_name || '',
      department: s.department || '',
      badge_number: s.badge_number || '',
      phone: s.phone || '',
      rank: s.rank || '',
      designation: s.designation || '',
    });
    setDialogOpen(true);
  }

  async function saveEdit() {
    if (!editingStaff) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.full_name,
      department: editForm.department || null,
      badge_number: editForm.badge_number || null,
      phone: editForm.phone || null,
      rank: editForm.rank || null,
      designation: editForm.designation || null,
    }).eq('id', editingStaff.id);

    if (error) {
      toast({ title: 'Error updating', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Staff updated' });
      setDialogOpen(false);
      await loadStaff();
    }
    setSaving(false);
  }

  const filtered = staff.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.rank?.toLowerCase().includes(search.toLowerCase()) ||
    s.department?.toLowerCase().includes(search.toLowerCase()) ||
    s.badge_number?.toLowerCase().includes(search.toLowerCase())
  );

  const roleColor = (r?: string) => {
    switch (r) {
      case 'admin': return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'investigator': return 'bg-primary/15 text-primary border-primary/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground">Manage staff profiles, ranks, and designations</p>
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, rank, department..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" /> Staff Directory ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No staff found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                      {s.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.full_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {s.rank && <span>{s.rank}</span>}
                        {s.rank && s.department && <span>·</span>}
                        {s.department && <span>{s.department}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.badge_number && (
                      <span className="text-xs font-mono text-muted-foreground">#{s.badge_number}</span>
                    )}
                    {s.designation && (
                      <Badge variant="outline" className="text-[10px]">{s.designation}</Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${roleColor(s.system_role)}`}>
                      {s.system_role}
                    </Badge>
                    {role === 'admin' && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rank</Label>
                <Select value={editForm.rank} onValueChange={v => setEditForm(f => ({ ...f, rank: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select rank..." /></SelectTrigger>
                  <SelectContent>
                    {RANKS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))} placeholder="e.g. Nodal Officer, SHO" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Input value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Cyber Crime Cell" />
              </div>
              <div className="space-y-2">
                <Label>Badge Number</Label>
                <Input value={editForm.badge_number} onChange={e => setEditForm(f => ({ ...f, badge_number: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
