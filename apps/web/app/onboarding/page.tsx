import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

interface OnboardingPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function OnboardingPage({ searchParams }: OnboardingPageProps) {
  return <OnboardingScreen demoMode={searchParams?.demo === "1"} />;
}
