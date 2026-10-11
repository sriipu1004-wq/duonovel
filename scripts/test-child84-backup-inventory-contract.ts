import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Offline source guard. No credentials, backup requests or Production API calls.
const src = readFileSync("scripts/child84-backup-inventory-readonly.ps1", "utf8");
for (const required of [
  "https://api.supabase.com/v1/projects/$ProjectRef/database/backups",
  "$ProjectRef -cne 'nyxbnccuvmlzffgtdadi'",
  "SUPABASE_ACCESS_TOKEN",
  "'Process'",
  "Invoke-RestMethod -Method Get",
  "-MaximumRedirection 0",
  "LATEST_COMPLETED_BACKUP_UTC",
  "ToUniversalTime()",
  "BACKUP_INVENTORY=BLOCKED_NO_MANAGEMENT_TOKEN",
  "BACKUP_INVENTORY=NO_BACKUPS_READ_PERMISSION",
  "BACKUP_INVENTORY=UNEXPECTED_RESPONSE",
  "RESTORE_PROOF=NOT_PERFORMED",
]) assert.ok(src.includes(required), `Missing safe management backup listing condition: ${required}`);
assert.ok(!/Invoke-RestMethod\s+-Method\s+(?:Post|Put|Patch|Delete)/i.test(src),
  "Backup inventory must use GET only");
assert.ok(!/database\/backups\/restore|database\/backups\/restore-pitr|new[- ]project|\.WriteAllBytes|Set-Content|Out-File/i.test(
  src.replace(/^\s*#.*$/gm, "")),
  "Backup timestamp inventory must not restore, provision or write backup data");
assert.ok(!/Write-Output\s+\$token|Write-Host\s+\$token|echo\s+\$token/i.test(src),
  "Never print management credentials");
assert.ok(!src.includes("Read-Host"), "Do not collect PAT via an interactive log-visible prompt");
assert.ok(!src.includes("return $result"), "Do not expose unfiltered Management response");
console.log("PASS: management backup timestamp probe remains fixed-project read-only and credential-safe");
