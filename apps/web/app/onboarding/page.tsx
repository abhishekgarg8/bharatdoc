import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface OnboardingPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function OnboardingPage({ searchParams }: OnboardingPageProps) {
  return <OnboardingScreen demoMode={isExplicitDemoModeEnabled(searchParams)} />;
}
