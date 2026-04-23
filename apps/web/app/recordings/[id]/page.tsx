import { TranscriptSummaryScreen } from "@/components/recordings/transcript-summary-screen";
import { findDemoRecordingDetail } from "@/lib/client/recording-detail-data";

interface RecordingDetailPageProps {
  params: {
    id: string;
  };
}

export default function RecordingDetailPage({ params }: RecordingDetailPageProps) {
  return <TranscriptSummaryScreen recording={findDemoRecordingDetail(params.id)} />;
}
