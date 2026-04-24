import { NewRecordingPageClient } from "@/components/recordings/new-recording-page-client";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface NewRecordingPageProps {
  searchParams?: {
    demo?: string;
    mockRecorder?: string;
  };
}

export default function NewRecordingPage({ searchParams }: NewRecordingPageProps) {
  const demoMode = isExplicitDemoModeEnabled(searchParams);

  return (
    <NewRecordingPageClient
      demoOnMissingToken={demoMode}
      useDemoRecorder={demoMode && searchParams?.mockRecorder === "1"}
    />
  );
}
