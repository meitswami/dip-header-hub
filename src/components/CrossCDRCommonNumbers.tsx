import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

  async function analyze() {
    setLoading(true);
    setAnalyzed(true);

    // Get all evidence files for this case (CDR type)
    const { data: files } = await supabase
      .from('evidence_logs')
      .select('id, file_name')
      .eq('case_id', caseId)
      .in('upload_type', ['cdr', 'tower_dump']);

    if (!files?.length) {
      setResults([]);
      setTotalFiles(0);
      setLoading(false);
      return;
    }

    setTotalFiles(files.length);
    const fileMap = new Map(files.map(f => [f.id, f.file_name]));
    const fileIds = files.map(f => f.id);

    // Fetch CDR records with file_id
    const { data: cdrRecords } = await supabase
      .from('cdr_records')
      .select('calling_number, called_number, file_id')
      .eq('case_id', caseId)
      .in('file_id', fileIds)
      .limit(10000);

    // Fetch tower dump records with file_id
    const { data: tdRecords } = await supabase
      .from('tower_dump_records')
      .select('mobile_number, file_id')
      .eq('case_id', caseId)
      .in('file_id', fileIds)
      .limit(10000);

    // Build number → set of file_ids
    const numberFiles: Record<string, Set<string>> = {};
    const numberCalls: Record<string, number> = {};

    for (const r of (cdrRecords || [])) {
      for (const num of [r.calling_number, r.called_number]) {
        if (!num || !r.file_id) continue;
        if (!numberFiles[num]) { numberFiles[num] = new Set(); numberCalls[num] = 0; }
        numberFiles[num].add(r.file_id);
        numberCalls[num]++;
      }
    }

    for (const r of (tdRecords || [])) {
      if (!r.mobile_number || !r.file_id) continue;
      if (!numberFiles[r.mobile_number]) { numberFiles[r.mobile_number] = new Set(); numberCalls[r.mobile_number] = 0; }
      numberFiles[r.mobile_number].add(r.file_id);
      numberCalls[r.mobile_number]++;
    }

    const threshold = parseInt(minFiles);
    const common: CommonNumber[] = Object.entries(numberFiles)
      .filter(([_, fileSet]) => fileSet.size >= threshold)
      .map(([number, fileSet]) => ({
        number,
        fileCount: fileSet.size,
        fileNames: Array.from(fileSet).map(fid => fileMap.get(fid) || fid),
        totalCalls: numberCalls[number] || 0,
      }))
      .sort((a, b) => b.fileCount - a.fileCount || b.totalCalls - a.totalCalls);

    setResults(common);
    setLoading(false);
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
                      <TableCell className="font-mono text-sm font-medium">{r.number}</TableCell>
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
    </Card>
  );
}
