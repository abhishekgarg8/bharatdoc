import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessRejectedScreen } from "@/components/onboarding/access-rejected-screen";

describe("AccessRejectedScreen", () => {
  it("lets rejected doctors return to onboarding to choose another hospital", () => {
    const navigate = vi.fn();

    render(<AccessRejectedScreen authClient={{ signOut: vi.fn() }} onNavigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: /join a different hospital/i }));

    expect(navigate).toHaveBeenCalledWith("/onboarding");
  });

  it("signs out rejected doctors and returns to onboarding", async () => {
    const navigate = vi.fn();
    const authClient = {
      signOut: vi.fn(async () => undefined)
    };

    render(<AccessRejectedScreen authClient={authClient} onNavigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(authClient.signOut).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith("/onboarding");
  });

  it("still exits to onboarding when local Supabase browser config is unavailable", async () => {
    const navigate = vi.fn();
    const authClient = {
      signOut: vi.fn(async () => {
        throw new Error("Supabase client environment is not configured.");
      })
    };

    render(<AccessRejectedScreen authClient={authClient} onNavigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/onboarding"));
  });
});
