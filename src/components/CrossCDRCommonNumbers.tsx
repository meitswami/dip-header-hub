import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, AlertTriangle } from 'lucide-react';

interface CommonNumber {
  number: string;
  fileCount: number;
  fileNames: string[];
  totalCalls: number;
}

export default function CrossCDRCommonNumbers({ caseId }: { caseId: string }) {
  const [results, setResults] = useState<CommonNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [minFiles, setMinFiles] = useState('3');
  const [totalFiles, setTotalFiles] = useState(0);
  const [analyzed, setAnalyzed] = useState(false);
  const [fileNameById, setFileNameById] = useState<Record<string, string>>({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailNumber, setDetailNumber] = useState<string | null>(null);
  const [detailRecords, setDetailRecords] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const normalizeKey = (k: string) => k.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
  const preferredRawColumns = new Set([
    'call_type',
    'service_type',
    'service_ty',
    'service',
    'duration',
    'dur',
    'dur_s',
    'date',
    'call_date',
    'time',
    'call_time',
    'target_no',
    'target_number',
    'a_party',
    'a_party_number',
    'b_party_no',
    'b_party_number',
    'b_party',
    'first_bts_location',
    'last_bts_location',
    'type_of_connection',
    'toc',
    'connection_type',
  ]);

  async function analyze() {
    setLoading(true);
    setAnalyzed(true);

    const threshold = parseInt(minFiles);
    try {
      const res = await api.getCommonNumbers(caseId, threshold);
      setTotalFiles(res.total_files);
      const map: Record<string, string> = {};
      res.results.forEach(r => {
        r.fileNames.forEach(fn => { map[fn] = fn; });
      });
      setFileNameById(map);
      setResults(res.results);
    } catch (e) {
      setResults([]);
      setTotalFiles(0);
    }
    setLoading(false);
  }

  async function openDetails(number: string) {
    setDetailNumber(number);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const data = await api.getCdrSample(caseId, number);
      setDetailRecords(data);
    } catch {
      setDetailRecords([]);
    }
    setDetailLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" /> Cross-File Common Numbers
        </CardTitle>
        <CardDescription>
          Detect phone numbers appearing across multiple uploaded CDR/Tower Dump files — key for identifying suspects and associates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Min files:</span>
            <Select value={minFiles} onValueChange={setMinFiles}>
              <SelectTrigger className="w-20 h-8 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {['2', '3', '4', '5', '6', '7', '8', '10'].map(v => (
                  <SelectItem key={v} value={v}>{v}+</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={analyze} disabled={loading} size="sm" className="gap-1">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            Analyze
          </Button>
          {analyzed && <span className="text-xs text-muted-foreground">{totalFiles} files scanned</span>}
        </div>

        {analyzed && !loading && results.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No numbers found appearing in {minFiles}+ files.</p>
            <p className="text-xs mt-1">Try lowering the threshold or upload more CDR files.</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="default">{results.length}</Badge>
              <span className="text-muted-foreground">numbers found in {minFiles}+ files</span>
            </div>
            <div className="rounded-md border border-border overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead className="text-center">Files</TableHead>
                    <TableHead className="text-center">Total Calls</TableHead>
                    <TableHead>Appears In</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={r.number}>
                      <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                      <TableCell className="font-mono text-sm font-medium">
                        <Button
                          variant="link"
                          className="p-0 h-auto font-mono text-sm"
                          onClick={() => openDetails(r.number)}
                        >
                          {r.number}
                        </Button>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.fileCount >= 5 ? 'destructive' : 'secondary'}>{r.fileCount}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">{r.totalCalls.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.fileNames.slice(0, 3).map((fn, j) => (
                            <Badge key={j} variant="outline" className="text-[10px] font-normal max-w-[150px] truncate">{fn}</Badge>
                          ))}
                          {r.fileNames.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">+{r.fileNames.length - 3} more</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Common number {detailNumber} across CDR files
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-6 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading call records...
            </div>
          ) : detailRecords.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground text-center">
              No CDR records for this number in the analyzed files.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto space-y-4">
              <div className="mb-3 text-xs text-muted-foreground">
                {Object.entries(
                  detailRecords.reduce<Record<string, number>>((acc, r) => {
                    const fid = r.file_id as string | null;
                    if (!fid) return acc;
                    acc[fid] = (acc[fid] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([fid, count]) => (
                  <div key={fid}>
                    <span className="font-medium text-foreground">
                      {fileNameById[fid] || fid}
                    </span>{' '}
                    — {count} calls/SMS with this number
                  </div>
                ))}
              </div>

              {/* Normalized combined view (same columns for all) */}
              <div className="mb-4 overflow-x-auto">
                <div className="text-xs font-medium mb-1">Normalized view (common fields)</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>CDR File</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Duration (sec)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRecords.map((r, idx) => {
                      const d = r.call_date ? new Date(r.call_date) : null;
                      return (
                        <TableRow key={idx}>
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="text-xs">
                            {fileNameById[r.file_id] || r.file_id || ''}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.calling_number || ''}</TableCell>
                          <TableCell className="font-mono text-xs">{r.called_number || ''}</TableCell>
                          <TableCell className="text-xs">{r.call_type || ''}</TableCell>
                          <TableCell className="text-xs">
                            {d ? d.toLocaleDateString() : ''}
                          </TableCell>
                          <TableCell className="text-xs">
                            {d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                          </TableCell>
                          <TableCell className="text-xs">{r.duration ?? ''}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Raw rows by CDR file (all original columns) */}
              <div className="space-y-4">
                {Object.entries(
                  detailRecords.reduce<Record<string, any[]>>((acc, r) => {
                    const fid = (r.file_id as string) || 'unknown';
                    if (!acc[fid]) acc[fid] = [];
                    acc[fid].push(r);
                    return acc;
                  }, {})
                ).map(([fid, rows]) => {
                  const rawRows = rows
                    .map(r => (r.raw_data || {}) as Record<string, any>)
                    .filter(r => Object.keys(r).length > 0);
                  if (!rawRows.length) return null;
                  const allHeaders = Array.from(
                    new Set(rawRows.flatMap(r => Object.keys(r)))
                  );
                  const filteredHeaders = allHeaders.filter(h =>
                    preferredRawColumns.has(normalizeKey(h))
                  );
                  const headers = filteredHeaders.length > 0 ? filteredHeaders : allHeaders;
                  const fileName = fileNameById[fid] || fid;
                  return (
                    <div key={fid}>
                      <div className="text-xs font-medium mb-1">
                        Original CDR rows from {fileName}
                      </div>
                      <div className="rounded-md border border-border overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {headers.map(h => (
                                <TableHead key={h} className="text-xs whitespace-nowrap">
                                  {h}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rawRows.map((row, idx) => (
                              <TableRow key={idx}>
                                {headers.map(h => (
                                  <TableCell key={h} className="text-xs whitespace-nowrap">
                                    {row[h] != null ? String(row[h]) : ''}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
