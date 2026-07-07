import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";
import PgimerOnboardingPage from "@/app/h/pgimer/page";
import OnboardingPage from "@/app/onboarding/page";
import SignupPage from "@/app/signup/page";
import RecordingDetailPage from "@/app/recordings/[id]/page";
import NewRecordingPage from "@/app/recordings/new/page";
import SearchPage from "@/app/search/page";
import PendingApprovalPage from "@/app/pending-approval/page";
import LanguageSettingsPage from "@/app/settings/language/page";
import SettingsPage from "@/app/settings/page";
import PromptSettingsPage from "@/app/settings/prompt/page";
import { OnboardingExplainerScreen } from "@/components/onboarding/onboarding-explainer-screen";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface DemoFallbackProps {
  brandedJoinTarget?: {
    clinicCode: string;
  };
  demoOnMissingToken?: boolean;
  demoMode?: boolean;
  useDemoRecorder?: boolean;
}

function propsFor(element: ReactElement): DemoFallbackProps {
  return element.props as DemoFallbackProps;
}

describe("production demo route gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps demo query handling out of static server page props", () => {
    expect(isExplicitDemoModeEnabled({ demo: "1" })).toBe(false);

    expect(propsFor(DashboardPage() as ReactElement).demoOnMissingToken).toBeUndefined();
    expect(propsFor(SearchPage() as ReactElement).demoOnMissingToken).toBeUndefined();
    expect(propsFor(SettingsPage() as ReactElement).demoOnMissingToken).toBeUndefined();
    expect(propsFor(PendingApprovalPage() as ReactElement).demoOnMissingToken).toBeUndefined();
    expect(propsFor(NewRecordingPage() as ReactElement).demoOnMissingToken).toBeUndefined();
    expect(propsFor(NewRecordingPage() as ReactElement).useDemoRecorder).toBeUndefined();
    expect(
      propsFor(
        RecordingDetailPage({
          params: { id: "p-10481" }
        }) as ReactElement
      ).demoOnMissingToken
    ).toBeUndefined();
    expect(propsFor(PromptSettingsPage() as ReactElement).demoOnMissingToken).toBeUndefined();
    expect(propsFor(LanguageSettingsPage() as ReactElement).demoOnMissingToken).toBeUndefined();
    expect(propsFor(OnboardingPage() as ReactElement).demoMode).toBeUndefined();
    expect(propsFor(SignupPage() as ReactElement).demoMode).toBeUndefined();
    expect(propsFor(PgimerOnboardingPage() as ReactElement).brandedJoinTarget?.clinicCode).toBe("PGIMER");
  });

  it("allows the client-side demo helper only when the explicit demo env flag is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO_MODE", "true");

    expect(isExplicitDemoModeEnabled({ demo: "1" })).toBe(true);
    expect(propsFor(DashboardPage() as ReactElement).demoOnMissingToken).toBeUndefined();
    expect(propsFor(PendingApprovalPage() as ReactElement).demoOnMissingToken).toBeUndefined();
    expect(propsFor(NewRecordingPage() as ReactElement).useDemoRecorder).toBeUndefined();
    expect(propsFor(OnboardingPage() as ReactElement).demoMode).toBeUndefined();
    expect(propsFor(SignupPage() as ReactElement).demoMode).toBeUndefined();
    expect(propsFor(PgimerOnboardingPage() as ReactElement).brandedJoinTarget?.clinicCode).toBe("PGIMER");
  });

  it("keeps the public explainer and signup routes separated", () => {
    expect((OnboardingPage() as ReactElement).type).toBe(OnboardingExplainerScreen);
    expect((SignupPage() as ReactElement).type).toBe(OnboardingScreen);
  });
});
