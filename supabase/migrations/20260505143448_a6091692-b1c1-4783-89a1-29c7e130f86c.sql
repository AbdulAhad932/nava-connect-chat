
-- =========================
-- GROUPS
-- =========================
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  photo_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_members_user ON public.group_members(user_id);
CREATE INDEX idx_group_members_group ON public.group_members(group_id);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_group_member(_group uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group AND user_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_group uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group AND user_id = _user AND role = 'admin'
  );
$$;

-- RLS: groups
CREATE POLICY "Members view their groups"
ON public.groups FOR SELECT TO authenticated
USING (public.is_group_member(id, auth.uid()));

CREATE POLICY "Authenticated can create groups"
ON public.groups FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can update group"
ON public.groups FOR UPDATE TO authenticated
USING (public.is_group_admin(id, auth.uid()))
WITH CHECK (public.is_group_admin(id, auth.uid()));

CREATE POLICY "Admins can delete group"
ON public.groups FOR DELETE TO authenticated
USING (public.is_group_admin(id, auth.uid()));

-- RLS: group_members
CREATE POLICY "Members can view roster"
ON public.group_members FOR SELECT TO authenticated
USING (public.is_group_member(group_id, auth.uid()));

-- Allow inserting yourself as creator (when group has no admin yet) OR admin can add others
CREATE POLICY "Creator or admin can add members"
ON public.group_members FOR INSERT TO authenticated
WITH CHECK (
  public.is_group_admin(group_id, auth.uid())
  OR (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND g.created_by = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_id
    )
  )
);

CREATE POLICY "Admins or self can remove member"
ON public.group_members FOR DELETE TO authenticated
USING (
  public.is_group_admin(group_id, auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY "Admins update roles"
ON public.group_members FOR UPDATE TO authenticated
USING (public.is_group_admin(group_id, auth.uid()))
WITH CHECK (public.is_group_admin(group_id, auth.uid()));

-- updated_at trigger
CREATE TRIGGER set_groups_updated_at
BEFORE UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- MESSAGES: support groups
-- =========================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE public.messages ALTER COLUMN receiver_id DROP NOT NULL;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_target_check
  CHECK (
    (receiver_id IS NOT NULL AND group_id IS NULL)
    OR (receiver_id IS NULL AND group_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_messages_group_created ON public.messages(group_id, created_at DESC);

-- Replace message SELECT/INSERT policies to include groups
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
CREATE POLICY "View 1-1 or group messages"
ON public.messages FOR SELECT TO authenticated
USING (
  (group_id IS NULL AND (auth.uid() = sender_id OR auth.uid() = receiver_id))
  OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
);

DROP POLICY IF EXISTS "Users can send messages as themselves" ON public.messages;
CREATE POLICY "Send 1-1 or group messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND (
    (group_id IS NULL AND receiver_id IS NOT NULL)
    OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
  )
);

-- =========================
-- STATUSES (24h stories)
-- =========================
CREATE TABLE public.statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  media_url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX idx_statuses_user ON public.statuses(user_id);
CREATE INDEX idx_statuses_expires ON public.statuses(expires_at);

ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active statuses"
ON public.statuses FOR SELECT TO authenticated
USING (expires_at > now());

CREATE POLICY "Users insert own status"
ON public.statuses FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own status"
ON public.statuses FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- =========================
-- STORAGE BUCKETS
-- =========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('group-avatars', 'group-avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('status-media', 'status-media', true)
ON CONFLICT (id) DO NOTHING;

-- group-avatars: public read, only signed-in users upload (folder = group id they admin)
CREATE POLICY "group-avatars read all"
ON storage.objects FOR SELECT
USING (bucket_id = 'group-avatars');

CREATE POLICY "group-avatars insert by admin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'group-avatars'
  AND public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "group-avatars update by admin"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'group-avatars'
  AND public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- status-media: read for any authenticated user, upload only to own folder
CREATE POLICY "status-media read authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'status-media');

CREATE POLICY "status-media insert own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'status-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "status-media delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'status-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- =========================
-- pg_cron + pg_net for scheduled status cleanup
-- =========================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
