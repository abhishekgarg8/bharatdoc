import { SearchPageClient } from "@/components/search/search-page-client";

interface SearchPageProps {
  searchParams?: {
    demo?: string;
  };
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  return <SearchPageClient demoOnMissingToken={searchParams?.demo === "1"} />;
}
