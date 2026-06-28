import { describe, expect, it } from "vitest";
import { shouldOpenExternally } from "@/components/native-shell-bridge";

describe("shouldOpenExternally", () => {
  it("keeps relative and same-origin links inside the shell", () => {
    expect(shouldOpenExternally("/dashboard", "https://bharatdoc-web.vercel.app")).toBe(false);
    expect(shouldOpenExternally("https://bharatdoc-web.vercel.app/search", "https://bharatdoc-web.vercel.app")).toBe(
      false
    );
  });

  it("opens external http links outside the shell", () => {
    expect(shouldOpenExternally("https://jtezgoegatwbvdqeogiy.supabase.co/storage/v1/object/sign/file.pdf")).toBe(true);
  });

  it("ignores non-http links", () => {
    expect(shouldOpenExternally("mailto:clinic@example.com")).toBe(false);
    expect(shouldOpenExternally("tel:+919999999999")).toBe(false);
  });
});
