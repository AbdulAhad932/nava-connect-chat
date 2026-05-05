
-- Extend messages with media fields
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_name text,
  ADD COLUMN IF NOT EXISTS media_size bigint,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE public.messages ALTER COLUMN message DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN message SET DEFAULT '';

-- Private bucket for chat media
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', false)
ON CONFLICT (id) DO NOTHING;

-- Policies on storage.objects for chat-media
DROP POLICY IF EXISTS "chat-media upload own folder" ON storage.objects;
CREATE POLICY "chat-media upload own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "chat-media delete own files" ON storage.objects;
CREATE POLICY "chat-media delete own files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "chat-media read sender or receiver" ON storage.objects;
CREATE POLICY "chat-media read sender or receiver"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.media_url LIKE '%' || storage.objects.name
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);
