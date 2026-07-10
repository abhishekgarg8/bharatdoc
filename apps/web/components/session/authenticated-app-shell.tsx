"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  createSupabaseAuthClient,
  type AuthClient,
} from "@/lib/client/auth-client";
import {
  AuthSessionExpiredError,
  isAuthSessionExpiredError,
} from "@/lib/client/api-error";
import {
  fetchAuthenticatedBootstrap,
  TimeoutError,
  type ActiveAppContext,
  type AuthenticatedAppState,
} from "@/lib/client/authenticated-app";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import {
  cacheLocalRecordingContext,
  clearCachedLocalRecordingContext,
  authUserIdFromToken,
  readCachedLocalRecordingContextEntry,
} from "@/lib/client/local-recording-context";
import { PageError, PageLoading } from "@/components/session/page-loading";

interface AuthenticatedAppValue {
  state: AuthenticatedAppState;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface AuthenticatedAppShellProps {
  children: ReactNode;
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  onNavigate?: (href: string) => void;
}

const AppContext = createContext<AuthenticatedAppValue | null>(null);
const demoContext: ActiveAppContext = {
  authUserId: "demo-user",
  doctorId: "demo-doctor",
  clinicId: "demo-clinic",
  clinicName: "Sunrise Hospital, Pune",
  doctorName: "Dr. Aparna Iyer",
  permissions: { canManageClinic: true, canRecord: true },
};

function cachedState(
  token: string,
): Extract<AuthenticatedAppState, { status: "active_offline_stale" }> | null {
  const cached = readCachedLocalRecordingContextEntry(token);
  if (!cached) return null;
  return {
    status: "active_offline_stale",
    token,
    source: "cache",
    cachedAt: cached.cachedAt,
    expiresAt: cached.expiresAt,
    context: {
      ...cached.context.scope,
      clinicName: cached.context.clinicName,
      permissions: { canManageClinic: false, canRecord: true },
    },
  };
}

function isConnectivityError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}

export function AuthenticatedAppShell({
  children,
  authClient,
  fetcher = fetch,
  onNavigate,
}: AuthenticatedAppShellProps) {
  const client = useMemo(
    () => authClient ?? createSupabaseAuthClient(),
    [authClient],
  );
  const navigate = useMemo(
    () => onNavigate ?? ((href: string) => window.location.assign(href)),
    [onNavigate],
  );
  const queryDemo = useExplicitDemoMode();
  const demo = queryDemo;
  const [state, setState] = useState<AuthenticatedAppState>({
    status: "loading",
  });
  const tokenRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const requestControllerRef = useRef(new AbortController());
  const mountedRef = useRef(true);

  const load = useCallback(
    async (token: string, preserveStale = false) => {
      const generation = ++generationRef.current;
      requestControllerRef.current.abort();
      requestControllerRef.current = new AbortController();
      const cached = cachedState(token);
      if (!preserveStale)
        setState(
          navigator.onLine === false && cached ? cached : { status: "loading" },
        );

      try {
        const bootstrap = await fetchAuthenticatedBootstrap(token, fetcher, {
          signal: requestControllerRef.current.signal,
        });
        if (
          !mountedRef.current ||
          generation !== generationRef.current ||
          tokenRef.current !== token
        )
          return;

        if (bootstrap.doctor.accountStatus !== "active") {
          clearCachedLocalRecordingContext(token);
          const status =
            bootstrap.doctor.accountStatus === "pending_approval"
              ? "pending"
              : "rejected";
          setState({
            status,
            token,
            doctor: bootstrap.doctor,
            clinic: bootstrap.clinic,
          });
          navigate(
            status === "pending" ? "/pending-approval" : "/access-rejected",
          );
          return;
        }

        if (
          !bootstrap.doctor.clinicId ||
          bootstrap.clinic?.id !== bootstrap.doctor.clinicId
        ) {
          throw new Error("The active account has no valid clinic scope.");
        }

        const context: ActiveAppContext = {
          authUserId: bootstrap.doctor.authUserId,
          doctorId: bootstrap.doctor.id,
          clinicId: bootstrap.doctor.clinicId,
          clinicName: bootstrap.clinic.name,
          doctorName: bootstrap.doctor.name,
          permissions: {
            canManageClinic: bootstrap.doctor.role === "owner",
            canRecord: true,
          },
        };
        if (
          !cacheLocalRecordingContext(
            {
              clinicName: context.clinicName,
              scope: {
                authUserId: context.authUserId,
                doctorId: context.doctorId,
                clinicId: context.clinicId,
              },
            },
            token,
          )
        )
          throw new Error(
            "The account scope did not match the authenticated session.",
          );
        setState({
          status: "active_online",
          token,
          context,
          source: "network",
          refreshedAt: Date.now(),
        });
      } catch (error) {
        if (
          !mountedRef.current ||
          generation !== generationRef.current ||
          (error instanceof Error && error.name === "AbortError")
        )
          return;
        if (isAuthSessionExpiredError(error)) {
          clearCachedLocalRecordingContext(token);
          setState({ status: "unauthenticated" });
          await client.signOut().catch(() => undefined);
          navigate("/signup");
          return;
        }
        const fallback = cachedState(token);
        if (isConnectivityError(error) && fallback) setState(fallback);
        else
          setState({
            status: "error",
            kind: "bootstrap",
            retryable: true,
            message: "Unable to load your account. Try again.",
          });
      }
    },
    [client, fetcher, navigate],
  );

  const acceptToken = useCallback(
    async (token: string | null) => {
      if (tokenRef.current === token && token !== null) return;
      const previous = tokenRef.current;
      tokenRef.current = token;
      if (
        previous &&
        authUserIdFromToken(previous) !== authUserIdFromToken(token ?? "")
      ) {
        clearCachedLocalRecordingContext(previous);
      }
      if (!token) {
        ++generationRef.current;
        requestControllerRef.current.abort();
        if (demo)
          setState({
            status: "active_demo",
            context: demoContext,
            source: "demo",
          });
        else {
          setState({ status: "unauthenticated" });
          navigate("/signup");
        }
        return;
      }
      await load(token);
    },
    [demo, load, navigate],
  );

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    let observedAuthEvent = false;
    const unsubscribe = client.subscribeToTokenChanges?.((token) => {
      observedAuthEvent = true;
      if (!disposed) void acceptToken(token);
    });
    void client
      .getCurrentIdToken()
      .then((token) => {
        if (!disposed && !observedAuthEvent) void acceptToken(token);
      })
      .catch(() => {
        if (!disposed && !observedAuthEvent) {
          void acceptToken(null);
        }
      });
    return () => {
      disposed = true;
      mountedRef.current = false;
      ++generationRef.current;
      requestControllerRef.current.abort();
      unsubscribe?.();
    };
  }, [acceptToken, client]);

  const refresh = useCallback(async () => {
    if (tokenRef.current)
      await load(tokenRef.current, state.status === "active_offline_stale");
  }, [load, state.status]);

  useEffect(() => {
    const reconnect = () => {
      if (state.status === "active_offline_stale") void refresh();
    };
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [refresh, state.status]);

  const signOut = useCallback(async () => {
    const token = tokenRef.current;
    tokenRef.current = null;
    ++generationRef.current;
    requestControllerRef.current.abort();
    if (token) clearCachedLocalRecordingContext(token);
    setState({ status: "unauthenticated" });
    await client.signOut().catch(() => undefined);
    navigate("/signup");
  }, [client, navigate]);

  const request = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = tokenRef.current;
      if (!token) throw new Error("Authentication is required.");
      if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const controller = new AbortController();
      const abort = () => controller.abort();
      requestControllerRef.current.signal.addEventListener("abort", abort, {
        once: true,
      });
      init.signal?.addEventListener("abort", abort, { once: true });
      let rejectCancellation!: (reason: unknown) => void;
      const cancellation = new Promise<never>((_resolve, reject) => {
        rejectCancellation = reject;
      });
      const rejectAbort = () =>
        rejectCancellation(new DOMException("Aborted", "AbortError"));
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
      const timeout = setTimeout(() => {
        rejectCancellation(new TimeoutError());
        controller.abort();
      }, 10_000);
      try {
        let responseRequest: Promise<Response>;
        try {
          responseRequest = Promise.resolve(
            fetcher(input, {
              ...init,
              cache: "no-store",
              headers: {
                ...Object.fromEntries(new Headers(init.headers)),
                Authorization: `Bearer ${token}`,
              },
              signal: controller.signal,
            }),
          );
        } catch (error) {
          responseRequest = Promise.reject(error);
        }
        const response = await Promise.race([responseRequest, cancellation]);
        if (response.status === 401) {
          await signOut();
          throw new AuthSessionExpiredError();
        }
        return response;
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", rejectAbort);
        requestControllerRef.current.signal.removeEventListener("abort", abort);
        init.signal?.removeEventListener("abort", abort);
      }
    },
    [fetcher, signOut],
  );

  const value = useMemo(
    () => ({ state, refresh, signOut, request }),
    [refresh, request, signOut, state],
  );
  const active =
    state.status === "active_online" ||
    state.status === "active_offline_stale" ||
    state.status === "active_demo";

  return (
    <AppContext.Provider value={value}>
      {active ? (
        children
      ) : state.status === "error" ? (
        <PageError message={state.message} onRetry={() => void refresh()} />
      ) : (
        <PageLoading label="Loading your account" />
      )}
    </AppContext.Provider>
  );
}

export function useAuthenticatedApp(): AuthenticatedAppValue {
  const value = useContext(AppContext);
  if (!value)
    throw new Error(
      "useAuthenticatedApp must be used inside AuthenticatedAppShell.",
    );
  return value;
}
