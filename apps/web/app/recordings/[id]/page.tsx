import { RecordingDetailPageClient } from "@/components/recordings/recording-detail-page-client";

interface RecordingDetailPageProps {
  params: {
    id: string;
  };
}

export default function RecordingDetailPage({ params }: RecordingDetailPageProps) {
  return <RecordingDetailPageClient recordingId={params.id} />;
}
