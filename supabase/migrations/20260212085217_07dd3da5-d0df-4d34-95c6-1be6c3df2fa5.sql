
-- Fix notifications insert to be more restrictive - only authenticated users can create notifications
DROP POLICY "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
