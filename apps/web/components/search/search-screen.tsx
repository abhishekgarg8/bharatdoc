"use client";

import { ArrowLeft, ChevronRight, FileText, Search, XCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { normalizePatientId } from "@bharatdoc/shared";
import { BharatButton } from "@/components/bharat-button";
import { BottomNav } from "@/components/bottom-nav";
import { StatusTick } from "@/components/status-tick";
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

function SearchResultCard({ record, returnTo }: { record: DashboardRecord; returnTo: string }) {
  const hasPdf = Boolean(record.pdfSignedUrl || record.pdfStoragePath || record.status === "pdf_saved");
  const recordingHref = `/recordings/${record.id}?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <article className="rounded-[14px] border border-rule bg-paper p-4 shadow-[0_1px_0_#E5DAC5]">
      <Link
        className="flex items-start gap-3 transition active:scale-[0.99]"
        href={recordingHref}
        aria-label={`Open recording ${record.patientId}`}
      >
        <div className="w-[72px] shrink-0 overflow-hidden rounded-md border border-dashed border-ochre bg-paper-deep px-2 py-1.5 text-center">
          <div className="font-body text-[9px] font-bold uppercase tracking-[0.12em] text-ochre">Patient</div>
          <div className="mt-0.5 truncate font-mono text-[13px] font-bold text-ink">{record.patientId}</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 font-body text-[13px] font-bold text-ink">
            <span className="shrink-0">{record.time}</span>
            {record.label ? <span className="truncate text-ink-muted">· {record.label}</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 font-body text-[11.5px] text-ink-muted">
            <span>{record.clinicName ?? "Hospital record"}</span>
            <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
            <span>{record.doctorName}</span>
            <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
            <span>{record.duration}</span>
          </div>
          <div className="mt-2">
            <StatusTick status={record.status} />
          </div>
        </div>

        <ChevronRight className="mt-1 h-4.5 w-4.5 shrink-0 text-ink-faint" />
      </Link>

      {hasPdf ? (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-rule bg-paper-deep px-3 py-2">
          <span className="flex items-center gap-2 font-body text-[11.5px] font-semibold text-ink-muted">
            <FileText className="h-3.5 w-3.5 text-terracotta" />
            PDF available
          </span>
          {record.pdfSignedUrl ? (
            <a
              className="font-body text-[11.5px] font-bold text-terracotta underline-offset-2 hover:underline"
              href={record.pdfSignedUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open PDF
            </a>
          ) : (
            <span className="font-body text-[11.5px] font-bold text-ink-muted">Saved</span>
          )}
        </div>
      ) : null}
    </article>
  );
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
  const returnTo = hasSearched ? `/search?patient_id=${encodeURIComponent(searchedQuery)}` : "/search";

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
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
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
              Find consultations by exact Patient ID or by entering the beginning of an ID.
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
                placeholder="P-104… or P-10482"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setError(null);
                }}
              />
              {query ? (
                <button
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted"
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
            {hasSearched ? " · exact or partial Patient ID match" : ""}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-28">
          {error ? <p className="rounded-xl border border-rule bg-paper px-3.5 py-3 font-body text-sm font-semibold text-stamp">{error}</p> : null}
          {!error && results.length === 0 ? (
            <div className="rounded-xl border border-rule bg-paper px-4 py-8 text-center">
              <p className="font-body text-sm font-bold text-ink">No consultations found</p>
              <p className="mt-2 font-body text-xs leading-relaxed text-ink-muted">
                Check the Patient ID, or enter only the first few characters such as P-104.
              </p>
            </div>
          ) : null}
          {results.map((record) => (
            <SearchResultCard key={record.id} record={record} returnTo={returnTo} />
          ))}
        </div>

        <BottomNav active="search" />
      </section>
    </main>
  );
}
