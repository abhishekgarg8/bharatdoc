import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";

interface BharatButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "ink" | "ghost";
  asChild?: boolean;
}

const variants = {
  primary: "bg-terracotta text-white shadow-warm",
  ink: "bg-ink text-paper shadow-[0_4px_12px_rgba(28,23,18,0.25)]",
  ghost: "border border-rule bg-transparent text-ink-soft"
};

function buttonClassName(className: string | undefined, variant: BharatButtonProps["variant"]): string {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 font-body text-sm font-bold tracking-[0.01em] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant ?? "primary"],
    className
  );
}

export function BharatButton({
  children,
  className,
  icon,
  variant = "primary",
  asChild = false,
  ...props
}: BharatButtonProps) {
  if (asChild) {
    if (!isValidElement(children)) {
      throw new Error("BharatButton asChild requires a single valid React element child.");
    }

    const child = children as ReactElement<{ className?: string; children?: ReactNode }>;

    return cloneElement(child, {
      className: cn(buttonClassName(className, variant), child.props.className),
      children: (
        <>
          {icon}
          {child.props.children}
        </>
      )
    });
  }

  return (
    <button
      className={buttonClassName(className, variant)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
