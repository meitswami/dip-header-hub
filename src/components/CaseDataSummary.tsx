import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Users, ArrowUpDown, Moon } from 'lucide-react';

interface Stats {
  uniqueNumbers: number;
  nightPct: number;
}

export default function CaseDataSummary({ caseId }: { caseId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const statsRes = await api.getSummaryStats(caseId);
        setStats({
          uniqueNumbers: statsRes.total_unique_numbers ?? 0,
          nightPct: statsRes.night_call_percentage ?? 0,
        });
      } catch {
        setStats(null);
      }
      setLoading(false);
    }
    load();
  }, [caseId]);

  if (loading) return <Card><CardContent className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>;
  if (!stats) return null;

  const items = [
    { label: 'Unique Numbers', value: stats.uniqueNumbers.toLocaleString(), icon: Users },
    { label: 'Night %', value: `${Math.round(stats.nightPct)}%`, icon: Moon },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><ArrowUpDown className="h-4 w-4" /> Data Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
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
      </CardContent>
    </Card>
  );
}
