import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "@/components/settings/settings-screen";
import type { PendingApproval } from "@/lib/client/clinic-admin-api";

const pendingApprovals: PendingApproval[] = [
  {
    id: "request-1",
    requested_at: "2026-04-23T07:10:00.000Z",
    doctor: {
      id: "doctor-1",
      name: "Dr. Meera Shah",
      specialization: "Pediatrician",
      phone: "+91 98340 12340",
      created_at: "2026-04-23T07:10:00.000Z"
    }
  }
];

const ownerDoctor = {
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  phone: "+91 98765 43210",
  role: "owner" as const
};

const doctorProfile = {
  name: "Dr. Nisha Shah",
  specialization: "General Physician",
  phone: "+91 98765 43211",
  role: "doctor" as const
};

const clinic = {
  id: "demo-clinic",
  name: "Sunrise Hospital",
  code: "MED42X",
  address: "24 Baner Road, Pune 411045",
  activeDoctorsCount: 1
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SettingsScreen", () => {
  it("renders profile, hospital admin, transcription, and account groups", () => {
    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Aparna Iyer")).toBeInTheDocument();
    expect(screen.getByText("Hospital admin")).toBeInTheDocument();
    expect(screen.getByText("1 doctor waiting")).toBeInTheDocument();
    expect(screen.getByText("Hospital code")).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /language/i })).toHaveAttribute("href", "/settings/language");
    expect(screen.getByRole("link", { name: /summary prompt/i })).toHaveAttribute("href", "/settings/prompt");
    expect(screen.getByText("Delete account")).toBeInTheDocument();
    expect(screen.getByText("Not available in this build")).toBeInTheDocument();
  });

  it("shows active doctor details when the owner expands the hospital team", async () => {
    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} />);

    fireEvent.click(screen.getByRole("button", { name: /active doctors/i }));

    await waitFor(() => expect(screen.getByText("Current hospital members with active BharatDoc access.")).toBeInTheDocument());
    expect(screen.getByText("Dr. Leena Joshi")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText(/7 recordings/)).toBeInTheDocument();
  });

  it("removes active doctors and keeps them in audit history", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);

    fireEvent.click(screen.getByRole("button", { name: /active doctors/i }));
    await screen.findByText("Current hospital members with active BharatDoc access.");
    fireEvent.click(screen.getAllByRole("button", { name: /remove from clinic/i })[1]!);

    await waitFor(() => expect(screen.getByText(/removed from clinic/i)).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/doctors/doctor-leena/remove", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /removed doctors/i }));
    expect(screen.getByText("Dr. Leena Joshi")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /re-approve/i }).length).toBeGreaterThan(0);
  });

  it("re-approves removed doctors from owner audit history", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={[]} idToken="id-token" fetcher={fetcher} />);

    fireEvent.click(screen.getByRole("button", { name: /removed doctors/i }));
    expect(await screen.findByText("Dr. Sameer Kulkarni")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /re-approve/i }));

    await waitFor(() => expect(screen.getByText("Dr. Sameer Kulkarni re-approved.")).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/doctors/doctor-removed/reapprove", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });
    expect(screen.getByText("No removed doctors.")).toBeInTheDocument();
  });

  it("scrolls to owner review when pending approvals row is clicked", () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} />);

    fireEvent.click(screen.getByRole("button", { name: /pending approvals/i }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("only marks the summary prompt as edited when a custom prompt is saved", () => {
    render(
      <SettingsScreen
        doctor={ownerDoctor}
        clinic={clinic}
        activeDoctors={[]}
        pendingApprovals={[]}
      />
    );

    expect(screen.getByText("Default prompt")).toBeInTheDocument();
    expect(screen.queryByText("Edited")).not.toBeInTheDocument();
  });

  it("approves a pending doctor through the API and removes the card", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => expect(screen.queryByText("Dr. Meera Shah")).not.toBeInTheDocument());
    expect(screen.getByText("No pending join requests.")).toBeInTheDocument();
    expect(screen.getByText("Dr. Meera Shah approved.")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/join-requests/request-1/approve", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("does not approve locally when authentication is missing", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => expect(screen.getByText("Unable to approve Dr. Meera Shah.")).toBeInTheDocument());
    expect(screen.getByText("Dr. Meera Shah")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a pending doctor through the API and removes the card", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));

    await waitFor(() => expect(screen.queryByText("Dr. Meera Shah")).not.toBeInTheDocument());
    expect(screen.getByText("Dr. Meera Shah rejected.")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/join-requests/request-1/reject", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason: null })
    });
  });

  it("updates the hospital profile through the owner API", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/clinic/admin") {
        return Response.json({
          clinic: {
            id: "demo-clinic",
            name: "Sunrise Family Hospital",
            code: "MED43Y",
            address: null,
            activeDoctorsCount: 3
          }
        });
      }

      return Response.json({ ok: true });
    }) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);

    fireEvent.click(screen.getByRole("button", { name: /hospital profile/i }));
    fireEvent.change(screen.getByLabelText("Hospital name"), { target: { value: "Sunrise Family Hospital" } });
    fireEvent.change(screen.getByLabelText("Hospital address"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save hospital/i }));

    await waitFor(() => expect(screen.getByText("Hospital profile saved.")).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/admin", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Sunrise Family Hospital",
        address: null
      })
    });
  });

  it("copies the read-only hospital code without sending profile updates", async () => {
    const writeText = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText
      }
    });

    render(
      <SettingsScreen
        doctor={ownerDoctor}
        clinic={clinic}
        activeDoctors={[]}
        pendingApprovals={[]}
        idToken="id-token"
        fetcher={fetcher}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /hospital code/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("MED42X"));
    expect(screen.getByText("Hospital code copied.")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not save hospital profile locally when authentication is missing", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} fetcher={fetcher} />);

    fireEvent.click(screen.getByRole("button", { name: /hospital profile/i }));
    fireEvent.change(screen.getByLabelText("Hospital name"), { target: { value: "Sunrise Family Hospital" } });
    fireEvent.click(screen.getByRole("button", { name: /save hospital/i }));

    await waitFor(() => expect(screen.getByText("Unable to save hospital profile.")).toBeInTheDocument());
    expect(screen.queryByText("Hospital profile saved.")).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not render demo owner admin data for non-owner settings", () => {
    render(<SettingsScreen doctor={doctorProfile} activeDoctors={[]} pendingApprovals={[]} />);

    expect(screen.getByText("Dr. Nisha Shah")).toBeInTheDocument();
    expect(screen.queryByText("Hospital admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Dr. Meera Shah")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("shows zero pending approvals without falling back to demo requests", () => {
    render(<SettingsScreen doctor={ownerDoctor} clinic={clinic} activeDoctors={[]} pendingApprovals={[]} />);

    expect(screen.getByText("No doctors waiting")).toBeInTheDocument();
    expect(screen.getByText("No pending join requests.")).toBeInTheDocument();
    expect(screen.queryByText("Dr. Meera Shah")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("calls the sign-out handler from the account section", async () => {
    const onSignOut = vi.fn(async () => undefined);

    render(
      <SettingsScreen
        doctor={ownerDoctor}
        clinic={clinic}
        activeDoctors={[]}
        pendingApprovals={[]}
        onSignOut={onSignOut}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });
});
