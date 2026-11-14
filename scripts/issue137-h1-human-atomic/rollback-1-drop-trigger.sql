-- Issue #137 H1 rollback, stage 1 of 2. Run BEFORE reverting the app.
-- Removes only the guard trigger: the new app keeps working through the RPC,
-- and the old app (direct writes) works again once it is redeployed.
begin;
drop trigger if exists issue137_h1_human_atomic_guard on public.recordings;
commit;
