-- This migration records the global daily AI-story generation reservation
-- already applied to the production database through Supabase SQL Editor.
-- It is idempotent and can safely be applied to another environment.

CREATE INDEX IF NOT EXISTS
  idx_time_fit_story_generation_logs_global_daily_counted_created_at
ON public.time_fit_story_generation_logs (created_at DESC)
WHERE is_counted = true;

CREATE OR REPLACE FUNCTION public.reserve_time_fit_story_generation(
  p_request_id uuid,
  p_user_id uuid,
  p_user_email_hash text,
  p_ip_hash text,
  p_user_agent_hash text,
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
BEGIN
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

  PERFORM pg_advisory_xact_lock(918273645::bigint);

  v_day_start :=
    date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo')
    AT TIME ZONE 'Asia/Tokyo';
  v_day_end := v_day_start + INTERVAL '1 day';

  SELECT
    COUNT(*)::bigint,
    COALESCE(
      SUM(
        COALESCE(
          log.cost_estimate_jpy,
          CEIL(
            (
              (
                COALESCE(
                  log.estimated_input_tokens,
                  p_estimated_input_tokens
                )::numeric
                * p_estimated_input_jpy_per_million_tokens
              )
              +
              (
                COALESCE(log.estimated_output_tokens, 0)::numeric
                * p_estimated_output_jpy_per_million_tokens
              )
            )
            / 1000000::numeric
            * 1000::numeric
          )
          / 1000::numeric
        )
      ),
      0::numeric
    )
  INTO
    v_generation_count,
    v_estimated_cost_jpy
  FROM public.time_fit_story_generation_logs AS log
  WHERE log.is_counted = true
    AND log.created_at >= v_day_start
    AND log.created_at < v_day_end;

  IF p_global_max_generations = 0
    OR v_generation_count + 1 > p_global_max_generations THEN
    RETURN QUERY
    SELECT
      false,
      'global_daily_generation_limit'::text,
      NULL::uuid;
    RETURN;
  END IF;

  IF p_global_max_estimated_cost_jpy = 0
    OR v_estimated_cost_jpy + p_cost_estimate_jpy
      > p_global_max_estimated_cost_jpy THEN
    RETURN QUERY
    SELECT
      false,
      'global_daily_cost_limit'::text,
      NULL::uuid;
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
    cost_estimate_jpy
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
    p_cost_estimate_jpy
  )
  RETURNING id INTO v_log_id;

  RETURN QUERY
  SELECT
    true,
    NULL::text,
    v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_time_fit_story_generation(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  integer,
  integer,
  numeric,
  integer,
  numeric,
  numeric,
  numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reserve_time_fit_story_generation(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  integer,
  integer,
  numeric,
  integer,
  numeric,
  numeric,
  numeric
) TO service_role;
