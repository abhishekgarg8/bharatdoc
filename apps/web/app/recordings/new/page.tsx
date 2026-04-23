import { NewRecordingPageClient } from "@/components/recordings/new-recording-page-client";

interface NewRecordingPageProps {
  searchParams?: {
    mockRecorder?: string;
  };
}

export default function NewRecordingPage({ searchParams }: NewRecordingPageProps) {
  return <NewRecordingPageClient useDemoRecorder={searchParams?.mockRecorder === "1"} />;
}
