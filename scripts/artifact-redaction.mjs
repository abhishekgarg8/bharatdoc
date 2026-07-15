import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const UUID_VALUE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATIENT_ID = /\bP(?:ATIENT)?[-_][A-Z0-9][A-Z0-9_-]{1,}\b/gi;
const PHONE = /(?<![\w])(?:\+?91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\w)/g;
const INTERNATIONAL_PHONE =
  /(?<![\w])\+?[1-9]\d{0,2}[ .-]?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}(?!\w)/g;
const JWT =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{4,})?\b/g;
const BEARER = /\bBearer\s+[^\s,"']+/gi;
const URL = /https?:\/\/[^\s<>"']+/gi;
const PATIENT_ID_LINE =
  /\b(patient(?:[_ ]?id)?|mrn|uhid)(\s*[:=]\s*)([A-Z0-9_-]+)/gi;
const CLINICAL_LINE =
  /\b(transcript|summary|clinical(?: note| text)?|doctor|patient)(\s*[:=]\s*)([^\n\r]+)/gi;
const TOKEN_KEYS =
  /(?:authorization|cookie|password|secret|token|api[_-]?key|session|jwt|code_verifier)/i;
const CONTACT_KEYS = /(?:email|phone|mobile|contact)/i;
const CLINICAL_KEYS =
  /(?:transcript|summary|clinical|diagnosis|symptom|prescription|treatment|patient_name)/i;
const ID_KEYS = /(?:^id$|_id$|uuid$|patient[_-]?id)/i;
const URL_KEYS = /(?:url|uri|href|link)/i;
const DEFAULT_CORRELATION_KEY =
  process.env.ARTIFACT_REDACTION_KEY || randomBytes(32).toString("hex");

export function createArtifactRedactor(
  correlationKey = DEFAULT_CORRELATION_KEY,
) {
  const placeholder = (kind, value) =>
    `[REDACTED:${kind}:${createHmac("sha256", correlationKey).update(String(value)).digest("hex").slice(0, 12)}]`;

  const redactUrl = (value) => {
    try {
      const input = new globalThis.URL(String(value));
      const redactUrlPart = (part) =>
        part
          .replace(EMAIL, (match) => placeholder("EMAIL", match.toLowerCase()))
          .replace(INTERNATIONAL_PHONE, (match) =>
            placeholder("PHONE", match.replace(/\D/g, "")),
          )
          .replace(PHONE, (match) =>
            placeholder("PHONE", match.replace(/\D/g, "")),
          )
          .replace(UUID, (match) => placeholder("UUID", match.toLowerCase()))
          .replace(PATIENT_ID, (match) =>
            placeholder("PATIENT_ID", match.toUpperCase()),
          )
          .replace(JWT, (match) => placeholder("TOKEN", match));
      const pathname = input.pathname.split("/").map(redactUrlPart).join("/");
      const query = new URLSearchParams();
      for (const [key, item] of input.searchParams)
        query.append(redactUrlPart(key), placeholder("QUERY", item));
      return `${input.protocol}//${input.host}${pathname}${query.size ? `?${query}` : ""}`;
    } catch {
      return placeholder("URL", value);
    }
  };

  const redactText = (value) =>
    String(value)
      .replace(URL, (match) => redactUrl(match))
      .replace(
        PATIENT_ID_LINE,
        (_match, label, separator, id) =>
          `${label}${separator}${placeholder("PATIENT_ID", id)}`,
      )
      .replace(
        CLINICAL_LINE,
        (_match, label, separator, clinical) =>
          `${label}${separator}${placeholder("CLINICAL", clinical)}`,
      )
      .replace(BEARER, (match) => placeholder("TOKEN", match))
      .replace(JWT, (match) => placeholder("TOKEN", match))
      .replace(EMAIL, (match) => placeholder("EMAIL", match.toLowerCase()))
      .replace(INTERNATIONAL_PHONE, (match) =>
        placeholder("PHONE", match.replace(/\D/g, "")),
      )
      .replace(PHONE, (match) => placeholder("PHONE", match.replace(/\D/g, "")))
      .replace(UUID, (match) => placeholder("UUID", match.toLowerCase()))
      .replace(PATIENT_ID, (match) =>
        placeholder("PATIENT_ID", match.toUpperCase()),
      );

  const redactJson = (value, key = "") => {
    if (value === null) return value;
    if (Array.isArray(value)) return value.map((item) => redactJson(item, key));
    if (typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([childKey, item]) => [
          [TOKEN_KEYS, CONTACT_KEYS, CLINICAL_KEYS, ID_KEYS, URL_KEYS].some(
            (pattern) => pattern.test(childKey),
          )
            ? childKey
            : redactText(childKey),
          redactJson(item, childKey),
        ]),
      );
    if (TOKEN_KEYS.test(key)) return placeholder("TOKEN", value);
    if (CONTACT_KEYS.test(key) && typeof value !== "boolean")
      return placeholder(
        key.toLowerCase().includes("phone") ||
          key.toLowerCase().includes("mobile")
          ? "PHONE"
          : "EMAIL",
        value,
      );
    if (CLINICAL_KEYS.test(key)) return placeholder("CLINICAL", value);
    if (ID_KEYS.test(key))
      return placeholder(UUID_VALUE.test(value) ? "UUID" : "ID", value);
    if (URL_KEYS.test(key) || /^https?:\/\//i.test(value))
      return redactUrl(value);
    if (typeof value === "boolean" || typeof value === "number") return value;
    return redactText(value);
  };

  const filename = (value) => {
    const base = path.basename(String(value));
    const extension = path
      .extname(base)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, "");
    const stem = base.slice(0, base.length - extension.length);
    const safe =
      redactText(stem)
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^\.+|_+$/g, "") || "artifact";
    return `${safe.slice(0, 160)}${extension}`;
  };

  return {
    filename,
    json: redactJson,
    placeholder,
    text: redactText,
    url: redactUrl,
  };
}

export function privateArtifactPath(
  root,
  relativePath,
  redactor = createArtifactRedactor(),
) {
  if (
    path.isAbsolute(relativePath) ||
    relativePath
      .split(/[\\/]+/)
      .some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Artifact path must be a safe relative path.");
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(
    resolvedRoot,
    ...relativePath.split(/[\\/]+/).map(redactor.filename),
  );
  if (!target.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error("Artifact path escaped its private root.");
  return target;
}

export function assertPrivateArtifactRoot(
  projectRoot,
  artifactRoot,
  ignoredRoot = path.join(projectRoot, ".artifacts/private-e2e"),
) {
  const project = path.resolve(projectRoot);
  const artifact = path.resolve(artifactRoot);
  const ignored = path.resolve(ignoredRoot);
  const isInProject =
    artifact === project || artifact.startsWith(`${project}${path.sep}`);
  if (
    isInProject &&
    artifact !== ignored &&
    !artifact.startsWith(`${ignored}${path.sep}`)
  ) {
    throw new Error(
      "Repository-local E2E artifacts must stay below ignored .artifacts/private-e2e/.",
    );
  }
  return artifact;
}

export async function writePrivateArtifact({
  root,
  relativePath,
  value,
  redactor = createArtifactRedactor(),
  binary = false,
}) {
  const target = privateArtifactPath(root, relativePath, redactor);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(target), 0o700);
  const content = binary
    ? value
    : typeof value === "string"
      ? redactor.text(value)
      : `${JSON.stringify(redactor.json(value), null, 2)}\n`;
  await writeFile(target, content, { mode: 0o600 });
  await chmod(target, 0o600);
  return target;
}
