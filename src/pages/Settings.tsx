import { useState } from 'react';
import { useOllamaSettings, getOllamaFetchBase } from '@/hooks/useOllamaSettings';
import { useHealthCheck, ServiceStatus } from '@/hooks/useHealthCheck';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, Save, Bot, Database, HardDrive, RefreshCw, CheckCircle2, XCircle, Wifi, Cpu, MemoryStick } from 'lucide-react';

const RECOMMENDED_MODELS = [
  { value: 'phi3:mini', label: 'Phi-3 Mini (3.8B)', ram: '8 GB', accuracy: '⭐⭐⭐', speed: 'Fast', desc: 'Best for 8GB RAM. Good for basic queries.' },
  { value: 'gemma:2b', label: 'Gemma 2B', ram: '8 GB', accuracy: '⭐⭐', speed: 'Very Fast', desc: 'Fastest option, lower accuracy.' },
  { value: 'mistral:7b', label: 'Mistral 7B', ram: '12 GB', accuracy: '⭐⭐⭐⭐', speed: 'Medium', desc: 'Strong reasoning, good for CDR analysis.' },
  { value: 'llama3:8b', label: 'Llama 3 8B', ram: '16 GB', accuracy: '⭐⭐⭐⭐⭐', speed: 'Medium', desc: 'Best accuracy for forensic analysis.' },
  { value: 'mixtral:8x7b', label: 'Mixtral 8x7B', ram: '24 GB+', accuracy: '⭐⭐⭐⭐⭐', speed: 'Slow', desc: 'Top-tier reasoning, needs high RAM.' },
  { value: 'llava:7b', label: 'LLaVA 7B (Vision)', ram: '16 GB', accuracy: '⭐⭐⭐⭐', speed: 'Medium', desc: 'For OCR/image analysis only.' },
];

function StatusBadge({ status }: { status: ServiceStatus }) {
  if (status === 'ok') return <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>;
  if (status === 'error') return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Offline</Badge>;
  return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking</Badge>;
}

export default function Settings() {
  const { settings, save, defaults } = useOllamaSettings();
  const { health, recheck } = useHealthCheck();
  const [url, setUrl] = useState(settings.url);
  const [model, setModel] = useState(settings.model);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);

  function handleSave() {
    save({ url: url.replace(/\/+$/, ''), model });
    toast({ title: 'Settings saved', description: 'Ollama configuration updated.' });
    setTestResult(null);
    recheck();
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const cleanUrl = url.replace(/\/+$/, '');
      const fetchBase = getOllamaFetchBase(cleanUrl);
      const res = await fetch(`${fetchBase}/api/tags`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models: string[] = (data.models || []).map((m: any) => m.name || m.model);
      const hasModel = models.some(m => m === model || m.startsWith(model.split(':')[0]));
      setTestResult('ok');
      toast({
        title: 'Connection successful!',
        description: hasModel
          ? `Model "${model}" is available. ${models.length} model(s) installed.`
          : `Connected, but "${model}" not found. Available: ${models.slice(0, 5).join(', ') || 'none'}. Run: ollama pull ${model}`,
      });
    } catch (e) {
      setTestResult('error');
      toast({
        title: 'Connection failed',
        description: `Cannot reach Ollama at ${url}. Make sure Ollama is running.`,
        variant: 'destructive',
      });
    }
    setTesting(false);
  }

  function handleReset() {
    setUrl(defaults.url);
    setModel(defaults.model);
    save(defaults);
    toast({ title: 'Reset to defaults' });
    setTestResult(null);
  }

  const selectedModelInfo = RECOMMENDED_MODELS.find(m => m.value === model);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure system connections and AI model</p>
      </div>

      {/* Health Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Wifi className="h-5 w-5" /> System Status</CardTitle>
            <Button variant="outline" size="sm" onClick={recheck} className="gap-1"><RefreshCw className="h-3 w-3" /> Refresh</Button>
          </div>
          <CardDescription>Connection status for all backend services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {[
              { label: 'Database (PostgreSQL)', status: health.database, icon: Database, desc: 'Case data, records, user accounts' },
              { label: 'Ollama AI Engine', status: health.ollama, icon: Bot, desc: 'Local LLM for AI Chat & document processing' },
              { label: 'File Storage', status: health.storage, icon: HardDrive, desc: 'Evidence files, case documents' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ollama Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Ollama Configuration</CardTitle>
          <CardDescription>Configure the local AI engine used for chat analysis, document processing, and OCR</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div>
              <Label htmlFor="ollamaUrl">Ollama Server URL</Label>
              <Input id="ollamaUrl" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:11434" className="font-mono text-sm" />
              <p className="mt-1 text-xs text-muted-foreground">Default: http://localhost:11434 — Change if Ollama runs on another machine</p>
            </div>

            <div>
              <Label>Recommended Model</Label>
              <Select value={RECOMMENDED_MODELS.some(m => m.value === model) ? model : 'custom'} onValueChange={v => { if (v !== 'custom') setModel(v); }}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {RECOMMENDED_MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.label}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{m.ram}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom model...</SelectItem>
                </SelectContent>
              </Select>

              {/* Model details card */}
              {selectedModelInfo && (
                <div className="mt-2 rounded-lg border border-border bg-muted/50 p-3 text-sm space-y-1">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1"><MemoryStick className="h-3 w-3" /> RAM: {selectedModelInfo.ram}</span>
                    <span>Accuracy: {selectedModelInfo.accuracy}</span>
                    <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> Speed: {selectedModelInfo.speed}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedModelInfo.desc}</p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="ollamaModel">Model Name</Label>
              <Input id="ollamaModel" value={model} onChange={e => setModel(e.target.value)} placeholder="phi3:mini" className="font-mono text-sm" />
              <p className="mt-1 text-xs text-muted-foreground">
                Type any Ollama model name or select from recommendations above. Install: <code className="font-mono text-xs bg-muted px-1 rounded">ollama pull {model}</code>
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleTest} disabled={testing} variant="outline" className="gap-1">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              Test Connection
            </Button>
            <Button onClick={handleSave} className="gap-1">
              <Save className="h-4 w-4" /> Save
            </Button>
            <Button onClick={handleReset} variant="ghost" className="ml-auto text-muted-foreground">Reset Defaults</Button>
          </div>

          {testResult === 'ok' && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4" /> Ollama is reachable and responding
            </div>
          )}
          {testResult === 'error' && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4" /> Cannot connect to Ollama. Ensure it&apos;s running: <code className="font-mono text-xs bg-muted px-1 rounded">ollama serve</code>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
