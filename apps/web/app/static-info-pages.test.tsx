import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpCenterPage from "@/app/help-center/page";
import TermsPrivacyPage from "@/app/terms-privacy/page";

describe("static information pages", () => {
  it("renders the help center with FAQs", () => {
    render(<HelpCenterPage />);

    expect(screen.getByRole("heading", { name: "Help Center" })).toBeInTheDocument();
    expect(screen.getByText("How do doctors join a hospital workspace?")).toBeInTheDocument();
    expect(screen.getByText("Can I edit the AI summary?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings");
  });

  it("renders terms and privacy policy content", () => {
    render(<TermsPrivacyPage />);

    expect(screen.getByRole("heading", { name: "Terms and Privacy" })).toBeInTheDocument();
    expect(screen.getByText("Clinical responsibility")).toBeInTheDocument();
    expect(screen.getByText("Information we process")).toBeInTheDocument();
    expect(screen.getByText("Data sharing")).toBeInTheDocument();
  });
});
