-- Stripe-backed monthly subscriptions for LIB read.
-- Billing records and entitlement writes are service-role only. The application
-- continues to read feature access from libread_user_entitlements so the payment
-- provider remains isolated from the rest of the product.

create table if not exists public.libread_billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.libread_billing_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_libread_billing_subscriptions_customer
  on public.libread_billing_subscriptions (stripe_customer_id);

create table if not exists public.libread_stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.libread_billing_customers enable row level security;
alter table public.libread_billing_subscriptions enable row level security;
alter table public.libread_stripe_webhook_events enable row level security;

revoke all on table public.libread_billing_customers from public, anon, authenticated;
revoke all on table public.libread_billing_subscriptions from public, anon, authenticated;
revoke all on table public.libread_stripe_webhook_events from public, anon, authenticated;
grant all on table public.libread_billing_customers to service_role;
grant all on table public.libread_billing_subscriptions to service_role;
grant all on table public.libread_stripe_webhook_events to service_role;

-- Paid accounts receive higher or unlimited daily action limits, but a
-- calendar-month cost reservation keeps the 500 JPY plan viable even for
-- unusually heavy use.
-- Failed OpenAI calls release both the daily action and this reservation.
create table if not exists public.libread_subscriber_monthly_ai_reservations (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null
    check (action_type in ('story_generation', 'translation_generation', 'word_explanation')),
  reserved_cost_jpy numeric(12, 4) not null
    check (reserved_cost_jpy > 0),
  is_counted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_libread_subscriber_monthly_ai_user
  on public.libread_subscriber_monthly_ai_reservations
    (user_id, created_at desc)
  where is_counted = true;

alter table public.libread_subscriber_monthly_ai_reservations
  enable row level security;
revoke all on table public.libread_subscriber_monthly_ai_reservations
  from public, anon, authenticated;
grant all on table public.libread_subscriber_monthly_ai_reservations
  to service_role;

create or replace function public.reserve_libread_subscriber_monthly_ai_budget(
  p_request_id uuid,
  p_user_id uuid,
  p_action_type text,
  p_reserved_cost_jpy numeric,
  p_monthly_limit_jpy numeric
)
returns table (
  allowed boolean,
  used_cost_jpy numeric,
  limit_cost_jpy numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_used numeric := 0;
  v_is_subscriber boolean := false;
begin
  if p_request_id is null
    or p_user_id is null
    or p_action_type not in ('story_generation', 'translation_generation', 'word_explanation')
    or p_reserved_cost_jpy <= 0
    or p_monthly_limit_jpy <= 0 then
    raise exception 'Invalid subscriber budget reservation'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.libread_user_entitlements as entitlement
    where entitlement.user_id = p_user_id
      and entitlement.plan_type = 'subscriber'
      and (
        entitlement.subscriber_until is null
        or entitlement.subscriber_until > now()
      )
  ) into v_is_subscriber;

  if not v_is_subscriber then
    return query select true, 0::numeric, p_monthly_limit_jpy;
    return;
  end if;

  v_month_start := date_trunc(
    'month', now() at time zone 'Asia/Tokyo'
  ) at time zone 'Asia/Tokyo';
  v_month_end := v_month_start + interval '1 month';

  perform pg_advisory_xact_lock(
    hashtextextended('libread-subscriber-budget:' || p_user_id::text, 0)
  );

  select coalesce(sum(reservation.reserved_cost_jpy), 0)
  into v_used
  from public.libread_subscriber_monthly_ai_reservations as reservation
  where reservation.user_id = p_user_id
    and reservation.is_counted = true
    and reservation.created_at >= v_month_start
    and reservation.created_at < v_month_end;

  if exists (
    select 1
    from public.libread_subscriber_monthly_ai_reservations
    where request_id = p_request_id and is_counted = true
  ) then
    return query select true, v_used, p_monthly_limit_jpy;
    return;
  end if;

  if v_used + p_reserved_cost_jpy > p_monthly_limit_jpy then
    return query select false, v_used, p_monthly_limit_jpy;
    return;
  end if;

  insert into public.libread_subscriber_monthly_ai_reservations (
    request_id,
    user_id,
    action_type,
    reserved_cost_jpy
  ) values (
    p_request_id,
    p_user_id,
    p_action_type,
    p_reserved_cost_jpy
  );

  return query select true, v_used + p_reserved_cost_jpy, p_monthly_limit_jpy;
end;
$$;

create or replace function public.release_libread_subscriber_monthly_ai_budget(
  p_request_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.libread_subscriber_monthly_ai_reservations
  set is_counted = false, updated_at = now()
  where request_id = p_request_id and is_counted = true;
$$;

revoke all on function public.reserve_libread_subscriber_monthly_ai_budget(
  uuid, uuid, text, numeric, numeric
) from public;
revoke all on function public.release_libread_subscriber_monthly_ai_budget(uuid)
  from public;
grant execute on function public.reserve_libread_subscriber_monthly_ai_budget(
  uuid, uuid, text, numeric, numeric
) to service_role;
grant execute on function public.release_libread_subscriber_monthly_ai_budget(uuid)
  to service_role;

-- The shared word cache uses a text content identifier because it serves three
-- reader types. Restore cascade semantics explicitly for private chapters so a
-- work/account deletion cannot leave uploaded-text fragments behind.
create or replace function public.delete_private_library_word_cache_for_chapter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.bilingual_word_explanations
  where content_type = 'private_library'
    and content_id = old.id::text;
  return old;
end;
$$;

drop trigger if exists trg_delete_private_library_word_cache
  on public.private_library_chapters;
create trigger trg_delete_private_library_word_cache
after delete on public.private_library_chapters
for each row execute function public.delete_private_library_word_cache_for_chapter();

revoke all on function public.delete_private_library_word_cache_for_chapter()
  from public, anon, authenticated;
