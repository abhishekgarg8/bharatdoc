import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchPageClient } from "@/components/search/search-page-client";
import type { PhoneAuthClient } from "@/lib/client/phone-auth";

const apiRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patient_id: "P-20001",
  label: null,
  duration_seconds: 180,
  doctor_name: "Dr. Nisha Shah",
  status: "recorded",
  recorded_at: "2026-04-23T06:12:00.000Z"
};

describe("SearchPageClient", () => {
  it("loads authenticated recent records and searches with the same token", async () => {
    const authClient: PhoneAuthClient = {
      sendOtp: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/recordings") {
        return Response.json({ records: [apiRecord] });
      }

      if (url === "/api/patients/search?patient_id=P-20001") {
        return Response.json({ records: [apiRecord] });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    }) as unknown as typeof fetch;

    render(<SearchPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("P-20001")).resolves.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: "P-20001" } });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));

    await expect(screen.findByText("Results for P-20001")).resolves.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/patients/search?patient_id=P-20001", {
      headers: { Authorization: "Bearer id-token" }
    });
  });

  it("uses demo search when no token is available", async () => {
    const authClient: PhoneAuthClient = {
      sendOtp: vi.fn(),
      getCurrentIdToken: vi.fn(async () => null)
    };

    render(<SearchPageClient authClient={authClient} />);

    await expect(screen.findByText("P-10482")).resolves.toBeInTheDocument();
  });
});
