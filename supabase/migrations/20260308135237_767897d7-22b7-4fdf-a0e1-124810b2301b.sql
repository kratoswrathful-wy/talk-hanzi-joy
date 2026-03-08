
ALTER TABLE public.profiles
ADD COLUMN timezone text DEFAULT 'Asia/Taipei',
ADD COLUMN status_message text DEFAULT '',
ADD COLUMN phone text DEFAULT '',
ADD COLUMN mobile text DEFAULT '',
ADD COLUMN bio text DEFAULT '';
