import { validateAllManifests } from "./runtime";

const result = validateAllManifests();
console.log(`Public Domain manifests checked: ${result.checked}`);
for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
if (result.errors.length > 0) {
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("PASS: Public Domain manifests are structurally valid");
}
