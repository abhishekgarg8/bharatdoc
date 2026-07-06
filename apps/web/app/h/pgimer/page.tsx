import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "AI Scribe for PGIMER | BharatDoc",
  description: "Record consultations and create doctor-reviewed clinical notes and Patient ID PDFs for PGIMER."
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
        welcomeTitle: "AI Scribe for PGIMER",
        welcomeCopy: "Record consultations and create doctor-reviewed clinical notes and Patient ID PDFs."
      }}
    />
  );
}
