import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

const DATA_TYPES = [
  { key: 'cdr_records', label: 'CDR Records', description: 'Call Detail Records' },
  { key: 'ipdr_records', label: 'IPDR Records', description: 'Internet Protocol Detail Records' },
  { key: 'tower_dump_records', label: 'Tower Dump Records', description: 'Tower dump data' },
  { key: 'sdr_records', label: 'SDR Records', description: 'Subscriber Detail Records' },
  { key: 'investigation_insights', label: 'Investigation Insights', description: 'Auto-generated insights' },
  { key: 'chat_logs', label: 'Chat Logs', description: 'AI chat history' },
  { key: 'case_tasks', label: 'Case Tasks', description: 'Task assignments' },
  { key: 'activity_logs', label: 'Activity Logs', description: 'Audit trail records' },
  { key: 'evidence_logs', label: 'Evidence Logs', description: 'Upload evidence chain' },
  { key: 'case_documents', label: 'Case Documents', description: 'Uploaded documents' },
  { key: 'aliases', label: 'Aliases', description: 'Phone number aliases' },
  { key: 'geofences', label: 'Geofences', description: 'Geofence zones' },
  { key: 'geofence_alerts', label: 'Geofence Alerts', description: 'Zone breach alerts' },
  { key: 'notifications', label: 'Notifications', description: 'User notifications' },
  { key: 'cases', label: 'All Cases & Data', description: '⚠️ Deletes cases and ALL associated records' },
] as const;

type DataTypeKey = (typeof DATA_TYPES)[number]['key'];

export default function DataCleanup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<DataTypeKey>>(new Set());
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [results, setResults] = useState<{ key: string; count: number }[]>([]);

  const toggleType = (key: DataTypeKey) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === DATA_TYPES.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(DATA_TYPES.map(d => d.key)));
    }
  };

  const handleDelete = async () => {
    if (!user || selected.size === 0) return;

    // Verify password by re-authenticating
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password,
    });

    if (authError) {
      toast({ title: 'Authentication failed', description: 'Incorrect password. Please try again.', variant: 'destructive' });
      return;
    }

    setDeleting(true);
    const deleteResults: { key: string; count: number }[] = [];

    // If deleting cases, delete dependent tables first
    const orderedKeys: DataTypeKey[] = [];
    const dependentTables: DataTypeKey[] = ['cdr_records', 'ipdr_records', 'tower_dump_records', 'sdr_records', 'investigation_insights', 'chat_logs', 'case_tasks', 'activity_logs', 'evidence_logs', 'case_documents', 'aliases', 'geofence_alerts', 'geofences', 'notifications'];

    if (selected.has('cases')) {
      // Delete everything in order
      dependentTables.forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });
      orderedKeys.push('cases');
    } else {
      // geofence_alerts before geofences
      if (selected.has('geofence_alerts')) orderedKeys.push('geofence_alerts');
      if (selected.has('geofences')) orderedKeys.push('geofences');
      selected.forEach(k => { if (!orderedKeys.includes(k) && k !== 'cases') orderedKeys.push(k); });
    }

    for (const key of orderedKeys) {
      try {
        // For notifications, delete only current user's
        if (key === 'notifications') {
          const { data } = await supabase.from('notifications').select('id').eq('user_id', user.id);
          if (data && data.length > 0) {
            await supabase.from('notifications').delete().eq('user_id', user.id);
          }
          deleteResults.push({ key, count: data?.length || 0 });
        } else if (key === 'cases') {
          const { data } = await supabase.from('cases').select('id').eq('created_by', user.id);
          if (data && data.length > 0) {
            for (const c of data) {
              await supabase.from('cases').delete().eq('id', c.id);
            }
          }
          deleteResults.push({ key, count: data?.length || 0 });
        } else {
          // Get all cases the user can access (RLS limits to cases they're a member of)
          const { data: accessibleCases } = await supabase.from('cases').select('id');
          const caseIds = (accessibleCases || []).map((c: { id: string }) => c.id);
          if (caseIds.length > 0) {
            const { count } = await supabase.from(key as any).select('*', { count: 'exact', head: true }).in('case_id', caseIds);
            const { error } = await supabase.from(key as any).delete().in('case_id', caseIds);
            deleteResults.push({ key, count: error ? -1 : (count ?? 0) });
            // When deleting record tables, also remove matching evidence_logs so file list matches and user can re-upload
            if (key === 'cdr_records' || key === 'ipdr_records' || key === 'tower_dump_records' || key === 'sdr_records') {
              const uploadType = key === 'cdr_records' ? 'cdr' : key === 'ipdr_records' ? 'ipdr' : key === 'tower_dump_records' ? 'tower_dump' : 'sdr';
              await supabase.from('evidence_logs').delete().eq('upload_type', uploadType).in('case_id', caseIds);
            }
          } else {
            deleteResults.push({ key, count: 0 });
          }
        }
      } catch (e: any) {
        deleteResults.push({ key, count: -1 });
      }
    }

    setResults(deleteResults);
    setDeleting(false);
    setShowConfirm(false);
    setPassword('');
    toast({ title: 'Data cleanup complete', description: `Deleted data from ${deleteResults.filter(r => r.count > 0).length} tables.` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Trash2 className="h-6 w-6" /> Data Cleanup</h1>
        <p className="text-sm text-muted-foreground mt-1">Remove test/dummy data from your cases. Only data you created or uploaded will be deleted.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Select data to delete</CardTitle>
            <Button variant="outline" size="sm" className="text-xs" onClick={selectAll}>
              {selected.size === DATA_TYPES.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DATA_TYPES.map(dt => (
              <label key={dt.key} className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer transition-colors hover:bg-muted/50 ${selected.has(dt.key) ? 'border-primary bg-primary/5' : ''} ${dt.key === 'cases' ? 'border-destructive/50' : ''}`}>
                <Checkbox checked={selected.has(dt.key)} onCheckedChange={() => toggleType(dt.key)} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{dt.label}</p>
                  <p className="text-xs text-muted-foreground">{dt.description}</p>
                </div>
              </label>
            ))}
          </div>

          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="mt-4" disabled={selected.size === 0}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete Selected Data
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Confirm Data Deletion</DialogTitle>
                <DialogDescription>This action is irreversible. Enter your account password to confirm.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {Array.from(selected).map(k => (
                    <Badge key={k} variant="destructive" className="text-xs">{DATA_TYPES.find(d => d.key === k)?.label}</Badge>
                  ))}
                </div>
                <div>
                  <Label className="text-xs">Account Password</Label>
                  <Input type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
                <Button variant="destructive" disabled={!password || deleting} onClick={handleDelete}>
                  {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                  Confirm Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Cleanup Results</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {results.map(r => (
                <div key={r.key} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                  <span>{DATA_TYPES.find(d => d.key === r.key)?.label || r.key}</span>
                  <Badge variant={r.count > 0 ? 'destructive' : 'secondary'} className="text-xs">
                    {r.count === -1 ? 'Error' : `${r.count} deleted`}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
