import { NewRecordingPageClient } from "@/components/recordings/new-recording-page-client";

interface NewRecordingPageProps {
  searchParams?: {
    demo?: string;
    mockRecorder?: string;
  };
}

export default function NewRecordingPage({ searchParams }: NewRecordingPageProps) {
  return (
    <NewRecordingPageClient
      demoOnMissingToken={searchParams?.demo === "1"}
      useDemoRecorder={searchParams?.mockRecorder === "1"}
    />
  );
}
