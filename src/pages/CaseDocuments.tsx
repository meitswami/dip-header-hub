import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  Upload, FileText, Search, Loader2, Trash2, FolderOpen, Download,
  File, FileImage, FileType
} from 'lucide-react';

const DOC_CATEGORIES = [
  { value: 'fir', label: 'FIR (First Information Report)' },
  { value: 'sir', label: 'SIR (Spot Inspection Report)' },
  { value: 'fr', label: 'FR (Final Report)' },
  { value: 'chargesheet', label: 'Chargesheet' },
  { value: 'witness_statement', label: 'Witness Statement' },
  { value: 'forensic_report', label: 'Forensic Report' },
  { value: 'court_order', label: 'Court Order' },
  { value: 'seizure_memo', label: 'Seizure Memo' },
  { value: 'cdr_data', label: 'CDR Data' },
  { value: 'ipdr_data', label: 'IPDR Data' },
  { value: 'tower_data', label: 'Tower Dump Data' },
  { value: 'photograph', label: 'Photographs' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
];

type CaseDoc = any;

export default function CaseDocuments() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [cases, setCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState(searchParams.get('case') || '');
  const [documents, setDocuments] = useState<CaseDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('other');
  const [filterCategory, setFilterCategory] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('cases').select('id, title').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setCases(data); });
  }, []);

  useEffect(() => {
    if (selectedCase) loadDocuments();
  }, [selectedCase]);

  async function loadDocuments() {
    setLoading(true);
    let query = supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', selectedCase)
      .order('created_at', { ascending: false });
    const { data } = await query;
    if (data) setDocuments(data as CaseDoc[]);
    setLoading(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !user || !selectedCase) return;

    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        // Compute hash
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const filePath = `${selectedCase}/${category}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('case-documents')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        await supabase.from('case_documents').insert({
          case_id: selectedCase,
          title: file.name.replace(/\.[^.]+$/, ''),
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          uploaded_by: user.id,
        } as any);

        toast({ title: 'Document uploaded', description: file.name });
      } catch (err: any) {
        toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
      }
    }
    setUploading(false);
    e.target.value = '';
    loadDocuments();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Case Documents</h1>
          <p className="text-muted-foreground">Upload and organize case-related documents by category</p>
        </div>
        <Select value={selectedCase} onValueChange={setSelectedCase}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select case..." /></SelectTrigger>
          <SelectContent>
            {cases.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selectedCase && (
        <>
          {/* Upload */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1.5 block">Document Category</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOC_CATEGORIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Upload Files</label>
                  <div className="relative">
                    <input type="file" multiple onChange={handleUpload} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <Button variant="outline" disabled={uploading}>
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploading ? 'Uploading...' : 'Choose Files'}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Category summary */}
          {Object.keys(categoryCounts).length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={filterCategory === 'all' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setFilterCategory('all')}
              >
                All ({documents.length})
              </Badge>
              {Object.entries(categoryCounts).map(([cat, count]) => (
                <Badge
                  key={cat}
                  variant={filterCategory === cat ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setFilterCategory(cat)}
                >
                  {DOC_CATEGORIES.find(c => c.value === cat)?.label || cat} ({String(count)})
                </Badge>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          {/* Document list */}
          {loading ? (
            <Card><CardContent className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No documents found</p>
                <p className="text-sm">Upload case documents to organize them here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(doc => (
                <Card key={doc.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="text-muted-foreground">{fileIcon(doc.file_name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{doc.file_name}</span>
                        {doc.file_size && <span>• {(doc.file_size / 1024).toFixed(0)} KB</span>}
                        <span>• {new Date(doc.created_at).toLocaleDateString()}</span>
                      </div>
                      {doc.file_hash && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">SHA256: {doc.file_hash.substring(0, 16)}...</p>
                      )}
                    </div>
                    <Badge variant="outline">
                      {String(DOC_CATEGORIES.find(c => c.value === (doc as any).category)?.label || (doc as any).category || '')}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => deleteDoc(doc)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {!selectedCase && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Select a case to manage documents</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
