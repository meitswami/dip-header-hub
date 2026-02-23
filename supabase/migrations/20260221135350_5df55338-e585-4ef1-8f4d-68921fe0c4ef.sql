
-- Add detailed fields to person_profiles
ALTER TABLE public.person_profiles
  ADD COLUMN IF NOT EXISTS alias_name text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS mobile_numbers text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS alleged_role text,
  ADD COLUMN IF NOT EXISTS photo_urls text[] DEFAULT '{}';

-- Add ocr_text column to case_documents for storing extracted text
ALTER TABLE public.case_documents
  ADD COLUMN IF NOT EXISTS ocr_text text,
  ADD COLUMN IF NOT EXISTS ocr_status text DEFAULT 'pending';
