// PreToolUse hook: skip the approval prompt for low-risk Supabase/Vercel calls (see sql-guard.mjs).
// Prints nothing for every other call, so the normal approval prompt appears.
import { readFileSync } from 'node:fs';
import { decide } from './sql-guard.mjs';

let event = {};
try {
  event = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}
const reason = decide(event);
if (reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: `auto-approved: ${reason}`,
    },
  }));
}
