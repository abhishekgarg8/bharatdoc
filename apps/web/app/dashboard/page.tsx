import { DashboardPageClient } from "@/components/dashboard-page-client";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface DashboardPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  return <DashboardPageClient demoOnMissingToken={isExplicitDemoModeEnabled(searchParams)} />;
}
