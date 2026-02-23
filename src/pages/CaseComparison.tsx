import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, GitCompare, Phone, AlertTriangle, Link2, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CaseOption { id: string; title: string; fir_number: string | null; status: string; }
interface CdrSummary { case_id: string; numbers: Set<string>; imeis: Set<string>; total: number; }

export default function CaseComparison() {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, CdrSummary>>({});
  const [compared, setCompared] = useState(false);

  useEffect(() => {
    supabase.from('cases').select('id,title,fir_number,status').order('created_at', { ascending: false }).then(({ data }) => {
      setCases(data || []);
      setLoading(false);
    });
  }, []);

  const toggleCase = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev);
    setCompared(false);
  };

  const runComparison = async () => {
    if (selected.length < 2) return;
    setComparing(true);
    const results: Record<string, CdrSummary> = {};
    await Promise.all(selected.map(async caseId => {
      const { data } = await supabase.from('cdr_records').select('calling_number,called_number,imei').eq('case_id', caseId).limit(1000);
      const numbers = new Set<string>();
      const imeis = new Set<string>();
      (data || []).forEach(r => {
        if (r.calling_number) numbers.add(r.calling_number);
        if (r.called_number) numbers.add(r.called_number);
        if (r.imei) imeis.add(r.imei);
      });
      results[caseId] = { case_id: caseId, numbers, imeis, total: data?.length || 0 };
    }));
    setSummaries(results);
    setCompared(true);
    setComparing(false);
  };

  const sharedNumbers = useMemo(() => {
    if (!compared || selected.length < 2) return [];
    const allNumbers = new Map<string, string[]>();
    selected.forEach(caseId => {
      const s = summaries[caseId];
      if (!s) return;
      s.numbers.forEach(num => {
        if (!allNumbers.has(num)) allNumbers.set(num, []);
        allNumbers.get(num)!.push(caseId);
      });
    });
    return Array.from(allNumbers.entries()).filter(([, cids]) => cids.length > 1).sort((a, b) => b[1].length - a[1].length);
  }, [compared, summaries, selected]);

  const sharedImeis = useMemo(() => {
    if (!compared || selected.length < 2) return [];
    const allImeis = new Map<string, string[]>();
    selected.forEach(caseId => {
      const s = summaries[caseId];
      if (!s) return;
      s.imeis.forEach(imei => {
        if (!allImeis.has(imei)) allImeis.set(imei, []);
        allImeis.get(imei)!.push(caseId);
      });
    });
    return Array.from(allImeis.entries()).filter(([, cids]) => cids.length > 1).sort((a, b) => b[1].length - a[1].length);
  }, [compared, summaries, selected]);

  const chartData = useMemo(() => selected.map(caseId => {
    const c = cases.find(x => x.id === caseId);
    const s = summaries[caseId];
    return {
      name: c?.title?.slice(0, 20) || caseId.slice(0, 8),
      records: s?.total || 0,
      numbers: s?.numbers.size || 0,
      imeis: s?.imeis.size || 0,
    };
  }), [selected, summaries, cases]);

  const caseTitle = (id: string) => cases.find(c => c.id === id)?.title || id.slice(0, 8);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><GitCompare className="h-6 w-6" /> Case Comparison</h1>
        <p className="text-sm text-muted-foreground mt-1">Compare CDR patterns across cases to identify linked crimes</p>
      </div>

      {/* Case selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Cases to Compare (2–5)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-60 overflow-y-auto">
            {cases.map(c => (
              <label key={c.id} className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors">
                <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggleCase(c.id)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.title}</p>
                  {c.fir_number && <p className="text-xs text-muted-foreground">FIR: {c.fir_number}</p>}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{c.status}</Badge>
              </label>
            ))}
          </div>
          <Button className="mt-4" disabled={selected.length < 2 || comparing} onClick={runComparison}>
            {comparing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <GitCompare className="h-4 w-4 mr-2" />}
            Compare {selected.length} Cases
          </Button>
        </CardContent>
      </Card>

      {compared && (
        <>
          {/* Summary chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">CDR Volume Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Legend />
                    <Bar dataKey="records" fill="hsl(213 94% 42%)" name="CDR Records" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="numbers" fill="hsl(142 71% 35%)" name="Unique Numbers" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="imeis" fill="hsl(38 92% 50%)" name="Unique IMEIs" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Shared numbers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Shared Phone Numbers
                <Badge variant="secondary">{sharedNumbers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sharedNumbers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No shared phone numbers found between selected cases.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sharedNumbers.slice(0, 50).map(([num, cids]) => (
                    <div key={num} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                      <Phone className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-mono text-sm font-medium">{num}</span>
                      <div className="flex gap-1 ml-auto flex-wrap justify-end">
                        {cids.map(cid => (
                          <Badge key={cid} variant="outline" className="text-[10px]">{caseTitle(cid)}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shared IMEIs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" /> Shared IMEI Devices
                <Badge variant="secondary">{sharedImeis.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sharedImeis.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No shared IMEI devices found between selected cases.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sharedImeis.slice(0, 50).map(([imei, cids]) => (
                    <div key={imei} className="flex items-center gap-3 p-2 rounded-md bg-destructive/5 border border-destructive/20">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      <span className="font-mono text-sm font-medium">{imei}</span>
                      <div className="flex gap-1 ml-auto flex-wrap justify-end">
                        {cids.map(cid => (
                          <Badge key={cid} variant="outline" className="text-[10px]">{caseTitle(cid)}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
