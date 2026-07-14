
DROP POLICY IF EXISTS "Users can update messages (read receipts)" ON public.messages;
CREATE POLICY "Recipient can mark as read" ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() <> sender_id)
  WITH CHECK (auth.uid() <> sender_id);
