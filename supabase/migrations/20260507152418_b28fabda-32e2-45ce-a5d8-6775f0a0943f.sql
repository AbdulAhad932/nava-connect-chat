
-- Profile fields for About + privacy
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS about text DEFAULT 'Hey there! I am using NAVA.',
  ADD COLUMN IF NOT EXISTS privacy_last_seen text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS privacy_photo text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS privacy_about text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light';

-- Blocked users
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own blocks or blocks against them"
  ON public.blocked_users FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

CREATE POLICY "Users create own blocks"
  ON public.blocked_users FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users delete own blocks"
  ON public.blocked_users FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);
