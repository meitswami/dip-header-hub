import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Users, Phone, AlertTriangle, Search, Network } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface CommonNumberAnalysisProps {
  caseId: string;
}

interface CommonContact {
  number: string;
  connectedTo: string[];
  totalCalls: number;
  isBurner: boolean;
}

interface SuspectCluster {
  suspects: string[];
  sharedContacts: string[];
  strength: number;
}

export default function CommonNumberAnalysis({ caseId }: CommonNumberAnalysisProps) {
  const [loading, setLoading] = useState(true);
  const [commonContacts, setCommonContacts] = useState<CommonContact[]>([]);
  const [clusters, setClusters] = useState<SuspectCluster[]>([]);
  const [burnerNumbers, setBurnerNumbers] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [suspects, setSuspects] = useState<string[]>([]);
  const [newSuspect, setNewSuspect] = useState('');

  useEffect(() => {
    if (!caseId) return;
    loadAliasesAsSuspects();
  }, [caseId]);

  async function loadAliasesAsSuspects() {
    const { data: aliases } = await supabase
      .from('aliases')
      .select('phone_number')
      .eq('case_id', caseId);

    const nums = aliases?.map(a => a.phone_number) || [];
    setSuspects(nums);
    if (nums.length >= 2) {
      await runAnalysis(nums);
    } else {
      setLoading(false);
    }
  }

  async function runAnalysis(suspectNumbers: string[]) {
    setLoading(true);

    const { data: cdrData } = await supabase
      .from('cdr_records')
      .select('calling_number, called_number, duration, call_date, imei, cell_id')
      .eq('case_id', caseId)
      .limit(5000);

    if (!cdrData || cdrData.length === 0) {
      setLoading(false);
      return;
    }

    // Build contact maps for each suspect
    const suspectContacts: Record<string, Record<string, number>> = {};
    suspectNumbers.forEach(s => { suspectContacts[s] = {}; });

    cdrData.forEach(r => {
      suspectNumbers.forEach(suspect => {
        if (r.calling_number === suspect && r.called_number) {
          suspectContacts[suspect][r.called_number] = (suspectContacts[suspect][r.called_number] || 0) + 1;
        }
        if (r.called_number === suspect && r.calling_number) {
          suspectContacts[suspect][r.calling_number] = (suspectContacts[suspect][r.calling_number] || 0) + 1;
        }
      });
    });

    // Find common contacts (numbers that appear in 2+ suspect contact lists)
    const allContacts: Record<string, { connectedTo: Set<string>; totalCalls: number }> = {};
    Object.entries(suspectContacts).forEach(([suspect, contacts]) => {
      Object.entries(contacts).forEach(([number, count]) => {
        if (suspectNumbers.includes(number)) return; // skip other suspects
        if (!allContacts[number]) allContacts[number] = { connectedTo: new Set(), totalCalls: 0 };
        allContacts[number].connectedTo.add(suspect);
        allContacts[number].totalCalls += count;
      });
    });

    const commons = Object.entries(allContacts)
      .filter(([_, data]) => data.connectedTo.size >= 2)
      .map(([number, data]) => ({
        number,
        connectedTo: Array.from(data.connectedTo),
        totalCalls: data.totalCalls,
        isBurner: false,
      }))
      .sort((a, b) => b.connectedTo.length - a.connectedTo.length || b.totalCalls - a.totalCalls);

    // Detect burner patterns: numbers with short usage period, few unique contacts, or multiple IMEIs
    const numberMetrics: Record<string, { dates: Set<string>; contacts: Set<string>; imeis: Set<string> }> = {};
    cdrData.forEach(r => {
      [r.calling_number, r.called_number].filter(Boolean).forEach(num => {
        if (!num) return;
        if (!numberMetrics[num]) numberMetrics[num] = { dates: new Set(), contacts: new Set(), imeis: new Set() };
        if (r.call_date) numberMetrics[num].dates.add(r.call_date.substring(0, 10));
        if (r.calling_number && r.calling_number !== num) numberMetrics[num].contacts.add(r.calling_number);
        if (r.called_number && r.called_number !== num) numberMetrics[num].contacts.add(r.called_number);
        if (r.imei) numberMetrics[num].imeis.add(r.imei);
      });
    });

    const burners: string[] = [];
    Object.entries(numberMetrics).forEach(([num, m]) => {
      const daySpan = m.dates.size;
      const contactCount = m.contacts.size;
      // Burner heuristics: short lifespan + few contacts, or multiple IMEIs
      if ((daySpan <= 7 && contactCount <= 3) || m.imeis.size >= 3) {
        burners.push(num);
      }
    });

    commons.forEach(c => { c.isBurner = burners.includes(c.number); });
    setBurnerNumbers(burners.filter(b => suspectNumbers.includes(b) || commons.some(c => c.number === b)));

    // Build clusters: groups of suspects that share contacts
    const clusterMap: SuspectCluster[] = [];
    for (let i = 0; i < suspectNumbers.length; i++) {
      for (let j = i + 1; j < suspectNumbers.length; j++) {
        const shared = commons
          .filter(c => c.connectedTo.includes(suspectNumbers[i]) && c.connectedTo.includes(suspectNumbers[j]))
          .map(c => c.number);
        if (shared.length > 0) {
          clusterMap.push({
            suspects: [suspectNumbers[i], suspectNumbers[j]],
            sharedContacts: shared,
            strength: shared.length,
          });
        }
      }
    }
    clusterMap.sort((a, b) => b.strength - a.strength);

    setCommonContacts(commons);
    setClusters(clusterMap);
    setLoading(false);
  }

  function addSuspect() {
    const num = newSuspect.trim();
    if (!num || suspects.includes(num)) return;
    const updated = [...suspects, num];
    setSuspects(updated);
    setNewSuspect('');
    if (updated.length >= 2) runAnalysis(updated);
  }

  const filtered = commonContacts.filter(c =>
    c.number.includes(search) || c.connectedTo.some(s => s.includes(search))
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Analyzing common contacts...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Suspect Numbers Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Suspect Numbers for Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Add suspect phone number..."
              value={newSuspect}
              onChange={e => setNewSuspect(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSuspect()}
            />
            <Button onClick={addSuspect} size="sm">Add</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {suspects.map(s => (
              <Badge key={s} variant="secondary" className="gap-1">
                <Phone className="h-3 w-3" /> {s}
                <button className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => {
                  const updated = suspects.filter(x => x !== s);
                  setSuspects(updated);
                  if (updated.length >= 2) runAnalysis(updated);
                }}>×</button>
              </Badge>
            ))}
          </div>
          {suspects.length < 2 && (
            <p className="text-sm text-muted-foreground mt-2">Add at least 2 suspect numbers to analyze common contacts. Numbers from aliases are auto-loaded.</p>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {suspects.length >= 2 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Network className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xl font-bold">{commonContacts.length}</p>
                <p className="text-xs text-muted-foreground">Common Contacts</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-chart-2" />
              <div>
                <p className="text-xl font-bold">{clusters.length}</p>
                <p className="text-xs text-muted-foreground">Suspect Clusters</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-xl font-bold">{burnerNumbers.length}</p>
                <p className="text-xs text-muted-foreground">Suspected Burners</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Common Contacts Table */}
      {commonContacts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Common Contacts Between Suspects</CardTitle>
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Filter..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Connected Suspects</TableHead>
                  <TableHead>Total Calls</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map(c => (
                  <TableRow key={c.number}>
                    <TableCell className="font-mono text-sm">{c.number}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.connectedTo.map(s => (
                          <Badge key={s} variant="outline" className="text-xs">{s.slice(-4)}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{c.totalCalls}</TableCell>
                    <TableCell>
                      {c.isBurner && <Badge variant="destructive" className="text-xs">Burner</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Suspect Clusters */}
      {clusters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Communication Clusters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {clusters.slice(0, 10).map((cl, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">
                        {cl.suspects.map(s => s.slice(-4)).join(' ↔ ')}
                      </span>
                    </div>
                    <Badge variant="secondary">{cl.strength} shared</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cl.sharedContacts.slice(0, 8).map(sc => (
                      <Badge key={sc} variant="outline" className="text-xs font-mono">{sc}</Badge>
                    ))}
                    {cl.sharedContacts.length > 8 && (
                      <Badge variant="outline" className="text-xs">+{cl.sharedContacts.length - 8} more</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
