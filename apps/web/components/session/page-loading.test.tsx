import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageError } from "@/components/session/page-loading";

describe("PageError", () => {
  it("offers sign-in recovery when the message asks the user to sign in again", () => {
    render(<PageError message="Unable to load dashboard. Please sign in again." />);

    expect(screen.getByRole("link", { name: /sign in again/i })).toHaveAttribute("href", "/onboarding");
  });
});
