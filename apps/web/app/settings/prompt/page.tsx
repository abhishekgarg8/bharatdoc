import { PromptEditorPageClient } from "@/components/settings/prompt-editor-page-client";

interface PromptSettingsPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function PromptSettingsPage({ searchParams }: PromptSettingsPageProps) {
  return <PromptEditorPageClient demoOnMissingToken={searchParams?.demo === "1"} />;
}
