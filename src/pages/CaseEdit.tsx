import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function CaseEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    fir_number: '',
    sections: '',
    complainant: '',
    accused: '',
    description: '',
    case_date: '',
    status: 'active',
  });

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        toast({ title: 'Case not found', variant: 'destructive' });
        navigate('/cases');
        return;
      }
      setForm({
        title: data.title || '',
        fir_number: data.fir_number || '',
        sections: data.sections || '',
        complainant: data.complainant || '',
        accused: data.accused || '',
        description: data.description || '',
        case_date: data.case_date || '',
        status: data.status || 'active',
      });
      setLoading(false);
    }
    load();
  }, [id]);

  const update = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('cases')
        .update({
          ...form,
          case_date: form.case_date || null,
        })
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Case updated successfully' });
      navigate(`/cases/${id}`);
    } catch (err: any) {
      toast({
        title: 'Error updating case',
        description: err?.message || 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (role !== 'admin' && role !== 'investigator') {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Edit Case</h1>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            You do not have permission to edit cases.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Edit Case</h1>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Loading case...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Case Title *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={e => update('title', e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fir">FIR Number</Label>
                  <Input
                    id="fir"
                    value={form.fir_number}
                    onChange={e => update('fir_number', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Case Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={form.case_date || ''}
                    onChange={e => update('case_date', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sections">Applicable Sections</Label>
                <Input
                  id="sections"
                  value={form.sections}
                  onChange={e => update('sections', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="complainant">Complainant</Label>
                  <Input
                    id="complainant"
                    value={form.complainant}
                    onChange={e => update('complainant', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accused">Accused</Label>
                  <Input
                    id="accused"
                    value={form.accused}
                    onChange={e => update('accused', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  value={form.description}
                  onChange={e => update('description', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={v => update('status', v)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/cases/${id}`)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

