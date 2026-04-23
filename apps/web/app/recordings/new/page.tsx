import { RecordingScreen } from "@/components/recordings/recording-screen";

interface NewRecordingPageProps {
  searchParams?: {
    mockRecorder?: string;
  };
}

export default function NewRecordingPage({ searchParams }: NewRecordingPageProps) {
  return <RecordingScreen useDemoRecorder={searchParams?.mockRecorder === "1"} />;
}
