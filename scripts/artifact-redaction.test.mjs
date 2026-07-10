import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createArtifactRedactor,
  assertPrivateArtifactRoot,
  privateArtifactPath,
  writePrivateArtifact,
} from "./artifact-redaction.mjs";

const redactor = createArtifactRedactor("test-correlation-key");
const uuid = "3fb9431c-3d99-4073-8f6a-3e97c412643d";

test("allows ignored or external roots and rejects other repository-local output", () => {
  const project = path.join(os.tmpdir(), "bharatdoc-project");
  const ignored = path.join(project, ".artifacts/private-e2e");
  assert.equal(assertPrivateArtifactRoot(project, ignored), ignored);
  assert.equal(
    assertPrivateArtifactRoot(project, path.join(ignored, "nested")),
    path.join(ignored, "nested"),
  );
  assert.equal(
    assertPrivateArtifactRoot(
      project,
      path.join(os.tmpdir(), "external-evidence"),
    ),
    path.join(os.tmpdir(), "external-evidence"),
  );
  assert.throws(() => assertPrivateArtifactRoot(project, project));
  assert.throws(() =>
    assertPrivateArtifactRoot(project, path.join(project, "testing")),
  );
});

test("redacts text deterministically while preserving correlation", () => {
  const input = `Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature\nDoctor: doctor+e2e@example.com\nPhone: +91 98765 43210\nRecording: ${uuid}\nPatient ID: 301748995\nTranscript: Patient reports fever and cough.`;
  const first = redactor.text(input);
  const second = redactor.text(input);

  assert.equal(first, second);
  for (const secret of [
    "eyJhbGci",
    "doctor+e2e@example.com",
    "98765",
    uuid,
    "301748995",
    "fever and cough",
  ]) {
    assert.doesNotMatch(
      first,
      new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    );
  }
  assert.match(
    first,
    /\[REDACTED:(?:TOKEN|EMAIL|PHONE|UUID|PATIENT_ID|CLINICAL):[a-f0-9]{12}\]/,
  );
});

test("redacts nested JSON by key and value without mutating input", () => {
  const input = {
    authorization: "Bearer top-secret-token",
    doctor: {
      id: uuid,
      email: "doctor@example.com",
      patient_id: 301748995,
      phone: 9876543210,
    },
    lookup: { "doctor+key@clinic.test": "safe value" },
    response: {
      transcript: "Patient reports chest pain",
      summary: "Possible angina",
      ok: true,
    },
    links: ["https://example.com/report?token=signed-value&download=1"],
  };
  const output = redactor.json(input);

  assert.notEqual(output, input);
  assert.equal(input.doctor.email, "doctor@example.com");
  assert.equal(output.response.ok, true);
  assert.match(output.authorization, /^\[REDACTED:TOKEN:/);
  assert.match(output.doctor.id, /^\[REDACTED:UUID:/);
  assert.match(output.doctor.email, /^\[REDACTED:EMAIL:/);
  assert.match(output.doctor.patient_id, /^\[REDACTED:ID:/);
  assert.match(output.doctor.phone, /^\[REDACTED:PHONE:/);
  assert.doesNotMatch(JSON.stringify(output), /doctor\+key@clinic\.test/);
  assert.match(output.response.transcript, /^\[REDACTED:CLINICAL:/);
  assert.doesNotMatch(output.links[0], /signed-value|download=1/);
});

test("strips URL credentials, contacts, fragments, query keys, and values", () => {
  const output = redactor.url(
    `https://user:pass@example.com/doctor@example.com/${uuid}?doctor@example.com=signed-value&patient=P-123#secret`,
  );
  assert.equal(output.includes("user:pass"), false);
  assert.equal(output.includes("#secret"), false);
  assert.equal(output.includes("signed-value"), false);
  assert.equal(output.includes("P-123"), false);
  assert.equal(output.includes("doctor@example.com"), false);
  assert.match(output, /\[REDACTED:EMAIL:[a-f0-9]{12}\]\/\[REDACTED:UUID:/);
  assert.match(
    output,
    /%5BREDACTED%3AEMAIL%3A[a-f0-9]{12}%5D=%5BREDACTED%3AQUERY%3A/,
  );
});

test("sanitizes screenshot filenames and metadata", () => {
  const filename = redactor.filename(
    `../doctor@example.com-${uuid}-P-E2E-42.png`,
  );
  const metadata = redactor.json({
    filename,
    screenshot_url: "https://example.com/a.png?token=secret",
    patient_id: "P-E2E-42",
  });
  assert.equal(path.basename(filename), filename);
  assert.doesNotMatch(filename, /doctor@example|3fb9431c|P-E2E-42/);
  assert.match(filename, /\.png$/);
  assert.doesNotMatch(JSON.stringify(metadata), /secret|P-E2E-42/);
});

test("writes redacted artifacts only beneath a private root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bharatdoc-artifacts-"));
  try {
    const target = await writePrivateArtifact({
      root,
      relativePath: "logs/doctor@example.com.json",
      value: {
        email: "doctor@example.com",
        transcript: "Sensitive consultation",
      },
      redactor,
    });
    assert.equal(target.startsWith(`${root}${path.sep}`), true);
    assert.doesNotMatch(target, /doctor@example/);
    assert.doesNotMatch(
      await readFile(target, "utf8"),
      /doctor@example|Sensitive consultation/,
    );
    assert.equal((await stat(path.dirname(target))).mode & 0o777, 0o700);
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    if (process.platform !== "win32") {
      await chmod(path.dirname(target), 0o755);
      await chmod(target, 0o644);
      await writePrivateArtifact({
        root,
        relativePath: "logs/doctor@example.com.json",
        value: "Transcript: still private",
        redactor,
      });
      assert.equal((await stat(path.dirname(target))).mode & 0o777, 0o700);
      assert.equal((await stat(target)).mode & 0o777, 0o600);
    }
    assert.throws(() =>
      privateArtifactPath(root, "../../escape.json", redactor),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
