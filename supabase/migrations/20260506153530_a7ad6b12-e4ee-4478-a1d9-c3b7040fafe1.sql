CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reactions on visible messages"
ON public.message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND (
        (m.group_id IS NULL AND (auth.uid() = m.sender_id OR auth.uid() = m.receiver_id))
        OR (m.group_id IS NOT NULL AND public.is_group_member(m.group_id, auth.uid()))
      )
  )
);

CREATE POLICY "Users add own reactions"
ON public.message_reactions FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND (
        (m.group_id IS NULL AND (auth.uid() = m.sender_id OR auth.uid() = m.receiver_id))
        OR (m.group_id IS NOT NULL AND public.is_group_member(m.group_id, auth.uid()))
      )
  )
);

CREATE POLICY "Users delete own reactions"
ON public.message_reactions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);