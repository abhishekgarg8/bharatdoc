import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  filesToScan,
  findArtifactViolations,
  usesFullIndexFallback,
} from "./scan-artifacts.mjs";

test("uses the index for staged checks and the full index when a CI base is unavailable", () => {
  const calls = [];
  const run = (args) => (calls.push(args), [args.join(" ")]);
  filesToScan([], run);
  filesToScan(["--base", ""], run);
  filesToScan(["--base", "000000"], run);
  filesToScan(["--base", "abc123"], run);
  assert.deepEqual(calls, [
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    ["ls-files", "-z"],
    ["ls-files", "-z"],
    ["diff", "--name-only", "--diff-filter=ACMR", "-z", "abc123...HEAD"],
  ]);
  assert.equal(usesFullIndexFallback(["--base", ""]), true);
  assert.equal(usesFullIndexFallback(["--base", "abc123"]), false);
});

test("rejects raw runs, production media, and sensitive tracked text", async () => {
  const files = new Map([
    ["test/runs/20260710/log.json", "{}"],
    ["test/production-e2e-results.md", "scrubbed-looking but prohibited"],
    ["output/playwright/run/trace.zip", Buffer.from([0])],
    ["testing/issue-76-production/raw.webm", Buffer.from([0])],
    [
      "docs/new.md",
      "token=secret doctor@realclinic.in 3fb9431c-3d99-4073-8f6a-3e97c412643d",
    ],
    ["test/fixtures/synthetic.png", Buffer.from([0])],
  ]);
  const violations = await findArtifactViolations(
    [...files.keys()],
    async (file) => files.get(file),
  );
  assert.equal(
    violations.some(({ file }) => file.startsWith("test/runs/")),
    true,
  );
  assert.equal(
    violations.some(({ file }) => file.startsWith("test/production-")),
    true,
  );
  assert.equal(
    violations.some(({ file }) => file.startsWith("output/playwright/")),
    true,
  );
  assert.equal(
    violations.some(({ file }) => file.endsWith("raw.webm")),
    true,
  );
  assert.equal(
    violations.some(({ file }) => file === "docs/new.md"),
    true,
  );
  assert.equal(
    violations.some(({ file }) => file === "test/fixtures/synthetic.png"),
    false,
  );
});

test("workflow uses least privilege and short-lived private artifacts", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/private-e2e-artifacts.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /REPOSITORY_VISIBILITY.*\n\s*run: test .* = private/);
  assert.match(
    workflow,
    /ARTIFACT_REDACTION_KEY:.*secrets\.ARTIFACT_REDACTION_KEY/,
  );
  assert.match(
    workflow,
    /concurrency:\s*\n\s*group: production-e2e\s*\n\s*cancel-in-progress: false/,
  );
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(workflow, /scripts\/scan-artifacts\.mjs/);
  assert.doesNotMatch(workflow, /pull_request_target/);
});

test("private output paths and raw artifact directories are ignored", async () => {
  const gitignore = await readFile(
    new URL("../.gitignore", import.meta.url),
    "utf8",
  );
  assert.match(gitignore, /^\.artifacts\/private-e2e\/$/m);
  assert.match(gitignore, /^test\/runs\/$/m);
  assert.match(gitignore, /^test\/screenshots\/$/m);
});
