import { RecordingScreen } from "@/components/recording/recording-screen";

interface RecordingPageProps {
  searchParams?: {
    mockAudio?: string | string[];
  };
}

function hasMockAudioFlag(value: string | string[] | undefined): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return Array.isArray(value) ? value.includes("1") : value === "1";
}

export default function RecordingPage({ searchParams }: RecordingPageProps) {
  return <RecordingScreen mockAudio={hasMockAudioFlag(searchParams?.mockAudio)} />;
}
