
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Knowledge base documents
CREATE TABLE public.knowledge_base_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'pending',
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  page_count INTEGER,
  chunk_count INTEGER DEFAULT 0,
  error_message TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_base_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_docs_select" ON public.knowledge_base_documents FOR SELECT USING (true);
CREATE POLICY "kb_docs_insert" ON public.knowledge_base_documents FOR INSERT WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "kb_docs_delete" ON public.knowledge_base_documents FOR DELETE USING (is_admin() OR uploaded_by = auth.uid());

-- Knowledge base chunks
CREATE TABLE public.knowledge_base_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.knowledge_base_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_base_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_chunks_select" ON public.knowledge_base_chunks FOR SELECT USING (true);
CREATE POLICY "kb_chunks_insert" ON public.knowledge_base_chunks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.knowledge_base_documents WHERE id = document_id AND uploaded_by = auth.uid()) OR is_admin()
);

-- Case documents
CREATE TABLE public.case_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  category TEXT NOT NULL DEFAULT 'other',
  document_type TEXT,
  description TEXT,
  file_hash TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_docs_select" ON public.case_documents FOR SELECT USING (is_case_member_or_admin(case_id));
CREATE POLICY "case_docs_insert" ON public.case_documents FOR INSERT WITH CHECK (is_case_member_or_admin(case_id) AND uploaded_by = auth.uid());
CREATE POLICY "case_docs_delete" ON public.case_documents FOR DELETE USING (is_admin() OR uploaded_by = auth.uid());

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-base', 'knowledge-base', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('case-documents', 'case-documents', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "kb_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'knowledge-base' AND auth.role() = 'authenticated');
CREATE POLICY "kb_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'knowledge-base' AND auth.role() = 'authenticated');
CREATE POLICY "case_docs_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'case-documents' AND auth.role() = 'authenticated');
CREATE POLICY "case_docs_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'case-documents' AND auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_kb_chunks_document_id ON public.knowledge_base_chunks(document_id);
CREATE INDEX idx_kb_chunks_content_trgm ON public.knowledge_base_chunks USING gin(content gin_trgm_ops);
CREATE INDEX idx_case_documents_case_id ON public.case_documents(case_id);
CREATE INDEX idx_case_documents_category ON public.case_documents(category);
