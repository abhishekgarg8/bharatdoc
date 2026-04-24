import { SettingsPageClient } from "@/components/settings/settings-page-client";

interface SettingsPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function SettingsPage({ searchParams }: SettingsPageProps) {
  return <SettingsPageClient demoOnMissingToken={searchParams?.demo === "1"} />;
}
