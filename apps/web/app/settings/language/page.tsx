import { TranscriptionLanguagePageClient } from "@/components/settings/transcription-language-page-client";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface LanguageSettingsPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function LanguageSettingsPage({ searchParams }: LanguageSettingsPageProps) {
  return <TranscriptionLanguagePageClient demoOnMissingToken={isExplicitDemoModeEnabled(searchParams)} />;
}
