import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Group, Plus, Loader2, Pencil, Trash2, UserPlus, ToggleRight } from 'lucide-react';

interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

interface Profile {
  id: string;
  full_name: string;
}

interface GroupModPerm {
  group_id: string;
  module_key: string;
  enabled: boolean;
}

const MODULES = [
  { key: 'cdr_analysis', label: 'CDR Analysis' },
  { key: 'ipdr_analysis', label: 'IPDR Analysis' },
  { key: 'tower_dump', label: 'Tower Dump' },
  { key: 'ai_chat', label: 'AI Chat' },
  { key: 'reports', label: 'Reports' },
  { key: 'documents', label: 'Documents' },
  { key: 'knowledge_base', label: 'Knowledge Base' },
  { key: 'legal_reference', label: 'Legal Reference' },
  { key: 'case_compare', label: 'Case Compare' },
  { key: 'data_upload', label: 'Data Upload' },
];

export default function GroupManager() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<UserGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<UserGroup | null>(null);
  const [membersGroup, setMembersGroup] = useState<UserGroup | null>(null);
  const [permsGroup, setPermsGroup] = useState<UserGroup | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [groupPerms, setGroupPerms] = useState<GroupModPerm[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadGroups(); }, []);

  async function loadGroups() {
    setLoading(true);
    const { data: grps } = await supabase.from('user_groups').select('*').order('name');
    const { data: members } = await supabase.from('group_members').select('group_id');
    if (grps) {
      setGroups(grps.map(g => ({
        ...g,
        member_count: members?.filter(m => m.group_id === g.id).length || 0,
      })));
    }
    setLoading(false);
  }

  async function saveGroup() {
    if (!form.name.trim()) { toast({ title: 'Group name required', variant: 'destructive' }); return; }
    setSaving(true);
    if (editGroup) {
      const { error } = await supabase.from('user_groups').update({ name: form.name, description: form.description || null }).eq('id', editGroup.id);
      if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Group updated' }); setEditGroup(null); }
    } else {
      const { error } = await supabase.from('user_groups').insert({ name: form.name, description: form.description || null });
      if (error) toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Group created' }); setAddOpen(false); }
    }
    setForm({ name: '', description: '' });
    setSaving(false);
    loadGroups();
  }

  async function confirmDelete() {
    if (!deleteGroup) return;
    const { error } = await supabase.from('user_groups').delete().eq('id', deleteGroup.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Group deleted' }); setDeleteGroup(null); loadGroups(); }
  }

  async function openMembers(g: UserGroup) {
    setMembersGroup(g);
    const [{ data: users }, { data: members }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('group_members').select('user_id').eq('group_id', g.id),
    ]);
    setAllUsers(users || []);
    setGroupMembers(members?.map(m => m.user_id) || []);
  }

  async function toggleMember(userId: string) {
    if (!membersGroup) return;
    if (groupMembers.includes(userId)) {
      await supabase.from('group_members').delete().eq('group_id', membersGroup.id).eq('user_id', userId);
      setGroupMembers(prev => prev.filter(id => id !== userId));
    } else {
      await supabase.from('group_members').insert({ group_id: membersGroup.id, user_id: userId });
      setGroupMembers(prev => [...prev, userId]);
    }
    loadGroups();
  }

  async function openPerms(g: UserGroup) {
    setPermsGroup(g);
    const { data } = await supabase.from('group_module_permissions').select('group_id, module_key, enabled').eq('group_id', g.id);
    setGroupPerms(data || []);
  }

  function isModuleEnabled(moduleKey: string) {
    const p = groupPerms.find(x => x.module_key === moduleKey);
    return p ? p.enabled : true; // default enabled
  }

  async function toggleModulePerm(moduleKey: string) {
    if (!permsGroup) return;
    const newVal = !isModuleEnabled(moduleKey);

    // Optimistic update
    setGroupPerms(prev => {
      const exists = prev.find(x => x.module_key === moduleKey);
      if (exists) return prev.map(x => x.module_key === moduleKey ? { ...x, enabled: newVal } : x);
      return [...prev, { group_id: permsGroup.id, module_key: moduleKey, enabled: newVal }];
    });

    const { error } = await supabase.from('group_module_permissions').upsert(
      { group_id: permsGroup.id, module_key: moduleKey, enabled: newVal, updated_at: new Date().toISOString() },
      { onConflict: 'group_id,module_key' }
    );

    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      openPerms(permsGroup);
    } else {
      toast({ title: `${moduleKey.replace(/_/g, ' ')} ${newVal ? 'enabled' : 'disabled'} for ${permsGroup.name}` });
    }
  }

  function openEdit(g: UserGroup) {
    setEditGroup(g);
    setForm({ name: g.name, description: g.description || '' });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Create user groups, assign members, and manage group-level module access</p>
        <Button onClick={() => { setAddOpen(true); setForm({ name: '', description: '' }); }}>
          <Plus className="h-4 w-4 mr-2" />
          Create Group
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><Group className="h-5 w-5" /> All Groups</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Group className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No groups yet. Create one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map(g => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{g.description || '—'}</TableCell>
                    <TableCell><Badge variant="outline">{g.member_count} members</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(g.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openMembers(g)} title="Manage members"><UserPlus className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openPerms(g)} title="Module permissions"><ToggleRight className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(g)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteGroup(g)} className="text-destructive hover:text-destructive" title="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Group Dialog */}
      <Dialog open={addOpen || !!editGroup} onOpenChange={open => { if (!open) { setAddOpen(false); setEditGroup(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editGroup ? 'Edit Group' : 'Create Group'}</DialogTitle>
            <DialogDescription>{editGroup ? 'Update group details' : 'Create a new user group'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Group Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Cyber Cell Team" /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setEditGroup(null); }}>Cancel</Button>
            <Button onClick={saveGroup} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editGroup ? 'Save Changes' : 'Create Group'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Members Dialog */}
      <Dialog open={!!membersGroup} onOpenChange={open => !open && setMembersGroup(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Members — {membersGroup?.name}</DialogTitle>
            <DialogDescription>Toggle users to add/remove them from this group</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {allUsers.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                <Checkbox checked={groupMembers.includes(u.id)} onCheckedChange={() => toggleMember(u.id)} />
                <span className="text-sm font-medium">{u.full_name}</span>
              </div>
            ))}
            {allUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No users found</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersGroup(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Module Permissions Dialog */}
      <Dialog open={!!permsGroup} onOpenChange={open => !open && setPermsGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Module Permissions — {permsGroup?.name}</DialogTitle>
            <DialogDescription>
              Enable or disable modules for this group. Group permissions can override role-level denials — if a module is disabled for a role but enabled for a group, members of that group will still have access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {MODULES.map(mod => (
              <div key={mod.key} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                <span className="text-sm font-medium">{mod.label}</span>
                <Switch
                  checked={isModuleEnabled(mod.key)}
                  onCheckedChange={() => toggleModulePerm(mod.key)}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermsGroup(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteGroup} onOpenChange={open => !open && setDeleteGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
            <DialogDescription>Are you sure you want to delete <strong>{deleteGroup?.name}</strong>? All members will be removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroup(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete Group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
