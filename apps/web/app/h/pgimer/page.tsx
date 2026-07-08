import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Exclusive PGIMER AI Scribe Access | BharatDoc",
  description: "AI scribe access exclusively for PGIMER doctors."
};

export default function PgimerOnboardingPage() {
  return (
    <OnboardingScreen
      brandedJoinTarget={{
        clinicCode: "PGIMER",
        name: "Postgraduate Institute of Medical Education & Research, Chandigarh",
        address: "Sector-12, Chandigarh PIN-160012, India",
        welcomeBadge: "Exclusive hospital access",
        welcomeTitle: "AI scribe exclusively for PGIMER Doctors",
        welcomeCopy:
          "Advanced clinical documentation tools as used by large well-funded health systems in the US. This pilot brings that workflow to PGIMER doctors using AI now."
      }}
    />
  );
}
