import { Home, Search, Settings } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const items = [
  { id: "home", label: "Home", href: "/dashboard", icon: Home },
  { id: "search", label: "Search", href: "/search", icon: Search },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings }
] as const;

interface BottomNavProps {
  active: (typeof items)[number]["id"];
  settingsBadgeCount?: number;
}

export function BottomNav({ active, settingsBadgeCount = 0 }: BottomNavProps) {
  return (
    <nav className="border-t border-rule bg-paper px-5 pb-[calc(0.75rem+var(--safe-area-bottom))] pt-2 font-body" aria-label="Primary navigation">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          const badge = item.id === "settings" ? settingsBadgeCount : 0;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "relative flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-[0.02em]",
                isActive ? "text-terracotta" : "text-ink-muted"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2.2 : 1.6} />
              <span>{item.label}</span>
              {badge > 0 ? (
                <span className="absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold leading-none text-white">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
