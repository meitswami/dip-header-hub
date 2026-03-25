import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, FileSpreadsheet, Search, Download, Loader2, ChevronLeft, X, Trash2, Upload, RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { parseSpreadsheet, parseSpreadsheetBestHeaders, ParseResult, autoMapColumns, mapRowToRecord, CDR_COLUMN_MAP, IPDR_COLUMN_MAP, SDR_COLUMN_MAP, TOWER_COLUMN_MAP } from '@/lib/dataParser';
import * as XLSX from 'xlsx';

const COLUMN_MAP: Record<string, Record<string, string[]>> = {
  cdr: CDR_COLUMN_MAP,
  ipdr: IPDR_COLUMN_MAP,
  tower_dump: TOWER_COLUMN_MAP,
  sdr: SDR_COLUMN_MAP,
};

const TYPE_CONFIG: Record<string, { table: string; label: string }> = {
  cdr: { table: 'cdr_records', label: 'CDR Records' },
  ipdr: { table: 'ipdr_records', label: 'IPDR Records' },
  tower_dump: { table: 'tower_dump_records', label: 'Tower Dumps' },
  sdr: { table: 'sdr_records', label: 'SDR Records' },
};

export default function CaseRecords() {
  const { id: caseId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const type = searchParams.get('type') || 'cdr';
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.cdr;

  const [caseTitle, setCaseTitle] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [parsedData, setParsedData] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileSearch, setFileSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reimporting, setReimporting] = useState<string | null>(null);

  const loadFiles = async () => {
    if (!caseId) return;
    setLoading(true);
    const [caseRes, filesRes] = await Promise.all([
      supabase.from('cases').select('title').eq('id', caseId).single(),
      supabase.from('evidence_logs').select('*').eq('case_id', caseId).eq('upload_type', type).order('created_at', { ascending: false }),
    ]);
    if (caseRes.data) setCaseTitle(caseRes.data.title);
    if (filesRes.data) setFiles(filesRes.data);
    setLoading(false);
  };

  useEffect(() => { loadFiles(); }, [caseId, type]);

  // Resolve storage path: when file_path is missing, find file in bucket by uploaded_by/case_id (recover old uploads)
  const resolveStoragePath = async (file: any): Promise<string | null> => {
    if (file.file_path) return file.file_path;
    const uid = file.uploaded_by;
    const fileName = file.file_name;
    if (!caseId || !fileName || !uid) return null;
    const prefix = `${uid}/${caseId}`;
    const { data: list, error } = await supabase.storage.from('evidence').list(prefix, { limit: 200 });
    if (error || !list?.length) return null;
    const match = list.find((f: any) => f.name === fileName || f.name.endsWith(`_${fileName}`));
    if (!match) return null;
    return `${prefix}/${match.name}`;
  };

  // Download file from storage, parse it, and show in table
  const openFile = async (file: any) => {
    setFileLoading(true);
    setSelectedFile(file);
    setParsedData(null);
    setSearchQuery('');

    try {
      let blob: Blob;
      let path = file.file_path;
      if (!path) {
        path = await resolveStoragePath(file) ?? undefined;
        if (path) setFiles(prev => prev.map(f => f.id === file.id ? { ...f, file_path: path } : f));
      }
      if (path) {
        const { data, error } = await supabase.storage.from('evidence').download(path);
        if (error) throw new Error(error.message);
        if (!data) throw new Error('No file data returned');
        blob = data;
      } else {
        const url = file.file_url as string;
        if (!url) throw new Error('File location is missing. Re-upload the file.');
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to download file');
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('text/html')) {
          throw new Error('Server returned a web page instead of the file. The file link may be expired or require sign-in.');
        }
        blob = await response.blob();
      }
      const fileObj = new File([blob], file.file_name || 'data.csv');
      const result = await parseSpreadsheet(fileObj);
      setParsedData(result);
    } catch (err: any) {
      toast({ title: 'Error loading file', description: err.message, variant: 'destructive' });
    }
    setFileLoading(false);
  };

  // Download original file
  const downloadFile = async (file: any) => {
    try {
      let blob: Blob;
      let path = file.file_path;
      if (!path) path = await resolveStoragePath(file) ?? undefined;
      if (path) {
        const { data, error } = await supabase.storage.from('evidence').download(path);
        if (error) throw new Error(error.message);
        if (!data) throw new Error('No file data');
        blob = data;
      } else if (file.file_url) {
        const response = await fetch(file.file_url);
        if (!response.ok) throw new Error('Download failed');
        blob = await response.blob();
      } else {
        throw new Error('File location is missing.');
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.file_name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    }
  };

  // Download currently displayed (possibly filtered) data as Excel
  const downloadDisplayedExcel = () => {
    if (!parsedData || filteredRows.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(filteredRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, selectedFile?.file_name || 'export.xlsx');
  };

  // Delete file: remove evidence_log, linked records, and storage file
  const deleteFile = async (file: any) => {
    setDeleting(file.id);
    try {
      // Delete linked records by source_file
      await supabase.from(config.table as any).delete().eq('case_id', caseId!).eq('source_file', file.file_name);

      // Remove from storage: use file_path, else resolve (recover) or parse from file_url
      let storagePath = file.file_path || (file.file_url && file.file_url.includes('/evidence/') ? decodeURIComponent(file.file_url.split('/evidence/')[1]) : null);
      if (!storagePath) storagePath = await resolveStoragePath(file) ?? undefined;
      if (storagePath) {
        await supabase.storage.from('evidence').remove([storagePath]);
      }

      // Delete evidence_log entry
      await supabase.from('evidence_logs').delete().eq('id', file.id);

      setFiles(prev => prev.filter(f => f.id !== file.id));
      toast({ title: 'File deleted', description: file.file_name });

      if (selectedFile?.id === file.id) {
        setSelectedFile(null);
        setParsedData(null);
      }
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
    setDeleting(null);
  };

  // Re-import file into record table (so CDR Analysis / AI can use it)
  const reimportRecords = async (file: any) => {
    if (!caseId) return;
    setReimporting(file.id);
    try {
      let blob: Blob;
      let path = (file.file_path || await resolveStoragePath(file)) ?? undefined;
      if (path) {
        const { data, error } = await supabase.storage.from('evidence').download(path);
        if (error) throw new Error(error.message);
        if (!data) throw new Error('No file data');
        blob = data;
      } else throw new Error('File not found in storage. Re-upload the file.');
      const result = type === 'cdr'
        ? await parseSpreadsheetBestHeaders(new File([blob], file.file_name || 'data.csv'), COLUMN_MAP.cdr)
        : await parseSpreadsheet(new File([blob], file.file_name || 'data.csv'));
      const columnMap = COLUMN_MAP[type];
      const tableName = config.table;
      if (!columnMap || !result.rows.length) {
        toast({ title: 'No rows or unknown type', description: 'Could not import.', variant: 'destructive' });
        setReimporting(null);
        return;
      }
      const mapping = autoMapColumns(result.headers, columnMap);
      await supabase.from(tableName).delete().eq('case_id', caseId).eq('file_id', file.id);
      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < result.rows.length; i += BATCH) {
        const batch = result.rows.slice(i, i + BATCH).map(row => ({
          case_id: caseId,
          ...mapRowToRecord(row, mapping),
          raw_data: row,
          file_id: file.id,
        }));
        const { error } = await supabase.from(tableName).insert(batch as any);
        if (error) throw error;
        inserted += batch.length;
      }
      toast({ title: 'Records imported', description: `${inserted} rows added to database. CDR Analysis and AI will now use this data.` });
      loadFiles();
    } catch (err: any) {
      toast({ title: 'Re-import failed', description: err?.message || 'Failed', variant: 'destructive' });
    }
    setReimporting(null);
  };

  // Search/filter rows
  const filteredRows = useMemo(() => {
    if (!parsedData) return [];
    if (!searchQuery.trim()) return parsedData.rows;
    const q = searchQuery.toLowerCase();
    return parsedData.rows.filter(row =>
      Object.values(row).some(v => v !== null && String(v).toLowerCase().includes(q))
    );
  }, [parsedData, searchQuery]);

  const filteredFiles = useMemo(() => {
    if (!fileSearch.trim()) return files;
    const q = fileSearch.toLowerCase();
    return files.filter(f => f.file_name.toLowerCase().includes(q));
  }, [files, fileSearch]);

  const headers = parsedData?.headers || [];

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/cases/${caseId}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{config.label}</h1>
          <p className="text-sm text-muted-foreground">{caseTitle}</p>
        </div>
        <Badge variant="outline">{files.length} files uploaded</Badge>
      </div>

      {!selectedFile ? (
        /* ===== FILE LIST VIEW ===== */
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search files by name or number..."
                value={fileSearch}
                onChange={e => setFileSearch(e.target.value)}
              />
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/upload?case=${caseId}`}><Upload className="h-4 w-4 mr-1" /> Upload More</Link>
            </Button>
          </div>

          {filteredFiles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No {config.label} files uploaded yet.</p>
                <Button asChild variant="outline" className="mt-3">
                  <Link to={`/upload?case=${caseId}`}>Upload Data</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2">
              {filteredFiles.map(file => (
                <Card key={file.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div
                      className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer"
                      onClick={() => openFile(file)}
                    >
                      <FileSpreadsheet className="h-8 w-8 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{file.file_name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{(file.file_size / 1024).toFixed(1)} KB</span>
                          <span>·</span>
                          <span>{new Date(file.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="flex-shrink-0">{type.toUpperCase()}</Badge>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => reimportRecords(file)} disabled={reimporting === file.id} title="Import into database (for CDR Analysis & AI)">
                        {reimporting === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadFile(file)} title="Download original">
                        <Download className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete file">
                            {deleting === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {file.file_name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the file, its linked records, and evidence log. You can re-upload later.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteFile(file)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ===== RECORD TABLE VIEW ===== */
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => { setSelectedFile(null); setParsedData(null); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back to files
            </Button>
            <Badge variant="outline" className="font-mono text-xs">{selectedFile.file_name}</Badge>
            <span className="text-sm text-muted-foreground">
              {parsedData ? `${filteredRows.length} of ${parsedData.totalRows} rows` : ''}
            </span>
            <div className="flex-1" />
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-8 text-sm"
                placeholder="Search number, IMEI, location..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery('')}>
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => downloadFile(selectedFile)}>
              <Download className="h-4 w-4 mr-1" /> Original
            </Button>
            <Button variant="outline" size="sm" onClick={downloadDisplayedExcel} disabled={filteredRows.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Export View
            </Button>
          </div>

          {fileLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading file data...</span>
            </div>
          ) : !parsedData || parsedData.totalRows === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>Could not parse this file or it's empty.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-auto max-h-[70vh] max-w-full overscroll-auto">
                <Table className="min-w-max w-max">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 sticky top-0 bg-background">#</TableHead>
                      {headers.map(h => (
                        <TableHead key={h} className="whitespace-nowrap text-xs sticky top-0 bg-background min-w-[8rem]">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.slice(0, 1000).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        {headers.map(h => (
                          <TableCell key={h} className="text-xs whitespace-nowrap max-w-48 truncate">
                            {row[h] != null ? String(row[h]) : ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filteredRows.length > 1000 && (
                <div className="p-3 text-center text-xs text-muted-foreground border-t">
                  Showing 1000 of {filteredRows.length} rows. Use search to narrow results.
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
