import type { ReactNode } from "react";
import { AuthenticatedAppShell } from "@/components/session/authenticated-app-shell";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
