import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Users, Loader2, Pencil, Trash2, Plus, Search, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface UserProfile {
  id: string;
  full_name: string;
  badge_number: string | null;
  department: string | null;
  rank: string | null;
  designation: string | null;
  phone: string | null;
  role: string;
}

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'investigator', label: 'Investigator', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'viewer', label: 'Viewer', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'none', label: 'No Role', color: 'bg-muted text-muted-foreground' },
];

export default function AdminUsers() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', badge_number: '', department: '', rank: '', designation: '', phone: '', role: '' });

  useEffect(() => {
    if (role !== 'admin') return;
    loadUsers();
  }, [role]);

  async function loadUsers() {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, badge_number, department, rank, designation, phone');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    if (profiles) {
      const combined = profiles.map(p => ({
        ...p,
        role: roles?.find(r => r.user_id === p.id)?.role || 'none',
      }));
      setUsers(combined);
    }
    setLoading(false);
  }

  async function updateRole(userId: string, newRole: string) {
    try {
      if (newRole === 'none') {
        await supabase.from('user_roles').delete().eq('user_id', userId);
      } else {
        const { error } = await supabase.from('user_roles').upsert(
          { user_id: userId, role: newRole as any },
          { onConflict: 'user_id,role' }
        );
        if (error) {
          await supabase.from('user_roles').delete().eq('user_id', userId);
          await supabase.from('user_roles').insert({ user_id: userId, role: newRole as any });
        }
      }
      toast({ title: 'Role updated successfully' });
      loadUsers();
    } catch (err: any) {
      toast({ title: 'Failed to update role', description: err.message, variant: 'destructive' });
    }
  }

  function openEdit(u: UserProfile) {
    setEditUser(u);
    setEditForm({
      full_name: u.full_name || '',
      badge_number: u.badge_number || '',
      department: u.department || '',
      rank: u.rank || '',
      designation: u.designation || '',
      phone: u.phone || '',
      role: u.role,
    });
  }

  async function saveEdit() {
    if (!editUser) return;
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: editForm.full_name,
        badge_number: editForm.badge_number || null,
        department: editForm.department || null,
        rank: editForm.rank || null,
        designation: editForm.designation || null,
        phone: editForm.phone || null,
      }).eq('id', editUser.id);

      if (error) throw error;

      if (editForm.role !== editUser.role) {
        await updateRole(editUser.id, editForm.role);
      }

      toast({ title: 'User updated successfully' });
      setEditUser(null);
      loadUsers();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    try {
      // Remove role first, then profile
      await supabase.from('user_roles').delete().eq('user_id', deleteUser.id);
      const { error } = await supabase.from('profiles').delete().eq('id', deleteUser.id);
      if (error) throw error;
      toast({ title: 'User profile removed' });
      setDeleteUser(null);
      loadUsers();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  }

  const filtered = users.filter(u =>
    !search || [u.full_name, u.badge_number, u.department, u.role].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const roleBadge = (r: string) => {
    const found = ROLES.find(x => x.value === r);
    return <Badge variant="outline" className={found?.color || ''}>{found?.label || r}</Badge>;
  };

  if (role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            User & Role Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage users, assign roles, and edit profiles</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {ROLES.map(r => {
          const count = users.filter(u => u.role === r.value).length;
          return (
            <Card key={r.value}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{r.label}s</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* User Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">All Users</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No users found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Badge</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                    <TableCell>{u.badge_number || '—'}</TableCell>
                    <TableCell>{u.department || '—'}</TableCell>
                    <TableCell>{u.rank || '—'}</TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={val => updateRole(u.id, val)}>
                        <SelectTrigger className="w-36">{roleBadge(u.role)}</SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Edit user">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {u.id !== user?.id && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteUser(u)} title="Remove user" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user profile and role assignment</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Full Name</Label>
              <Input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Badge Number</Label>
                <Input value={editForm.badge_number} onChange={e => setEditForm(f => ({ ...f, badge_number: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Phone</Label>
                <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Department</Label>
                <Input value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Rank</Label>
                <Input value={editForm.rank} onChange={e => setEditForm(f => ({ ...f, rank: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Designation</Label>
              <Input value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={val => setEditForm(f => ({ ...f, role: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteUser} onOpenChange={open => !open && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove User</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{deleteUser?.full_name}</strong>'s profile and role? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Remove User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
