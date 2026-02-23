import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, Wifi, Radio, UserCheck, Clock, MapPin, Users, ArrowUpDown, Moon, Sun, Smartphone } from 'lucide-react';

interface Stats {
  cdrCount: number;
  ipdrCount: number;
  towerCount: number;
  sdrCount: number;
  uniqueNumbers: number;
  uniqueTowers: number;
  uniqueImeis: number;
  dateRange: [string, string] | null;
  totalDuration: number;
  dayCalls: number;
  nightCalls: number;
  longestCall: { duration: number; from: string; to: string } | null;
  topContact: { number: string; count: number } | null;
}

export default function CaseDataSummary({ caseId }: { caseId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [cdrRes, ipdrRes, tdRes, sdrRes] = await Promise.all([
        supabase.from('cdr_records').select('calling_number, called_number, call_date, duration, imei, cell_id, tower_location').eq('case_id', caseId).limit(5000),
        supabase.from('ipdr_records').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
        supabase.from('tower_dump_records').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
        supabase.from('sdr_records').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
      ]);

      const cdr = cdrRes.data || [];
      const numbers = new Set<string>();
      const towers = new Set<string>();
      const imeis = new Set<string>();
      const contactCount: Record<string, number> = {};
      let totalDur = 0, dayCalls = 0, nightCalls = 0;
      let longestCall: Stats['longestCall'] = null;
      const dates: string[] = [];

      for (const r of cdr) {
        if (r.calling_number) { numbers.add(r.calling_number); contactCount[r.calling_number] = (contactCount[r.calling_number] || 0) + 1; }
        if (r.called_number) { numbers.add(r.called_number); contactCount[r.called_number] = (contactCount[r.called_number] || 0) + 1; }
        if (r.cell_id) towers.add(r.cell_id);
        if (r.tower_location) towers.add(r.tower_location);
        if (r.imei) imeis.add(r.imei);
        totalDur += r.duration || 0;
        if (r.call_date) {
          dates.push(r.call_date);
          const h = new Date(r.call_date).getHours();
          if (h >= 6 && h < 22) dayCalls++; else nightCalls++;
        }
        if (r.duration && (!longestCall || r.duration > longestCall.duration)) {
          longestCall = { duration: r.duration, from: r.calling_number || '?', to: r.called_number || '?' };
        }
      }

      dates.sort();
      const topEntry = Object.entries(contactCount).sort((a, b) => b[1] - a[1])[0];

      setStats({
        cdrCount: cdr.length,
        ipdrCount: ipdrRes.count || 0,
        towerCount: tdRes.count || 0,
        sdrCount: sdrRes.count || 0,
        uniqueNumbers: numbers.size,
        uniqueTowers: towers.size,
        uniqueImeis: imeis.size,
        dateRange: dates.length >= 2 ? [dates[0], dates[dates.length - 1]] : null,
        totalDuration: totalDur,
        dayCalls,
        nightCalls,
        longestCall,
        topContact: topEntry ? { number: topEntry[0], count: topEntry[1] } : null,
      });
      setLoading(false);
    }
    load();
  }, [caseId]);

  if (loading) return <Card><CardContent className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>;
  if (!stats) return null;

  const formatDur = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  const items = [
    { label: 'CDR Records', value: stats.cdrCount.toLocaleString(), icon: Phone },
    { label: 'IPDR Records', value: stats.ipdrCount.toLocaleString(), icon: Wifi },
    { label: 'Tower Dumps', value: stats.towerCount.toLocaleString(), icon: Radio },
    { label: 'SDR Records', value: stats.sdrCount.toLocaleString(), icon: UserCheck },
    { label: 'Unique Numbers', value: stats.uniqueNumbers.toLocaleString(), icon: Users },
    { label: 'Unique Towers', value: stats.uniqueTowers.toLocaleString(), icon: MapPin },
    { label: 'Unique IMEIs', value: stats.uniqueImeis.toLocaleString(), icon: Smartphone },
    { label: 'Total Call Time', value: formatDur(stats.totalDuration), icon: Clock },
    { label: 'Day Calls', value: stats.dayCalls.toLocaleString(), icon: Sun },
    { label: 'Night Calls', value: stats.nightCalls.toLocaleString(), icon: Moon },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><ArrowUpDown className="h-4 w-4" /> Data Summary</CardTitle>
        {stats.dateRange && (
          <CardDescription className="text-xs">
            Date range: {new Date(stats.dateRange[0]).toLocaleDateString()} → {new Date(stats.dateRange[1]).toLocaleDateString()}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {items.map(item => (
            <div key={item.label} className="flex items-center gap-2 rounded-md border border-border p-2">
              <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{item.value}</p>
                <p className="text-[10px] text-muted-foreground truncate">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
        {(stats.topContact || stats.longestCall) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {stats.topContact && (
              <Badge variant="outline" className="text-xs font-normal">
                Top contact: {stats.topContact.number} ({stats.topContact.count} calls)
              </Badge>
            )}
            {stats.longestCall && (
              <Badge variant="outline" className="text-xs font-normal">
                Longest call: {formatDur(stats.longestCall.duration)} ({stats.longestCall.from} → {stats.longestCall.to})
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
