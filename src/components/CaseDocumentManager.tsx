import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import {
  Upload, FileText, Loader2, Trash2, FolderOpen, Eye,
  File, FileImage, FileType, Search, ScanText, ChevronDown
} from 'lucide-react';

const DOC_CATEGORIES = [
  { value: 'fir', label: 'FIR' },
  { value: 'sir', label: 'SIR' },
  { value: 'fr', label: 'Final Report' },
  { value: 'chargesheet', label: 'Chargesheet' },
  { value: 'witness_statement', label: 'Witness Statement' },
  { value: 'forensic_report', label: 'Forensic Report' },
  { value: 'court_order', label: 'Court Order' },
  { value: 'seizure_memo', label: 'Seizure Memo' },
  { value: 'photograph', label: 'Photographs' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
];

type CaseDoc = {
  id: string;
  case_id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  category: string;
  file_hash: string | null;
  created_at: string;
  ocr_text: string | null;
  ocr_status: string | null;
};

interface Props {
  caseId: string;
}

export default function CaseDocumentManager({ caseId }: Props) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<CaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('other');
  const [docTitle, setDocTitle] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [viewingDoc, setViewingDoc] = useState<CaseDoc | null>(null);
  const [ocrProcessing, setOcrProcessing] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  useEffect(() => { loadDocuments(); }, [caseId]);

  async function loadDocuments() {
    setLoading(true);
    const { data } = await supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });
    if (data) setDocuments(data as CaseDoc[]);
    setLoading(false);
  }

  async function checkDuplicate(fileName: string, title: string): Promise<boolean> {
    const existing = documents.find(
      d => d.file_name.toLowerCase() === fileName.toLowerCase() ||
           d.title.toLowerCase() === title.toLowerCase()
    );
    if (existing) {
      toast({
        title: 'Duplicate document',
        description: `A document with this name "${existing.title}" already exists in this case.`,
        variant: 'destructive',
      });
      return true;
    }
    return false;
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !user || !docTitle.trim()) {
      if (!docTitle.trim()) toast({ title: 'Please enter a document name', variant: 'destructive' });
      return;
    }

    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'txt', 'png', 'jpg', 'jpeg'].includes(ext || '')) {
      toast({ title: 'Unsupported format', description: 'Only PDF, TXT, PNG, JPG, JPEG allowed', variant: 'destructive' });
      e.target.value = '';
      return;
    }

    const isDuplicate = await checkDuplicate(file.name, docTitle.trim());
    if (isDuplicate) { e.target.value = ''; return; }

    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const filePath = `${caseId}/${category}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('case-documents')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: insertData, error: insertErr } = await supabase.from('case_documents').insert({
        case_id: caseId,
        title: docTitle.trim(),
        file_name: file.name,
        file_url: filePath,
        file_size: file.size,
        category,
        file_hash: fileHash,
        uploaded_by: user.id,
        ocr_status: 'pending',
      }).select().single();

      if (insertErr) throw insertErr;

      toast({ title: 'Document uploaded', description: `${docTitle.trim()} — starting OCR...` });
      setDocTitle('');
      loadDocuments();

      // Trigger OCR
      if (insertData) triggerOCR(insertData.id);
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    }
    setUploading(false);
    e.target.value = '';
  }

  async function triggerOCR(documentId: string) {
    setOcrProcessing(prev => new Set(prev).add(documentId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-document`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ documentId }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'OCR failed');
      }
      toast({ title: 'OCR completed', description: 'Text extracted successfully' });
      loadDocuments();
    } catch (err: any) {
      toast({ title: 'OCR failed', description: err.message, variant: 'destructive' });
    }
    setOcrProcessing(prev => { const s = new Set(prev); s.delete(documentId); return s; });
  }

  async function deleteDoc(doc: CaseDoc) {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    await supabase.storage.from('case-documents').remove([doc.file_url]);
    await supabase.from('case_documents').delete().eq('id', doc.id);
    toast({ title: 'Document deleted' });
    loadDocuments();
  }

  const filtered = documents.filter(d => {
    if (filterCategory !== 'all' && d.category !== filterCategory) return false;
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.file_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categoryCounts = documents.reduce((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const fileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return <FileImage className="h-4 w-4" />;
    if (['pdf'].includes(ext || '')) return <FileType className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const ocrStatusBadge = (status: string | null) => {
    switch (status) {
      case 'completed': return <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">OCR Done</Badge>;
      case 'processing': return <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">Processing...</Badge>;
      case 'error': return <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">OCR Error</Badge>;
      default: return <Badge variant="outline" className="text-xs">Pending</Badge>;
    }
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-base font-semibold w-full text-left">
              <FileText className="h-5 w-5 text-primary" />
              Case Documents ({documents.length})
              <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="space-y-4">
        {/* Upload form */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-medium mb-1 block">Document Name *</label>
            <Input
              placeholder="e.g. Chargesheet"
              value={docTitle}
              onChange={e => setDocTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium mb-1 block">Upload (.pdf, .txt, .png, .jpg, .jpeg)</label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.txt,.png,.jpg,.jpeg"
                onChange={handleUpload}
                disabled={uploading || !docTitle.trim()}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Button variant="outline" disabled={uploading || !docTitle.trim()} className="w-full">
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {uploading ? 'Uploading & Processing...' : 'Choose File'}
              </Button>
            </div>
          </div>
        </div>

        {/* Filter badges */}
        {Object.keys(categoryCounts).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={filterCategory === 'all' ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={() => setFilterCategory('all')}
            >All ({documents.length})</Badge>
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <Badge
                key={cat}
                variant={filterCategory === cat ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setFilterCategory(cat)}
              >
                {DOC_CATEGORIES.find(c => c.value === cat)?.label || cat} ({count})
              </Badge>
            ))}
          </div>
        )}

        {/* Search */}
        {documents.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
          </div>
        )}

        {/* Document list */}
        {loading ? (
          <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No documents yet. Upload case documents above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="text-muted-foreground">{fileIcon(doc.file_name)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{doc.file_name}</span>
                    {doc.file_size && <span>• {(doc.file_size / 1024).toFixed(0)} KB</span>}
                    <span>• {new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {DOC_CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                </Badge>
                {ocrStatusBadge(doc.ocr_status)}
                {doc.ocr_text && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewingDoc(doc)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {ocrProcessing.has(doc.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : doc.ocr_status !== 'completed' && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => triggerOCR(doc.id)} title="Run OCR">
                    <ScanText className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteDoc(doc)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* OCR Text Viewer Dialog */}
        <Dialog open={!!viewingDoc} onOpenChange={() => setViewingDoc(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{viewingDoc?.title} — Extracted Text</DialogTitle>
            </DialogHeader>
            <div className="whitespace-pre-wrap text-sm font-mono bg-muted p-4 rounded-lg">
              {viewingDoc?.ocr_text || 'No text extracted.'}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
      </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
