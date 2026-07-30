UPDATE public.messages SET read_at = NULL
WHERE id IN (
  SELECT m.id FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE p.username = 'manmadha'
  ORDER BY m.created_at DESC
  LIMIT 6
);