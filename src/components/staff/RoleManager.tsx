import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Users, Loader2, Search } from 'lucide-react';

interface UserProfile {
  id: string;
  full_name: string;
  badge_number: string | null;
  department: string | null;
  rank: string | null;
  role: string;
}

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'investigator', label: 'Investigator', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'viewer', label: 'Viewer', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'none', label: 'No Role', color: 'bg-muted text-muted-foreground' },
];

export default function RoleManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, badge_number, department, rank');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    if (profiles) {
      setUsers(profiles.map(p => ({
        ...p,
        role: roles?.find(r => r.user_id === p.id)?.role || 'none',
      })));
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

  const filtered = users.filter(u =>
    !search || [u.full_name, u.badge_number, u.department, u.role, u.rank].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const roleBadge = (r: string) => {
    const found = ROLES.find(x => x.value === r);
    return <Badge variant="outline" className={found?.color || ''}>{found?.label || r}</Badge>;
  };

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {ROLES.map(r => (
          <Card key={r.value}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-2xl font-bold">{users.filter(u => u.role === r.value).length}</div>
              <div className="text-xs text-muted-foreground">{r.label}s</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Role Assignments</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><Users className="h-10 w-10 mx-auto mb-2 opacity-40" /><p>No users found</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Badge</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>System Role</TableHead>
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
                      <Select
                        value={u.role}
                        onValueChange={val => updateRole(u.id, val)}
                        disabled={u.id === user?.id}
                      >
                        <SelectTrigger className="w-40">{roleBadge(u.role)}</SelectTrigger>
                        <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
