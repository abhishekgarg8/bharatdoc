import { describe, expect, it } from "vitest";
import { extractEnvObjectValue, parseServiceAccountJson } from "./service-account.js";

describe("service account env parsing", () => {
  it("parses single-line service account json", () => {
    expect(parseServiceAccountJson('{"project_id":"bharatdoc","client_email":"owner@bharatdoc.test"}')).toMatchObject({
      project_id: "bharatdoc",
      client_email: "owner@bharatdoc.test"
    });
  });

  it("extracts multiline service account json from dotenv content", () => {
    const envFile = `
FIREBASE_ADMIN_SDK_JSON = {
  "project_id": "bharatdoc",
  "client_email": "owner@bharatdoc.test",
  "private_key": "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"
}
`.trim();

    expect(extractEnvObjectValue(envFile, "FIREBASE_ADMIN_SDK_JSON")).toContain('"client_email": "owner@bharatdoc.test"');
    expect(parseServiceAccountJson('{"project_id":"bharatdoc",', envFile)).toMatchObject({
      project_id: "bharatdoc",
      client_email: "owner@bharatdoc.test"
    });
  });

  it("throws when the env content does not contain a valid service account object", () => {
    expect(() => parseServiceAccountJson("not json", "FIREBASE_ADMIN_SDK_JSON=oops")).toThrow();
  });
});
