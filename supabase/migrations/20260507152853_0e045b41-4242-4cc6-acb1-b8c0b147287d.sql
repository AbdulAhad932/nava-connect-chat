
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid,
  ADD COLUMN IF NOT EXISTS forwarded_from_id uuid,
  ADD COLUMN IF NOT EXISTS is_deleted_for_everyone boolean NOT NULL DEFAULT false;

-- Allow sender to soft-delete (delete for everyone) within 1 hour
CREATE POLICY "Sender can soft delete within 1 hour"
  ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id AND created_at > (now() - interval '1 hour'))
  WITH CHECK (auth.uid() = sender_id);

-- Per-user deletions (delete for me)
CREATE TABLE IF NOT EXISTS public.message_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own deletions"
  ON public.message_deletions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users add own deletions"
  ON public.message_deletions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own deletions"
  ON public.message_deletions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Starred messages
CREATE TABLE IF NOT EXISTS public.starred_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
ALTER TABLE public.starred_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own stars"
  ON public.starred_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users add own stars"
  ON public.starred_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own stars"
  ON public.starred_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Realtime
ALTER TABLE public.message_deletions REPLICA IDENTITY FULL;
ALTER TABLE public.starred_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_deletions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.starred_messages;
