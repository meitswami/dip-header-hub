import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Search, Loader2, Pencil, Trash2 } from 'lucide-react';

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
  'Director General of Police (DGP)', 'Additional DGP', 'Inspector General (IG)',
  'Deputy Inspector General (DIG)', 'Superintendent of Police (SP)', 'Additional SP',
  'Deputy SP (DSP)', 'Inspector', 'Sub-Inspector (SI)', 'Assistant Sub-Inspector (ASI)',
  'Head Constable', 'Constable', 'Cyber Cell Officer', 'Technical Analyst', 'Other',
];

const DEPARTMENTS = [
  'Cyber Crime Cell', 'Crime Branch', 'Special Cell', 'Traffic', 'PCR',
  'Anti-Narcotics', 'EOW (Economic Offences Wing)', 'Women Cell', 'Forensic Lab', 'Control Room', 'Other',
];

const emptyForm = { full_name: '', department: '', badge_number: '', phone: '', rank: '', designation: '' };

export default function StaffDirectory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [deleteStaff, setDeleteStaff] = useState<Staff | null>(null);

  useEffect(() => { loadStaff(); }, []);

  async function loadStaff() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, department, badge_number, phone, rank, designation')
      .order('full_name');
    if (profiles) {
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');
      const roleMap: Record<string, string> = {};
      roles?.forEach(r => { roleMap[r.user_id] = r.role; });
      setStaff(profiles.map(p => ({ ...p, system_role: roleMap[p.id] || 'viewer' })));
    }
    setLoading(false);
  }

  function openCreate() {
    setIsNew(true);
    setEditingStaff(null);
    setEditForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(s: Staff) {
    setIsNew(false);
    setEditingStaff(s);
    setEditForm({
      full_name: s.full_name || '', department: s.department || '',
      badge_number: s.badge_number || '', phone: s.phone || '',
      rank: s.rank || '', designation: s.designation || '',
    });
    setDialogOpen(true);
  }

  async function saveForm() {
    if (!editForm.full_name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      full_name: editForm.full_name,
      department: editForm.department || null,
      badge_number: editForm.badge_number || null,
      phone: editForm.phone || null,
      rank: editForm.rank || null,
      designation: editForm.designation || null,
    };

    if (isNew) {
      toast({ title: 'New staff must register/sign up first', description: 'You can then edit their profile here.' });
      setSaving(false);
      setDialogOpen(false);
      return;
    }

    const { error } = await supabase.from('profiles').update(payload).eq('id', editingStaff!.id);
    if (error) {
      toast({ title: 'Error updating', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Staff updated successfully' });
      setDialogOpen(false);
      await loadStaff();
    }
    setSaving(false);
  }

  async function confirmDelete() {
    if (!deleteStaff) return;
    try {
      await supabase.from('user_roles').delete().eq('user_id', deleteStaff.id);
      const { error } = await supabase.from('profiles').delete().eq('id', deleteStaff.id);
      if (error) throw error;
      toast({ title: 'Staff profile removed' });
      setDeleteStaff(null);
      loadStaff();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  }

  const filtered = staff.filter(s =>
    !search || [s.full_name, s.rank, s.department, s.badge_number, s.designation].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const roleColor = (r?: string) => {
    switch (r) {
      case 'admin': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'investigator': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 mr-4">
          <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-2xl font-bold">{staff.length}</div><div className="text-xs text-muted-foreground">Total Staff</div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-2xl font-bold">{staff.filter(s => s.rank).length}</div><div className="text-xs text-muted-foreground">With Rank</div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-2xl font-bold">{new Set(staff.map(s => s.department).filter(Boolean)).size}</div><div className="text-xs text-muted-foreground">Departments</div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-2xl font-bold">{staff.filter(s => s.badge_number).length}</div><div className="text-xs text-muted-foreground">With Badge</div></CardContent></Card>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Staff
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Staff Directory ({filtered.length})</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><Users className="h-10 w-10 mx-auto mb-2 opacity-40" /><p>No staff found</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Badge</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>System Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell>{s.rank || '—'}</TableCell>
                    <TableCell>{s.designation || '—'}</TableCell>
                    <TableCell>{s.department || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{s.badge_number || '—'}</TableCell>
                    <TableCell>{s.phone || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className={roleColor(s.system_role)}>{s.system_role}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      {s.id !== user?.id && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteStaff(s)} className="text-destructive hover:text-destructive" title="Remove"><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNew ? 'Add Staff' : 'Edit Staff Profile'}</DialogTitle>
            <DialogDescription>{isNew ? 'New staff must sign up first. You can then edit their profile here.' : 'Update staff profile details'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Full Name *</Label><Input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Rank</Label>
                <Select value={editForm.rank} onValueChange={v => setEditForm(f => ({ ...f, rank: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select rank..." /></SelectTrigger>
                  <SelectContent>{RANKS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Designation</Label><Input value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))} placeholder="e.g. Nodal Officer, SHO" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Department</Label>
                <Select value={editForm.department} onValueChange={v => setEditForm(f => ({ ...f, department: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                  <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Badge Number</Label><Input value={editForm.badge_number} onChange={e => setEditForm(f => ({ ...f, badge_number: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Phone</Label><Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveForm} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{isNew ? 'Add Staff' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteStaff} onOpenChange={open => !open && setDeleteStaff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Staff</DialogTitle>
            <DialogDescription>Are you sure you want to remove <strong>{deleteStaff?.full_name}</strong>? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteStaff(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Remove Staff</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
