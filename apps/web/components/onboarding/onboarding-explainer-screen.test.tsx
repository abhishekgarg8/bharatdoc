import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OnboardingExplainerScreen } from "@/components/onboarding/onboarding-explainer-screen";

describe("OnboardingExplainerScreen", () => {
  it("renders exactly three explainer screens with skippable signup routing", () => {
    render(<OnboardingExplainerScreen />);

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByText(/Sign up with your details/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip" })).toHaveAttribute("href", "/signup");
    expect(screen.getAllByLabelText(/Show /)).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Confirm your email" })).toBeInTheDocument();
    expect(screen.getByText(/Open the confirmation email/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Start recording and transcribing" })).toBeInTheDocument();
    expect(screen.getByText(/review the generated notes/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/signup");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("supports backward and progress-dot navigation", () => {
    render(<OnboardingExplainerScreen />);

    fireEvent.click(screen.getByLabelText("Show Start recording and transcribing"));
    expect(screen.getByRole("heading", { name: "Start recording and transcribing" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous onboarding screen" }));
    expect(screen.getByRole("heading", { name: "Confirm your email" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Show Create your account"));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous onboarding screen" })).toBeDisabled();
  });
});
