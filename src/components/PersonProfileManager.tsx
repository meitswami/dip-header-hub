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
  alias_name: string | null;
  phone: string | null;
  mobile_numbers: string[];
  photo_url: string | null;
  photo_urls: string[];
  role_in_case: string | null;
  alleged_role: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
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
    name: '', alias_name: '', alleged_role: 'Suspect',
    city: '', state: '', country: 'India', address: '',
    mobile_numbers: [''] as string[],
  });
  const [sectionOpen, setSectionOpen] = useState(false);

  useEffect(() => { loadPersons(); }, [caseId]);

  async function loadPersons() {
    const { data } = await supabase
      .from('person_profiles')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });
    if (data) setPersons(data as PersonProfile[]);
    setLoading(false);
  }

  function resetForm() {
    setForm({ name: '', alias_name: '', alleged_role: 'Suspect', city: '', state: '', country: 'India', address: '', mobile_numbers: [''] });
    setEditing(null);
    setFormPhotos([]);
    setShowForm(false);
  }

  function openEdit(p: PersonProfile) {
    setForm({
      name: p.name,
      alias_name: p.alias_name || '',
      alleged_role: p.alleged_role || p.role_in_case || 'Suspect',
      city: p.city || '',
      state: p.state || '',
      country: p.country || 'India',
      address: p.address || '',
      mobile_numbers: (p.mobile_numbers?.length ? p.mobile_numbers : [p.phone || '']).filter(Boolean).concat(['']),
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
    const mobiles = form.mobile_numbers.filter(m => m.trim());
    const payload = {
      case_id: caseId,
      name: form.name.trim(),
      alias_name: form.alias_name.trim() || null,
      alleged_role: form.alleged_role,
      role_in_case: form.alleged_role,
      phone: mobiles[0] || null,
      mobile_numbers: mobiles,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
      address: form.address.trim() || null,
    };

    try {
      if (editing) {
        // Upload new photos and merge with existing
        let photoUrls = editing.photo_urls || [];
        if (formPhotos.length > 0) {
          const newUrls = await uploadPhotosForPerson(editing.id, formPhotos);
          photoUrls = [...photoUrls, ...newUrls];
        }
        const { error } = await supabase.from('person_profiles').update({
          ...payload,
          photo_urls: photoUrls,
          photo_url: photoUrls[0] || null,
        }).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Person updated' });
      } else {
        const { data, error } = await supabase.from('person_profiles').insert(payload).select().single();
        if (error) throw error;
        // Upload photos for new person
        if (formPhotos.length > 0 && data) {
          const urls = await uploadPhotosForPerson(data.id, formPhotos);
          await supabase.from('person_profiles').update({
            photo_urls: urls,
            photo_url: urls[0] || null,
          }).eq('id', data.id);
        }
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
    const person = persons.find(p => p.id === personId);
    const currentUrls = person?.photo_urls || [];
    const newUrls = [...currentUrls, filePath];
    await supabase.from('person_profiles').update({ photo_urls: newUrls, photo_url: newUrls[0] }).eq('id', personId);
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

  // --- CSV Template Download ---
  function downloadTemplate() {
    const headers = ['Full Name', 'Alias', 'Alleged Role', 'Mobile Numbers (comma separated)', 'City', 'State', 'Country', 'Address'];
    const sampleRow = ['John Doe', 'JD', 'Suspect', '9876543210,9123456789', 'Mumbai', 'Maharashtra', 'India', '123 Main Street'];
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Persons');
    XLSX.writeFile(wb, 'persons_template.csv');
  }

  // --- CSV Import with smart merge ---
  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      let added = 0, updated = 0, skipped = 0;

      for (const row of rows) {
        const name = (row['Full Name'] || '').toString().trim();
        if (!name) { skipped++; continue; }

        const mobiles = (row['Mobile Numbers (comma separated)'] || '').toString().split(',').map((m: string) => m.trim()).filter(Boolean);
        const newData = {
          alias_name: (row['Alias'] || '').toString().trim() || null,
          alleged_role: (row['Alleged Role'] || 'Suspect').toString().trim(),
          mobile_numbers: mobiles,
          phone: mobiles[0] || null,
          city: (row['City'] || '').toString().trim() || null,
          state: (row['State'] || '').toString().trim() || null,
          country: (row['Country'] || 'India').toString().trim() || null,
          address: (row['Address'] || '').toString().trim() || null,
        };

        // Check if person with same name exists (case-insensitive)
        const existing = persons.find(p => p.name.toLowerCase() === name.toLowerCase());

        if (existing) {
          // Smart merge: only update fields that are empty/null in existing data
          const mergedPayload: any = {};
          if (!existing.alias_name && newData.alias_name) mergedPayload.alias_name = newData.alias_name;
          if (!existing.alleged_role && newData.alleged_role) mergedPayload.alleged_role = newData.alleged_role;
          if (!existing.city && newData.city) mergedPayload.city = newData.city;
          if (!existing.state && newData.state) mergedPayload.state = newData.state;
          if (!existing.country && newData.country) mergedPayload.country = newData.country;
          if (!existing.address && newData.address) mergedPayload.address = newData.address;

          // Merge mobile numbers (add new ones that don't exist)
          const existingMobiles = existing.mobile_numbers || [];
          const newMobiles = mobiles.filter((m: string) => !existingMobiles.includes(m));
          if (newMobiles.length > 0) {
            mergedPayload.mobile_numbers = [...existingMobiles, ...newMobiles];
            mergedPayload.phone = mergedPayload.mobile_numbers[0];
          }

          if (!existing.role_in_case && newData.alleged_role) mergedPayload.role_in_case = newData.alleged_role;

          if (Object.keys(mergedPayload).length > 0) {
            await supabase.from('person_profiles').update(mergedPayload).eq('id', existing.id);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Insert new person
          await supabase.from('person_profiles').insert({
            case_id: caseId,
            name,
            ...newData,
            role_in_case: newData.alleged_role,
          });
          added++;
        }
      }

      toast({
        title: 'CSV Import Complete',
        description: `Added: ${added}, Updated: ${updated}, Skipped: ${skipped}`,
      });
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
              <Button size="sm" variant="outline" onClick={downloadTemplate} title="Download CSV Template">
                <Download className="h-4 w-4 mr-1" /> Template
              </Button>
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
          <p className="text-sm text-muted-foreground text-center py-6">No persons added yet. Add manually or import from CSV.</p>
        ) : (
          /* Data table view */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3">Photo</th>
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Alias</th>
                  <th className="pb-2 pr-3">Role</th>
                  <th className="pb-2 pr-3">Mobile(s)</th>
                  <th className="pb-2 pr-3">Location</th>
                  <th className="pb-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {persons.map(p => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(p)}>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1">
                        <Avatar className="h-8 w-8">
                          {(p.photo_urls?.[0] || p.photo_url) ? (
                            <AvatarImage src={getPhotoUrl(p.photo_urls?.[0] || p.photo_url)} alt={p.name} />
                          ) : null}
                          <AvatarFallback className="text-[10px]">{p.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {(p.photo_urls?.length || 0) > 1 && (
                          <span className="text-[10px] text-muted-foreground">+{(p.photo_urls?.length || 0) - 1}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-medium">{p.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.alias_name || '—'}</td>
                    <td className="py-2 pr-3">
                      {p.alleged_role && <Badge variant="outline" className="text-xs">{p.alleged_role}</Badge>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col gap-0.5">
                        {(p.mobile_numbers?.length ? p.mobile_numbers : [p.phone]).filter(Boolean).map((m, i) => (
                          <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />{m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {[p.city, p.state, p.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="py-2 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <label className="cursor-pointer" title="Upload photo">
                          <input type="file" accept="image/*" className="hidden" onChange={ev => { if (ev.target.files?.[0]) uploadPhotoForExisting(p.id, ev.target.files[0]); }} />
                          <div className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent">
                            <ImageIcon className="h-3.5 w-3.5" />
                          </div>
                        </label>
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

        {/* Add/Edit Dialog */}
        <Dialog open={showForm} onOpenChange={v => { if (!v) resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Person' : 'Add Person'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Full Name *</label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Real full name" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Alias (Optional)</label>
                  <Input value={form.alias_name} onChange={e => setForm({ ...form, alias_name: e.target.value })} placeholder="Known alias" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Alleged Role</label>
                <Select value={form.alleged_role} onValueChange={v => setForm({ ...form, alleged_role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Mobile numbers */}
              <div>
                <label className="text-xs font-medium mb-1 block">Mobile Numbers</label>
                {form.mobile_numbers.map((num, i) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <Input
                      value={num}
                      onChange={e => {
                        const nums = [...form.mobile_numbers];
                        nums[i] = e.target.value;
                        setForm({ ...form, mobile_numbers: nums });
                      }}
                      placeholder={`Number ${i + 1}`}
                    />
                    {form.mobile_numbers.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
                        setForm({ ...form, mobile_numbers: form.mobile_numbers.filter((_, j) => j !== i) });
                      }}><X className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setForm({ ...form, mobile_numbers: [...form.mobile_numbers, ''] })}>
                  <Plus className="h-3 w-3 mr-1" /> Add Number
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">City</label>
                  <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="City" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">State</label>
                  <Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="State" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Country</label>
                  <Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Country" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Address</label>
                <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Full address" />
              </div>

              {/* Photo upload */}
              <div>
                <label className="text-xs font-medium mb-1 block">Photo(s)</label>
                {/* Show existing photos if editing */}
                {editing && editing.photo_urls?.length > 0 && (
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {editing.photo_urls.map((url, i) => (
                      <img key={i} src={getPhotoUrl(url)} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded object-cover border border-border" />
                    ))}
                  </div>
                )}
                {/* New photos to upload */}
                {formPhotos.length > 0 && (
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {formPhotos.map((f, i) => (
                      <div key={i} className="relative">
                        <img src={URL.createObjectURL(f)} alt={f.name} className="h-16 w-16 rounded object-cover border border-border" />
                        <button
                          className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px]"
                          onClick={() => setFormPhotos(formPhotos.filter((_, j) => j !== i))}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => {
                      if (e.target.files) setFormPhotos([...formPhotos, ...Array.from(e.target.files)]);
                      e.target.value = '';
                    }}
                  />
                  <Button variant="outline" size="sm" type="button">
                    <Upload className="h-3.5 w-3.5 mr-1" /> Add Photos
                  </Button>
                </div>
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
      </CardContent>
      </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
