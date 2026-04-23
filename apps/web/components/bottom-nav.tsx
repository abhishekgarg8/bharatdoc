import { Home, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { id: "home", label: "Home", icon: Home },
  { id: "search", label: "Search", icon: Search },
  { id: "settings", label: "Settings", icon: Settings, badge: 1 }
] as const;

interface BottomNavProps {
  active: (typeof items)[number]["id"];
}

export function BottomNav({ active }: BottomNavProps) {
  return (
    <nav className="border-t border-rule bg-paper px-6 pb-3 pt-2 font-body" aria-label="Primary navigation">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;

          return (
            <button
              key={item.id}
              className={cn(
                "relative flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-[0.02em]",
                isActive ? "text-terracotta" : "text-ink-muted"
              )}
              type="button"
            >
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2.2 : 1.6} />
              <span>{item.label}</span>
              {"badge" in item ? (
                <span className="absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold leading-none text-white">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
