import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface StaffProfile {
  id: string;
  full_name: string;
}

export default function NewCase() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [cioId, setCioId] = useState('');
  const [form, setForm] = useState({
    title: '', fir_number: '', sections: '', complainant: '', accused: '', description: '',
    case_date: '',
  });

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').order('full_name')
      .then(({ data }) => {
        if (data) setStaff(data);
        // Default CIO to current user
        if (user && !cioId) setCioId(user.id);
      });
  }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !cioId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('cases').insert({
        ...form,
        case_date: form.case_date || null,
        created_by: user.id,
      }).select('id').single();

      if (error) throw error;

      // Assign CIO with case_incharge role
      await supabase.from('case_assignments').insert({
        case_id: data.id, user_id: cioId, case_role: 'case_incharge',
      });

      // If creator is different from CIO, add creator as analyst
      if (cioId !== user.id) {
        await supabase.from('case_assignments').insert({
          case_id: data.id, user_id: user.id, case_role: 'analyst',
        });
      }

      toast({ title: 'Case created successfully' });
      navigate(`/cases/${data.id}`);
    } catch (err: any) {
      toast({ title: 'Error creating case', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Create New Case</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Case Title *</Label>
              <Input id="title" value={form.title} onChange={e => update('title', e.target.value)} placeholder="e.g. Cyber Fraud Investigation" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fir">FIR Number</Label>
                <Input id="fir" value={form.fir_number} onChange={e => update('fir_number', e.target.value)} placeholder="e.g. 123/2026" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Case Date</Label>
                <Input id="date" type="date" value={form.case_date} onChange={e => update('case_date', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cio">Case Incharge (CIO) *</Label>
              <Select value={cioId} onValueChange={setCioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Case Incharge..." />
                </SelectTrigger>
                <SelectContent>
                  {staff.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name} {s.id === user?.id ? '(You)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sections">Applicable Sections</Label>
              <Input id="sections" value={form.sections} onChange={e => update('sections', e.target.value)} placeholder="e.g. IPC 420, IT Act 66C" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="complainant">Complainant</Label>
                <Input id="complainant" value={form.complainant} onChange={e => update('complainant', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accused">Accused</Label>
                <Input id="accused" value={form.accused} onChange={e => update('accused', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Brief case description..." rows={3} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/cases')}>Cancel</Button>
              <Button type="submit" disabled={loading || !cioId}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Case
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
