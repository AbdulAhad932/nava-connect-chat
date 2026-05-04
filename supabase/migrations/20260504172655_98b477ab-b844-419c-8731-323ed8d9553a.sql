
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT,
  name TEXT,
  photo_url TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view profiles (chat app needs this)
CREATE POLICY "Profiles viewable by authenticated users"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Avatars storage bucket (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Avatar images publicly accessible"
ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
