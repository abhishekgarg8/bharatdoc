import { SearchPageClient } from "@/components/search/search-page-client";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

interface SearchPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  return <SearchPageClient demoOnMissingToken={isExplicitDemoModeEnabled(searchParams)} />;
}
