import { TranscriptionLanguagePageClient } from "@/components/settings/transcription-language-page-client";

interface LanguageSettingsPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function LanguageSettingsPage({ searchParams }: LanguageSettingsPageProps) {
  return <TranscriptionLanguagePageClient demoOnMissingToken={searchParams?.demo === "1"} />;
}
