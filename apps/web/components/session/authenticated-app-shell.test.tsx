import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticatedAppShell,
  useAuthenticatedApp,
} from "@/components/session/authenticated-app-shell";
import type { AuthClient } from "@/lib/client/auth-client";
import { cacheLocalRecordingContext } from "@/lib/client/local-recording-context";
import type { AuthenticatedBootstrap } from "@/lib/client/authenticated-app";

const doctorId = "11111111-1111-4111-8111-111111111111";
const clinicId = "22222222-2222-4222-8222-222222222222";
const tokenFor = (sub: string) =>
  `header.${btoa(JSON.stringify({ sub })).replaceAll("=", "")}.signature`;
const activeBootstrap: AuthenticatedBootstrap = {
  doctor: {
    id: doctorId,
    authUserId: "auth-a",
    clinicId,
    role: "owner",
    accountStatus: "active",
    name: "Dr. A",
  },
  clinic: { id: clinicId, name: "Clinic A" },
};

function errorName(error: unknown): string {
  return typeof error === "object" && error && "name" in error
    ? String(error.name)
    : "unknown";
}

function client(token: string | null = tokenFor("auth-a")) {
  let listener: ((nextToken: string | null) => void) | undefined;
  const authClient: AuthClient = {
    signUpWithPassword: vi.fn(),
    signInWithPassword: vi.fn(),
    getCurrentIdToken: vi.fn(async () => token),
    signOut: vi.fn(async () => undefined),
    subscribeToTokenChanges: vi.fn((next) => {
      listener = next;
      return vi.fn();
    }),
  };
  return { authClient, emit: (next: string | null) => listener?.(next) };
}

function Probe() {
  const app = useAuthenticatedApp();
  return (
    <div>
      <span>{app.state.status}</span>
      {"context" in app.state ? (
        <span>{app.state.context.clinicName}</span>
      ) : null}
      <button onClick={() => void app.request("/slow").catch(() => undefined)}>
        request
      </button>
      <button onClick={() => void app.signOut()}>sign out</button>
    </div>
  );
}

function RequestFailureProbe() {
  const app = useAuthenticatedApp();
  const [failure, setFailure] = useState("");
  return (
    <div>
      <span>{app.state.status}</span>
      <button
        onClick={() =>
          void app
            .request("/slow")
            .catch((error: unknown) => setFailure(errorName(error)))
        }
      >
        timed request
      </button>
      <button
        onClick={() => {
          const controller = new AbortController();
          controller.abort();
          void app
            .request("/cancelled", { signal: controller.signal })
            .catch((error: unknown) => setFailure(errorName(error)));
        }}
      >
        pre-aborted request
      </button>
      <span>{failure}</span>
    </div>
  );
}

function AuthorizationProbe() {
  const app = useAuthenticatedApp();
  return (
    <button
      onClick={() =>
        void app.request("/protected", {
          headers: {
            authorization: "Bearer stale-token",
            "X-Request-ID": "request-123",
          },
        })
      }
    >
      protected request
    </button>
  );
}

describe("AuthenticatedAppShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("routes missing sessions without mounting active children", async () => {
    const { authClient } = client(null);
    const navigate = vi.fn();

    render(
      <AuthenticatedAppShell authClient={authClient} onNavigate={navigate}>
        <Probe />
      </AuthenticatedAppShell>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/signup"));
    expect(screen.queryByText("sign out")).not.toBeInTheDocument();
  });

  it.each([
    ["pending_approval", "/pending-approval"],
    ["rejected", "/access-rejected"],
  ] as const)(
    "routes %s doctors without active-content flash",
    async (accountStatus, destination) => {
      const { authClient } = client();
      const navigate = vi.fn();
      cacheLocalRecordingContext(
        {
          clinicName: "Old Clinic",
          scope: { authUserId: "auth-a", doctorId, clinicId },
        },
        tokenFor("auth-a"),
      );
      const fetcher = vi.fn(async () =>
        Response.json({
          ...activeBootstrap,
          doctor: { ...activeBootstrap.doctor, accountStatus },
        }),
      ) as unknown as typeof fetch;

      render(
        <AuthenticatedAppShell
          authClient={authClient}
          fetcher={fetcher}
          onNavigate={navigate}
        >
          <Probe />
        </AuthenticatedAppShell>,
      );

      await waitFor(() => expect(navigate).toHaveBeenCalledWith(destination));
      expect(screen.queryByText("sign out")).not.toBeInTheDocument();
      expect(window.localStorage).toHaveLength(0);
    },
  );

  it("provides one active online doctor/clinic context and permissions", async () => {
    const { authClient } = client();
    const fetcher = vi.fn(async () =>
      Response.json(activeBootstrap),
    ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell
        authClient={authClient}
        fetcher={fetcher}
        onNavigate={vi.fn()}
      >
        <Probe />
      </AuthenticatedAppShell>,
    );

    await expect(
      screen.findByText("active_online"),
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("Clinic A")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses only exact, unexpired minimal context for an offline cold start", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const token = tokenFor("auth-a");
    cacheLocalRecordingContext(
      {
        clinicName: "Cached Clinic",
        scope: { authUserId: "auth-a", doctorId, clinicId },
      },
      token,
    );
    const { authClient } = client(token);
    const fetcher = vi.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell
        authClient={authClient}
        fetcher={fetcher}
        onNavigate={vi.fn()}
      >
        <Probe />
      </AuthenticatedAppShell>,
    );

    await expect(
      screen.findByText("active_offline_stale"),
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("Cached Clinic")).toBeInTheDocument();
  });

  it("revalidates stale context once on reconnect", async () => {
    const token = tokenFor("auth-a");
    cacheLocalRecordingContext(
      {
        clinicName: "Cached Clinic",
        scope: { authUserId: "auth-a", doctorId, clinicId },
      },
      token,
    );
    const { authClient } = client(token);
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        Response.json(activeBootstrap),
      ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell authClient={authClient} fetcher={fetcher}>
        <Probe />
      </AuthenticatedAppShell>,
    );
    await expect(
      screen.findByText("active_offline_stale"),
    ).resolves.toBeInTheDocument();
    await act(async () => window.dispatchEvent(new Event("online")));

    await expect(
      screen.findByText("active_online"),
    ).resolves.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ignores an old account response after a token change", async () => {
    let resolveFirst!: (value: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const { authClient, emit } = client(tokenFor("auth-a"));
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(
        Response.json({
          ...activeBootstrap,
          doctor: {
            ...activeBootstrap.doctor,
            authUserId: "auth-b",
            name: "Dr. B",
          },
          clinic: { id: clinicId, name: "Clinic B" },
        }),
      ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell authClient={authClient} fetcher={fetcher}>
        <Probe />
      </AuthenticatedAppShell>,
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => emit(tokenFor("auth-b")));
    await expect(screen.findByText("Clinic B")).resolves.toBeInTheDocument();
    resolveFirst(Response.json(activeBootstrap));
    await act(async () => undefined);
    expect(screen.queryByText("Clinic A")).not.toBeInTheDocument();
  });

  it("does not let a late initial token lookup overwrite a newer auth event", async () => {
    let resolveInitial!: (token: string | null) => void;
    let listener: ((token: string | null) => void) | undefined;
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            resolveInitial = resolve;
          }),
      ),
      subscribeToTokenChanges: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        ...activeBootstrap,
        doctor: { ...activeBootstrap.doctor, authUserId: "auth-b" },
        clinic: { id: clinicId, name: "Clinic B" },
      }),
    ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell authClient={authClient} fetcher={fetcher}>
        <Probe />
      </AuthenticatedAppShell>,
    );
    await act(async () => listener?.(tokenFor("auth-b")));
    await expect(screen.findByText("Clinic B")).resolves.toBeInTheDocument();
    await act(async () => resolveInitial(tokenFor("auth-a")));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Clinic B")).toBeInTheDocument();
  });

  it("preserves same-user cached scope across an offline token refresh", async () => {
    const { authClient, emit } = client(tokenFor("auth-a"));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(activeBootstrap))
      .mockRejectedValueOnce(
        new TypeError("offline"),
      ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell authClient={authClient} fetcher={fetcher}>
        <Probe />
      </AuthenticatedAppShell>,
    );
    await expect(
      screen.findByText("active_online"),
    ).resolves.toBeInTheDocument();
    await act(async () => emit(`${tokenFor("auth-a")}.refreshed`));

    await expect(
      screen.findByText("active_offline_stale"),
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("Clinic A")).toBeInTheDocument();
  });

  it("recovers an expired session centrally", async () => {
    const { authClient } = client();
    const navigate = vi.fn();
    const fetcher = vi.fn(async () =>
      Response.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 }),
    ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell
        authClient={authClient}
        fetcher={fetcher}
        onNavigate={navigate}
      >
        <Probe />
      </AuthenticatedAppShell>,
    );

    await waitFor(() => expect(authClient.signOut).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith("/signup");
    expect(screen.queryByText("sign out")).not.toBeInTheDocument();
  });

  it("shows a retryable error for non-connectivity bootstrap failures", async () => {
    const { authClient } = client();
    const fetcher = vi.fn(async () =>
      Response.json({ error: { code: "FAILED" } }, { status: 500 }),
    ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell authClient={authClient} fetcher={fetcher}>
        <Probe />
      </AuthenticatedAppShell>,
    );

    await expect(
      screen.findByText(/unable to load your account/i),
    ).resolves.toBeInTheDocument();
    expect(screen.queryByText("sign out")).not.toBeInTheDocument();
  });

  it("retries a failed bootstrap without adding another auth subscription", async () => {
    const { authClient } = client();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: { code: "FAILED" } }, { status: 500 }),
      )
      .mockResolvedValueOnce(
        Response.json(activeBootstrap),
      ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell authClient={authClient} fetcher={fetcher}>
        <Probe />
      </AuthenticatedAppShell>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await expect(
      screen.findByText("active_online"),
    ).resolves.toBeInTheDocument();
    expect(authClient.subscribeToTokenChanges).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("aborts shared authenticated requests on sign-out", async () => {
    const { authClient } = client();
    let requestAborted = false;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/me")
        return Promise.resolve(Response.json(activeBootstrap));
      return new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => {
          requestAborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        }),
      );
    }) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell
        authClient={authClient}
        fetcher={fetcher}
        onNavigate={vi.fn()}
      >
        <Probe />
      </AuthenticatedAppShell>,
    );
    await screen.findByText("active_online");
    fireEvent.click(screen.getByRole("button", { name: "request" }));
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));

    await waitFor(() => expect(requestAborted).toBe(true));
    expect(authClient.signOut).toHaveBeenCalledTimes(1);
  });

  it("replaces a caller Authorization header with exactly one current token", async () => {
    const token = tokenFor("auth-a");
    const { authClient } = client(token);
    const fetcherMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      input.toString() === "/api/me"
        ? Response.json(activeBootstrap)
        : Response.json({ ok: true }),
    );
    const fetcher = fetcherMock as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell authClient={authClient} fetcher={fetcher}>
        <AuthorizationProbe />
      </AuthenticatedAppShell>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "protected request" }),
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const requestInit = fetcherMock.mock.calls[1]?.[1];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(headers.get("authorization")).not.toContain(",");
    expect(headers.get("x-request-id")).toBe("request-123");
    expect(requestInit?.cache).toBe("no-store");
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("bounds authenticated page requests even when fetch ignores abort", async () => {
    vi.useFakeTimers();
    const { authClient } = client();
    const fetcher = vi.fn((input: RequestInfo | URL) =>
      input.toString() === "/api/me"
        ? Promise.resolve(Response.json(activeBootstrap))
        : new Promise<Response>(() => undefined),
    ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell authClient={authClient} fetcher={fetcher}>
        <RequestFailureProbe />
      </AuthenticatedAppShell>,
    );
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "timed request" }));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(screen.getByText("TimeoutError")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not dispatch a page request when the caller signal is already aborted", async () => {
    const { authClient } = client();
    const fetcher = vi.fn(async () =>
      Response.json(activeBootstrap),
    ) as unknown as typeof fetch;

    render(
      <AuthenticatedAppShell authClient={authClient} fetcher={fetcher}>
        <RequestFailureProbe />
      </AuthenticatedAppShell>,
    );
    await screen.findByText("active_online");
    fireEvent.click(
      screen.getByRole("button", { name: "pre-aborted request" }),
    );

    await waitFor(() =>
      expect(screen.getByText("AbortError")).toBeInTheDocument(),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
