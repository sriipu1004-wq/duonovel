import { validateAllManifests } from "./runtime";

const result = validateAllManifests();
console.log(`Public Domain manifests checked: ${result.checked}`);
console.log(
  `Approved: ${result.approvedIds.length}, imported: ${result.importedIds.length}, pending: ${result.pendingIds.length}`
);
console.log(`Imported manifest IDs: ${result.importedIds.join(",")}`);
const approvedNotImported = result.approvedIds.filter(
  (id) => !result.importedIds.includes(id)
);
if (approvedNotImported.length > 0) {
  console.warn(`WARN: approved but not imported: ${approvedNotImported.join(", ")}`);
}
for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
if (result.errors.length > 0) {
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("PASS: Public Domain manifests are structurally valid");
}
