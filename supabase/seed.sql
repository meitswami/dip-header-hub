-- ===========================================
-- CDR Investigation Platform - Database Seed
-- ===========================================
-- This file runs automatically after migrations on `supabase db reset`
-- It creates storage buckets and any initial data needed.

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('evidence', 'evidence', false, 52428800, NULL),
  ('knowledge-base', 'knowledge-base', false, 52428800, NULL),
  ('case-documents', 'case-documents', false, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for evidence bucket
CREATE POLICY IF NOT EXISTS "evidence_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'evidence' AND auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "evidence_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'evidence' AND auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "evidence_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'evidence' AND auth.uid() IS NOT NULL);

-- Storage policies for knowledge-base bucket
CREATE POLICY IF NOT EXISTS "kb_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "kb_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "kb_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);

-- Storage policies for case-documents bucket
CREATE POLICY IF NOT EXISTS "casedocs_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'case-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "casedocs_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'case-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "casedocs_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'case-documents' AND auth.uid() IS NOT NULL);
