import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "PGIMER Chandigarh | BharatDoc",
  description: "Join the PGIMER Chandigarh BharatDoc pilot workspace."
};

export default function PgimerOnboardingPage() {
  return (
    <OnboardingScreen
      brandedJoinTarget={{
        clinicCode: "PGIMER",
        name: "Postgraduate Institute of Medical Education & Research, Chandigarh",
        address: "Sector-12, Chandigarh PIN-160012, India",
        headerImageSrc: "/images/pgimer-header.png",
        headerImageAlt: "Postgraduate Institute of Medical Education and Research Chandigarh",
        welcomeTitle: "Join PGIMER on BharatDoc",
        welcomeCopy: "Create your doctor login and request access to the PGIMER pilot workspace."
      }}
    />
  );
}
