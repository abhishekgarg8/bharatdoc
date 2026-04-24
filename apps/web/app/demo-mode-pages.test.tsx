import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";
import OnboardingPage from "@/app/onboarding/page";
import RecordingDetailPage from "@/app/recordings/[id]/page";
import NewRecordingPage from "@/app/recordings/new/page";
import SearchPage from "@/app/search/page";
import LanguageSettingsPage from "@/app/settings/language/page";
import SettingsPage from "@/app/settings/page";
import PromptSettingsPage from "@/app/settings/prompt/page";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface DemoFallbackProps {
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

  it("ignores demo query strings unless the explicit demo env flag is enabled", () => {
    expect(isExplicitDemoModeEnabled({ demo: "1" })).toBe(false);

    expect(propsFor(DashboardPage({ searchParams: { demo: "1" } }) as ReactElement).demoOnMissingToken).toBe(false);
    expect(propsFor(SearchPage({ searchParams: { demo: "1" } }) as ReactElement).demoOnMissingToken).toBe(false);
    expect(propsFor(SettingsPage({ searchParams: { demo: "1" } }) as ReactElement).demoOnMissingToken).toBe(false);
    expect(
      propsFor(NewRecordingPage({ searchParams: { demo: "1", mockRecorder: "1" } }) as ReactElement)
        .demoOnMissingToken
    ).toBe(false);
    expect(
      propsFor(NewRecordingPage({ searchParams: { demo: "1", mockRecorder: "1" } }) as ReactElement)
        .useDemoRecorder
    ).toBe(false);
    expect(
      propsFor(
        RecordingDetailPage({
          params: { id: "p-10481" },
          searchParams: { demo: "1" }
        }) as ReactElement
      ).demoOnMissingToken
    ).toBe(false);
    expect(propsFor(PromptSettingsPage({ searchParams: { demo: "1" } }) as ReactElement).demoOnMissingToken).toBe(
      false
    );
    expect(propsFor(LanguageSettingsPage({ searchParams: { demo: "1" } }) as ReactElement).demoOnMissingToken).toBe(
      false
    );
    expect(propsFor(OnboardingPage({ searchParams: { demo: "1" } }) as ReactElement).demoMode).toBe(false);
  });

  it("allows local/test demo mode only when the explicit demo env flag is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO_MODE", "true");

    expect(isExplicitDemoModeEnabled({ demo: "1" })).toBe(true);
    expect(propsFor(DashboardPage({ searchParams: { demo: "1" } }) as ReactElement).demoOnMissingToken).toBe(true);
    expect(
      propsFor(NewRecordingPage({ searchParams: { demo: "1", mockRecorder: "1" } }) as ReactElement)
        .useDemoRecorder
    ).toBe(true);
    expect(propsFor(OnboardingPage({ searchParams: { demo: "1" } }) as ReactElement).demoMode).toBe(true);
  });
});
