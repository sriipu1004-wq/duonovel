// Decides which tool calls may skip the approval prompt (owner decision 2026-11-07).
// Conservative: anything not clearly safe returns null, and the normal prompt appears.

const READ_START = /^(select|with|explain|table|values)\b/;
const WRITE_WORDS = /\b(insert|update|delete|merge|upsert|drop|alter|truncate|create|grant|revoke|comment|copy|call|do|execute|prepare|deallocate|vacuum|analyze|cluster|reindex|refresh|lock|listen|notify|unlisten|set|reset|discard|into|security|begin|commit|rollback|savepoint|import|load)\b/;
const RISKY_FUNCS = /\b(pg_\w+|set_config|nextval|setval|currval|dblink\w*|lo_\w+|http\w*|query_to_xml\w*)\s*\(/;

// True only for a single read-only statement (SELECT / WITH / EXPLAIN without ANALYZE).
export function isReadOnlySql(sql) {
  if (typeof sql !== 'string') return false;
  const s = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "''")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, 'ident')
    .toLowerCase()
    .trim()
    .replace(/;\s*$/, '');
  if (!s || s.includes(';')) return false;
  if (!READ_START.test(s)) return false;
  if (/^explain\b[^(]*\banalyze\b/.test(s) || /^explain\s*\([^)]*analy[sz]e/.test(s)) return false;
  if (WRITE_WORDS.test(s) || RISKY_FUNCS.test(s)) return false;
  return true;
}

// Deploying main from GitHub: main is already reviewed and merged; other refs still ask.
export function isMainDeploy(input) {
  const g = input?.requestBody?.gitSource ?? input?.gitSource;
  return !!g && g.type === 'github' && g.repo === 'duonovel' && g.ref === 'main';
}

export function decide(event) {
  const name = event?.tool_name ?? '';
  const input = event?.tool_input ?? {};
  if (/__execute_sql$/.test(name) && isReadOnlySql(input.query)) return 'read-only SQL';
  if (/__create_deployment$/.test(name) && isMainDeploy(input)) return 'deploy of reviewed main';
  return null;
}
