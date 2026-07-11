import { RecordingDetailPageClient } from "@/components/recordings/recording-detail-page-client";

interface RecordingDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export const dynamic = "force-static";

export default async function RecordingDetailPage({ params }: RecordingDetailPageProps) {
  return <RecordingDetailPageClient recordingId={(await params).id} />;
}
