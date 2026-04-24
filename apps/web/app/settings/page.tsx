import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface SettingsPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function SettingsPage({ searchParams }: SettingsPageProps) {
  return <SettingsPageClient demoOnMissingToken={isExplicitDemoModeEnabled(searchParams)} />;
}
