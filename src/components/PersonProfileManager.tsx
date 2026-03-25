import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Users, Plus, Trash2, Upload, Loader2, Edit2, Phone, MapPin, X,
  ChevronDown, Download, FileUp, Image as ImageIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
  caseId: string;
}

type PersonProfile = {
  id: string;
  name: string;
  role: string | null;
  phone_numbers: string[] | null;
  photo_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  case_id: string;
};

const ROLES = ['Accused', 'Suspect', 'Victim', 'Witness', 'Complainant', 'Informant', 'Other'];

export default function PersonProfileManager({ caseId }: Props) {
  const { user } = useAuth();
  const [persons, setPersons] = useState<PersonProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PersonProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [formPhotos, setFormPhotos] = useState<File[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '', role: 'suspect',
    phone_numbers: [''] as string[],
    notes: '',
  });
  const [sectionOpen, setSectionOpen] = useState(false);

  useEffect(() => { loadPersons(); }, [caseId]);

  async function loadPersons() {
    const { data } = await supabase
      .from('person_profiles')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });
    if (data) setPersons(data as unknown as PersonProfile[]);
    setLoading(false);
  }

  function resetForm() {
    setForm({ name: '', role: 'suspect', phone_numbers: [''], notes: '' });
    setEditing(null);
    setFormPhotos([]);
    setShowForm(false);
  }

  function openEdit(p: PersonProfile) {
    setForm({
      name: p.name,
      role: p.role || 'suspect',
      phone_numbers: (p.phone_numbers?.length ? p.phone_numbers : ['']),
      notes: p.notes || '',
    });
    setEditing(p);
    setFormPhotos([]);
    setShowForm(true);
  }

  async function uploadPhotosForPerson(personId: string, files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const file of files) {
      const filePath = `${caseId}/person_${personId}_${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('evidence').upload(filePath, file);
      if (!error) urls.push(filePath);
    }
    return urls;
  }

  async function savePerson() {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const mobiles = form.phone_numbers.filter(m => m.trim());
    const payload: any = {
      case_id: caseId,
      name: form.name.trim(),
      role: form.role,
      phone_numbers: mobiles,
      notes: form.notes.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('person_profiles').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Person updated' });
      } else {
        const { data, error } = await supabase.from('person_profiles').insert(payload).select().single();
        if (error) throw error;
        toast({ title: 'Person added' });
      }
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    }
    setUploading(false);
    resetForm();
    loadPersons();
  }

  async function uploadPhotoForExisting(personId: string, file: File) {
    setUploading(true);
    const filePath = `${caseId}/person_${personId}_${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('evidence').upload(filePath, file);
    if (error) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      setUploading(false);
      return;
    }
    await supabase.from('person_profiles').update({ photo_url: filePath }).eq('id', personId);
    toast({ title: 'Photo uploaded' });
    setUploading(false);
    loadPersons();
  }

  async function deletePerson(id: string) {
    if (!confirm('Delete this person profile?')) return;
    await supabase.from('person_profiles').delete().eq('id', id);
    toast({ title: 'Person deleted' });
    loadPersons();
  }

  function getPhotoUrl(path: string | null) {
    if (!path) return '';
    const { data } = supabase.storage.from('evidence').getPublicUrl(path);
    return data.publicUrl;
  }

  // --- CSV Import ---
  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      let added = 0, skipped = 0;
      for (const row of rows) {
        const name = (row['Full Name'] || '').toString().trim();
        if (!name) { skipped++; continue; }
        const mobiles = (row['Mobile Numbers'] || '').toString().split(',').map((m: string) => m.trim()).filter(Boolean);
        await supabase.from('person_profiles').insert({
          case_id: caseId, name,
          role: (row['Role'] || 'suspect').toString().trim(),
          phone_numbers: mobiles,
        } as any);
        added++;
      }
      toast({ title: 'Import Complete', description: `Added: ${added}, Skipped: ${skipped}` });
      loadPersons();
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    }
    setImporting(false);
    e.target.value = '';
  }

  return (
    <Card>
      <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-base font-semibold text-left">
                <Users className="h-5 w-5 text-primary" />
                Persons ({persons.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${sectionOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <div className="flex gap-2">
              <div className="relative">
                <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleCSVImport} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
                <Button size="sm" variant="outline" disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileUp className="h-4 w-4 mr-1" />}
                  Import
                </Button>
              </div>
              <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="space-y-3">
        {loading ? (
          <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : persons.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No persons added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3">Photo</th>
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Role</th>
                  <th className="pb-2 pr-3">Phone(s)</th>
                  <th className="pb-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {persons.map(p => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(p)}>
                    <td className="py-2 pr-3">
                      <Avatar className="h-8 w-8">
                        {p.photo_url ? <AvatarImage src={getPhotoUrl(p.photo_url)} alt={p.name} /> : null}
                        <AvatarFallback className="text-[10px]">{p.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </td>
                    <td className="py-2 pr-3 font-medium">{p.name}</td>
                    <td className="py-2 pr-3">
                      {p.role && <Badge variant="outline" className="text-xs">{p.role}</Badge>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col gap-0.5">
                        {(p.phone_numbers || []).map((m, i) => (
                          <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />{m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePerson(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
<<<<<<< HEAD
=======

        {/* Add/Edit Dialog */}
        <Dialog open={showForm} onOpenChange={v => { if (!v) resetForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Person' : 'Add Person'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Full Name *</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Role</label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r.toLowerCase()}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Phone Numbers</label>
                {form.phone_numbers.map((num, i) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <Input value={num} onChange={e => {
                      const nums = [...form.phone_numbers];
                      nums[i] = e.target.value;
                      setForm({ ...form, phone_numbers: nums });
                    }} placeholder={`Number ${i + 1}`} />
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setForm({ ...form, phone_numbers: [...form.phone_numbers, ''] })}>
                  <Plus className="h-3 w-3 mr-1" /> Add Number
                </Button>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Notes</label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button onClick={savePerson} disabled={!form.name.trim() || uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  {editing ? 'Update' : 'Add Person'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
>>>>>>> 190780503942b273a628c5916becb363ed820f3a
      </CardContent>
      </CollapsibleContent>
      </Collapsible>

      {/* Add/Edit Dialog — outside Collapsible so it opens even when section is closed */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(!!v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Person' : 'Add Person'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Full Name *</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Role</label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r.toLowerCase()}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Phone Numbers</label>
              {form.phone_numbers.map((num, i) => (
                <div key={i} className="flex gap-2 mb-1.5">
                  <Input value={num} onChange={e => {
                    const nums = [...form.phone_numbers];
                    nums[i] = e.target.value;
                    setForm({ ...form, phone_numbers: nums });
                  }} placeholder={`Number ${i + 1}`} />
                </div>
              ))}
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setForm({ ...form, phone_numbers: [...form.phone_numbers, ''] })}>
                <Plus className="h-3 w-3 mr-1" /> Add Number
              </Button>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Notes</label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={savePerson} disabled={!form.name.trim() || uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                {editing ? 'Update' : 'Add Person'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
