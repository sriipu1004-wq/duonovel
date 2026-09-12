-- Harden function execution privileges for the translation-credit foundation.
--
-- Supabase projects may have explicit default EXECUTE grants on newly created
-- functions for anon/authenticated. Revoking from PostgreSQL PUBLIC alone is not
-- sufficient in that case. Keep read helpers authenticated-only and the atomic
-- mutation RPC service-role-only.

revoke all on function public.block_credit_ledger_mutation()
from public, anon, authenticated;

revoke all on function public.get_credit_balance()
from public, anon, authenticated;
grant execute on function public.get_credit_balance()
to authenticated;

revoke all on function public.has_public_episode_translation_unlock(uuid, text)
from public, anon, authenticated;
grant execute on function public.has_public_episode_translation_unlock(uuid, text)
to authenticated;

revoke all on function public.unlock_public_episode_translation(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.unlock_public_episode_translation(
  uuid, uuid, text, text, text
) to service_role;
