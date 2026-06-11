import { useState, useEffect, useCallback } from 'react';
import { api, type KbDocument, type KbCitation } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import {
  Upload, FileText, Search, Loader2, BookOpen, Trash2, Clock,
  CheckCircle, XCircle, Brain, Send, Bot, User, AlertCircle, Gauge,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'general', label: 'General Reference' },
  { value: 'ipc', label: 'Indian Penal Code (IPC)' },
  { value: 'crpc', label: 'Code of Criminal Procedure (CrPC)' },
  { value: 'it_act', label: 'Information Technology Act' },
  { value: 'evidence_act', label: 'Indian Evidence Act' },
  { value: 'bnss', label: 'Bharatiya Nagarik Suraksha Sanhita (BNSS)' },
  { value: 'bns', label: 'Bharatiya Nyaya Sanhita (BNS)' },
  { value: 'bsa', label: 'Bharatiya Sakshya Adhiniyam (BSA)' },
  { value: 'cyber_crime', label: 'Cyber Crime Manual' },
  { value: 'sop', label: 'Standard Operating Procedures' },
  { value: 'case_law', label: 'Case Laws & Judgments' },
];

type QAMessage = { role: 'user' | 'assistant'; content: string; citations?: KbCitation[] };

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [tier, setTier] = useState<'fast' | 'accurate'>('fast');
  const [qaMessages, setQaMessages] = useState<QAMessage[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await api.kbFiles(null, false);
      setDocuments(data);
    } catch (err) {
      toast({ title: 'Failed to load documents', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
    const interval = setInterval(loadDocuments, 4000);
    return () => clearInterval(interval);
  }, [loadDocuments]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        try {
          await api.kbUpload(file, { caseId: null, category });
          toast({ title: 'Document ingested', description: file.name });
        } catch (err) {
          toast({ title: 'Upload failed', description: (err as Error).message, variant: 'destructive' });
        }
      }
      await loadDocuments();
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function deleteDocument(doc: KbDocument) {
    if (!confirm(`Delete "${doc.title || doc.file_name}"? This removes its indexed chunks.`)) return;
    try {
      await api.kbDelete(doc.id);
      toast({ title: 'Document deleted' });
      loadDocuments();
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  async function askQuestion() {
    if (!qaInput.trim() || qaLoading) return;
    const userMsg: QAMessage = { role: 'user', content: qaInput.trim() };
    setQaMessages(prev => [...prev, userMsg]);
    setQaInput('');
    setQaLoading(true);
    try {
      const res = await api.kbQuery({
        question: userMsg.content,
        case_id: null,
        include_global: true,
        tier,
      });
      setQaMessages(prev => [...prev, { role: 'assistant', content: res.content, citations: res.citations }]);
    } catch (err) {
      setQaMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + (err as Error).message }]);
    } finally {
      setQaLoading(false);
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-warning" />;
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const processingDocs = documents.filter(d => d.status === 'processing');
  const filteredDocs = documents.filter(d => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (d.title || '').toLowerCase().includes(q)
      || (d.file_name || '').toLowerCase().includes(q)
      || (d.category || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground">
            Upload any document — PDF, Word, PowerPoint, Excel, CSV, SQL, or images (OCR) — and ask grounded questions.
          </p>
        </div>
      </div>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents"><FileText className="h-4 w-4 mr-1" /> Documents</TabsTrigger>
          <TabsTrigger value="ask"><Brain className="h-4 w-4 mr-1" /> Ask Knowledge Base</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm font-medium mb-1.5 block">Category</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Upload documents</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.md,.log,.xlsx,.xls,.csv,.tsv,.pptx,.ppt,.sql,.png,.jpg,.jpeg,.webp,.tiff,.bmp"
                      multiple
                      onChange={handleUpload}
                      disabled={uploading}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" disabled={uploading}>
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploading ? 'Ingesting...' : 'Choose Files'}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {processingDocs.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-warning">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">{processingDocs.length} document(s) processing...</span>
                </div>
                {processingDocs.map(d => {
                  const elapsed = d.processing_started_at
                    ? Math.round((Date.now() - new Date(d.processing_started_at).getTime()) / 1000)
                    : 0;
                  return (
                    <div key={d.id} className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm flex-1 truncate">{d.title || d.file_name}</span>
                      <span className="text-xs text-muted-foreground">{elapsed}s</span>
                      <Progress value={Math.min(elapsed * 5, 90)} className="w-24" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, filename, or category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="space-y-2">
            {loading ? (
              <Card><CardContent className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>
            ) : filteredDocs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No documents in knowledge base</p>
                  <p className="text-sm">Upload any document to make it searchable and queryable.</p>
                </CardContent>
              </Card>
            ) : (
              filteredDocs.map(doc => (
                <Card key={doc.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    {statusIcon(doc.status)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{doc.title || doc.file_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span>{doc.file_name}</span>
                        {doc.file_size ? <span>• {(doc.file_size / 1024).toFixed(0)} KB</span> : null}
                        {doc.chunk_count ? <span>• {doc.chunk_count} chunks</span> : null}
                        {doc.source_type ? <span>• {doc.source_type.toUpperCase()}</span> : null}
                        {doc.language ? <span>• lang: {doc.language}</span> : null}
                      </div>
                      {doc.error_message && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {doc.error_message}
                        </p>
                      )}
                    </div>
                    {doc.category && (
                      <Badge variant="outline">
                        {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                      </Badge>
                    )}
                    <Badge variant={doc.status === 'completed' ? 'default' : doc.status === 'error' ? 'destructive' : 'secondary'}>
                      {doc.status}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => deleteDocument(doc)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="ask">
          <Card className="flex flex-col h-[calc(100vh-16rem)]">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    Ask the Knowledge Base
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Grounded answers with citations. English or Hindi.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                  <Select value={tier} onValueChange={v => setTier(v as 'fast' | 'accurate')}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fast">Fast (3B)</SelectItem>
                      <SelectItem value="accurate">Accurate (7B)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1 p-4">
              {qaMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                  <Brain className="h-12 w-12 mb-4 opacity-40" />
                  <p className="font-medium">Ask anything about the uploaded documents</p>
                  <p className="text-sm">The answer cites source file + page/row.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {qaMessages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                      {msg.role === 'assistant' && (
                        <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className={`max-w-[80%] space-y-2`}>
                        <div className={`rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${
                          msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        }`}>
                          {msg.content}
                        </div>
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.citations.map(c => (
                              <Badge key={c.chunk_id} variant="outline" className="text-[10px] font-normal" title={c.preview}>
                                [{c.index}] {c.file_name}{c.locator ? ` — ${c.locator}` : ''}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  ))}
                  {qaLoading && qaMessages[qaMessages.length - 1]?.role !== 'assistant' && (
                    <div className="flex gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <div className="bg-muted rounded-lg px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Textarea
                  value={qaInput}
                  onChange={e => setQaInput(e.target.value)}
                  placeholder="Ask a question — e.g. 'Summarize IPC 420 penalties' or 'What is MSISDN?'"
                  className="min-h-[44px] max-h-32 resize-none"
                  rows={1}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion(); } }}
                />
                <Button onClick={askQuestion} disabled={!qaInput.trim() || qaLoading} size="icon" className="shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
