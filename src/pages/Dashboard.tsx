import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FolderOpen, Upload, MessageSquare, AlertTriangle,
  Search, Plus, Clock, Shield, TrendingUp
} from 'lucide-react';

interface CaseSummary {
  id: string;
  title: string;
  fir_number: string | null;
  status: string;
  created_at: string;
}

export default function Dashboard() {
  const { user, role, profile } = useAuth();
  const { t } = useLang();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('cases')
        .select('id, title, fir_number, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        setCases(data);
        setStats({
          total: data.length,
          active: data.filter(c => c.status === 'active').length,
          pending: data.filter(c => c.status === 'pending').length,
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = cases.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.fir_number?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: string) => {
    switch (s) {
      case 'active': return 'bg-success/15 text-success border-success/30';
      case 'closed': return 'bg-muted text-muted-foreground border-border';
      case 'pending': return 'bg-warning/15 text-warning border-warning/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('dash.title')}</h1>
          <p className="text-muted-foreground">
            {t('dash.welcome')}, {profile?.full_name || 'Officer'}
          </p>
        </div>
        {(role === 'admin' || role === 'investigator') && (
          <Button asChild>
            <Link to="/cases/new"><Plus className="mr-2 h-4 w-4" /> {t('dash.new_case')}</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: t('dash.total'), value: stats.total, icon: FolderOpen, color: 'text-primary' },
          { label: t('dash.active'), value: stats.active, icon: TrendingUp, color: 'text-success' },
          { label: t('dash.pending'), value: stats.pending, icon: Clock, color: 'text-warning' },
          { label: t('dash.alerts'), value: 0, icon: AlertTriangle, color: 'text-destructive' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: t('dash.upload'), desc: t('dash.upload_desc'), icon: Upload, to: '/upload' },
          { label: t('dash.ai'), desc: t('dash.ai_desc'), icon: MessageSquare, to: '/chat' },
          { label: t('dash.manage'), desc: t('dash.manage_desc'), icon: FolderOpen, to: '/cases' },
        ].map(action => (
          <Card key={action.label} className="hover:border-primary/50 transition-colors cursor-pointer">
            <Link to={action.to}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <action.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t('dash.recent')}</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('dash.search')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>{t('dash.no_cases')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => (
                <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{c.title}</p>
                      {c.fir_number && <p className="text-xs text-muted-foreground">FIR: {c.fir_number}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                    <Badge variant="outline" className={statusColor(c.status)}>
                      {c.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
