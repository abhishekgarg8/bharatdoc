import type { Metadata } from "next";
import { StaticInfoPage } from "@/components/static-info-page";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Help Center | BharatDoc",
  description: "BharatDoc help center with answers for onboarding, recording, summaries, PDFs, and hospital owner review."
};

const faqSections = [
  {
    title: "How do doctors join a hospital workspace?",
    body: "Ask the hospital owner for the doctor join code, enter it during onboarding, and submit the request. The owner must approve the request before hospital records become available."
  },
  {
    title: "Who can approve or remove doctors?",
    body: "Only an active hospital owner can review pending requests, remove doctors, and re-approve removed doctors from Settings."
  },
  {
    title: "How do recordings work?",
    body: "Start a recording from Home, add a patient ID, stop when the consultation ends, and transcribe when ready. Local demo recordings stay on the device for testing."
  },
  {
    title: "Can I edit the AI summary?",
    body: "Yes. Open a recording after transcription, generate the draft summary, edit the text, and save before creating a PDF."
  },
  {
    title: "Where do PDFs appear?",
    body: "Completed PDFs appear on the recording detail screen and are marked on Home and Search so staff can see which consultations are ready."
  },
  {
    title: "What should I do if the hospital code does not work?",
    body: "Confirm the six-character code with the hospital owner, check for mistyped letters or numbers, and ask the owner to update the doctor join code if needed."
  },
  {
    title: "How do I get support?",
    body: "Contact the BharatDoc team through your hospital administrator. Include the patient ID, approximate time, and a short description of the issue."
  }
];

export default function HelpCenterPage() {
  return (
    <StaticInfoPage
      eyebrow="Help"
      title="Help Center"
      description="Quick answers for doctors and hospital owners using BharatDoc."
      updatedAt="June 28, 2026"
      sections={faqSections}
    />
  );
}
