import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderOpen, Plus, Search } from 'lucide-react';

export default function Cases() {
  const { role } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      let query = supabase.from('cases').select('*').order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter as any);
      const { data } = await query;
      if (data) setCases(data);
      setLoading(false);
    }
    load();
  }, [statusFilter]);

  const filtered = cases.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.fir_number?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: string) => {
    switch (s) {
      case 'active': return 'bg-success/15 text-success border-success/30';
      case 'closed': return 'bg-muted text-muted-foreground border-border';
      case 'pending': return 'bg-warning/15 text-warning border-warning/30';
      case 'archived': return 'bg-secondary text-secondary-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Cases</h1>
        {(role === 'admin' || role === 'investigator') && (
          <Button asChild><Link to="/cases/new"><Plus className="mr-2 h-4 w-4" /> New Case</Link></Button>
        )}
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by title or FIR number..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>No cases found</p></CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(c => (
            <Link key={c.id} to={`/cases/${c.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">{c.title}</h3>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        {c.fir_number && <span>FIR: {c.fir_number}</span>}
                        {c.sections && <span>Sections: {c.sections}</span>}
                        <span>{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>
                      {c.description && <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{c.description}</p>}
                    </div>
                    <Badge variant="outline" className={statusColor(c.status)}>{c.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
