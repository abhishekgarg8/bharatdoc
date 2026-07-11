import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbiddenPath = /^(?:\.playwright-(?:cli|mcp)\/|testing\/|test\/(?:runs|screenshots)\/|test\/production-.*\.md$|output\/(?:playwright\/|p1-demo-gate-.*\.png$)|apps\/web\/(?:test-results|playwright-report)\/)|^(?:prod-|production-|auth-redirect-|local-.*-supabase-auth).*\.(?:png|webm|pdf|log)$/i;
const binaryEvidence = /\.(?:webm|mp3|m4a|wav|aiff)$/i;
const violations = tracked.filter((path) => forbiddenPath.test(path) || (path.startsWith("test/") && binaryEvidence.test(path)));
const secretPattern = /(?:token_hash=(?!\{\{)[A-Za-z0-9_-]{20,}|X-Amz-Signature=[A-Fa-f0-9]{32,}|[?&]token=eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;
for (const path of tracked.filter((item) => /\.(?:json|log|md|txt)$/i.test(item))) {
  try {
    if (secretPattern.test(readFileSync(path, "utf8"))) violations.push(`${path} (credential-bearing content)`);
  } catch { /* unreadable files are checked by the repository host */ }
}
if (violations.length) {
  console.error(`Tracked clinical/test evidence is forbidden:\n${[...new Set(violations)].join("\n")}`);
  process.exit(1);
}
console.log("PHI artifact policy passed.");
