
-- Profiles table: two users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read all messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can update messages (read receipts)" ON public.messages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);

CREATE INDEX messages_created_at_idx ON public.messages(created_at);

-- Typing indicator table (one row per user)
CREATE TABLE public.typing_status (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_typing BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.typing_status TO authenticated;
GRANT ALL ON public.typing_status TO service_role;
ALTER TABLE public.typing_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read typing" ON public.typing_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can upsert own typing" ON public.typing_status FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own typing" ON public.typing_status FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Presence table
CREATE TABLE public.presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.presence TO authenticated;
GRANT ALL ON public.presence TO service_role;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read presence" ON public.presence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can upsert own presence" ON public.presence FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presence" ON public.presence FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;

-- Storage policies for chat-images bucket
CREATE POLICY "Authenticated can view chat images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-images');
CREATE POLICY "Public can view chat images" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'chat-images');
CREATE POLICY "Authenticated can upload chat images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete own chat images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);
