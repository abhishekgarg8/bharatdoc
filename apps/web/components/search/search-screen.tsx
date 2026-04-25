"use client";

import { ArrowLeft, Search, XCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { normalizePatientId } from "@bharatdoc/shared";
import { BharatButton } from "@/components/bharat-button";
import { BottomNav } from "@/components/bottom-nav";
import { DashboardRecordCard } from "@/components/dashboard-record-card";
import {
  demoDashboardRecords,
  searchPatientRecords,
  type DashboardRecord
} from "@/lib/client/dashboard-data";

interface SearchScreenProps {
  idToken?: string;
  fetcher?: typeof fetch;
  initialQuery?: string;
  initialRecords?: DashboardRecord[];
}

function demoSearch(records: DashboardRecord[], query: string): DashboardRecord[] {
  const normalizedQuery = normalizePatientId(query);

  if (!normalizedQuery) {
    return records;
  }

  return records.filter((record) => normalizePatientId(record.patientId).includes(normalizedQuery));
}

export function SearchScreen({
  idToken,
  fetcher = fetch,
  initialQuery = "",
  initialRecords = demoDashboardRecords
}: SearchScreenProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<DashboardRecord[]>(() => demoSearch(initialRecords, initialQuery));
  const [searchedQuery, setSearchedQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedQuery = useMemo(() => normalizePatientId(query), [query]);
  const hasSearched = Boolean(searchedQuery.trim());

  async function submitSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError(null);

    if (!normalizedQuery) {
      setResults(initialRecords);
      setSearchedQuery("");
      return;
    }

    setLoading(true);

    try {
      const nextResults = idToken
        ? await searchPatientRecords(idToken, normalizedQuery, fetcher)
        : demoSearch(initialRecords, normalizedQuery);

      setResults(nextResults);
      setSearchedQuery(normalizedQuery);
    } catch {
      setError("Unable to search patient records.");
      setResults([]);
      setSearchedQuery(normalizedQuery);
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setSearchedQuery("");
    setResults(initialRecords);
    setError(null);
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <section className="paper-bg flex min-h-0 flex-1 flex-col">
        <header className="flex items-start gap-3 px-5 pb-4 pt-5">
          <Link
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
            href="/dashboard"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta">
              Hospital records
            </p>
            <h1 className="mt-1 font-display text-[30px] italic leading-none tracking-normal text-ink">
              Search
            </h1>
            <p className="mt-2 font-body text-xs leading-relaxed text-ink-muted">
              Find consultations by Patient ID across your hospital.
            </p>
          </div>
        </header>

        <form className="px-5 pb-4" onSubmit={submitSearch}>
          <label className="mb-2 block font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta" htmlFor="patient-search">
            Patient ID
          </label>
          <div className="flex gap-2">
            <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border-2 border-terracotta bg-paper px-3">
              <Search className="h-4 w-4 shrink-0 text-ink-muted" />
              <input
                id="patient-search"
                className="min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold uppercase text-ink outline-none placeholder:font-body placeholder:font-normal placeholder:normal-case placeholder:text-ink-faint"
                placeholder="P-10482"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setError(null);
                }}
              />
              {query ? (
                <button
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted"
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                >
                  <XCircle className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <BharatButton className="min-h-12 px-4" disabled={loading} type="submit">
              {loading ? "Searching" : "Search"}
            </BharatButton>
          </div>
        </form>

        <div className="px-5 pb-2">
          <h2 className="font-body text-sm font-bold text-ink">
            {hasSearched ? `Results for ${searchedQuery}` : "Recent hospital records"}
          </h2>
          <p className="mt-1 font-body text-xs text-ink-muted">
            {results.length} {results.length === 1 ? "consultation" : "consultations"}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-28">
          {error ? <p className="rounded-xl border border-rule bg-paper px-3.5 py-3 font-body text-sm font-semibold text-stamp">{error}</p> : null}
          {!error && results.length === 0 ? (
            <div className="rounded-xl border border-rule bg-paper px-4 py-8 text-center">
              <p className="font-body text-sm font-bold text-ink">No consultations found</p>
              <p className="mt-2 font-body text-xs leading-relaxed text-ink-muted">
                Check the Patient ID and search again.
              </p>
            </div>
          ) : null}
          {results.map((record) => (
            <DashboardRecordCard key={record.id} record={record} />
          ))}
        </div>

        <BottomNav active="search" />
      </section>
    </main>
  );
}
