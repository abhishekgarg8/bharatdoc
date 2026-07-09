import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");
const config = readFileSync(resolve(repoRoot, "supabase/config.toml"), "utf8");
const confirmationTemplate = readFileSync(
  resolve(repoRoot, "supabase/templates/confirmation.html"),
  "utf8",
);

describe("Supabase auth confirmation email template", () => {
  it("uses BharatDoc branded copy and the app-owned token hash callback URL", () => {
    expect(config).toContain("[auth.email.template.confirmation]");
    expect(config).toContain('subject = "Confirm your BharatDoc account"');
    expect(config).toContain('"https://bharatdoc-web.vercel.app/auth/callback"');
    expect(config).toContain(
      'content_path = "./supabase/templates/confirmation.html"',
    );

    expect(confirmationTemplate).toContain("Welcome to BharatDoc");
    expect(confirmationTemplate).toContain("{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email");
    expect(confirmationTemplate).toContain("{{ .Email }}");
    expect(confirmationTemplate).not.toContain("{{ .ConfirmationURL }}");
    expect(confirmationTemplate).not.toMatch(
      /powered by Supabase|Supabase Auth|Confirm Your Signup/i,
    );
  });
});
