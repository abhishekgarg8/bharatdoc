import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Exclusive PGIMER AI Scribe Access | BharatDoc",
  description: "A US-style AI scribe workflow opened for PGIMER doctors."
};

export default function PgimerOnboardingPage() {
  return (
    <OnboardingScreen
      brandedJoinTarget={{
        clinicCode: "PGIMER",
        name: "Postgraduate Institute of Medical Education & Research, Chandigarh",
        address: "Sector-12, Chandigarh PIN-160012, India",
        welcomeBadge: "Exclusive hospital access",
        welcomeTitle: "A US-style AI scribe workflow, opened for PGIMER",
        welcomeCopy:
          "Advanced clinical documentation tools are usually reserved for large, well-funded health systems. This pilot brings that workflow to PGIMER doctors first."
      }}
    />
  );
}
