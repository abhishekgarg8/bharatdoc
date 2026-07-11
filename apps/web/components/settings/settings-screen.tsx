"use client";

import { Check, ChevronRight, Clipboard, ClipboardList, Edit3, Languages, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { BharatButton } from "@/components/bharat-button";
import { BottomNav } from "@/components/bottom-nav";
import { SpecializationField } from "@/components/settings/specialization-field";
import { DeviceStorageControls } from "@/components/settings/device-storage-controls";
import {
  approvePendingDoctor,
  reapproveClinicDoctor,
  rejectPendingDoctor,
  removeClinicDoctor,
  updateClinicProfile,
  type PendingApproval
} from "@/lib/client/clinic-admin-api";
import { deleteAccount, updateDoctorProfile } from "@/lib/client/settings-api";
import { CLINIC_CODE_LENGTH, DEFAULT_SUMMARY_PROMPT } from "@bharatdoc/shared";
import { cn } from "@/lib/utils";
import type { LocalRecordingRepository } from "@/lib/client/local-recordings";

export interface SettingsDoctorProfile {
  id?: string;
  authUserId?: string;
  name: string;
  specialization: string;
  contact: string;
  role: "owner" | "doctor";
  customPrompt?: string | null;
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
  contact: string;
  role: "owner" | "doctor";
  recordingsCount: number;
  createdAt: string;
}

export interface SettingsRejectedDoctor extends SettingsActiveDoctor {
  accountStatus: "rejected";
}

interface SettingsScreenProps {
  doctor?: SettingsDoctorProfile;
  clinic?: SettingsClinicProfile;
  activeDoctors?: SettingsActiveDoctor[];
  rejectedDoctors?: SettingsRejectedDoctor[];
  pendingApprovals?: PendingApproval[];
  idToken?: string;
  fetcher?: typeof fetch;
  allowLocalDemoWrites?: boolean;
  demoMode?: boolean;
  onSignOut?: () => void | Promise<void>;
  localRepository?: LocalRecordingRepository;
}

const defaultDoctor: SettingsDoctorProfile = {
  id: "owner-aparna",
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  contact: "aparna@example.com",
  role: "owner",
  customPrompt: "Summarize {{transcript}} into a concise clinical note."
};

const defaultClinic: SettingsClinicProfile = {
  id: "demo-clinic",
  name: "Sunrise Hospital",
  code: "MED42X",
  address: "24 Baner Road, Pune 411045",
  activeDoctorsCount: 3
};

const defaultActiveDoctors: SettingsActiveDoctor[] = [
  {
    id: "owner-aparna",
    name: "Dr. Aparna Iyer",
    specialization: "General Physician",
    contact: "aparna@example.com",
    role: "owner",
    recordingsCount: 12,
    createdAt: "2026-04-23T06:40:00.000Z"
  },
  {
    id: "doctor-meera",
    name: "Dr. Meera Shah",
    specialization: "Pediatrician",
    contact: "meera@example.com",
    role: "doctor",
    recordingsCount: 4,
    createdAt: "2026-04-23T07:10:00.000Z"
  },
  {
    id: "doctor-leena",
    name: "Dr. Leena Joshi",
    specialization: "General Physician",
    contact: "leena@example.com",
    role: "doctor",
    recordingsCount: 7,
    createdAt: "2026-04-22T11:10:00.000Z"
  }
];

const defaultRejectedDoctors: SettingsRejectedDoctor[] = [
  {
    id: "doctor-removed",
    name: "Dr. Sameer Kulkarni",
    specialization: "General Physician",
    contact: "sameer@example.com",
    role: "doctor",
    recordingsCount: 2,
    createdAt: "2026-04-20T11:10:00.000Z",
    accountStatus: "rejected"
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
      phone: "meera@example.com",
      created_at: "2026-04-23T07:10:00.000Z"
    }
  }
];
const ClinicCodePattern = /^[A-Z0-9]+$/;

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
  doctor,
  clinic,
  activeDoctors,
  rejectedDoctors,
  pendingApprovals,
  idToken,
  fetcher = fetch,
  allowLocalDemoWrites = false,
  demoMode = false,
  onSignOut,
  localRepository
}: SettingsScreenProps) {
  const resolvedDoctor = doctor ?? (demoMode ? defaultDoctor : null);
  const resolvedClinic = clinic ?? (demoMode ? defaultClinic : null);
  const [doctorOverride, setDoctorOverride] = useState<Partial<SettingsDoctorProfile> | null>(null);
  const displayedDoctor = useMemo(
    () => (resolvedDoctor ? { ...resolvedDoctor, ...doctorOverride } : null),
    [doctorOverride, resolvedDoctor]
  );
  const resolvedActiveDoctors = activeDoctors ?? (demoMode ? defaultActiveDoctors : []);
  const resolvedRejectedDoctors = rejectedDoctors ?? (demoMode ? defaultRejectedDoctors : []);
  const resolvedPendingApprovals = pendingApprovals ?? (demoMode ? defaultPendingApprovals : []);
  const clinicForState = resolvedClinic ?? {
    id: "",
    name: "",
    code: "",
    address: null,
    activeDoctorsCount: 0
  };
  const [pending, setPending] = useState(resolvedPendingApprovals);
  const [clinicState, setClinicState] = useState(clinicForState);
  const [activeDoctorsState, setActiveDoctorsState] = useState(resolvedActiveDoctors);
  const [rejectedDoctorsState, setRejectedDoctorsState] = useState(resolvedRejectedDoctors);
  const [workingRequestId, setWorkingRequestId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: resolvedDoctor?.name ?? "",
    specialization: resolvedDoctor?.specialization ?? ""
  });
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingClinic, setSavingClinic] = useState(false);
  const [savingClinicCode, setSavingClinicCode] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<
    "active-doctors" | "rejected-doctors" | "clinic-profile" | "doctor-join-code" | null
  >(null);
  const [clinicForm, setClinicForm] = useState({
    name: clinicForState.name,
    address: clinicForState.address ?? ""
  });
  const [clinicCodeForm, setClinicCodeForm] = useState(clinicForState.code);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ownerReviewRef = useRef<HTMLElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isOwner = displayedDoctor?.role === "owner";
  const canManageClinic = Boolean(isOwner && resolvedClinic);
  const promptEdited = useMemo(() => {
    const customPrompt = displayedDoctor?.customPrompt?.trim();
    return Boolean(customPrompt && customPrompt !== DEFAULT_SUMMARY_PROMPT.trim());
  }, [displayedDoctor?.customPrompt]);

  if (!displayedDoctor) {
    return (
      <main className="relative mx-auto flex h-dvh w-full max-w-[430px] items-center justify-center bg-paper px-6 text-center text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
        <section className="rounded-[14px] border border-rule bg-paper-deep px-5 py-6">
          <h1 className="font-body text-base font-bold text-ink">Unable to load settings</h1>
          <p className="mt-2 font-body text-sm leading-6 text-ink-muted">Sign in again to view account settings.</p>
        </section>
      </main>
    );
  }

  function openProfileEditor() {
    if (!displayedDoctor) {
      return;
    }

    setProfileForm({
      name: displayedDoctor.name,
      specialization: displayedDoctor.specialization
    });
    setProfileMessage(null);
    setProfileError(null);
    setEditingProfile(true);
  }

  async function saveDoctorProfile() {
    if (!displayedDoctor) {
      return;
    }

    setProfileError(null);
    setProfileMessage(null);

    const normalizedName = profileForm.name.trim();
    const normalizedSpecialization = profileForm.specialization.trim();

    if (!normalizedName) {
      setProfileError("Doctor name is required.");
      return;
    }

    if (!normalizedSpecialization) {
      setProfileError("Specialization is required.");
      return;
    }

    setSavingProfile(true);

    try {
      if (!idToken && !allowLocalDemoWrites) {
        throw new Error("Authentication is required.");
      }

      const updatedDoctor = idToken
        ? await updateDoctorProfile(
            idToken,
            {
              name: normalizedName,
              specialization: normalizedSpecialization
            },
            fetcher
          )
        : {
            ...displayedDoctor,
            name: normalizedName,
            specialization: normalizedSpecialization
          };

      setDoctorOverride({
        name: updatedDoctor.name,
        specialization: updatedDoctor.specialization
      });
      if (updatedDoctor.id) {
        setActiveDoctorsState((current) =>
          current.map((member) =>
            member.id === updatedDoctor.id
              ? {
                  ...member,
                  name: updatedDoctor.name,
                  specialization: updatedDoctor.specialization
                }
              : member
          )
        );
      }
      setProfileForm({
        name: updatedDoctor.name,
        specialization: updatedDoctor.specialization
      });
      setProfileMessage("Profile saved.");
      setEditingProfile(false);
    } catch {
      setProfileError("Unable to save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

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
    const normalizedAddress = clinicForm.address.trim();

    if (!normalizedName) {
      setError("Hospital name is required.");
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
              address: normalizedAddress || null
            },
            fetcher
          )
        : {
            ...clinicState,
            name: normalizedName,
            address: normalizedAddress || null
          };
      setClinicState(updatedClinic);
      setClinicForm({
        name: updatedClinic.name,
        address: updatedClinic.address ?? ""
      });
      setMessage("Hospital profile saved.");
      setExpandedPanel(null);
    } catch {
      setError("Unable to save hospital profile.");
    } finally {
      setSavingClinic(false);
    }
  }

  async function saveClinicCode() {
    setError(null);
    setMessage(null);

    const normalizedCode = clinicCodeForm.trim().toUpperCase();

    if (normalizedCode.length !== CLINIC_CODE_LENGTH || !ClinicCodePattern.test(normalizedCode)) {
      setError(`Doctor join code must be exactly ${CLINIC_CODE_LENGTH} letters or numbers.`);
      return;
    }

    setSavingClinicCode(true);

    try {
      if (!idToken && !allowLocalDemoWrites) {
        throw new Error("Authentication is required.");
      }

      const updatedClinic = idToken
        ? await updateClinicProfile(idToken, { code: normalizedCode }, fetcher)
        : {
            ...clinicState,
            code: normalizedCode
          };

      setClinicState(updatedClinic);
      setClinicCodeForm(updatedClinic.code);
      setMessage("Doctor join code saved.");
      setExpandedPanel(null);
    } catch {
      setError("Unable to save doctor join code.");
    } finally {
      setSavingClinicCode(false);
    }
  }

  async function removeDoctor(member: SettingsActiveDoctor) {
    setWorkingRequestId(member.id);
    setError(null);
    setMessage(null);

    try {
      if (!idToken && !allowLocalDemoWrites) {
        throw new Error("Authentication is required.");
      }

      if (idToken) {
        await removeClinicDoctor(idToken, member.id, fetcher);
      }

      setActiveDoctorsState((current) => current.filter((item) => item.id !== member.id));
      setRejectedDoctorsState((current) => [
        { ...member, accountStatus: "rejected" },
        ...current.filter((item) => item.id !== member.id)
      ]);
      setMessage(`${member.name} removed from hospital.`);
    } catch {
      setError(`Unable to remove ${member.name}.`);
    } finally {
      setWorkingRequestId(null);
    }
  }

  async function reapproveDoctor(member: SettingsRejectedDoctor) {
    setWorkingRequestId(member.id);
    setError(null);
    setMessage(null);

    try {
      if (!idToken && !allowLocalDemoWrites) {
        throw new Error("Authentication is required.");
      }

      if (idToken) {
        await reapproveClinicDoctor(idToken, member.id, fetcher);
      }

      const activeMember: SettingsActiveDoctor = {
        id: member.id,
        name: member.name,
        specialization: member.specialization,
        contact: member.contact,
        role: member.role,
        recordingsCount: member.recordingsCount,
        createdAt: member.createdAt
      };
      setRejectedDoctorsState((current) => current.filter((item) => item.id !== member.id));
      setActiveDoctorsState((current) => [...current, activeMember]);
      setMessage(`${member.name} re-approved.`);
    } catch {
      setError(`Unable to re-approve ${member.name}.`);
    } finally {
      setWorkingRequestId(null);
    }
  }

  function togglePanel(panel: "active-doctors" | "rejected-doctors" | "clinic-profile" | "doctor-join-code") {
    setMessage(null);
    setError(null);
    setExpandedPanel((current) => (current === panel ? null : panel));
  }

  function scrollToPendingApprovals() {
    setMessage(null);
    setError(null);
    const container = scrollContainerRef.current;
    const target = ownerReviewRef.current;

    if (container && target) {
      const targetTop = target.getBoundingClientRect().top;
      const containerTop = container.getBoundingClientRect().top;
      container.scrollTop += targetTop - containerTop;
    }
  }

  async function handleSignOut() {
    if (!onSignOut || signingOut) {
      return;
    }

    setSigningOut(true);
    setError(null);
    setMessage(null);

    try {
      await onSignOut();
    } catch {
      setError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  async function handleDeleteAccount() {
    if (!idToken || deletingAccount) return;
    if (!window.confirm("Delete your BharatDoc account and every consultation you own? This cannot be undone.")) return;
    if (!window.confirm("Final confirmation: permanently delete account data and stored files?")) return;
    setDeletingAccount(true);
    setDeletionStatus("Deletion in progress…");
    try {
      const result = await deleteAccount(idToken, fetcher);
      if (result.deletion.state !== "completed") {
        setDeletionStatus("Deletion cleanup is queued. Retry this action to continue safely.");
        return;
      }
      setDeletionStatus("Account deletion completed.");
      await onSignOut?.();
    } catch {
      setDeletionStatus(isOwner
        ? "Unable to delete. Hospital owners must transfer ownership before deleting an account with other members."
        : "Unable to delete account. No data was silently discarded; retry from this device.");
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <section className="paper-bg flex min-h-0 flex-1 flex-col">
        <header className="px-5 pb-4 pt-5">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta">Account</p>
          <h1 className="mt-1 font-display text-[34px] italic leading-none tracking-normal text-ink">Settings</h1>
        </header>

        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
          <button
            className="mb-4 flex w-full items-center gap-3 rounded-[14px] border border-rule bg-paper p-4 text-left shadow-[0_1px_0_#E5DAC5] transition active:scale-[0.99]"
            type="button"
            aria-label="Edit doctor profile"
            onClick={openProfileEditor}
          >
            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-terracotta font-display text-[26px] text-white">
              {initialForName(displayedDoctor.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-body text-[15px] font-bold leading-tight text-ink">{displayedDoctor.name}</h2>
              <p className="mt-0.5 font-body text-xs text-ink-muted">{displayedDoctor.specialization}</p>
              <p className="mt-0.5 truncate font-body text-[11px] text-ink-faint">{displayedDoctor.contact}</p>
            </div>
            <Edit3 className="h-[18px] w-[18px] shrink-0 text-ink-soft" />
          </button>

          {editingProfile ? (
            <section className="mb-5 rounded-[14px] border border-rule bg-paper px-4 py-4 shadow-[0_1px_0_#E5DAC5]">
              <div className="mb-4">
                <h2 className="font-body text-sm font-bold text-ink">Doctor profile</h2>
                <p className="mt-1 font-body text-[11.5px] leading-relaxed text-ink-muted">
                  Update the name and specialization shown on records and PDFs.
                </p>
              </div>

              <div className="grid gap-3">
                <label className="block">
                  <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                    Doctor name
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-xl border border-rule bg-paper-deep px-3 font-body text-sm text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
                    value={profileForm.name}
                    onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                    aria-label="Doctor name"
                  />
                </label>

                <SpecializationField
                  value={profileForm.specialization}
                  onChange={(value) => setProfileForm((current) => ({ ...current, specialization: value }))}
                />
              </div>

              {profileError ? <p className="mt-3 font-body text-xs font-semibold text-stamp">{profileError}</p> : null}

              <div className="mt-4 flex gap-2">
                <BharatButton className="flex-1" disabled={savingProfile} onClick={saveDoctorProfile}>
                  Save profile
                </BharatButton>
                <BharatButton
                  className="flex-1"
                  variant="ghost"
                  onClick={() => {
                    setProfileForm({
                      name: displayedDoctor.name,
                      specialization: displayedDoctor.specialization
                    });
                    setEditingProfile(false);
                    setProfileError(null);
                  }}
                >
                  Cancel
                </BharatButton>
              </div>
            </section>
          ) : null}

          {profileMessage ? <p className="mb-4 ml-1 font-body text-xs font-semibold text-sage">{profileMessage}</p> : null}
          {!editingProfile && profileError ? <p className="mb-4 ml-1 font-body text-xs font-semibold text-stamp">{profileError}</p> : null}

          {canManageClinic ? (
            <SettingsGroup title="Hospital admin">
              <SettingsRow
                title="Pending approvals"
                subtitle={pendingSubtitle(pending.length)}
                badge={pending.length}
                accent={pending.length > 0}
                icon={<ShieldCheck className="h-4 w-4" />}
                onClick={scrollToPendingApprovals}
              />
              <SettingsRow
                title="Active doctors"
                subtitle={`${activeDoctorsState.length} members`}
                icon={<UserRound className="h-4 w-4" />}
                onClick={() => togglePanel("active-doctors")}
                expanded={expandedPanel === "active-doctors"}
              />
              <SettingsRow
                title="Removed doctors"
                subtitle={`${rejectedDoctorsState.length} in audit history`}
                icon={<UserRound className="h-4 w-4" />}
                onClick={() => togglePanel("rejected-doctors")}
                expanded={expandedPanel === "rejected-doctors"}
              />
              <SettingsRow
                title="Hospital profile"
                subtitle={<span>{clinicState.name || "Not configured"}</span>}
                icon={<ClipboardList className="h-4 w-4" />}
                onClick={() => togglePanel("clinic-profile")}
                expanded={expandedPanel === "clinic-profile"}
              />
              <SettingsRow
                title="Doctor join code"
                subtitle={
                  <span>
                    <span className="font-mono">{clinicState.code}</span>
                    <span className="font-body"> · Share with doctors to join</span>
                  </span>
                }
                icon={<Clipboard className="h-4 w-4" />}
                onClick={() => togglePanel("doctor-join-code")}
                expanded={expandedPanel === "doctor-join-code"}
              />
            </SettingsGroup>
          ) : null}

          {canManageClinic && expandedPanel === "doctor-join-code" ? (
            <section className="mb-5 rounded-[14px] border border-rule bg-paper px-4 py-4 shadow-[0_1px_0_#E5DAC5]">
              <div className="mb-4">
                <h2 className="font-body text-sm font-bold text-ink">Doctor join code</h2>
                <p className="mt-1 font-body text-[11.5px] leading-relaxed text-ink-muted">
                  Doctors use this code to request access to the hospital workspace.
                </p>
              </div>

              <label className="block">
                <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                  Join code
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-xl border border-rule bg-paper-deep px-3 font-mono text-sm uppercase tracking-[0.14em] text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
                  value={clinicCodeForm}
                  maxLength={CLINIC_CODE_LENGTH}
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(event) => setClinicCodeForm(event.target.value.toUpperCase())}
                  aria-label="Doctor join code"
                />
              </label>
              <p className="mt-2 font-body text-[11px] text-ink-muted">
                Use exactly {CLINIC_CODE_LENGTH} letters or numbers.
              </p>

              <div className="mt-4 flex gap-2">
                <BharatButton className="flex-1" disabled={savingClinicCode} onClick={saveClinicCode}>
                  Save code
                </BharatButton>
                <BharatButton
                  className="flex-1"
                  variant="ghost"
                  onClick={() => {
                    setClinicCodeForm(clinicState.code);
                    setExpandedPanel(null);
                    setError(null);
                  }}
                >
                  Cancel
                </BharatButton>
              </div>
            </section>
          ) : null}

          {canManageClinic && expandedPanel === "active-doctors" ? (
            <section className="mb-5 rounded-[14px] border border-rule bg-paper px-4 py-3 shadow-[0_1px_0_#E5DAC5]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-body text-sm font-bold text-ink">Active doctors</h2>
                  <p className="mt-0.5 font-body text-[11.5px] text-ink-muted">
                    Current hospital members with active BharatDoc access.
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
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="min-w-0 truncate font-body text-sm font-bold text-ink">{member.name}</h3>
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
                      <p className="mt-1 truncate font-body text-[11px] text-ink-faint">{member.contact}</p>
                      <p className="mt-1 font-body text-[11px] text-ink-soft">
                        Joined {requestedLabel(member.createdAt)} · {member.recordingsCount} recordings
                      </p>
                      {member.role !== "owner" ? (
                        <button
                          className="mt-2 inline-flex min-h-11 items-center font-body text-[11px] font-bold text-stamp underline-offset-2 hover:underline disabled:opacity-60"
                          type="button"
                          disabled={workingRequestId === member.id}
                          onClick={() => void removeDoctor(member)}
                        >
                          Remove from hospital
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {canManageClinic && expandedPanel === "rejected-doctors" ? (
            <section className="mb-5 rounded-[14px] border border-rule bg-paper px-4 py-3 shadow-[0_1px_0_#E5DAC5]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-body text-sm font-bold text-ink">Removed doctors</h2>
                  <p className="mt-0.5 font-body text-[11.5px] text-ink-muted">
                    Rejected or removed doctors kept for owner audit.
                  </p>
                </div>
                <span className="rounded-full bg-paper-deep px-2 py-1 font-body text-[11px] font-bold text-ink-soft">
                  {rejectedDoctorsState.length}
                </span>
              </div>
              {rejectedDoctorsState.length === 0 ? (
                <div className="rounded-lg border border-dashed border-rule bg-paper-deep px-3 py-5 text-center font-body text-xs text-ink-muted">
                  No removed doctors.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {rejectedDoctorsState.map((member) => (
                    <article key={member.id} className="flex items-start gap-3 rounded-[12px] border border-rule bg-paper-deep px-3 py-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper font-display text-lg text-ink-soft">
                        {initialForName(member.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-body text-sm font-bold text-ink">{member.name}</h3>
                        <p className="mt-1 font-body text-xs text-ink-muted">{member.specialization}</p>
                        <p className="mt-1 truncate font-body text-[11px] text-ink-faint">{member.contact}</p>
                        <p className="mt-1 font-body text-[11px] text-ink-soft">
                          {member.recordingsCount} recordings · removed
                        </p>
                        <button
                          className="mt-2 inline-flex min-h-11 items-center font-body text-[11px] font-bold text-sage underline-offset-2 hover:underline disabled:opacity-60"
                          type="button"
                          disabled={workingRequestId === member.id}
                          onClick={() => void reapproveDoctor(member)}
                        >
                          Re-approve
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {canManageClinic && expandedPanel === "clinic-profile" ? (
            <section className="mb-5 rounded-[14px] border border-rule bg-paper px-4 py-4 shadow-[0_1px_0_#E5DAC5]">
              <div className="mb-4">
                <h2 className="font-body text-sm font-bold text-ink">Hospital profile</h2>
                <p className="mt-1 font-body text-[11.5px] leading-relaxed text-ink-muted">
                  Update the hospital name and address shown on records and PDFs.
                </p>
              </div>

              <div className="grid gap-3">
                <label className="block">
                  <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                    Hospital name
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-xl border border-rule bg-paper-deep px-3 font-body text-sm text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
                    value={clinicForm.name}
                    onChange={(event) => setClinicForm((current) => ({ ...current, name: event.target.value }))}
                    aria-label="Hospital name"
                  />
                </label>

                <label className="block">
                  <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                    Hospital address
                  </span>
                  <textarea
                    className="mt-2 min-h-24 w-full resize-none rounded-xl border border-rule bg-paper-deep px-3 py-3 font-body text-sm text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
                    value={clinicForm.address}
                    onChange={(event) => setClinicForm((current) => ({ ...current, address: event.target.value }))}
                    aria-label="Hospital address"
                  />
                </label>
              </div>

              <div className="mt-4 flex gap-2">
                <BharatButton className="flex-1" disabled={savingClinic} onClick={saveClinic}>
                  Save hospital
                </BharatButton>
                <BharatButton
                  className="flex-1"
                  variant="ghost"
                  onClick={() => {
                    setClinicForm({
                      name: clinicState.name,
                      address: clinicState.address ?? ""
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
                promptEdited ? (
                  <span className="rounded bg-saffron/15 px-1.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.1em] text-ochre">
                    Edited
                  </span>
                ) : null
              }
              icon={<Sparkles className="h-4 w-4" />}
            />
          </SettingsGroup>

          {displayedDoctor.id && displayedDoctor.authUserId && resolvedClinic ? (
            <DeviceStorageControls
              scope={{ authUserId: displayedDoctor.authUserId, doctorId: displayedDoctor.id, clinicId: resolvedClinic.id }}
              {...(localRepository ? { repository: localRepository } : {})}
            />
          ) : null}

          {canManageClinic ? (
            <section ref={ownerReviewRef} className="mb-5">
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
            <SettingsRow title="Help & support" subtitle="FAQs and support details" href="/help-center" />
            <SettingsRow title="Terms and privacy" subtitle="Terms of use and privacy policy" href="/terms-privacy" />
            <SettingsRow title="Version" subtitle="v0.9.1 · MVP" />
          </SettingsGroup>

          <SettingsGroup title="Account">
            <SettingsRow title={signingOut ? "Signing out..." : "Sign out"} danger onClick={handleSignOut} disabled={signingOut} />
            {idToken ? (
              <SettingsRow title={deletingAccount ? "Deleting account…" : "Delete account"} subtitle={deletionStatus ?? "Permanently delete owned consultations and account data"} danger onClick={handleDeleteAccount} disabled={deletingAccount} />
            ) : null}
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
  expanded = false,
  disabled = false
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
  disabled?: boolean;
}) {
  const className = cn(
    "flex w-full items-center gap-3 border-b border-rule px-4 py-3.5 text-left last:border-b-0",
    accent ? "bg-terracotta/5" : "bg-transparent",
    href || onClick ? "transition active:scale-[0.99]" : "cursor-default"
  );
  const isInteractive = Boolean((href || onClick) && !disabled);
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
      {!danger && isInteractive ? (
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

  if (onClick || disabled) {
    return (
      <button className={className} type="button" onClick={onClick} disabled={disabled || !onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
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
  const contact = request.doctor.phone;

  return (
    <article className="rounded-xl border border-rule bg-paper px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep font-display text-[22px] italic text-ink-soft">
          {initialForName(request.doctor.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-body text-sm font-bold text-ink">{request.doctor.name}</h3>
          <p className="mt-0.5 truncate font-body text-xs text-ink-muted">{request.doctor.specialization}</p>
          <p className="mt-0.5 truncate font-body text-[11px] text-ink-faint">
            {contact} · requested {requestedLabel(request.requested_at)}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_1.35fr] gap-2">
        <BharatButton
          className="min-h-11 border-stamp/30 py-2 text-stamp"
          variant="ghost"
          icon={<X className="h-4 w-4" />}
          disabled={working}
          onClick={onReject}
        >
          Reject
        </BharatButton>
        <BharatButton
          className="min-h-11 bg-sage py-2 text-white shadow-[0_4px_12px_rgba(95,122,82,0.25)]"
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
