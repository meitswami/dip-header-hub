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
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, ArrowRight, X, Files, Phone, ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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

interface ProcurementMeta {
  phone_number: string;
  operator_name: string;
  request_ref_no: string;
  period_from: string;
  period_to: string;
  notes: string;
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
  const [step, setStep] = useState<'select' | 'procurement' | 'review' | 'processing' | 'done'>('select');
  const [existingAliases, setExistingAliases] = useState<Record<string, string>>({});
  const [myCaseRole, setMyCaseRole] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [procurement, setProcurement] = useState<ProcurementMeta>({
    phone_number: '', operator_name: '', request_ref_no: '',
    period_from: '', period_to: '', notes: '',
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('cases').select('id, title').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setCases(data); });
  }, []);

  // Check user's case role when case is selected
  useEffect(() => {
    if (!selectedCase || !user) { setMyCaseRole(null); return; }
    setCheckingRole(true);
    supabase.from('case_assignments')
      .select('case_role')
      .eq('case_id', selectedCase)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMyCaseRole(data?.case_role || null);
        setCheckingRole(false);
      });
  }, [selectedCase, user?.id]);

  // Fetch existing aliases
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

  const canUpload = myCaseRole === 'procurement' || myCaseRole === 'case_incharge';

  // Check for duplicate procurement data
  async function checkDuplicate(): Promise<boolean> {
    if (!procurement.phone_number || !procurement.period_from || !procurement.period_to) return false;
    const { data } = await supabase
      .from('data_procurements')
      .select('id, phone_number, period_from, period_to, data_type')
      .eq('case_id', selectedCase)
      .eq('data_type', uploadType)
      .eq('phone_number', procurement.phone_number);

    if (data && data.length > 0) {
      const overlap = data.find(d => {
        if (!d.period_from || !d.period_to) return false;
        return d.period_from <= procurement.period_to && d.period_to >= procurement.period_from;
      });
      if (overlap) {
        setDuplicateWarning(`Data for ${procurement.phone_number} (${uploadType.toUpperCase()}) already exists for overlapping period ${overlap.period_from} to ${overlap.period_to}. You may append or skip.`);
        return true;
      }
    }
    return false;
  }

  const handleProcurementNext = async () => {
    await checkDuplicate();
    setStep('select');
  };

  const handleFilesSelect = async (selectedFiles: FileList) => {
    const typeConfig = TYPE_MAP[uploadType];
    const entries: FileEntry[] = [];

    for (const f of Array.from(selectedFiles)) {
      const detectedNumber = extractPhoneFromFilename(f.name);
      entries.push({
        file: f, parsed: null, mapping: {}, status: 'pending',
        insertedCount: 0, detectedNumber,
        numberLabel: detectedNumber ? (existingAliases[detectedNumber] || '') : '',
      });
    }

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

    // Check for file hash duplicates
    for (const entry of entries) {
      const buffer = await entry.file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const { data: existing } = await supabase
        .from('evidence_logs')
        .select('id')
        .eq('case_id', selectedCase)
        .eq('file_hash', fileHash)
        .limit(1);
      if (existing && existing.length > 0) {
        entry.status = 'error';
        entry.error = 'Duplicate file — this exact file has already been uploaded';
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
        if (entry.detectedNumber && entry.numberLabel && !existingAliases[entry.detectedNumber]) {
          await supabase.from('aliases').insert({
            case_id: selectedCase, phone_number: entry.detectedNumber,
            alias_name: entry.numberLabel, created_by: user.id,
          });
          setExistingAliases(prev => ({ ...prev, [entry.detectedNumber!]: entry.numberLabel }));
        }

        const buffer = await entry.file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const filePath = `${user.id}/${selectedCase}/${Date.now()}_${entry.file.name}`;
        const { error: storageError } = await supabase.storage.from('evidence').upload(filePath, entry.file);
        if (storageError) throw storageError;

        // Log evidence
        const { data: evidenceData } = await supabase.from('evidence_logs').insert({
          case_id: selectedCase, file_name: entry.file.name, file_hash: fileHash,
          file_size: entry.file.size, upload_type: uploadType, uploaded_by: user.id,
        }).select('id').single();

        // Create procurement record
        if (evidenceData) {
          await supabase.from('data_procurements').insert({
            case_id: selectedCase,
            evidence_log_id: evidenceData.id,
            procured_by: user.id,
            phone_number: procurement.phone_number || entry.detectedNumber || null,
            data_type: uploadType,
            operator_name: procurement.operator_name || null,
            request_ref_no: procurement.request_ref_no || null,
            period_from: procurement.period_from || null,
            period_to: procurement.period_to || null,
            notes: procurement.notes || null,
            status: 'uploaded',
          });
        }

        const records = entry.parsed.rows.map(row => ({
          case_id: selectedCase,
          ...mapRowToRecord(row, entry.mapping),
          raw_data: row,
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
    setFiles(prev => { const next = [...prev]; next[idx] = { ...next[idx], numberLabel: label }; return next; });
  };
  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));
  const reset = () => {
    setFiles([]); setStep('select'); setDuplicateWarning(null);
    setProcurement({ phone_number: '', operator_name: '', request_ref_no: '', period_from: '', period_to: '', notes: '' });
    if (fileRef.current) fileRef.current.value = '';
  };

  const totalRows = files.reduce((s, e) => s + (e.parsed?.totalRows || 0), 0);
  const totalInserted = files.reduce((s, e) => s + e.insertedCount, 0);
  const readyCount = files.filter(e => e.status === 'ready').length;
  const mappedCount = files.filter(e => Object.keys(e.mapping).length > 0).length;
  const stepLabels = ['Procurement Info', 'Select Files', 'Review & Name', 'Processing', 'Done'];
  const stepKeys = ['procurement', 'select', 'review', 'processing', 'done'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Data Upload</h1>
      <p className="text-muted-foreground">Upload CDR/IPDR/Tower/SDR data with procurement tracking and duplicate detection.</p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {stepLabels.map((label, i) => {
          const currentIdx = stepKeys.indexOf(step);
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${
                i === currentIdx ? 'bg-primary text-primary-foreground' :
                i < currentIdx ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
              }`}>{i < currentIdx ? '✓' : i + 1}</div>
              <span className={i === currentIdx ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
              {i < stepLabels.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {/* Role check */}
      {selectedCase && !checkingRole && !canUpload && myCaseRole !== null && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Access Denied</p>
              <p className="text-xs text-muted-foreground">
                Only Procurement or Case Incharge (CIO) can upload data. Your role: <Badge variant="outline">{myCaseRole}</Badge>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Procurement metadata */}
      {step === 'procurement' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Procurement Details</CardTitle>
            <CardDescription>Enter procurement metadata before uploading files</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Select Case *</Label>
                <Select value={selectedCase} onValueChange={setSelectedCase}>
                  <SelectTrigger><SelectValue placeholder="Choose a case..." /></SelectTrigger>
                  <SelectContent>{cases.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data Type *</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input value={procurement.phone_number} onChange={e => setProcurement(p => ({ ...p, phone_number: e.target.value }))} placeholder="e.g. 7568191111" />
              </div>
              <div className="space-y-2">
                <Label>Operator Name</Label>
                <Input value={procurement.operator_name} onChange={e => setProcurement(p => ({ ...p, operator_name: e.target.value }))} placeholder="e.g. Jio, Airtel" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Request Ref No.</Label>
                <Input value={procurement.request_ref_no} onChange={e => setProcurement(p => ({ ...p, request_ref_no: e.target.value }))} placeholder="Reference number" />
              </div>
              <div className="space-y-2">
                <Label>Period From</Label>
                <Input type="date" value={procurement.period_from} onChange={e => setProcurement(p => ({ ...p, period_from: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Period To</Label>
                <Input type="date" value={procurement.period_to} onChange={e => setProcurement(p => ({ ...p, period_to: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={procurement.notes} onChange={e => setProcurement(p => ({ ...p, notes: e.target.value }))} placeholder="Any procurement notes..." rows={2} />
            </div>

            {duplicateWarning && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm text-warning flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{duplicateWarning}</span>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={handleProcurementNext} disabled={!selectedCase}>
                Next: Select Files <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload Evidence Files</CardTitle>
            <CardDescription>Select multiple .xlsx, .xls, .csv files — no manual mapping needed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedCase && (
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
            )}

            {/* Start with procurement step button */}
            {selectedCase && canUpload && step === 'select' && files.length === 0 && (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('procurement')}>
                  Enter Procurement Details First
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Files</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => { if (canUpload) fileRef.current?.click(); }}>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to select files (Ctrl/Cmd for multiple)</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple
                onChange={e => {
                  const fl = e.target.files;
                  if (fl && fl.length > 0 && selectedCase && canUpload) handleFilesSelect(fl);
                  else if (fl && fl.length > 0 && !selectedCase) toast({ title: 'Select a case first', variant: 'destructive' });
                  else if (fl && fl.length > 0 && !canUpload) toast({ title: 'You do not have upload permission for this case', variant: 'destructive' });
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
                {entry.detectedNumber && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-mono">{entry.detectedNumber}</span>
                    {existingAliases[entry.detectedNumber] ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success">
                        {existingAliases[entry.detectedNumber]}
                      </span>
                    ) : (
                      <Input className="h-7 w-32 text-xs" placeholder="Name this number"
                        value={entry.numberLabel} onChange={e => updateLabel(i, e.target.value)} />
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
          <CardHeader><CardTitle className="text-lg">Processing Files...</CardTitle></CardHeader>
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
                  <span className="text-xs text-muted-foreground">{entry.insertedCount}/{entry.parsed?.totalRows ?? 0}</span>
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
