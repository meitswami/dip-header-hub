import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
  CheckCircle, XCircle, Brain, Send, Bot, User, AlertCircle
} from 'lucide-react';

const CATEGORIES = [
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
  { value: 'general', label: 'General Reference' },
];

type KBDoc = {
  id: string;
  title: string;
  file_name: string;
  file_size: number | null;
  category: string;
  status: string;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  chunk_count: number | null;
  page_count: number | null;
  error_message: string | null;
  created_at: string;
};

type QAMessage = { role: 'user' | 'assistant'; content: string };

export default function KnowledgeBase() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<KBDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [qaMessages, setQaMessages] = useState<QAMessage[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);

  useEffect(() => {
    loadDocuments();
    // Poll for processing status
    const interval = setInterval(loadDocuments, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadDocuments() {
    const { data } = await supabase
      .from('knowledge_base_documents')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setDocuments(data as KBDoc[]);
    setLoading(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !user) return;

    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('knowledge-base')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const fileUrl = filePath;

        // Create document record
        const { data: doc, error: insertError } = await supabase
          .from('knowledge_base_documents')
          .insert({
            title: file.name.replace(/\.[^.]+$/, ''),
            file_name: file.name,
            file_url: fileUrl,
            file_size: file.size,
            category,
            uploaded_by: user.id,
            status: 'processing',
            processing_started_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (insertError) throw insertError;

        // Trigger backend processing
        const processResp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-kb-document`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ documentId: doc.id, filePath: fileUrl }),
          }
        );

        if (!processResp.ok) {
          const errText = await processResp.text();
          console.error('Processing error:', errText);
        }

        toast({ title: 'Document uploaded', description: `${file.name} is being processed` });
      } catch (err: any) {
        toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
      }
    }
    setUploading(false);
    e.target.value = '';
    loadDocuments();
  }

  async function deleteDocument(doc: KBDoc & { file_url?: string }) {
    if (!confirm(`Delete "${doc.title}"? This will remove all extracted data.`)) return;
    if ((doc as any).file_url) await supabase.storage.from('knowledge-base').remove([(doc as any).file_url]);
    await supabase.from('knowledge_base_documents').delete().eq('id', doc.id);
    toast({ title: 'Document deleted' });
    loadDocuments();
  }

  async function askQuestion() {
    if (!qaInput.trim() || qaLoading) return;
    const userMsg: QAMessage = { role: 'user', content: qaInput.trim() };
    setQaMessages(prev => [...prev, userMsg]);
    setQaInput('');
    setQaLoading(true);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kb-query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            question: userMsg.content,
            messages: qaMessages.concat(userMsg),
          }),
        }
      );

      if (!resp.ok) throw new Error('Query failed');

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let nlIdx: number;
        while ((nlIdx = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, nlIdx);
          textBuffer = textBuffer.slice(nlIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) {
              assistantText += c;
              setQaMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant')
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
                return [...prev, { role: 'assistant', content: assistantText }];
              });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setQaMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + err.message }]);
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
  const filteredDocs = documents.filter(d =>
    !searchQuery ||
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.category.includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground">Upload legal documents, SOPs, and reference material for AI training</p>
        </div>
      </div>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents"><FileText className="h-4 w-4 mr-1" /> Documents</TabsTrigger>
          <TabsTrigger value="ask"><Brain className="h-4 w-4 mr-1" /> Ask Knowledge Base</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          {/* Upload section */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-end gap-4">
                <div className="flex-1">
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
                  <label className="text-sm font-medium mb-1.5 block">Upload PDF(s)</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      multiple
                      onChange={handleUpload}
                      disabled={uploading}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" disabled={uploading}>
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploading ? 'Uploading...' : 'Choose Files'}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Processing status */}
          {processingDocs.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-warning">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">{processingDocs.length} document(s) being processed...</span>
                </div>
                {processingDocs.map(d => {
                  const elapsed = d.processing_started_at
                    ? Math.round((Date.now() - new Date(d.processing_started_at).getTime()) / 1000)
                    : 0;
                  return (
                    <div key={d.id} className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm flex-1">{d.title}</span>
                      <span className="text-xs text-muted-foreground">{elapsed}s elapsed</span>
                      <Progress value={Math.min(elapsed * 2, 90)} className="w-24" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents by title or category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Document list */}
          <div className="space-y-2">
            {loading ? (
              <Card><CardContent className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>
            ) : filteredDocs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No documents in knowledge base</p>
                  <p className="text-sm">Upload PDFs to train the AI with legal and procedural knowledge</p>
                </CardContent>
              </Card>
            ) : (
              filteredDocs.map(doc => (
                <Card key={doc.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    {statusIcon(doc.status)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{doc.file_name}</span>
                        {doc.file_size && <span>• {(doc.file_size / 1024).toFixed(0)} KB</span>}
                        {doc.chunk_count ? <span>• {doc.chunk_count} chunks</span> : null}
                        {doc.processing_completed_at && doc.processing_started_at && (
                          <span>• Processed in {Math.round((new Date(doc.processing_completed_at).getTime() - new Date(doc.processing_started_at).getTime()) / 1000)}s</span>
                        )}
                      </div>
                      {doc.error_message && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {doc.error_message}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline">{CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}</Badge>
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
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Ask the Knowledge Base
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Ask questions from all uploaded documents. AI will search through the knowledge base and provide accurate answers.
              </p>
            </CardHeader>
            <ScrollArea className="flex-1 p-4">
              {qaMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                  <Brain className="h-12 w-12 mb-4 opacity-40" />
                  <p className="font-medium">Test your knowledge base</p>
                  <p className="text-sm">Ask any question to verify the uploaded data accuracy</p>
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
                      <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${
                        msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                        {msg.content}
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
                  placeholder="Ask a question from the knowledge base..."
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
