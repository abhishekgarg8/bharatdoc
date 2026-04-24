"use client";

import { useMemo, useState } from "react";
import { Building2, Check, FileText, Loader2, Plus } from "lucide-react";
import { normalizeEmail, type RegistrationInput } from "@bharatdoc/shared";
import { BharatButton } from "@/components/bharat-button";
import { LogoMark } from "@/components/onboarding/logo-mark";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { createSupabaseAuthClient, authErrorMessage, type AuthClient } from "@/lib/client/auth-client";
import { destinationForRegistration, lookupClinic, registerAccount, type ClinicLookupResponse } from "@/lib/client/onboarding-api";
import { destinationForDoctorStatus, fetchCurrentDoctor } from "@/lib/client/session";

type OnboardingStep = "credentials" | "profile" | "clinic";
type AuthMode = "signup" | "login";
type ClinicMode = "join_clinic" | "create_clinic";

interface OnboardingScreenProps {
  authClient?: AuthClient;
  onNavigate?: (href: string) => void;
  demoMode?: boolean;
}

function createDemoAuthClient(): AuthClient {
  return {
    async signUpWithPassword(): Promise<string> {
      return "demo-id-token";
    },
    async signInWithPassword(): Promise<string> {
      return "demo-id-token";
    },
    async getCurrentIdToken(): Promise<string | null> {
      return "demo-id-token";
    },
    async signOut(): Promise<void> {
      return undefined;
    }
  };
}

const demoDefaults = {
  email: "aparna@example.com",
  password: "bharatdoc123",
  profile: {
    name: "Dr. Aparna Iyer",
    specialization: "General Physician",
    medicalRegNo: ""
  },
  clinicCode: "MED42X",
  clinic: {
    name: "Sunrise Clinic",
    address: "24 Baner Road, Pune 411045"
  }
};

export function OnboardingScreen({ authClient, onNavigate, demoMode = false }: OnboardingScreenProps) {
  const auth = useMemo(() => authClient ?? (demoMode ? createDemoAuthClient() : createSupabaseAuthClient()), [demoMode, authClient]);
  const navigate = onNavigate ?? ((href: string) => window.location.assign(href));
  const [step, setStep] = useState<OnboardingStep>("credentials");
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(demoMode ? demoDefaults.email : "");
  const [password, setPassword] = useState(demoMode ? demoDefaults.password : "");
  const [idToken, setIdToken] = useState<string | null>(null);
  const [profile, setProfile] = useState(demoMode ? demoDefaults.profile : { name: "", specialization: "", medicalRegNo: "" });
  const [clinicMode, setClinicMode] = useState<ClinicMode>("join_clinic");
  const [clinicCode, setClinicCode] = useState(demoMode ? demoDefaults.clinicCode : "");
  const [clinicLookup, setClinicLookup] = useState<ClinicLookupResponse | null>(null);
  const [clinic, setClinic] = useState(demoMode ? demoDefaults.clinic : { name: "", address: "" });

  async function handleCredentials() {
    setIsBusy(true);
    setError(null);

    try {
      const credentials = {
        email: normalizeEmail(email),
        password
      };
      const token =
        authMode === "signup" ? await auth.signUpWithPassword(credentials) : await auth.signInWithPassword(credentials);

      setEmail(credentials.email);
      setIdToken(token);

      if (demoMode || authMode === "signup") {
        setStep("profile");
        return;
      }

      try {
        const me = await fetchCurrentDoctor(token);
        navigate(destinationForDoctorStatus(me.doctor.account_status));
      } catch {
        setStep("profile");
      }
    } catch (authError) {
      setError(authErrorMessage(authError));
    } finally {
      setIsBusy(false);
    }
  }

  function handleAuthModeChange(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setError(null);
  }

  function handleProfileContinue() {
    if (!idToken) {
      setError("Create an account or sign in before registration.");
      setStep("credentials");
      return;
    }

    setError(null);
    setStep("clinic");
  }

  async function handleLookupClinic() {
    setIsBusy(true);
    setError(null);

    try {
      setClinicLookup(
        demoMode
          ? {
              clinic_id: "demo-clinic",
              clinic_name: "Sunrise Clinic",
              clinic_address: "24 Baner Road, Pune"
            }
          : await lookupClinic(clinicCode)
      );
    } catch (lookupError) {
      setClinicLookup(null);
      setError(lookupError instanceof Error ? lookupError.message : "Clinic lookup failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRegister() {
    if (!idToken) {
      setError("Create an account or sign in before registration.");
      return;
    }

    setIsBusy(true);
    setError(null);

    const input: RegistrationInput =
      clinicMode === "join_clinic"
        ? {
            mode: "join_clinic",
            profile: {
              name: profile.name,
              specialization: profile.specialization,
              medical_reg_no: profile.medicalRegNo || undefined
            },
            clinic_code: clinicCode.toUpperCase()
          }
        : {
            mode: "create_clinic",
            profile: {
              name: profile.name,
              specialization: profile.specialization,
              medical_reg_no: profile.medicalRegNo || undefined
            },
            clinic: {
              name: clinic.name,
              address: clinic.address || undefined
            }
          };

    try {
      if (demoMode) {
        navigate(clinicMode === "join_clinic" ? "/pending-approval" : "/dashboard?demo=1");
      } else {
        const result = await registerAccount(idToken, input);
        navigate(destinationForRegistration(result));
      }
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Registration failed.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <OnboardingShell>
      <section className="flex flex-1 flex-col px-7 py-10">
        <LogoMark />

        <div className="mt-10">
          <h1 className="font-display text-[40px] italic leading-none tracking-normal text-ink">Welcome to BharatDoc</h1>
          <p className="mt-3 max-w-[320px] font-body text-sm leading-6 text-ink-muted">
            Record consultations. Get AI-drafted clinical summaries. Save to PDF in one tap.
          </p>
        </div>

        <StepIndicator step={step} />
        {error ? <div className="mt-4 rounded-lg border border-stamp/20 bg-stamp/10 px-3 py-2 font-body text-xs text-stamp">{error}</div> : null}

        {step === "credentials" ? (
          <Panel title={authMode === "signup" ? "Create login" : "Sign in"}>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <ModeButton active={authMode === "signup"} onClick={() => handleAuthModeChange("signup")}>
                Sign up
              </ModeButton>
              <ModeButton active={authMode === "login"} onClick={() => handleAuthModeChange("login")}>
                Log in
              </ModeButton>
            </div>
            <label className="mb-1.5 block font-body text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              Email
            </label>
            <input
              className="w-full rounded-[10px] border-[1.5px] border-terracotta bg-paper px-4 py-3 font-body text-base font-semibold text-ink outline-none"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              aria-label="Email"
            />
            <label className="mb-1.5 mt-4 block font-body text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              Password
            </label>
            <input
              className="w-full rounded-[10px] border border-rule bg-paper-deep px-4 py-3 font-body text-sm font-semibold text-ink outline-none"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              aria-label="Password"
            />
            <p className="mt-2 font-body text-[11px] text-ink-muted">Use at least 8 characters.</p>
            <BharatButton className="mt-5 w-full" onClick={handleCredentials} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {authMode === "signup" ? "Create account" : "Log in"}
            </BharatButton>
          </Panel>
        ) : null}

        {step === "profile" ? (
          <Panel title="Profile details" icon={<FileText className="h-4 w-4 text-terracotta" />}>
            <TextField label="Full name" value={profile.name} onChange={(value) => setProfile((current) => ({ ...current, name: value }))} />
            <TextField
              label="Specialization"
              value={profile.specialization}
              onChange={(value) => setProfile((current) => ({ ...current, specialization: value }))}
            />
            <TextField
              label="Medical registration no."
              value={profile.medicalRegNo}
              placeholder="Optional"
              onChange={(value) => setProfile((current) => ({ ...current, medicalRegNo: value }))}
            />
            <BharatButton className="mt-3 w-full" onClick={handleProfileContinue}>
              Continue
            </BharatButton>
          </Panel>
        ) : null}

        {step === "clinic" ? (
          <Panel title="Your clinic" icon={<Building2 className="h-4 w-4 text-terracotta" />}>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <ModeButton active={clinicMode === "join_clinic"} onClick={() => setClinicMode("join_clinic")}>
                Join clinic
              </ModeButton>
              <ModeButton active={clinicMode === "create_clinic"} onClick={() => setClinicMode("create_clinic")}>
                Create clinic
              </ModeButton>
            </div>

            {clinicMode === "join_clinic" ? (
              <div>
                <TextField label="Clinic code" value={clinicCode} onChange={(value) => setClinicCode(value.toUpperCase())} mono />
                <BharatButton variant="ghost" className="mt-1 w-full" onClick={handleLookupClinic} disabled={isBusy}>
                  Check clinic code
                </BharatButton>
                {clinicLookup ? (
                  <div className="mt-3 rounded-lg border border-rule bg-paper-deep px-3 py-2">
                    <div className="flex items-center gap-1.5 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-sage">
                      <Check className="h-3 w-3" />
                      Clinic found
                    </div>
                    <div className="mt-1 font-display text-[22px] italic leading-none text-ink">{clinicLookup.clinic_name}</div>
                    <div className="mt-1 font-body text-[11px] text-ink-muted">{clinicLookup.clinic_address ?? "Address not added"}</div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <TextField label="Clinic name" value={clinic.name} onChange={(value) => setClinic((current) => ({ ...current, name: value }))} />
                <TextField
                  label="Address"
                  value={clinic.address}
                  onChange={(value) => setClinic((current) => ({ ...current, address: value }))}
                  placeholder="Optional"
                />
                <div className="mt-2 flex items-center gap-3 rounded-[14px] border border-rule bg-paper-deep p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-rule bg-paper text-ink-soft">
                    <Plus className="h-[18px] w-[18px]" />
                  </span>
                  <div className="font-body text-[11.5px] leading-5 text-ink-muted">
                    You will become the owner and can approve other doctors.
                  </div>
                </div>
              </div>
            )}

            <BharatButton className="mt-5 w-full" onClick={handleRegister} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {clinicMode === "join_clinic" ? "Request to join" : "Create clinic & continue"}
            </BharatButton>
          </Panel>
        ) : null}
      </section>
    </OnboardingShell>
  );
}

function StepIndicator({ step }: { step: OnboardingStep }) {
  const current = ["credentials", "profile", "clinic"].indexOf(step) + 1;

  return (
    <div className="mt-8 flex items-center gap-2">
      {[1, 2, 3].map((item) => (
        <div key={item} className={item <= current ? "h-1.5 flex-1 rounded-full bg-terracotta" : "h-1.5 flex-1 rounded-full bg-rule"} />
      ))}
    </div>
  );
}

function Panel({ children, title, icon }: { children: React.ReactNode; title: string; icon?: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-[14px] border border-rule bg-paper p-4">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="font-body text-sm font-bold text-ink">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block font-body text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</span>
      <input
        className={mono ? "w-full rounded-[10px] border border-rule bg-paper-deep px-3 py-2 font-mono text-sm font-bold uppercase tracking-[0.12em] text-ink outline-none" : "w-full rounded-[10px] border border-rule bg-paper-deep px-3 py-2 font-body text-sm font-semibold text-ink outline-none"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function ModeButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className={
        active
          ? "rounded-xl border-[1.5px] border-terracotta bg-terracotta/10 px-3 py-2 font-body text-xs font-bold text-terracotta"
          : "rounded-xl border border-rule bg-paper-deep px-3 py-2 font-body text-xs font-bold text-ink-muted"
      }
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
