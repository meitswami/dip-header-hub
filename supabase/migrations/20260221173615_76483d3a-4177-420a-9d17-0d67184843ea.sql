
-- Add source_file column to all record tables so we can link records to specific uploaded files
ALTER TABLE public.cdr_records ADD COLUMN IF NOT EXISTS source_file TEXT;
ALTER TABLE public.ipdr_records ADD COLUMN IF NOT EXISTS source_file TEXT;
ALTER TABLE public.tower_dump_records ADD COLUMN IF NOT EXISTS source_file TEXT;
ALTER TABLE public.sdr_records ADD COLUMN IF NOT EXISTS source_file TEXT;

-- Add indexes for fast filtering by source_file
CREATE INDEX IF NOT EXISTS idx_cdr_source_file ON public.cdr_records(case_id, source_file);
CREATE INDEX IF NOT EXISTS idx_ipdr_source_file ON public.ipdr_records(case_id, source_file);
CREATE INDEX IF NOT EXISTS idx_tower_source_file ON public.tower_dump_records(case_id, source_file);
CREATE INDEX IF NOT EXISTS idx_sdr_source_file ON public.sdr_records(case_id, source_file);
