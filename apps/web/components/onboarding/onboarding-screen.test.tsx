import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

describe("OnboardingScreen", () => {
  it("renders the phone, profile, join clinic, and create clinic steps", () => {
    render(<OnboardingScreen />);

    expect(screen.getByText("Welcome to BharatDoc")).toBeInTheDocument();
    expect(screen.getByText("Mobile number")).toBeInTheDocument();
    expect(screen.getByText("Profile details")).toBeInTheDocument();
    expect(screen.getByText("Join an existing clinic")).toBeInTheDocument();
    expect(screen.getByText("Create a new clinic")).toBeInTheDocument();
  });
});
