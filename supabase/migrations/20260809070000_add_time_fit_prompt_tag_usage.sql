BEGIN;

CREATE TABLE IF NOT EXISTS public.time_fit_story_prompt_tag_usage (
  tag text PRIMARY KEY,
  use_count bigint NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_fit_story_prompt_tag_usage_tag_length
    CHECK (char_length(btrim(tag)) BETWEEN 1 AND 30)
);

ALTER TABLE public.time_fit_story_prompt_tag_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.time_fit_story_prompt_tag_usage
  FROM PUBLIC, anon, authenticated;

INSERT INTO public.time_fit_story_prompt_tag_usage (tag, use_count)
VALUES
  ('暗め', 0),
  ('女学生', 0),
  ('教室', 0),
  ('雨の夜', 0),
  ('不穏', 0),
  ('男子学生', 0),
  ('放課後', 0),
  ('無人駅', 0),
  ('切ない', 0),
  ('優しい', 0),
  ('大学生', 0),
  ('社会人', 0),
  ('幼なじみ', 0),
  ('人外', 0),
  ('子ども', 0),
  ('老人', 0),
  ('学校', 0),
  ('海辺', 0),
  ('古い洋館', 0),
  ('近未来都市', 0),
  ('異世界', 0),
  ('宇宙船', 0),
  ('幻想的', 0),
  ('緊張感', 0),
  ('明るめ', 0),
  ('コメディ調', 0),
  ('会話多め', 0),
  ('一人称', 0),
  ('どんでん返し', 0),
  ('恋愛要素', 0),
  ('怪異', 0),
  ('ハッピーエンド', 0),
  ('救いのある結末', 0),
  ('バッドエンド', 0),
  ('謎を残す', 0)
ON CONFLICT (tag) DO NOTHING;

CREATE OR REPLACE FUNCTION public.increment_time_fit_story_prompt_tag_usage(
  p_tags text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.time_fit_story_prompt_tag_usage (
    tag,
    use_count,
    created_at,
    updated_at
  )
  SELECT DISTINCT
    btrim(candidate.tag),
    1,
    now(),
    now()
  FROM unnest(COALESCE(p_tags, ARRAY[]::text[])) AS candidate(tag)
  WHERE char_length(btrim(candidate.tag)) BETWEEN 1 AND 30
  ON CONFLICT (tag) DO UPDATE
  SET
    use_count =
      public.time_fit_story_prompt_tag_usage.use_count + 1,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_time_fit_story_prompt_tag_usage(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION public.increment_time_fit_story_prompt_tag_usage(text[])
  TO service_role;

COMMIT;
