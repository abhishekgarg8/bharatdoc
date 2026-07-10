import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchScreen } from "@/components/search/search-screen";
import type { DashboardRecord } from "@/lib/client/dashboard-data";
import {
  clearSearchNavigationState,
  readSearchNavigationState,
  saveSearchNavigationState,
  type SearchNavigationScope
} from "@/lib/client/search-navigation-state";

const scope: SearchNavigationScope = { authUserId: "auth-a", doctorId: "doctor-a", clinicId: "clinic-a" };

const records: DashboardRecord[] = [
  {
    id: "p-10481",
    patientId: "P-10481",
    time: "Today, 10:55",
    duration: "12:03",
    doctorName: "You",
    status: "transcribed",
    recordedAt: "2026-04-23T05:25:00.000Z"
  },
  {
    id: "p-10470",
    patientId: "P-10470",
    time: "Yest, 18:20",
    duration: "14:22",
    doctorName: "Dr. Rao",
    status: "pdf_saved",
    recordedAt: "2026-04-22T12:50:00.000Z"
  }
];

describe("SearchScreen", () => {
  beforeEach(() => clearSearchNavigationState());
  it("renders recent records and search form", () => {
    render(<SearchScreen initialRecords={records} />);

    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByText("Find consultations by exact Patient ID or by entering the beginning of an ID.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("P-104… or P-10482")).toBeInTheDocument();
    expect(screen.getByText("Recent hospital records")).toBeInTheDocument();
    expect(screen.getByText("P-10481")).toBeInTheDocument();
    expect(screen.getByText("P-10470")).toBeInTheDocument();
  });

  it("constrains long patient IDs in result cards", () => {
    render(
      <SearchScreen
        initialRecords={[
          {
            id: "p-long",
            patientId: "P-12345678901234567890",
            time: "Today, 10:55",
            duration: "12:03",
            doctorName: "Dr. Rao",
            status: "transcribed",
            recordedAt: "2026-04-23T05:25:00.000Z"
          }
        ]}
      />
    );

    const patientId = screen.getByText("P-12345678901234567890");
    expect(patientId).toHaveClass("truncate");
    expect(patientId.parentElement).toHaveClass("w-[72px]", "overflow-hidden");
  });

  it("filters demo records by normalized patient id", async () => {
    render(<SearchScreen initialRecords={records} />);

    fireEvent.change(screen.getByLabelText("Patient ID"), {
      target: { value: " p-10470 " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(screen.getByText("Results for P-10470")).toBeInTheDocument();
    });
    expect(screen.getByText("1 consultation · exact or partial Patient ID match")).toBeInTheDocument();
    expect(screen.getByText("P-10470")).toBeInTheDocument();
    expect(screen.queryByText("P-10481")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open recording P-10470" })).toHaveAttribute(
      "href",
      "/recordings/p-10470"
    );
  });

  it("filters demo records by partial patient id", async () => {
    render(<SearchScreen initialRecords={records} />);

    fireEvent.change(screen.getByLabelText("Patient ID"), {
      target: { value: "P-1048" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(screen.getByText("Results for P-1048")).toBeInTheDocument();
    });
    expect(screen.getByText("P-10481")).toBeInTheDocument();
    expect(screen.queryByText("P-10470")).not.toBeInTheDocument();
  });

  it("shows an empty state when no record matches", async () => {
    render(<SearchScreen initialRecords={records} />);

    fireEvent.change(screen.getByLabelText("Patient ID"), {
      target: { value: "P-99999" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(screen.getByText("No consultations found")).toBeInTheDocument();
    });
    expect(screen.getByText("Check the Patient ID, or enter only the first few characters such as P-104.")).toBeInTheDocument();
  });

  it("uses the hospital-scoped API when an id token is provided", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        records: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            patient_id: "P-10470",
            label: "Follow-up",
            clinic_name: "Sunrise Hospital",
            duration_seconds: 862,
            doctor_name: "Dr. Rao",
            status: "pdf_saved",
            recorded_at: "2026-04-22T12:50:00.000Z",
            has_pdf: true,
            pdf_generated_at: "2026-04-22T12:55:00.000Z",
            pdf_version: "v1",
            pdf_signed_url: "https://signed.example.com/p-10470.pdf"
          }
        ]
      })
    ) as unknown as typeof fetch;

    render(<SearchScreen idToken="id-token" fetcher={fetcher} initialRecords={[]} navigationScope={scope} />);

    fireEvent.change(screen.getByLabelText("Patient ID"), {
      target: { value: "P-10470" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith("/api/patients/search", {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: "Bearer id-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ patient_id: "P-10470" })
      });
    });
    expect(screen.getByText("P-10470")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open recording P-10470" })).toHaveAttribute(
      "href",
      "/recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
    expect(screen.getByText(/Follow-up/)).toBeInTheDocument();
    expect(screen.getByText("Sunrise Hospital")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open PDF" })).toHaveAttribute("href", "https://signed.example.com/p-10470.pdf");
  });

  it("restores scoped results without URL parameters", () => {
    render(<SearchScreen initialRecords={records} restoredSearch={{ query: "P-10470", records: [records[1]!] }} navigationScope={scope} />);
    expect(screen.getByText("Results for P-10470")).toBeInTheDocument();
    expect(screen.queryByText("P-10481")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open recording P-10470" })).toHaveAttribute("href", "/recordings/p-10470");
  });

  it("clears search results back to recent records", async () => {
    render(<SearchScreen initialRecords={records} initialQuery="P-10470" />);

    expect(screen.queryByText("P-10481")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByText("Recent hospital records")).toBeInTheDocument();
    expect(screen.getByText("P-10481")).toBeInTheDocument();
    expect(screen.getByText("P-10470")).toBeInTheDocument();
  });

  it("clears persisted PHI when an empty query is submitted", async () => {
    saveSearchNavigationState(scope, { query: "P-10470", records: [records[1]!] });
    render(<SearchScreen initialRecords={records} navigationScope={scope} />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(readSearchNavigationState(scope)).toBeNull());
  });
});
