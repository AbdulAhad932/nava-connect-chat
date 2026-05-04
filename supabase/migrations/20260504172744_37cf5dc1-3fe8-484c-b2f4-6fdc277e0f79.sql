
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Avatar images publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] IS NOT NULL);
