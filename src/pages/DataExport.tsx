import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, Database, FileJson, FileCode } from 'lucide-react';

const ALL_TABLES = [
  { key: 'cases', label: 'Cases' },
  { key: 'case_assignments', label: 'Case Assignments' },
  { key: 'cdr_records', label: 'CDR Records' },
  { key: 'ipdr_records', label: 'IPDR Records' },
  { key: 'tower_dump_records', label: 'Tower Dump Records' },
  { key: 'sdr_records', label: 'SDR Records' },
  { key: 'investigation_insights', label: 'Investigation Insights' },
  { key: 'chat_logs', label: 'Chat Logs' },
  { key: 'case_tasks', label: 'Case Tasks' },
  { key: 'activity_logs', label: 'Activity Logs' },
  { key: 'evidence_logs', label: 'Evidence Logs' },
  { key: 'case_documents', label: 'Case Documents' },
  { key: 'aliases', label: 'Aliases' },
  { key: 'person_profiles', label: 'Person Profiles' },
  { key: 'geofences', label: 'Geofences' },
  { key: 'geofence_alerts', label: 'Geofence Alerts' },
  { key: 'case_training_logs', label: 'Training Logs' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'knowledge_base_documents', label: 'KB Documents' },
  { key: 'knowledge_base_chunks', label: 'KB Chunks' },
];

export default function DataExport() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [format, setFormat] = useState<'json' | 'sql'>('json');
  const [caseId, setCaseId] = useState<string>('all');
  const [cases, setCases] = useState<{ id: string; title: string }[]>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set(ALL_TABLES.map(t => t.key)));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    supabase.from('cases').select('id, title').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setCases(data);
    });
  }, []);

  const toggleTable = (key: string) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAllTables = () => {
    if (selectedTables.size === ALL_TABLES.length) setSelectedTables(new Set());
    else setSelectedTables(new Set(ALL_TABLES.map(t => t.key)));
  };

  const handleExport = async () => {
    if (role !== 'admin') {
      toast({ title: 'Access denied', description: 'Only admins can export data.', variant: 'destructive' });
      return;
    }

    setExporting(true);
    try {
      const params = new URLSearchParams({ format });
      if (caseId !== 'all') params.set('case_id', caseId);
      if (selectedTables.size < ALL_TABLES.length) {
        params.set('tables', Array.from(selectedTables).join(','));
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-export?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Export failed');
      }

      const blob = await res.blob();
      const ext = format === 'sql' ? 'sql' : 'json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dip-export-${caseId === 'all' ? 'all' : caseId.slice(0, 8)}-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({ title: 'Export complete', description: `Data exported as ${ext.toUpperCase()}.` });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  if (role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Database className="h-6 w-6" /> Data Export</h1>
        <p className="text-sm text-muted-foreground mt-1">Export case data as JSON or SQL for backup, migration, or offline import.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Export Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as 'json' | 'sql')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">
                    <span className="flex items-center gap-2"><FileJson className="h-4 w-4" /> JSON</span>
                  </SelectItem>
                  <SelectItem value="sql">
                    <span className="flex items-center gap-2"><FileCode className="h-4 w-4" /> SQL (INSERT statements)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={caseId} onValueChange={setCaseId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cases</SelectItem>
                  {cases.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleExport} disabled={exporting || selectedTables.size === 0} className="w-full">
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {exporting ? 'Exporting...' : `Export as ${format.toUpperCase()}`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Tables to Export</CardTitle>
              <Button variant="outline" size="sm" className="text-xs" onClick={selectAllTables}>
                {selectedTables.size === ALL_TABLES.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ALL_TABLES.map(t => (
                <label
                  key={t.key}
                  className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors hover:bg-muted/50 text-sm ${selectedTables.has(t.key) ? 'border-primary bg-primary/5' : ''}`}
                >
                  <Checkbox checked={selectedTables.has(t.key)} onCheckedChange={() => toggleTable(t.key)} />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
            <div className="mt-3">
              <Badge variant="secondary" className="text-xs">{selectedTables.size} / {ALL_TABLES.length} selected</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
