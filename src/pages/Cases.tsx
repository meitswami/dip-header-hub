import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
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
    api.getCases().then(data => { setCases(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const byStatus = statusFilter === 'all' ? cases : cases.filter(c => c.status === statusFilter);

  const filtered = byStatus.filter(c =>
    c.title?.toLowerCase().includes(search.toLowerCase()) ||
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
        <h1 className="text-2xl font-bold tracking-tight">
          Cases ({filtered.length})
        </h1>
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
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left w-14">Sr. No.</th>
                    <th className="px-4 py-2 text-left">Case Title</th>
                    <th className="px-4 py-2 text-left">FIR No.</th>
                    <th className="px-4 py-2 text-left">Sections</th>
                    <th className="px-4 py-2 text-left">Created On</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left w-40">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, idx) => (
                    <tr key={c.id} className="border-b hover:bg-muted/40">
                      <td className="px-4 py-2 align-middle text-xs text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex flex-col">
                          <span className="font-medium">{c.title}</span>
                          {c.description && (
                            <span className="text-xs text-muted-foreground line-clamp-1">
                              {c.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle text-xs">
                        {c.fir_number || '—'}
                      </td>
                      <td className="px-4 py-2 align-middle text-xs">
                        {c.sections || '—'}
                      </td>
                      <td className="px-4 py-2 align-middle text-xs">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <Badge variant="outline" className={statusColor(c.status)}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex gap-2">
                          <Button asChild size="xs" variant="outline">
                            <Link to={`/cases/${c.id}`}>View</Link>
                          </Button>
                          {(role === 'admin' || role === 'investigator') && (
                            <Button asChild size="xs" variant="ghost">
                              <Link to={`/cases/${c.id}/edit`}>Edit</Link>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
