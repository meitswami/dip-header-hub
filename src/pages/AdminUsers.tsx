import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Users, Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export default function AdminUsers() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== 'admin') return;
    loadUsers();
  }, [role]);

  async function loadUsers() {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, badge_number, department');
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
          // If upsert fails due to unique constraint, delete old role first
          await supabase.from('user_roles').delete().eq('user_id', userId);
          await supabase.from('user_roles').insert({ user_id: userId, role: newRole as any });
        }
      }
      toast({ title: 'Role updated' });
      loadUsers();
    } catch (err: any) {
      toast({ title: 'Failed to update role', description: err.message, variant: 'destructive' });
    }
  }

  if (role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><Users className="h-10 w-10 mx-auto mb-2 opacity-40" /><p>No users found</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Badge</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                    <TableCell>{u.badge_number || '—'}</TableCell>
                    <TableCell>{u.department || '—'}</TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={val => updateRole(u.id, val)}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="investigator">Investigator</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="none">No Role</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
