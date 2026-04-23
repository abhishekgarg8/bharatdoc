import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchScreen } from "@/components/search/search-screen";
import type { DashboardRecord } from "@/lib/client/dashboard-data";

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
  it("renders recent records and search form", () => {
    render(<SearchScreen initialRecords={records} />);

    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByText("Recent clinic records")).toBeInTheDocument();
    expect(screen.getByText("P-10481")).toBeInTheDocument();
    expect(screen.getByText("P-10470")).toBeInTheDocument();
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
    expect(screen.getByText("P-10470")).toBeInTheDocument();
    expect(screen.queryByText("P-10481")).not.toBeInTheDocument();
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
  });

  it("uses the clinic-scoped API when an id token is provided", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        records: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            patient_id: "P-10470",
            label: null,
            duration_seconds: 862,
            doctor_name: "Dr. Rao",
            status: "pdf_saved",
            recorded_at: "2026-04-22T12:50:00.000Z"
          }
        ]
      })
    ) as unknown as typeof fetch;

    render(<SearchScreen idToken="id-token" fetcher={fetcher} initialRecords={[]} />);

    fireEvent.change(screen.getByLabelText("Patient ID"), {
      target: { value: "P-10470" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith("/api/patients/search?patient_id=P-10470", {
        headers: {
          Authorization: "Bearer id-token"
        }
      });
    });
    expect(screen.getByText("P-10470")).toBeInTheDocument();
  });

  it("clears search results back to recent records", async () => {
    render(<SearchScreen initialRecords={records} initialQuery="P-10470" />);

    expect(screen.queryByText("P-10481")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByText("Recent clinic records")).toBeInTheDocument();
    expect(screen.getByText("P-10481")).toBeInTheDocument();
    expect(screen.getByText("P-10470")).toBeInTheDocument();
  });
});
