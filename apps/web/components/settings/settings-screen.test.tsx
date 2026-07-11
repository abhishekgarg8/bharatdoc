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
      phone: "meera@example.com",
      created_at: "2026-04-23T07:10:00.000Z"
    }
  }
];

const ownerDoctor = {
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  contact: "aparna@example.com",
  role: "owner" as const
};

const doctorProfile = {
  name: "Dr. Nisha Shah",
  specialization: "General Physician",
  contact: "nisha@example.com",
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SettingsScreen", () => {
  it("renders profile, hospital admin, transcription, and account groups", () => {
    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Aparna Iyer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit doctor profile" })).toBeInTheDocument();
    expect(screen.getByText("aparna@example.com")).toBeInTheDocument();
    expect(screen.getByText("Hospital admin")).toBeInTheDocument();
    expect(screen.getByText("1 doctor waiting")).toBeInTheDocument();
    expect(screen.getByText("Doctor join code")).toBeInTheDocument();
    expect(screen.getByText(/Share with doctors to join/)).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /language/i })).toHaveAttribute("href", "/settings/language");
    expect(screen.getByRole("link", { name: /summary prompt/i })).toHaveAttribute("href", "/settings/prompt");
    expect(screen.getByRole("link", { name: /help & support/i })).toHaveAttribute("href", "/help-center");
    expect(screen.getByRole("link", { name: /terms and privacy/i })).toHaveAttribute("href", "/terms-privacy");
    expect(screen.getByText("FAQs and support details")).toBeInTheDocument();
    expect(screen.getByText("Terms of use and privacy policy")).toBeInTheDocument();
    expect(screen.queryByText("Delete account")).not.toBeInTheDocument();
    expect(screen.queryByText("Not available in this build")).not.toBeInTheDocument();
  });

  it("shows active doctor details when the owner expands the hospital team", async () => {
    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} />);

    fireEvent.click(screen.getByRole("button", { name: /active doctors/i }));

    await waitFor(() => expect(screen.getByText("Current hospital members with active BharatDoc access.")).toBeInTheDocument());
    expect(screen.getByText("Dr. Leena Joshi")).toBeInTheDocument();
    expect(screen.getByText("leena@example.com")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText(/7 recordings/)).toBeInTheDocument();
  });

  it("removes active doctors and keeps them in audit history", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);

    fireEvent.click(screen.getByRole("button", { name: /active doctors/i }));
    await screen.findByText("Current hospital members with active BharatDoc access.");
    fireEvent.click(screen.getAllByRole("button", { name: /remove from hospital/i })[1]!);

    await waitFor(() => expect(screen.getByText(/removed from hospital/i)).toBeInTheDocument());
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
    const originalScrollTop = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "scrollTop");
    const scrollTopValues: number[] = [];
    Object.defineProperty(window.HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get() {
        return 12;
      },
      set(value) {
        scrollTopValues.push(value);
      }
    });
    vi.spyOn(window.HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (typeof this.className === "string" && this.className.includes("overflow-y-auto")) {
        return { top: 20 } as DOMRect;
      }

      if (this.textContent?.includes("Owner review")) {
        return { top: 420 } as DOMRect;
      }

      return { top: 20 } as DOMRect;
    });

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} />);

    fireEvent.click(screen.getByRole("button", { name: /pending approvals/i }));

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTopValues).toContain(412);
    if (originalScrollTop) {
      Object.defineProperty(window.HTMLElement.prototype, "scrollTop", originalScrollTop);
    } else {
      Reflect.deleteProperty(window.HTMLElement.prototype, "scrollTop");
    }
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

  it("edits the signed-in doctor profile through the settings API", async () => {
    const updatedDoctor = {
      id: "owner-aparna",
      firebase_uid: "firebase-owner",
      clinic_id: "demo-clinic",
      role: "owner" as const,
      account_status: "active" as const,
      name: "Dr. Nisha Shah",
      specialization: "Pediatrics",
      phone: "nisha@example.com",
      profile_photo_path: null,
      custom_prompt: null,
      transcription_lang: "auto" as const,
      created_at: "2026-04-23T09:00:00.000Z"
    };
    const fetcher = vi.fn(async () => Response.json({ doctor: updatedDoctor })) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit doctor profile" }));
    expect(await screen.findByRole("heading", { name: "Doctor profile" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Doctor name"), { target: { value: "Dr. Nisha Shah" } });
    fireEvent.change(screen.getByLabelText("Specialization"), { target: { value: "Pediatrics" } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => expect(screen.getByText("Profile saved.")).toBeInTheDocument());
    expect(screen.getByText("Dr. Nisha Shah")).toBeInTheDocument();
    expect(screen.getByText("Pediatrics")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/settings/preferences", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Dr. Nisha Shah",
        specialization: "Pediatrics"
      })
    });
  });

  it("uses a curated specialization dropdown with Other fallback in the profile editor", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        doctor: {
          id: "owner-aparna",
          firebase_uid: "firebase-owner",
          clinic_id: "demo-clinic",
          role: "owner",
          account_status: "active",
          name: "Dr. Aparna Iyer",
          specialization: "Sports Medicine",
          phone: "aparna@example.com",
          profile_photo_path: null,
          custom_prompt: null,
          transcription_lang: "auto",
          created_at: "2026-04-23T09:00:00.000Z"
        }
      })
    ) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit doctor profile" }));
    const specialization = await screen.findByLabelText("Specialization");
    expect(specialization.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "General Physician" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Urology" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();

    fireEvent.change(specialization, { target: { value: "Other" } });
    fireEvent.change(screen.getByLabelText("Other specialization"), { target: { value: "Sports Medicine" } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => expect(screen.getByText("Profile saved.")).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledWith("/api/settings/preferences", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Dr. Aparna Iyer",
        specialization: "Sports Medicine"
      })
    });
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

  it("updates the doctor join code through the owner API", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/clinic/admin") {
        return Response.json({
          clinic: {
            ...clinic,
            code: "ABC123"
          }
        });
      }

      return Response.json({ ok: true });
    }) as unknown as typeof fetch;

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

    fireEvent.click(screen.getByRole("button", { name: /doctor join code/i }));
    fireEvent.change(screen.getByLabelText("Doctor join code"), { target: { value: "abc123" } });
    fireEvent.click(screen.getByRole("button", { name: /save code/i }));

    await waitFor(() => expect(screen.getByText("Doctor join code saved.")).toBeInTheDocument());
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/admin", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code: "ABC123" })
    });
  });

  it("validates doctor join codes before saving", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen demoMode pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);

    fireEvent.click(screen.getByRole("button", { name: /doctor join code/i }));
    fireEvent.change(screen.getByLabelText("Doctor join code"), { target: { value: "AB@" } });
    fireEvent.click(screen.getByRole("button", { name: /save code/i }));

    await waitFor(() => expect(screen.getByText("Doctor join code must be exactly 6 letters or numbers.")).toBeInTheDocument());
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

  it("double-confirms account deletion and signs out only after completed cleanup", async () => {
    const onSignOut = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => Response.json({ deletion: { id: "receipt", state: "completed" } })) as unknown as typeof fetch;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SettingsScreen doctor={doctorProfile} idToken="token" fetcher={fetcher} onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/account", {
      method: "DELETE", headers: { Authorization: "Bearer token" }
    }));
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
