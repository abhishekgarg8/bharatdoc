import { DashboardPageClient } from "@/components/dashboard-page-client";

interface DashboardPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  return <DashboardPageClient demoOnMissingToken={searchParams?.demo === "1"} />;
}
