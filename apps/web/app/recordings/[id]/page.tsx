import { RecordingDetailPageClient } from "@/components/recordings/recording-detail-page-client";

interface RecordingDetailPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    demo?: string;
  };
}

export default function RecordingDetailPage({ params, searchParams }: RecordingDetailPageProps) {
  return <RecordingDetailPageClient recordingId={params.id} demoOnMissingToken={searchParams?.demo === "1"} />;
}
