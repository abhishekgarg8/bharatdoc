import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OnboardingShellProps {
  children: ReactNode;
  className?: string;
}

export function OnboardingShell({ children, className }: OnboardingShellProps) {
  return (
    <main className={cn("paper-bg mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-paper text-ink", className)}>
      {children}
    </main>
  );
}
