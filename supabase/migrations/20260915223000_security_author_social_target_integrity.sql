-- Security hardening: author social rows must point at a real public profile.
-- Production was verified to have zero rows in both tables before this migration.

alter table public.author_follows
  add constraint author_follows_followed_author_id_fkey
  foreign key (followed_author_id)
  references public.users(id)
  on delete cascade;

alter table public.author_profile_likes
  add constraint author_profile_likes_author_id_fkey
  foreign key (author_id)
  references public.users(id)
  on delete cascade;
