
-- Add rank/designation column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rank text,
  ADD COLUMN IF NOT EXISTS designation text;
