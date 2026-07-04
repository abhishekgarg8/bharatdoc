import type { Metadata } from "next";
import { DoctorFaqPage } from "@/components/doctor-faq-page";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "FAQs for Doctors | BharatDoc",
  description:
    "Doctor-focused BharatDoc FAQs covering pricing, privacy, consent, AI accuracy, supported workflows, languages, and clinic adoption."
};

export default function FaqPage() {
  return <DoctorFaqPage />;
}
