import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BharatButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "ink" | "ghost";
}

const variants = {
  primary: "bg-terracotta text-white shadow-warm",
  ink: "bg-ink text-paper shadow-[0_4px_12px_rgba(28,23,18,0.25)]",
  ghost: "border border-rule bg-transparent text-ink-soft"
};

export function BharatButton({ children, className, icon, variant = "primary", ...props }: BharatButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 font-body text-sm font-bold tracking-[0.01em] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
