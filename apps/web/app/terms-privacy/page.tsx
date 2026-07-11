import type { Metadata } from "next";
import { StaticInfoPage } from "@/components/static-info-page";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms and Privacy | BharatDoc",
  description: "BharatDoc terms of use and privacy policy for doctors and hospital owners."
};

const policySections = [
  {
    title: "Use of BharatDoc",
    body: "BharatDoc helps doctors record consultations, draft clinical summaries, and create PDFs for hospital documentation. Users are responsible for reviewing all drafts before relying on or sharing them."
  },
  {
    title: "Clinical responsibility",
    body: "AI-generated summaries may be incomplete or inaccurate. Doctors and hospital staff must verify the transcript, summary, patient ID, and final PDF against the actual consultation."
  },
  {
    title: "Account access",
    body: "Hospital owners control doctor access through approvals, removals, and doctor join codes. Users must keep their credentials secure and notify the hospital owner if access should be changed."
  },
  {
    title: "Information we process",
    body: "BharatDoc may process account details, hospital details, consultation metadata, audio, transcripts, summaries, and generated PDFs to provide the documentation workflow."
  },
  {
    title: "How information is used",
    body: "Information is used to authenticate users, keep records clinic-scoped, transcribe audio, draft summaries, generate PDFs, troubleshoot issues, and improve reliability."
  },
  {
    title: "Data sharing",
    body: "BharatDoc does not sell patient information. Data may be processed by infrastructure, authentication, storage, transcription, and AI service providers needed to operate the product."
  },
  {
    title: "Retention and deletion",
    body: "Hospitals choose how long consultation records are retained for clinical and legal needs. A doctor can permanently delete a consultation they own; account deletion removes consultations owned by that account after storage cleanup. Device audio is removed after verified transcription and can be purged in Settings. Diagnostic data expires within 30 days and processing records within 90 days. Hospital owners must transfer ownership before deleting an account while other members remain."
  },
  {
    title: "Changes to these terms",
    body: "BharatDoc may update these terms and this privacy policy as the product changes. The updated date on this page shows the latest published version."
  }
];

export default function TermsPrivacyPage() {
  return (
    <StaticInfoPage
      eyebrow="Policy"
      title="Terms and Privacy"
      description="Terms of use and privacy policy for BharatDoc doctors, hospital owners, and administrators."
      updatedAt="July 11, 2026 · reviewed by Privacy & Security Lead"
      sections={policySections}
    />
  );
}
