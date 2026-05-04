ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_delivered boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_pair_created ON public.messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread ON public.messages (receiver_id) WHERE is_read = false;

-- Allow receiver to also update is_delivered (existing policy may already allow updates by receiver; ensure it)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='Receivers can update delivery/read status'
  ) THEN
    CREATE POLICY "Receivers can update delivery/read status"
      ON public.messages
      FOR UPDATE
      USING (auth.uid() = receiver_id)
      WITH CHECK (auth.uid() = receiver_id);
  END IF;
END $$;