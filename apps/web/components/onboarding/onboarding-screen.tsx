"use client";

import { useMemo, useState } from "react";
import { Building2, Check, Eye, EyeOff, FileText, Loader2, Plus } from "lucide-react";
import { normalizeEmail, type RegistrationInput } from "@bharatdoc/shared";
import { BharatButton } from "@/components/bharat-button";
import { LogoMark } from "@/components/onboarding/logo-mark";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { createSupabaseAuthClient, authErrorMessage, type AuthClient } from "@/lib/client/auth-client";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import { destinationForRegistration, lookupClinic, registerAccount, type ClinicLookupResponse } from "@/lib/client/onboarding-api";
import { destinationForDoctorStatus, fetchCurrentDoctor } from "@/lib/client/session";

type OnboardingStep = "credentials" | "profile" | "hospital";
type AuthMode = "signup" | "login";
type HospitalMode = "join_hospital" | "create_hospital";

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
    async resetPasswordForEmail(): Promise<void> {
      return undefined;
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
    specialization: "General Physician"
  },
  clinicCode: "MED42X",
  hospitalId: "demo-hospital",
  hospital: {
    name: "Sunrise Hospital",
    address: "24 Baner Road, Pune 411045"
  }
};

const demoClinicLookup: ClinicLookupResponse = {
  clinic_id: demoDefaults.hospitalId,
  clinic_name: demoDefaults.hospital.name,
  clinic_address: demoDefaults.hospital.address
};

export function OnboardingScreen({ authClient, onNavigate, demoMode = false }: OnboardingScreenProps) {
  const queryDemoMode = useExplicitDemoMode();
  const effectiveDemoMode = demoMode || queryDemoMode;
  const auth = useMemo(
    () => authClient ?? (effectiveDemoMode ? createDemoAuthClient() : createSupabaseAuthClient()),
    [effectiveDemoMode, authClient]
  );
  const navigate = onNavigate ?? ((href: string) => window.location.assign(href));
  const [step, setStep] = useState<OnboardingStep>("credentials");
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(effectiveDemoMode ? demoDefaults.email : "");
  const [password, setPassword] = useState(effectiveDemoMode ? demoDefaults.password : "");
  const [idToken, setIdToken] = useState<string | null>(null);
  const [profile, setProfile] = useState(effectiveDemoMode ? demoDefaults.profile : { name: "", specialization: "" });
  const [hospitalMode, setHospitalMode] = useState<HospitalMode>("join_hospital");
  const [clinicCode, setClinicCode] = useState(effectiveDemoMode ? demoDefaults.clinicCode : "");
  const [clinicLookupResult, setClinicLookupResult] = useState<ClinicLookupResponse | null>(
    effectiveDemoMode ? demoClinicLookup : null
  );
  const [isLookingUpClinic, setIsLookingUpClinic] = useState(false);
  const [hospital, setHospital] = useState(effectiveDemoMode ? demoDefaults.hospital : { name: "", address: "" });

  async function handleCredentials() {
    setIsBusy(true);
    setError(null);
    setResetMessage(null);

    try {
      const credentials = {
        email: normalizeEmail(email),
        password
      };
      const token =
        authMode === "signup" ? await auth.signUpWithPassword(credentials) : await auth.signInWithPassword(credentials);

      setEmail(credentials.email);
      setIdToken(token);

      if (effectiveDemoMode || authMode === "signup") {
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
    setResetMessage(null);
  }

  async function handleForgotPassword() {
    setError(null);
    setResetMessage(null);

    if (!email.trim()) {
      setError("Enter your email to reset your password.");
      return;
    }

    let normalizedEmail: string;

    try {
      normalizedEmail = normalizeEmail(email);
    } catch {
      setError("Enter a valid email to reset your password.");
      return;
    }

    if (!auth.resetPasswordForEmail) {
      setError("Password reset is unavailable. Try again later.");
      return;
    }

    setIsResettingPassword(true);

    try {
      await auth.resetPasswordForEmail(normalizedEmail);
      setEmail(normalizedEmail);
      setResetMessage("Check your email for a reset link.");
    } catch (resetError) {
      setError(authErrorMessage(resetError));
    } finally {
      setIsResettingPassword(false);
    }
  }

  function handleProfileContinue() {
    if (!idToken) {
      setError("Create an account or sign in before registration.");
      setStep("credentials");
      return;
    }

    setError(null);
    setStep("hospital");
  }

  async function handleClinicLookup(): Promise<ClinicLookupResponse | null> {
    const normalizedCode = clinicCode.trim().toUpperCase();

    setClinicCode(normalizedCode);
    setClinicLookupResult(null);
    setError(null);

    if (normalizedCode.length !== 6) {
      setError("Enter the 6-character Clinic Code shared by your hospital owner.");
      return null;
    }

    if (effectiveDemoMode) {
      setClinicLookupResult(demoClinicLookup);
      return demoClinicLookup;
    }

    setIsLookingUpClinic(true);

    try {
      const result = await lookupClinic(normalizedCode);
      setClinicLookupResult(result);
      return result;
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Hospital code was not found.");
      return null;
    } finally {
      setIsLookingUpClinic(false);
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
      hospitalMode === "join_hospital"
        ? {
            mode: "join_clinic",
            profile: {
              name: profile.name,
              specialization: profile.specialization
            },
            clinic_code: clinicCode.trim().toUpperCase()
          }
        : {
            mode: "create_hospital",
            profile: {
              name: profile.name,
              specialization: profile.specialization
            },
            hospital: {
              name: hospital.name,
              address: hospital.address || undefined
            }
          };

    try {
      if (effectiveDemoMode) {
        navigate(hospitalMode === "join_hospital" ? "/pending-approval?demo=1" : "/dashboard?demo=1");
      } else {
        if (hospitalMode === "join_hospital" && !clinicLookupResult) {
          const lookupResult = await handleClinicLookup();

          if (!lookupResult) {
            return;
          }
        }

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
        {error ? (
          <div className="mt-4 rounded-lg border border-stamp/20 bg-stamp/10 px-3 py-2 font-body text-xs text-stamp" role="alert">
            {error}
          </div>
        ) : null}
        {resetMessage ? (
          <div className="mt-4 rounded-lg border border-sage/25 bg-sage/10 px-3 py-2 font-body text-xs text-sage" role="status">
            {resetMessage}
          </div>
        ) : null}

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
              className="w-full rounded-[10px] border border-rule bg-paper px-4 py-3 font-body text-base font-semibold text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setResetMessage(null);
              }}
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              aria-label="Email"
            />
            <label className="mb-1.5 mt-4 block font-body text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              Password
            </label>
            <div className="relative">
              <input
                className="w-full rounded-[10px] border border-rule bg-paper-deep px-4 py-3 pr-12 font-body text-sm font-semibold text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                aria-label="Password"
              />
              <button
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {authMode === "signup" ? (
              <p className="mt-2 font-body text-[11px] text-ink-muted">Use at least 8 characters.</p>
            ) : (
              <button
                className="mt-2 font-body text-[11px] font-bold text-terracotta underline-offset-2 hover:underline disabled:opacity-60"
                type="button"
                onClick={handleForgotPassword}
                disabled={isResettingPassword}
              >
                {isResettingPassword ? "Sending reset link..." : "Forgot password?"}
              </button>
            )}
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
            <BharatButton className="mt-3 w-full" onClick={handleProfileContinue}>
              Continue
            </BharatButton>
          </Panel>
        ) : null}

        {step === "hospital" ? (
          <Panel title="Your hospital" icon={<Building2 className="h-4 w-4 text-terracotta" />}>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <ModeButton active={hospitalMode === "join_hospital"} onClick={() => setHospitalMode("join_hospital")}>
                Join hospital
              </ModeButton>
              <ModeButton active={hospitalMode === "create_hospital"} onClick={() => setHospitalMode("create_hospital")}>
                Create hospital
              </ModeButton>
            </div>

            {hospitalMode === "join_hospital" ? (
              <div>
                <label className="mb-3 block">
                  <span className="mb-1 block font-body text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                    Clinic Code
                  </span>
                  <input
                    className="w-full rounded-[10px] border border-rule bg-paper-deep px-3 py-2 font-mono text-sm font-bold uppercase tracking-[0.12em] text-ink outline-none"
                    value={clinicCode}
                    onChange={(event) => {
                      setClinicCode(event.target.value.toUpperCase());
                      setClinicLookupResult(null);
                    }}
                    maxLength={6}
                    autoCapitalize="characters"
                    aria-label="Clinic Code"
                    placeholder="MED42X"
                    disabled={isBusy || isLookingUpClinic}
                  />
                </label>
                <BharatButton
                  className="w-full"
                  variant="ghost"
                  onClick={() => void handleClinicLookup()}
                  disabled={isBusy || isLookingUpClinic}
                >
                  {isLookingUpClinic ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Find hospital
                </BharatButton>
                {clinicLookupResult ? (
                  <div className="mt-3 rounded-lg border border-rule bg-paper-deep px-3 py-2">
                    <div className="flex items-center gap-1.5 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-sage">
                      <Check className="h-3 w-3" />
                      Hospital selected
                    </div>
                    <div className="mt-1 font-display text-[22px] italic leading-none text-ink">
                      {clinicLookupResult.clinic_name}
                    </div>
                    <div className="mt-1 font-body text-[11px] text-ink-muted">
                      {clinicLookupResult.clinic_address ?? "Address not added"}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <TextField label="Hospital name" value={hospital.name} onChange={(value) => setHospital((current) => ({ ...current, name: value }))} />
                <TextField
                  label="Address"
                  value={hospital.address}
                  onChange={(value) => setHospital((current) => ({ ...current, address: value }))}
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

            <BharatButton
              className="mt-5 w-full"
              onClick={handleRegister}
              disabled={isBusy || isLookingUpClinic || (hospitalMode === "join_hospital" && !clinicLookupResult)}
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {hospitalMode === "join_hospital" ? "Request to join" : "Create hospital & continue"}
            </BharatButton>
          </Panel>
        ) : null}
      </section>
    </OnboardingShell>
  );
}

function StepIndicator({ step }: { step: OnboardingStep }) {
  const current = ["credentials", "profile", "hospital"].indexOf(step) + 1;

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
