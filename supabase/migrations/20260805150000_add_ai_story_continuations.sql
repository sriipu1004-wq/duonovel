-- AI-generated story continuations.
-- The reservation RPC prevents duplicate OpenAI calls per series, while the
-- completion RPC appends the draft episode and converts short -> long in one
-- database transaction.

ALTER TABLE public.time_fit_story_generation_logs
  ADD COLUMN IF NOT EXISTS generation_type text NOT NULL DEFAULT 'new_story',
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_episode_id uuid REFERENCES public.episodes(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'time_fit_story_generation_logs_generation_type_check'
      AND conrelid = 'public.time_fit_story_generation_logs'::regclass
  ) THEN
    ALTER TABLE public.time_fit_story_generation_logs
      ADD CONSTRAINT time_fit_story_generation_logs_generation_type_check
      CHECK (generation_type IN ('new_story', 'continuation'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS
  idx_time_fit_story_generation_logs_generation_type_created_at
ON public.time_fit_story_generation_logs (generation_type, created_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_time_fit_story_generation_logs_continuation_series
ON public.time_fit_story_generation_logs (series_id, created_at DESC)
WHERE generation_type = 'continuation';

-- This also protects episode numbering if another server instance reaches the
-- insert at the same time. Existing duplicate episode numbers must be resolved
-- before applying this migration.
CREATE UNIQUE INDEX IF NOT EXISTS
  uq_episodes_series_id_episode_number
ON public.episodes (series_id, episode_number);

CREATE TABLE IF NOT EXISTS public.time_fit_story_continuation_reservations (
  series_id uuid PRIMARY KEY REFERENCES public.series(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  source_episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  log_id uuid REFERENCES public.time_fit_story_generation_logs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

ALTER TABLE public.time_fit_story_continuation_reservations
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.time_fit_story_continuation_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.time_fit_story_continuation_reservations FROM anon;
REVOKE ALL ON TABLE public.time_fit_story_continuation_reservations FROM authenticated;
GRANT ALL ON TABLE public.time_fit_story_continuation_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_time_fit_story_continuation(
  p_request_id uuid,
  p_user_id uuid,
  p_user_email_hash text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_series_id uuid,
  p_source_episode_id uuid,
  p_requested_minutes integer,
  p_scene text,
  p_genre text,
  p_mood text,
  p_model text,
  p_estimated_input_tokens integer,
  p_estimated_output_tokens integer,
  p_cost_estimate_jpy numeric,
  p_global_max_generations integer,
  p_global_max_estimated_cost_jpy numeric,
  p_estimated_input_jpy_per_million_tokens numeric,
  p_estimated_output_jpy_per_million_tokens numeric
)
RETURNS TABLE (
  allowed boolean,
  limit_type text,
  log_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_generation_count bigint;
  v_estimated_cost_jpy numeric;
  v_log_id uuid;
  v_reservation_request_id uuid;
  v_latest_episode_id uuid;
  v_series_author_id uuid;
  v_series_effect_settings jsonb;
BEGIN
  IF p_user_id IS NULL OR p_series_id IS NULL OR p_source_episode_id IS NULL THEN
    RAISE EXCEPTION 'Continuation authentication and source are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_requested_minutes NOT IN (5, 10, 15, 20) THEN
    RAISE EXCEPTION 'Invalid requested_minutes: %', p_requested_minutes
      USING ERRCODE = '22023';
  END IF;

  IF p_global_max_generations < 0
    OR p_global_max_estimated_cost_jpy < 0
    OR p_estimated_input_tokens <= 0
    OR p_estimated_output_tokens <= 0
    OR p_cost_estimate_jpy < 0
    OR p_estimated_input_jpy_per_million_tokens <= 0
    OR p_estimated_output_jpy_per_million_tokens <= 0 THEN
    RAISE EXCEPTION 'Invalid global generation budget configuration'
      USING ERRCODE = '22023';
  END IF;

  -- Same global lock as reserve_time_fit_story_generation.
  PERFORM pg_advisory_xact_lock(918273645::bigint);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_series_id::text, 7331));

  SELECT s.author_id, s.effect_settings
  INTO v_series_author_id, v_series_effect_settings
  FROM public.series AS s
  WHERE s.id = p_series_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'series_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_series_author_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_series_effect_settings ->> 'source', '') <> 'time_fit_ai_story'
    AND lower(COALESCE(v_series_effect_settings ->> 'aiGenerated', 'false')) <> 'true' THEN
    RAISE EXCEPTION 'not_ai_generated_story' USING ERRCODE = '22023';
  END IF;

  SELECT e.id
  INTO v_latest_episode_id
  FROM public.episodes AS e
  WHERE e.series_id = p_series_id
  ORDER BY e.episode_number DESC, e.id DESC
  LIMIT 1;

  IF v_latest_episode_id IS NULL THEN
    RAISE EXCEPTION 'episode_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_latest_episode_id IS DISTINCT FROM p_source_episode_id THEN
    RETURN QUERY
    SELECT false, 'source_episode_changed'::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.time_fit_story_generation_logs AS log
  SET
    status = 'failed',
    success = false,
    error_code = 'continuation_reservation_expired',
    error_message = '続編生成の予約が期限切れになりました。',
    updated_at = now()
  FROM public.time_fit_story_continuation_reservations AS reservation
  WHERE reservation.series_id = p_series_id
    AND reservation.expires_at <= now()
    AND log.id = reservation.log_id
    AND log.status = 'started';

  DELETE FROM public.time_fit_story_continuation_reservations
  WHERE series_id = p_series_id
    AND expires_at <= now();

  INSERT INTO public.time_fit_story_continuation_reservations (
    series_id,
    request_id,
    user_id,
    source_episode_id,
    expires_at
  )
  VALUES (
    p_series_id,
    p_request_id,
    p_user_id,
    p_source_episode_id,
    now() + interval '30 minutes'
  )
  ON CONFLICT (series_id) DO NOTHING
  RETURNING request_id INTO v_reservation_request_id;

  IF v_reservation_request_id IS NULL THEN
    RETURN QUERY
    SELECT false, 'continuation_already_in_progress'::text, NULL::uuid;
    RETURN;
  END IF;

  v_day_start :=
    date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo')
    AT TIME ZONE 'Asia/Tokyo';
  v_day_end := v_day_start + interval '1 day';

  SELECT
    COUNT(*)::bigint,
    COALESCE(
      SUM(
        COALESCE(
          log.cost_estimate_jpy,
          CEIL(
            (
              COALESCE(log.estimated_input_tokens, p_estimated_input_tokens)::numeric
                * p_estimated_input_jpy_per_million_tokens
              + COALESCE(log.estimated_output_tokens, 0)::numeric
                * p_estimated_output_jpy_per_million_tokens
            )
            / 1000000::numeric
            * 1000::numeric
          ) / 1000::numeric
        )
      ),
      0::numeric
    )
  INTO v_generation_count, v_estimated_cost_jpy
  FROM public.time_fit_story_generation_logs AS log
  WHERE log.is_counted = true
    AND log.created_at >= v_day_start
    AND log.created_at < v_day_end;

  IF p_global_max_generations = 0
    OR v_generation_count + 1 > p_global_max_generations THEN
    DELETE FROM public.time_fit_story_continuation_reservations
    WHERE series_id = p_series_id AND request_id = p_request_id;

    RETURN QUERY
    SELECT false, 'global_daily_generation_limit'::text, NULL::uuid;
    RETURN;
  END IF;

  IF p_global_max_estimated_cost_jpy = 0
    OR v_estimated_cost_jpy + p_cost_estimate_jpy
      > p_global_max_estimated_cost_jpy THEN
    DELETE FROM public.time_fit_story_continuation_reservations
    WHERE series_id = p_series_id AND request_id = p_request_id;

    RETURN QUERY
    SELECT false, 'global_daily_cost_limit'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.time_fit_story_generation_logs (
    request_id,
    user_id,
    user_email_hash,
    ip_hash,
    user_agent_hash,
    requested_minutes,
    scene,
    genre,
    mood,
    model,
    status,
    success,
    is_counted,
    estimated_input_tokens,
    estimated_output_tokens,
    cost_estimate_jpy,
    generation_type,
    series_id,
    source_episode_id
  )
  VALUES (
    p_request_id,
    p_user_id,
    p_user_email_hash,
    p_ip_hash,
    p_user_agent_hash,
    p_requested_minutes,
    p_scene,
    p_genre,
    p_mood,
    p_model,
    'started',
    NULL,
    true,
    p_estimated_input_tokens,
    p_estimated_output_tokens,
    p_cost_estimate_jpy,
    'continuation',
    p_series_id,
    p_source_episode_id
  )
  RETURNING id INTO v_log_id;

  UPDATE public.time_fit_story_continuation_reservations
  SET log_id = v_log_id
  WHERE series_id = p_series_id AND request_id = p_request_id;

  RETURN QUERY
  SELECT true, NULL::text, v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_time_fit_story_continuation(
  p_request_id uuid,
  p_user_id uuid,
  p_series_id uuid,
  p_source_episode_id uuid,
  p_episode_title text,
  p_body text,
  p_continuity_summary text
)
RETURNS TABLE (
  episode_id uuid,
  episode_number integer,
  converted_to_long_form boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_series_author_id uuid;
  v_series_effect_settings jsonb;
  v_latest_episode_id uuid;
  v_next_episode_number integer;
  v_episode_id uuid;
  v_converted boolean;
  v_next_effect_settings jsonb;
BEGIN
  IF btrim(COALESCE(p_episode_title, '')) = ''
    OR btrim(COALESCE(p_body, '')) = ''
    OR btrim(COALESCE(p_continuity_summary, '')) = ''
    OR length(p_continuity_summary) > 3000 THEN
    RAISE EXCEPTION 'Invalid continuation output' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_series_id::text, 7331));

  SELECT reservation.log_id
  INTO v_log_id
  FROM public.time_fit_story_continuation_reservations AS reservation
  WHERE reservation.series_id = p_series_id
    AND reservation.request_id = p_request_id
    AND reservation.user_id = p_user_id
    AND reservation.source_episode_id = p_source_episode_id
    AND reservation.expires_at > now()
  FOR UPDATE;

  IF v_log_id IS NULL THEN
    RAISE EXCEPTION 'continuation_reservation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.author_id, s.effect_settings
  INTO v_series_author_id, v_series_effect_settings
  FROM public.series AS s
  WHERE s.id = p_series_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'series_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_series_author_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_series_effect_settings ->> 'source', '') <> 'time_fit_ai_story'
    AND lower(COALESCE(v_series_effect_settings ->> 'aiGenerated', 'false')) <> 'true' THEN
    RAISE EXCEPTION 'not_ai_generated_story' USING ERRCODE = '22023';
  END IF;

  SELECT e.id
  INTO v_latest_episode_id
  FROM public.episodes AS e
  WHERE e.series_id = p_series_id
  ORDER BY e.episode_number DESC, e.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_latest_episode_id IS DISTINCT FROM p_source_episode_id THEN
    RAISE EXCEPTION 'source_episode_changed' USING ERRCODE = '40001';
  END IF;

  SELECT COALESCE(MAX(e.episode_number), 0) + 1
  INTO v_next_episode_number
  FROM public.episodes AS e
  WHERE e.series_id = p_series_id;

  INSERT INTO public.episodes (
    series_id,
    episode_number,
    title,
    body,
    is_published,
    posting_status,
    scheduled_for,
    posted_at,
    last_edited_at
  )
  VALUES (
    p_series_id,
    v_next_episode_number,
    btrim(p_episode_title),
    btrim(p_body),
    false,
    'draft',
    NULL,
    NULL,
    now()
  )
  RETURNING id INTO v_episode_id;

  v_converted := COALESCE(v_series_effect_settings ->> 'storyFormat', 'long') = 'short';
  v_next_effect_settings := jsonb_set(
    jsonb_set(
      COALESCE(v_series_effect_settings, '{}'::jsonb),
      '{storyFormat}',
      '"long"'::jsonb,
      true
    ),
    '{aiContinuation}',
    jsonb_build_object(
      'version', 1,
      'summary', btrim(p_continuity_summary),
      'lastEpisodeNumber', v_next_episode_number,
      'updatedAt', now()
    ),
    true
  );

  UPDATE public.series
  SET effect_settings = v_next_effect_settings
  WHERE id = p_series_id;

  UPDATE public.time_fit_story_generation_logs
  SET
    status = 'success',
    success = true,
    response_title = btrim(p_episode_title),
    updated_at = now()
  WHERE id = v_log_id;

  DELETE FROM public.time_fit_story_continuation_reservations
  WHERE series_id = p_series_id AND request_id = p_request_id;

  RETURN QUERY
  SELECT v_episode_id, v_next_episode_number, v_converted;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_time_fit_story_continuation(
  p_request_id uuid,
  p_series_id uuid,
  p_error_code text,
  p_error_message text,
  p_is_counted boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_series_id::text, 7331));

  UPDATE public.time_fit_story_generation_logs
  SET
    status = 'failed',
    success = false,
    is_counted = p_is_counted,
    error_code = left(COALESCE(p_error_code, 'continuation_generation_failed'), 120),
    error_message = left(COALESCE(p_error_message, '続編生成に失敗しました。'), 1000),
    updated_at = now()
  WHERE request_id = p_request_id
    AND series_id = p_series_id
    AND generation_type = 'continuation';

  DELETE FROM public.time_fit_story_continuation_reservations
  WHERE series_id = p_series_id AND request_id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_time_fit_story_continuation(
  uuid, uuid, text, text, text, uuid, uuid, integer, text, text, text,
  text, integer, integer, numeric, integer, numeric, numeric, numeric
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_time_fit_story_continuation(
  uuid, uuid, text, text, text, uuid, uuid, integer, text, text, text,
  text, integer, integer, numeric, integer, numeric, numeric, numeric
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_time_fit_story_continuation(
  uuid, uuid, uuid, uuid, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_time_fit_story_continuation(
  uuid, uuid, uuid, uuid, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.fail_time_fit_story_continuation(
  uuid, uuid, text, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_time_fit_story_continuation(
  uuid, uuid, text, text, boolean
) TO service_role;
