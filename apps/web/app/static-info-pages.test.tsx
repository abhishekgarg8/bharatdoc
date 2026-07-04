import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FaqPage from "@/app/faqs/page";
import HelpCenterPage from "@/app/help-center/page";
import TermsPrivacyPage from "@/app/terms-privacy/page";

describe("static information pages", () => {
  it("renders doctor-focused public FAQs with careful pricing and clinical guidance", () => {
    render(<FaqPage />);

    expect(screen.getByRole("heading", { name: "FAQs for doctors" })).toBeInTheDocument();
    expect(screen.getByText("Is BharatDoc currently free?")).toBeInTheDocument();
    expect(screen.getByText(/currently free to use while we are in our early access/i)).toBeInTheDocument();
    expect(screen.getByText(/expect to introduce paid plans soon/i)).toBeInTheDocument();
    expect(screen.getByText("Is patient data safe and private?")).toBeInTheDocument();
    expect(screen.getByText(/We do not claim a specific legal certification/i)).toBeInTheDocument();
    expect(screen.getByText("Do I need patient consent before recording or transcribing a consultation?")).toBeInTheDocument();
    expect(screen.getByText(/Doctors should obtain patient consent/i)).toBeInTheDocument();
    expect(screen.getByText(/doctor remains responsible for the final clinical judgment/i)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(12);
    expect(screen.getByRole("link", { name: /start using bharatdoc/i })).toHaveAttribute("href", "/onboarding");
  });

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
