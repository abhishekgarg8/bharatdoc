interface LogoMarkProps {
  size?: number;
}

export function LogoMark({ size = 56 }: LogoMarkProps) {
  return (
    <div
      className="flex items-center justify-center rounded-[28%] bg-terracotta font-display italic leading-none text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.08)]"
      style={{ width: size, height: size, fontSize: size * 0.52 }}
      aria-label="BharatDoc"
    >
      B
    </div>
  );
}
