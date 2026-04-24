"use client";

import { Check, ChevronRight, ClipboardList, Edit3, Languages, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ClinicCodeSchema } from "@bharatdoc/shared";
import { BharatButton } from "@/components/bharat-button";
import { BottomNav } from "@/components/bottom-nav";
import {
  approvePendingDoctor,
  rejectPendingDoctor,
  updateClinicProfile,
  type PendingApproval
} from "@/lib/client/clinic-admin-api";
import { DEFAULT_SUMMARY_PROMPT } from "@bharatdoc/shared";
import { cn } from "@/lib/utils";

export interface SettingsDoctorProfile {
  name: string;
  specialization: string;
  phone: string;
  role: "owner" | "doctor";
}

export interface SettingsClinicProfile {
  id: string;
  name: string;
  code: string;
  address: string | null;
  activeDoctorsCount: number;
}

export interface SettingsActiveDoctor {
  id: string;
  name: string;
  specialization: string;
  phone: string;
  role: "owner" | "doctor";
  createdAt: string;
}

interface SettingsScreenProps {
  doctor?: SettingsDoctorProfile;
  clinic?: SettingsClinicProfile;
  activeDoctors?: SettingsActiveDoctor[];
  pendingApprovals?: PendingApproval[];
  idToken?: string;
  fetcher?: typeof fetch;
  allowLocalDemoWrites?: boolean;
}

const defaultDoctor: SettingsDoctorProfile = {
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  phone: "+91 98765 43210",
  role: "owner"
};

const defaultClinic: SettingsClinicProfile = {
  id: "demo-clinic",
  name: "Sunrise Clinic",
  code: "MED42X",
  address: "24 Baner Road, Pune 411045",
  activeDoctorsCount: 3
};

const defaultActiveDoctors: SettingsActiveDoctor[] = [
  {
    id: "owner-aparna",
    name: "Dr. Aparna Iyer",
    specialization: "General Physician",
    phone: "+91 98765 43210",
    role: "owner",
    createdAt: "2026-04-23T06:40:00.000Z"
  },
  {
    id: "doctor-meera",
    name: "Dr. Meera Shah",
    specialization: "Pediatrician",
    phone: "+91 98340 12340",
    role: "doctor",
    createdAt: "2026-04-23T07:10:00.000Z"
  },
  {
    id: "doctor-leena",
    name: "Dr. Leena Joshi",
    specialization: "General Physician",
    phone: "+91 98111 22334",
    role: "doctor",
    createdAt: "2026-04-22T11:10:00.000Z"
  }
];

const defaultPendingApprovals: PendingApproval[] = [
  {
    id: "pending-meera",
    requested_at: "2026-04-23T07:10:00.000Z",
    doctor: {
      id: "doctor-meera",
      name: "Dr. Meera Shah",
      specialization: "Pediatrician",
      phone: "+91 98340 12340",
      created_at: "2026-04-23T07:10:00.000Z"
    }
  }
];

function initialForName(name: string): string {
  return name.replace(/^Dr\.\s*/i, "").trim().charAt(0).toUpperCase() || "D";
}

function pendingSubtitle(count: number): string {
  if (count === 0) {
    return "No doctors waiting";
  }

  return `${count} ${count === 1 ? "doctor" : "doctors"} waiting`;
}

function requestedLabel(requestedAt: string, now = new Date()): string {
  const requested = new Date(requestedAt);
  const diffMs = now.getTime() - requested.getTime();

  if (Number.isNaN(requested.getTime()) || diffMs < 0) {
    return "just now";
  }

  const hours = Math.floor(diffMs / 3_600_000);

  if (hours < 1) {
    return "just now";
  }

  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function SettingsScreen({
  doctor = defaultDoctor,
  clinic = defaultClinic,
  activeDoctors = defaultActiveDoctors,
  pendingApprovals = defaultPendingApprovals,
  idToken,
  fetcher = fetch,
  allowLocalDemoWrites = false
}: SettingsScreenProps) {
  const [pending, setPending] = useState(pendingApprovals);
  const [clinicState, setClinicState] = useState(clinic);
  const [activeDoctorsState] = useState(activeDoctors);
  const [workingRequestId, setWorkingRequestId] = useState<string | null>(null);
  const [savingClinic, setSavingClinic] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"active-doctors" | "clinic-profile" | null>(null);
  const [clinicForm, setClinicForm] = useState({
    name: clinic.name,
    address: clinic.address ?? "",
    code: clinic.code
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = doctor.role === "owner";
  const promptEdited = useMemo(() => DEFAULT_SUMMARY_PROMPT.length > 0, []);

  async function reviewDoctor(request: PendingApproval, action: "approve" | "reject") {
    setWorkingRequestId(request.id);
    setError(null);
    setMessage(null);

    try {
      if (!idToken && !allowLocalDemoWrites) {
        throw new Error("Authentication is required.");
      }

      if (idToken) {
        if (action === "approve") {
          await approvePendingDoctor(idToken, request.id, fetcher);
        } else {
          await rejectPendingDoctor(idToken, request.id, null, fetcher);
        }
      }

      setPending((current) => current.filter((item) => item.id !== request.id));
      setMessage(`${request.doctor.name} ${action === "approve" ? "approved" : "rejected"}.`);
    } catch {
      setError(`Unable to ${action} ${request.doctor.name}.`);
    } finally {
      setWorkingRequestId(null);
    }
  }

  async function saveClinic() {
    setError(null);
    setMessage(null);

    const normalizedName = clinicForm.name.trim();
    const normalizedCode = clinicForm.code.trim().toUpperCase();
    const normalizedAddress = clinicForm.address.trim();
    const clinicCodeResult = ClinicCodeSchema.safeParse(normalizedCode);

    if (!normalizedName) {
      setError("Clinic name is required.");
      return;
    }

    if (!clinicCodeResult.success) {
      setError("Clinic code must be 6 uppercase characters.");
      return;
    }

    setSavingClinic(true);

    try {
      if (!idToken && !allowLocalDemoWrites) {
        throw new Error("Authentication is required.");
      }

      const updatedClinic = idToken
        ? await updateClinicProfile(
            idToken,
            {
              name: normalizedName,
              clinic_code: clinicCodeResult.data,
              address: normalizedAddress || null
            },
            fetcher
          )
        : {
            ...clinicState,
            name: normalizedName,
            code: clinicCodeResult.data,
            address: normalizedAddress || null
          };
      setClinicState(updatedClinic);
      setClinicForm({
        name: updatedClinic.name,
        address: updatedClinic.address ?? "",
        code: updatedClinic.code
      });
      setMessage("Clinic profile saved.");
      setExpandedPanel(null);
    } catch {
      setError("Unable to save clinic profile.");
    } finally {
      setSavingClinic(false);
    }
  }

  function togglePanel(panel: "active-doctors" | "clinic-profile") {
    setMessage(null);
    setError(null);
    setExpandedPanel((current) => (current === panel ? null : panel));
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <section className="paper-bg flex min-h-0 flex-1 flex-col">
        <header className="px-5 pb-4 pt-5">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta">Account</p>
          <h1 className="mt-1 font-display text-[34px] italic leading-none tracking-normal text-ink">Settings</h1>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
          <section className="mb-4 flex items-center gap-3 rounded-[14px] border border-rule bg-paper p-4 shadow-[0_1px_0_#E5DAC5]">
            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-terracotta font-display text-[26px] text-white">
              {initialForName(doctor.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-body text-[15px] font-bold leading-tight text-ink">{doctor.name}</h2>
              <p className="mt-0.5 font-body text-xs text-ink-muted">{doctor.specialization}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">{doctor.phone}</p>
            </div>
            <Edit3 className="h-[18px] w-[18px] shrink-0 text-ink-soft" />
          </section>

          {isOwner ? (
            <SettingsGroup title="Clinic admin">
              <SettingsRow
                title="Pending approvals"
                subtitle={pendingSubtitle(pending.length)}
                badge={pending.length}
                accent={pending.length > 0}
                icon={<ShieldCheck className="h-4 w-4" />}
              />
              <SettingsRow
                title="Active doctors"
                subtitle={`${activeDoctorsState.length} members`}
                icon={<UserRound className="h-4 w-4" />}
                onClick={() => togglePanel("active-doctors")}
                expanded={expandedPanel === "active-doctors"}
              />
              <SettingsRow
                title="Clinic profile"
                subtitle={
                  <span>
                    Code: <span className="font-mono font-bold text-terracotta">{clinicState.code}</span>
                  </span>
                }
                icon={<ClipboardList className="h-4 w-4" />}
                onClick={() => togglePanel("clinic-profile")}
                expanded={expandedPanel === "clinic-profile"}
              />
            </SettingsGroup>
          ) : null}

          {isOwner && expandedPanel === "active-doctors" ? (
            <section className="mb-5 rounded-[14px] border border-rule bg-paper px-4 py-3 shadow-[0_1px_0_#E5DAC5]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-body text-sm font-bold text-ink">Active doctors</h2>
                  <p className="mt-0.5 font-body text-[11.5px] text-ink-muted">
                    Current clinic members with active BharatDoc access.
                  </p>
                </div>
                <span className="rounded-full bg-paper-deep px-2 py-1 font-body text-[11px] font-bold text-ink-soft">
                  {activeDoctorsState.length}
                </span>
              </div>
              <div className="space-y-2.5">
                {activeDoctorsState.map((member) => (
                  <article key={member.id} className="flex items-start gap-3 rounded-[12px] border border-rule bg-paper-deep px-3 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-terracotta font-display text-lg text-white">
                      {initialForName(member.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-body text-sm font-bold text-ink">{member.name}</h3>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-[0.08em]",
                            member.role === "owner" ? "bg-terracotta/10 text-terracotta" : "bg-paper text-ink-muted"
                          )}
                        >
                          {member.role}
                        </span>
                      </div>
                      <p className="mt-1 font-body text-xs text-ink-muted">{member.specialization}</p>
                      <p className="mt-1 font-mono text-[11px] text-ink-faint">{member.phone}</p>
                      <p className="mt-1 font-body text-[11px] text-ink-soft">Joined {requestedLabel(member.createdAt)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {isOwner && expandedPanel === "clinic-profile" ? (
            <section className="mb-5 rounded-[14px] border border-rule bg-paper px-4 py-4 shadow-[0_1px_0_#E5DAC5]">
              <div className="mb-4">
                <h2 className="font-body text-sm font-bold text-ink">Clinic profile</h2>
                <p className="mt-1 font-body text-[11.5px] leading-relaxed text-ink-muted">
                  Update the clinic name, address, and shareable code used by doctors during onboarding.
                </p>
              </div>

              <div className="grid gap-3">
                <label className="block">
                  <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                    Clinic name
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-xl border border-rule bg-paper-deep px-3 font-body text-sm text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
                    value={clinicForm.name}
                    onChange={(event) => setClinicForm((current) => ({ ...current, name: event.target.value }))}
                    aria-label="Clinic name"
                  />
                </label>

                <label className="block">
                  <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                    Clinic address
                  </span>
                  <textarea
                    className="mt-2 min-h-24 w-full resize-none rounded-xl border border-rule bg-paper-deep px-3 py-3 font-body text-sm text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
                    value={clinicForm.address}
                    onChange={(event) => setClinicForm((current) => ({ ...current, address: event.target.value }))}
                    aria-label="Clinic address"
                  />
                </label>

                <label className="block">
                  <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                    Clinic code
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-xl border border-rule bg-paper-deep px-3 font-mono text-base font-bold tracking-[0.08em] text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
                    value={clinicForm.code}
                    onChange={(event) =>
                      setClinicForm((current) => ({
                        ...current,
                        code: event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6)
                      }))
                    }
                    aria-label="Clinic code"
                  />
                </label>
              </div>

              <div className="mt-4 flex gap-2">
                <BharatButton className="flex-1" disabled={savingClinic} onClick={saveClinic}>
                  Save clinic
                </BharatButton>
                <BharatButton
                  className="flex-1"
                  variant="ghost"
                  onClick={() => {
                    setClinicForm({
                      name: clinicState.name,
                      address: clinicState.address ?? "",
                      code: clinicState.code
                    });
                    setExpandedPanel(null);
                    setError(null);
                  }}
                >
                  Cancel
                </BharatButton>
              </div>
            </section>
          ) : null}

          <SettingsGroup title="Transcription">
            <SettingsRow
              title="Language"
              subtitle="Auto-detect · Hindi + English"
              href="/settings/language"
              icon={<Languages className="h-4 w-4" />}
            />
            <SettingsRow
              title="Summary prompt"
              subtitle={promptEdited ? "Custom prompt ready" : "Default prompt"}
              href="/settings/prompt"
              right={
                <span className="rounded bg-saffron/15 px-1.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.1em] text-ochre">
                  Edited
                </span>
              }
              icon={<Sparkles className="h-4 w-4" />}
            />
          </SettingsGroup>

          {isOwner ? (
            <section className="mb-5">
              <div className="mb-2 ml-1 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                Owner review
              </div>
              <div className="rounded-[14px] border border-rule bg-paper p-3 shadow-[0_1px_0_#E5DAC5]">
                <p className="mb-3 rounded-lg border border-saffron/30 bg-saffron/10 px-3 py-2 font-body text-[11.5px] leading-relaxed text-ink-soft">
                  <span className="font-bold text-ink">{pending.length} {pending.length === 1 ? "doctor" : "doctors"}</span> waiting for your approval.
                </p>
                {pending.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-rule bg-paper-deep px-3 py-5 text-center font-body text-xs text-ink-muted">
                    No pending join requests.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {pending.map((request) => (
                      <PendingDoctorCard
                        key={request.id}
                        request={request}
                        working={workingRequestId === request.id}
                        onApprove={() => reviewDoctor(request, "approve")}
                        onReject={() => reviewDoctor(request, "reject")}
                      />
                    ))}
                  </div>
                )}
                {message ? <p className="mt-3 font-body text-xs font-semibold text-sage">{message}</p> : null}
                {error ? <p className="mt-3 font-body text-xs font-semibold text-stamp">{error}</p> : null}
              </div>
            </section>
          ) : null}

          <SettingsGroup title="About">
            <SettingsRow title="Help & support" />
            <SettingsRow title="Terms and privacy" />
            <SettingsRow title="Version" subtitle="v0.9.1 · MVP" />
          </SettingsGroup>

          <SettingsGroup title="Account">
            <SettingsRow title="Sign out" danger />
            <SettingsRow title="Delete account" subtitle="Permanently erase records" danger />
          </SettingsGroup>
        </div>

        <BottomNav active="settings" settingsBadgeCount={pending.length} />
      </section>
    </main>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 ml-1 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">{title}</div>
      <div className="overflow-hidden rounded-[14px] border border-rule bg-paper shadow-[0_1px_0_#E5DAC5]">{children}</div>
    </section>
  );
}

function SettingsRow({
  title,
  subtitle,
  badge = 0,
  right,
  danger,
  accent,
  icon,
  href,
  onClick,
  expanded = false
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: number;
  right?: React.ReactNode;
  danger?: boolean;
  accent?: boolean;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const className = cn(
    "flex w-full items-center gap-3 border-b border-rule px-4 py-3.5 text-left last:border-b-0",
    accent ? "bg-terracotta/5" : "bg-transparent"
  );
  const content = (
    <>
      {icon ? <span className={cn("shrink-0", danger ? "text-stamp" : "text-ink-muted")}>{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cn("block font-body text-sm font-semibold", danger ? "text-stamp" : "text-ink")}>{title}</span>
        {subtitle ? <span className="mt-0.5 block font-body text-[11.5px] text-ink-muted">{subtitle}</span> : null}
      </span>
      {badge > 0 ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta px-1.5 font-body text-[11px] font-bold text-white">
          {badge}
        </span>
      ) : null}
      {right}
      {!danger ? (
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-ink-faint transition", expanded ? "rotate-90" : "")} />
      ) : null}
    </>
  );

  if (href && !danger) {
    return (
      <Link className={className} href={href}>
        {content}
      </Link>
    );
  }

  return (
    <button className={className} type="button" onClick={onClick}>
      {content}
    </button>
  );
}

function PendingDoctorCard({
  request,
  working,
  onApprove,
  onReject
}: {
  request: PendingApproval;
  working: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <article className="rounded-xl border border-rule bg-paper px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep font-display text-[22px] italic text-ink-soft">
          {initialForName(request.doctor.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-body text-sm font-bold text-ink">{request.doctor.name}</h3>
          <p className="mt-0.5 truncate font-body text-xs text-ink-muted">{request.doctor.specialization}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">
            {request.doctor.phone} · requested {requestedLabel(request.requested_at)}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_1.35fr] gap-2">
        <BharatButton
          className="min-h-10 border-stamp/30 py-2 text-stamp"
          variant="ghost"
          icon={<X className="h-4 w-4" />}
          disabled={working}
          onClick={onReject}
        >
          Reject
        </BharatButton>
        <BharatButton
          className="min-h-10 bg-sage py-2 text-white shadow-[0_4px_12px_rgba(95,122,82,0.25)]"
          icon={<Check className="h-4 w-4" />}
          disabled={working}
          onClick={onApprove}
        >
          Approve
        </BharatButton>
      </div>
    </article>
  );
}
