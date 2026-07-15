import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PROHIBITED_PATH = [
  /^test\/(?:runs|screenshots)\//,
  /^test\/production-/,
  /^test\/\.browser-/,
  /^\.artifacts\//,
  /^output\/playwright\//,
  /^testing\/.*(?:production|real-account|prod)/i,
];
const BINARY = /\.(?:aiff|avi|gif|jpeg|jpg|m4a|mov|mp3|mp4|pdf|png|wav|webm)$/i;
const SAFE_FIXTURE =
  /(?:^|\/)(?:__fixtures__|fixtures|[^/]+\.test\.[cm]?[jt]s)/;
const SENSITIVE = [
  /\bBearer\s+(?!\$\{)[A-Za-z0-9._~-]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /https?:\/\/[^\s<>"']+[?&](?:access_token|refresh_token|sig|signature|token)=/i,
  /\b(?:access[_-]?token|refresh[_-]?token|password|secret|api[_-]?key|authorization|cookie)\s*[:=]\s*["'](?!\$\{|<)[^"']{8,}["']/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b(?:transcript|clinical summary)\s*[:=]\s*\S+/i,
];
const CONTACT = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

export async function findArtifactViolations(
  files,
  loader = readFile,
  { scanContent = true } = {},
) {
  const violations = [];
  for (const file of files.filter(Boolean)) {
    if (PROHIBITED_PATH.some((pattern) => pattern.test(file))) {
      violations.push({ file, reason: "prohibited raw artifact path" });
      continue;
    }
    if (!scanContent || BINARY.test(file) || SAFE_FIXTURE.test(file)) continue;
    let content;
    try {
      content = String(await loader(file));
    } catch {
      continue;
    }
    const unsafeContact = [...content.matchAll(CONTACT)].some(
      (match) => !/^(?:example\.(?:com|org|net)|invalid|test)$/i.test(match[1]),
    );
    if (unsafeContact || SENSITIVE.some((pattern) => pattern.test(content)))
      violations.push({
        file,
        reason: "unredacted sensitive artifact content",
      });
  }
  return violations;
}

function gitFiles(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

export function filesToScan(args, run = gitFiles) {
  const baseIndex = args.indexOf("--base");
  if (
    args.includes("--all") ||
    (baseIndex >= 0 &&
      (!args[baseIndex + 1] || /^0+$/.test(args[baseIndex + 1])))
  )
    return run(["ls-files", "-z"]);
  if (baseIndex >= 0)
    return run([
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "-z",
      `${args[baseIndex + 1]}...HEAD`,
    ]);
  return run(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]);
}

export function usesFullIndexFallback(args) {
  const baseIndex = args.indexOf("--base");
  return (
    args.includes("--all") ||
    (baseIndex >= 0 &&
      (!args[baseIndex + 1] || /^0+$/.test(args[baseIndex + 1])))
  );
}

async function main() {
  const args = process.argv.slice(2);
  const files = filesToScan(args);
  const fullIndexFallback = usesFullIndexFallback(args);
  const violations = await findArtifactViolations(files, readFile, {
    scanContent: !fullIndexFallback,
  });
  if (!violations.length)
    return console.log(
      `Artifact policy passed (${files.length} tracked file${files.length === 1 ? "" : "s"} scanned${fullIndexFallback ? "; full-index path gate" : ""}).`,
    );
  console.error(
    violations.map(({ file, reason }) => `${file}: ${reason}`).join("\n"),
  );
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
