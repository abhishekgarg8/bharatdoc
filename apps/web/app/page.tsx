"use client";

import { useEffect } from "react";
import { LandingPage } from "@/components/landing-page";
import { createSupabaseAuthClient } from "@/lib/client/auth-client";
import { fetchCurrentDoctor, destinationForDoctorStatus } from "@/lib/client/session";

export default function HomePage() {
  useEffect(() => {
    const client = createSupabaseAuthClient();
    client.getCurrentIdToken().then(async (idToken) => {
      if (!idToken) return;
      try {
        const me = await fetchCurrentDoctor(idToken);
        window.location.assign(destinationForDoctorStatus(me.doctor.account_status));
      } catch {
        // silently stay on landing page
      }
    });
  }, []);

  return <LandingPage />;
}
