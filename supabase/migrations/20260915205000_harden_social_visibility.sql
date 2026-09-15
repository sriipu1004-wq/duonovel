-- Security audit hardening for public comments/reviews and their likes.
--
-- Social rows must never make a draft/private work observable after the work
-- itself becomes non-public. Mutations also need to verify that the referenced
-- work/episode is currently readable instead of accepting any known UUID/text id.

begin;

-- Remove review rows whose text series_id no longer resolves to a work. The
-- production audit found one such orphan. Review-like rows cascade with it.
delete from public.user_series_reviews review
where not exists (
  select 1
  from public.series s
  where s.id::text = review.series_id
);

-- ---------------------------------------------------------------------------
-- Episode comments
-- ---------------------------------------------------------------------------

drop policy if exists user_episode_comments_select_all
  on public.user_episode_comments;
drop policy if exists user_episode_comments_insert_own
  on public.user_episode_comments;
drop policy if exists user_episode_comments_update_own
  on public.user_episode_comments;
drop policy if exists user_episode_comments_delete_own
  on public.user_episode_comments;

create policy user_episode_comments_select_visible
on public.user_episode_comments
for select
to public
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.episodes e
    join public.series s on s.id = e.series_id
    where e.id = user_episode_comments.episode_id
      and (
        s.author_id = auth.uid()
        or (
          s.publication_status = 'public'
          and e.posting_status = 'posted'
          and e.is_published = true
        )
      )
  )
);

create policy user_episode_comments_insert_visible_own
on public.user_episode_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.episodes e
    join public.series s on s.id = e.series_id
    where e.id = user_episode_comments.episode_id
      and (
        s.author_id = auth.uid()
        or (
          s.publication_status = 'public'
          and e.posting_status = 'posted'
          and e.is_published = true
        )
      )
  )
);

create policy user_episode_comments_update_visible_own
on public.user_episode_comments
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.episodes e
    join public.series s on s.id = e.series_id
    where e.id = user_episode_comments.episode_id
      and (
        s.author_id = auth.uid()
        or (
          s.publication_status = 'public'
          and e.posting_status = 'posted'
          and e.is_published = true
        )
      )
  )
);

create policy user_episode_comments_delete_own
on public.user_episode_comments
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Episode comment likes
-- ---------------------------------------------------------------------------

drop policy if exists user_episode_comment_likes_select_all
  on public.user_episode_comment_likes;
drop policy if exists user_episode_comment_likes_insert_own
  on public.user_episode_comment_likes;
drop policy if exists user_episode_comment_likes_delete_own
  on public.user_episode_comment_likes;

create policy user_episode_comment_likes_select_visible
on public.user_episode_comment_likes
for select
to public
using (
  exists (
    select 1
    from public.user_episode_comments c
    join public.episodes e on e.id = c.episode_id
    join public.series s on s.id = e.series_id
    where c.id = user_episode_comment_likes.comment_id
      and (
        c.user_id = auth.uid()
        or s.author_id = auth.uid()
        or (
          s.publication_status = 'public'
          and e.posting_status = 'posted'
          and e.is_published = true
        )
      )
  )
);

create policy user_episode_comment_likes_insert_visible_own
on public.user_episode_comment_likes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.user_episode_comments c
    join public.episodes e on e.id = c.episode_id
    join public.series s on s.id = e.series_id
    where c.id = user_episode_comment_likes.comment_id
      and (
        c.user_id = auth.uid()
        or s.author_id = auth.uid()
        or (
          s.publication_status = 'public'
          and e.posting_status = 'posted'
          and e.is_published = true
        )
      )
  )
);

create policy user_episode_comment_likes_delete_own
on public.user_episode_comment_likes
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Series reviews
-- ---------------------------------------------------------------------------

drop policy if exists public_select_user_series_reviews
  on public.user_series_reviews;
drop policy if exists authenticated_insert_own_user_series_reviews
  on public.user_series_reviews;
drop policy if exists authenticated_update_own_user_series_reviews
  on public.user_series_reviews;
drop policy if exists authenticated_delete_own_user_series_reviews
  on public.user_series_reviews;

create policy public_select_visible_user_series_reviews
on public.user_series_reviews
for select
to public
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.series s
    where s.id::text = user_series_reviews.series_id
      and (
        s.author_id = auth.uid()
        or (
          user_series_reviews.is_public = true
          and s.publication_status = 'public'
        )
      )
  )
);

create policy authenticated_insert_visible_own_user_series_reviews
on public.user_series_reviews
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.series s
    where s.id::text = user_series_reviews.series_id
      and (
        s.author_id = auth.uid()
        or s.publication_status = 'public'
      )
  )
);

create policy authenticated_update_visible_own_user_series_reviews
on public.user_series_reviews
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.series s
    where s.id::text = user_series_reviews.series_id
      and (
        s.author_id = auth.uid()
        or s.publication_status = 'public'
      )
  )
);

create policy authenticated_delete_own_user_series_reviews
on public.user_series_reviews
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Series review likes
-- ---------------------------------------------------------------------------

drop policy if exists user_series_review_likes_select_all
  on public.user_series_review_likes;
drop policy if exists user_series_review_likes_insert_own
  on public.user_series_review_likes;
drop policy if exists user_series_review_likes_delete_own
  on public.user_series_review_likes;

create policy user_series_review_likes_select_visible
on public.user_series_review_likes
for select
to public
using (
  exists (
    select 1
    from public.user_series_reviews r
    join public.series s on s.id::text = r.series_id
    where r.id = user_series_review_likes.review_id
      and (
        r.user_id = auth.uid()
        or s.author_id = auth.uid()
        or (
          r.is_public = true
          and s.publication_status = 'public'
        )
      )
  )
);

create policy user_series_review_likes_insert_visible_own
on public.user_series_review_likes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.user_series_reviews r
    join public.series s on s.id::text = r.series_id
    where r.id = user_series_review_likes.review_id
      and (
        r.user_id = auth.uid()
        or s.author_id = auth.uid()
        or (
          r.is_public = true
          and s.publication_status = 'public'
        )
      )
  )
);

create policy user_series_review_likes_delete_own
on public.user_series_review_likes
for delete
to authenticated
using (user_id = auth.uid());

commit;
