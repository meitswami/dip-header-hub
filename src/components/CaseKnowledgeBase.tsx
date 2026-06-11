import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type KbDocument } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import {
  Upload, FileText, Loader2, AlertCircle, CheckCircle, XCircle, Clock, Trash2, Brain,
} from 'lucide-react';

const ACCEPT = [
  '.pdf', '.doc', '.docx', '.txt', '.md', '.log',
  '.xlsx', '.xls', '.csv', '.tsv',
  '.pptx', '.ppt', '.sql',
  '.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp',
].join(',');

interface Props {
  caseId: string;
}

export default function CaseKnowledgeBase({ caseId }: Props) {
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.kbFiles(caseId, false);
      setDocuments(data);
    } catch (err) {
      toast({ title: 'Failed to load documents', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        try {
          await api.kbUpload(file, { caseId, category: 'case-evidence' });
        } catch (err) {
          toast({ title: `Failed: ${file.name}`, description: (err as Error).message, variant: 'destructive' });
        }
      }
      toast({ title: `${files.length} file(s) queued for indexing` });
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function del(doc: KbDocument) {
    if (!confirm(`Remove "${doc.title || doc.file_name}" from this case's knowledge base?`)) return;
    try {
      await api.kbDelete(doc.id);
      load();
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle className="h-4 w-4 text-success" />;
    if (status === 'processing') return <Loader2 className="h-4 w-4 animate-spin text-warning" />;
    if (status === 'error') return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const processing = documents.filter(d => d.status === 'processing');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Case Knowledge Base
            <Badge variant="outline" className="ml-2 text-[10px] font-normal">
              {documents.length} doc{documents.length === 1 ? '' : 's'}
            </Badge>
          </CardTitle>
          <div className="relative">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              onChange={e => handleFiles(e.target.files)}
              disabled={uploading}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Button size="sm" variant="outline" disabled={uploading}>
              {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
              {uploading ? 'Ingesting…' : 'Upload documents'}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          PDF, Word, Excel, CSV, PowerPoint, SQL dumps, images (OCR — Eng + Hindi). Used by the AI to answer questions about this case.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {processing.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-2 space-y-1">
            {processing.map(d => {
              const elapsed = d.processing_started_at
                ? Math.round((Date.now() - new Date(d.processing_started_at).getTime()) / 1000)
                : 0;
              return (
                <div key={d.id} className="flex items-center gap-2 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin text-warning" />
                  <span className="flex-1 truncate">{d.title || d.file_name}</span>
                  <span className="text-muted-foreground">{elapsed}s</span>
                  <Progress value={Math.min(elapsed * 5, 90)} className="w-16 h-1.5" />
                </div>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
        ) : documents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No documents yet. Upload evidence documents so the AI can answer about them.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-2 w-6"></th>
                  <th className="pb-2 pr-2">File</th>
                  <th className="pb-2 pr-2">Type</th>
                  <th className="pb-2 pr-2">Chunks</th>
                  <th className="pb-2 pr-2">Lang</th>
                  <th className="pb-2 pr-2">Status</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(d => (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-2">{statusIcon(d.status)}</td>
                    <td className="py-2 pr-2 min-w-0">
                      <div className="truncate max-w-[320px]">
                        <FileText className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                        <span className="font-medium">{d.title || d.file_name}</span>
                      </div>
                      {d.error_message && (
                        <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                          <AlertCircle className="h-3 w-3" /> {d.error_message}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground uppercase">{d.source_type}</td>
                    <td className="py-2 pr-2 text-xs">{d.chunk_count || 0}</td>
                    <td className="py-2 pr-2 text-xs">{d.language || '—'}</td>
                    <td className="py-2 pr-2">
                      <Badge variant={d.status === 'completed' ? 'default' : d.status === 'error' ? 'destructive' : 'secondary'}>
                        {d.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del(d)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
