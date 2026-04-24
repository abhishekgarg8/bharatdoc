import { RecordingDetailPageClient } from "@/components/recordings/recording-detail-page-client";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface RecordingDetailPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    demo?: string;
  };
}

export default function RecordingDetailPage({ params, searchParams }: RecordingDetailPageProps) {
  return <RecordingDetailPageClient recordingId={params.id} demoOnMissingToken={isExplicitDemoModeEnabled(searchParams)} />;
}
