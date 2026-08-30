-- Record the measured token cost of each uncached word explanation so the
-- feature can be evaluated from real Preview usage instead of estimates.

alter table public.private_library_word_explanations
  add column if not exists actual_cost_jpy numeric(12, 6);
