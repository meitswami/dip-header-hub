import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, ArrowRight, X, Files, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  parseSpreadsheet, ParseResult, autoMapColumns, mapRowToRecord,
  CDR_COLUMN_MAP, IPDR_COLUMN_MAP, SDR_COLUMN_MAP, TOWER_COLUMN_MAP,
} from '@/lib/dataParser';
import { runAutoAnalysis } from '@/lib/autoAnalysis';

const TYPE_MAP: Record<string, { table: string; columnMap: Record<string, string[]> }> = {
  cdr: { table: 'cdr_records', columnMap: CDR_COLUMN_MAP },
  ipdr: { table: 'ipdr_records', columnMap: IPDR_COLUMN_MAP },
  tower_dump: { table: 'tower_dump_records', columnMap: TOWER_COLUMN_MAP },
  sdr: { table: 'sdr_records', columnMap: SDR_COLUMN_MAP },
};

// Extract phone number from filename like "7568191111_1.csv" or "CDR_8619922222.csv"
function extractPhoneFromFilename(filename: string): string | null {
  const matches = filename.match(/(\d{10,15})/);
  return matches ? matches[1] : null;
}

interface FileEntry {
  file: File;
  parsed: ParseResult | null;
  mapping: Record<string, string>;
  status: 'pending' | 'parsing' | 'ready' | 'importing' | 'done' | 'error';
  insertedCount: number;
  error?: string;
  detectedNumber: string | null;
  numberLabel: string;
}

export default function DataUpload() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [cases, setCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState(searchParams.get('case') || '');
  const [uploadType, setUploadType] = useState('cdr');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<'select' | 'review' | 'processing' | 'done'>('select');
  const [existingAliases, setExistingAliases] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('cases').select('id, title').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setCases(data); });
  }, []);

  // Fetch existing aliases for the selected case
  useEffect(() => {
    if (!selectedCase) return;
    supabase.from('aliases').select('phone_number, alias_name').eq('case_id', selectedCase)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach(a => { map[a.phone_number] = a.alias_name; });
          setExistingAliases(map);
        }
      });
  }, [selectedCase]);

  const handleFilesSelect = async (selectedFiles: FileList) => {
    const typeConfig = TYPE_MAP[uploadType];
    const entries: FileEntry[] = [];

    for (const f of Array.from(selectedFiles)) {
      const detectedNumber = extractPhoneFromFilename(f.name);
      entries.push({
        file: f,
        parsed: null,
        mapping: {},
        status: 'pending',
        insertedCount: 0,
        detectedNumber,
        numberLabel: detectedNumber ? (existingAliases[detectedNumber] || '') : '',
      });
    }

    // Parse all files and auto-map columns
    for (let i = 0; i < entries.length; i++) {
      entries[i].status = 'parsing';
      try {
        const result = await parseSpreadsheet(entries[i].file);
        const autoMap = autoMapColumns(result.headers, typeConfig.columnMap);
        entries[i] = { ...entries[i], parsed: result, mapping: autoMap, status: 'ready' };
      } catch (err: any) {
        entries[i] = { ...entries[i], status: 'error', error: err.message };
      }
    }

    setFiles(entries);
    setStep('review');
  };

  const handleProcessAll = async () => {
    if (!selectedCase || !user) return;
    setUploading(true);
    setStep('processing');
    const typeConfig = TYPE_MAP[uploadType];
    const updated = [...files];

    for (let i = 0; i < updated.length; i++) {
      const entry = updated[i];
      if (entry.status !== 'ready' || !entry.parsed) continue;
      updated[i] = { ...updated[i], status: 'importing' };
      setFiles([...updated]);

      try {
        // Save alias if number detected and label provided
        if (entry.detectedNumber && entry.numberLabel && !existingAliases[entry.detectedNumber]) {
          await supabase.from('aliases').insert({
            case_id: selectedCase,
            phone_number: entry.detectedNumber,
            alias_name: entry.numberLabel,
            created_by: user.id,
          });
          setExistingAliases(prev => ({ ...prev, [entry.detectedNumber!]: entry.numberLabel }));
        }

        // SHA256 hash
        const buffer = await entry.file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Upload to storage
        const filePath = `${user.id}/${selectedCase}/${Date.now()}_${entry.file.name}`;
        const { error: storageError } = await supabase.storage.from('evidence').upload(filePath, entry.file);
        if (storageError) throw storageError;
        const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath);

        // Log evidence
        await supabase.from('evidence_logs').insert({
          case_id: selectedCase, file_name: entry.file.name, file_hash: fileHash,
          file_url: urlData.publicUrl, file_size: entry.file.size,
          upload_type: uploadType, uploaded_by: user.id,
        });

        // Auto-map and insert records with source_file reference
        const records = entry.parsed.rows.map(row => ({
          case_id: selectedCase,
          source_file: entry.file.name,
          ...mapRowToRecord(row, entry.mapping),
          raw_data: row, // Store full raw JSON for flexible querying
        }));

        const BATCH_SIZE = 500;
        let inserted = 0;
        for (let j = 0; j < records.length; j += BATCH_SIZE) {
          const batch = records.slice(j, j + BATCH_SIZE);
          const { error } = await supabase.from(typeConfig.table as any).insert(batch as any);
          if (error) throw error;
          inserted += batch.length;
          updated[i] = { ...updated[i], insertedCount: inserted };
          setFiles([...updated]);
        }

        updated[i] = { ...updated[i], status: 'done', insertedCount: inserted };
        setFiles([...updated]);
      } catch (err: any) {
        updated[i] = { ...updated[i], status: 'error', error: err.message };
        setFiles([...updated]);
      }
    }

    // Run auto-analysis for CDR data
    if (uploadType === 'cdr') {
      toast({ title: 'Running auto-analysis...', description: 'Detecting patterns in uploaded data' });
      try {
        const analysisResults = await runAutoAnalysis(selectedCase);
        toast({ title: 'Analysis complete', description: `${analysisResults.length} insights generated` });
      } catch { /* ignore */ }
    }

    const totalInserted = updated.reduce((s, e) => s + e.insertedCount, 0);
    const doneCount = updated.filter(e => e.status === 'done').length;
    toast({ title: 'Import complete', description: `${doneCount}/${updated.length} files — ${totalInserted} records` });
    setStep('done');
    setUploading(false);
  };

  const updateLabel = (idx: number, label: string) => {
    setFiles(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], numberLabel: label };
      return next;
    });
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setFiles([]); setStep('select');
    if (fileRef.current) fileRef.current.value = '';
  };

  const totalRows = files.reduce((s, e) => s + (e.parsed?.totalRows || 0), 0);
  const totalInserted = files.reduce((s, e) => s + e.insertedCount, 0);
  const readyCount = files.filter(e => e.status === 'ready').length;
  const mappedCount = files.filter(e => Object.keys(e.mapping).length > 0).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Data Upload</h1>
      <p className="text-muted-foreground">Upload multiple files — columns are auto-detected, data stored as searchable JSON.</p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {['Select Files', 'Review & Name', 'Processing', 'Done'].map((label, i) => {
          const steps = ['select', 'review', 'processing', 'done'];
          const currentIdx = steps.indexOf(step);
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${
                i === currentIdx ? 'bg-primary text-primary-foreground' :
                i < currentIdx ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
              }`}>{i < currentIdx ? '✓' : i + 1}</div>
              <span className={i === currentIdx ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
              {i < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {step === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload Evidence Files</CardTitle>
            <CardDescription>Select multiple .xlsx, .xls, .csv files — no manual mapping needed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Select Case</Label>
                <Select value={selectedCase} onValueChange={setSelectedCase}>
                  <SelectTrigger><SelectValue placeholder="Choose a case..." /></SelectTrigger>
                  <SelectContent>{cases.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data Type</Label>
                <Select value={uploadType} onValueChange={setUploadType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cdr">CDR (Call Detail Records)</SelectItem>
                    <SelectItem value="ipdr">IPDR (IP Detail Records)</SelectItem>
                    <SelectItem value="tower_dump">Tower Dump</SelectItem>
                    <SelectItem value="sdr">SDR (Subscriber Detail Records)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Files</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to select files (Ctrl/Cmd for multiple)</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple
                onChange={e => {
                  const fl = e.target.files;
                  if (fl && fl.length > 0 && selectedCase) handleFilesSelect(fl);
                  else if (fl && fl.length > 0) toast({ title: 'Select a case first', variant: 'destructive' });
                }}
                className="hidden" />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'review' && files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Files className="h-5 w-5" />
              {files.length} Files — {totalRows} total rows
            </CardTitle>
            <CardDescription>
              Columns auto-mapped for {mappedCount} files. Name any detected phone numbers below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {files.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="flex-shrink-0">
                  {entry.status === 'error' ? <AlertCircle className="h-5 w-5 text-destructive" /> :
                   <FileSpreadsheet className="h-5 w-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.file.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{entry.parsed?.totalRows ?? '?'} rows</span>
                    <span>·</span>
                    <span>{Object.keys(entry.mapping).length} columns mapped</span>
                    {entry.status === 'error' && <span className="text-destructive">· {entry.error}</span>}
                  </div>
                </div>

                {/* Phone number detection & naming */}
                {entry.detectedNumber && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-mono">{entry.detectedNumber}</span>
                    {existingAliases[entry.detectedNumber] ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success">
                        {existingAliases[entry.detectedNumber]}
                      </span>
                    ) : (
                      <Input
                        className="h-7 w-32 text-xs"
                        placeholder="Name this number"
                        value={entry.numberLabel}
                        onChange={e => updateLabel(i, e.target.value)}
                      />
                    )}
                  </div>
                )}

                <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={handleProcessAll} disabled={readyCount === 0}>
                Process {readyCount} Files ({totalRows} Records)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'processing' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Processing Files...</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {files.map((entry, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    {entry.status === 'importing' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    {entry.status === 'done' && <CheckCircle className="h-3 w-3 text-success" />}
                    {entry.status === 'error' && <AlertCircle className="h-3 w-3 text-destructive" />}
                    {entry.status === 'ready' && <FileSpreadsheet className="h-3 w-3 text-muted-foreground" />}
                    <span className="truncate max-w-64">{entry.file.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.insertedCount}/{entry.parsed?.totalRows ?? 0}
                  </span>
                </div>
                <Progress value={entry.parsed?.totalRows ? (entry.insertedCount / entry.parsed.totalRows) * 100 : 0} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {step === 'done' && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-success" />
            <p className="text-lg font-semibold">Import Complete</p>
            <p className="text-muted-foreground">
              {files.filter(e => e.status === 'done').length}/{files.length} files — {totalInserted} records imported & analyzed
            </p>
            {files.some(e => e.status === 'error') && (
              <div className="mt-3 text-sm text-destructive">
                {files.filter(e => e.status === 'error').map((e, i) => (
                  <p key={i}><AlertCircle className="inline h-3 w-3 mr-1" />{e.file.name}: {e.error}</p>
                ))}
              </div>
            )}
            <Button onClick={reset} className="mt-4">Upload More Files</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
