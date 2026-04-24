import { PromptEditorPageClient } from "@/components/settings/prompt-editor-page-client";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface PromptSettingsPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function PromptSettingsPage({ searchParams }: PromptSettingsPageProps) {
  return <PromptEditorPageClient demoOnMissingToken={isExplicitDemoModeEnabled(searchParams)} />;
}
