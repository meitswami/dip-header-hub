import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  api,
  type MysqlConnection,
  type MysqlConnectionInput,
  type MysqlResult,
  type MysqlSchema,
} from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
  Database, Plus, Loader2, CheckCircle2, XCircle, RefreshCw, Trash2, Pencil, Play,
  ShieldCheck, FileSpreadsheet,
} from 'lucide-react';

interface Form extends Omit<MysqlConnectionInput, 'password'> {
  password: string;
}

const EMPTY_FORM: Form = {
  name: '', host: '', port: 3306, database: '', username: '', password: '',
  ssl_enabled: false, notes: '',
};

export default function MysqlConnections() {
  const { role } = useAuth();
  const [connections, setConnections] = useState<MysqlConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schema, setSchema] = useState<MysqlSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MysqlConnection | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [sql, setSql] = useState('SELECT 1 AS ok;');
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryResult, setQueryResult] = useState<MysqlResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.mysqlList();
      setConnections(list);
    } catch (err) {
      toast({ title: 'Failed to load connections', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSchema = useCallback(async (id: string) => {
    setSchema(null);
    setSchemaLoading(true);
    try {
      const s = await api.mysqlSchema(id);
      setSchema(s);
    } catch (err) {
      toast({ title: 'Schema fetch failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadSchema(selectedId);
    else setSchema(null);
  }, [selectedId, loadSchema]);

  const selectedConnection = useMemo(
    () => connections.find(c => c.id === selectedId) || null,
    [connections, selectedId]
  );

  if (role && role !== 'admin') return <Navigate to="/" replace />;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(conn: MysqlConnection) {
    setEditing(conn);
    setForm({
      name: conn.name,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      username: conn.username,
      password: '',
      ssl_enabled: conn.ssl_enabled,
      notes: conn.notes || '',
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name || !form.host || !form.database || !form.username) {
      toast({ title: 'Missing required fields', variant: 'destructive' });
      return;
    }
    if (!editing && !form.password) {
      toast({ title: 'Password required for new connections', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const body: MysqlConnectionInput = {
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port) || 3306,
        database: form.database.trim(),
        username: form.username.trim(),
        ssl_enabled: !!form.ssl_enabled,
        notes: form.notes || '',
        ...(form.password ? { password: form.password } : {}),
      };
      if (editing) await api.mysqlUpdate(editing.id, body);
      else await api.mysqlCreate(body);
      toast({ title: editing ? 'Connection updated' : 'Connection created' });
      setDialogOpen(false);
      load();
    } catch (err) {
      toast({ title: 'Save failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(conn: MysqlConnection) {
    if (!confirm(`Delete connection "${conn.name}"?`)) return;
    try {
      await api.mysqlDelete(conn.id);
      if (selectedId === conn.id) setSelectedId(null);
      load();
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  async function testConnection(conn: MysqlConnection) {
    setTestingId(conn.id);
    try {
      const res = await api.mysqlTest(conn.id);
      if (res.ok) toast({ title: 'Connection OK', description: `Server: ${res.server_version || 'unknown'}` });
      else toast({ title: 'Connection failed', description: res.error, variant: 'destructive' });
      load();
    } catch (err) {
      toast({ title: 'Test failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setTestingId(null);
    }
  }

  async function runQuery() {
    if (!selectedId || !sql.trim()) return;
    setQueryRunning(true);
    setQueryError(null);
    setQueryResult(null);
    try {
      const res = await api.mysqlQuery(selectedId, sql);
      setQueryResult(res);
    } catch (err) {
      setQueryError((err as Error).message);
    } finally {
      setQueryRunning(false);
    }
  }

  async function sampleTable(table: string) {
    if (!selectedId) return;
    setQueryRunning(true);
    setQueryError(null);
    setSql(`SELECT * FROM \`${table}\` LIMIT 100;`);
    try {
      const res = await api.mysqlSample(selectedId, table, 100);
      setQueryResult(res);
    } catch (err) {
      setQueryError((err as Error).message);
    } finally {
      setQueryRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6" /> External MySQL Connections
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Read-only connections to external databases for cross-DB investigation. Only SELECT / SHOW
            queries are permitted. Passwords are stored encrypted on the server.
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Connection</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Connections list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connections ({connections.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
            ) : connections.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No connections configured yet.
              </p>
            ) : (
              connections.map(c => {
                const isSelected = c.id === selectedId;
                return (
                  <div
                    key={c.id}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                    }`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {c.username}@{c.host}:{c.port}/{c.database}
                        </p>
                      </div>
                      {c.last_test_ok === true && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                      {c.last_test_ok === false && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    </div>
                    <div className="flex gap-1 mt-2 -ml-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => testConnection(c)} disabled={testingId === c.id} title="Test connection">
                        {testingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(c)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {c.last_test_error && (
                      <p className="text-[10px] text-destructive mt-1 line-clamp-2">{c.last_test_error}</p>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Right pane: schema + query */}
        <div className="space-y-4 min-w-0">
          {!selectedConnection ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Select a connection to browse its schema and run queries.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">
                      {selectedConnection.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedConnection.host}:{selectedConnection.port} / {selectedConnection.database}
                    </p>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> Read-only
                  </Badge>
                </CardHeader>
                <CardContent>
                  {schemaLoading ? (
                    <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
                  ) : !schema ? (
                    <p className="text-xs text-muted-foreground">No schema loaded.</p>
                  ) : schema.tables.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tables in this database.</p>
                  ) : (
                    <div className="max-h-[280px] overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Table</TableHead>
                            <TableHead className="text-xs">Columns</TableHead>
                            <TableHead className="text-xs">~Rows</TableHead>
                            <TableHead className="text-right text-xs">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {schema.tables.map(t => (
                            <TableRow key={t.name}>
                              <TableCell className="text-xs font-mono font-medium">{t.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {t.columns.slice(0, 4).map(c => c.name).join(', ')}
                                {t.columns.length > 4 ? ` +${t.columns.length - 4}` : ''}
                              </TableCell>
                              <TableCell className="text-xs">{t.estimated_rows.toLocaleString()}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => sampleTable(t.name)}>
                                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Sample
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Query</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={sql}
                    onChange={e => setSql(e.target.value)}
                    rows={4}
                    className="font-mono text-sm"
                    placeholder="SELECT ..."
                  />
                  <div className="flex gap-2 items-center">
                    <Button onClick={runQuery} disabled={queryRunning || !sql.trim()} size="sm">
                      {queryRunning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                      Run
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Only SELECT / SHOW / DESCRIBE / EXPLAIN. Max 500 rows per query.
                    </p>
                  </div>
                  {queryError && (
                    <div className="p-2 rounded-md bg-destructive/10 border border-destructive/30 text-xs text-destructive font-mono">
                      {queryError}
                    </div>
                  )}
                  {queryResult && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {queryResult.count} row{queryResult.count === 1 ? '' : 's'}
                        {queryResult.truncated ? ' (truncated)' : ''}
                      </p>
                      <div className="max-h-[420px] overflow-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {queryResult.columns.map(c => (
                                <TableHead key={c} className="text-xs whitespace-nowrap">{c}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {queryResult.rows.map((r, i) => (
                              <TableRow key={i}>
                                {queryResult.columns.map(c => (
                                  <TableCell key={c} className="text-xs whitespace-nowrap font-mono">
                                    {r[c] === null || r[c] === undefined ? '' : String(r[c])}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Connection' : 'New MySQL Connection'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Crime-branch DB" />
            </div>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <div>
                <Label className="text-xs">Host *</Label>
                <Input value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder="10.0.0.5" />
              </div>
              <div>
                <Label className="text-xs">Port</Label>
                <Input type="number" value={form.port ?? 3306} onChange={e => setForm({ ...form, port: Number(e.target.value) || 3306 })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Database *</Label>
              <Input value={form.database} onChange={e => setForm({ ...form, database: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Username *</Label>
                <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <Label className="text-xs">Password {editing ? '(leave blank to keep)' : '*'}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="ssl"
                type="checkbox"
                checked={!!form.ssl_enabled}
                onChange={e => setForm({ ...form, ssl_enabled: e.target.checked })}
              />
              <Label htmlFor="ssl" className="text-xs">Require SSL</Label>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
