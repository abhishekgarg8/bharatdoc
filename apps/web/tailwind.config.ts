import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF5EA",
        "paper-deep": "#F2EADB",
        ink: "#1C1712",
        "ink-soft": "#3D332A",
        "ink-muted": "#7A6E60",
        "ink-faint": "#AEA395",
        rule: "#E5DAC5",
        terracotta: "#C24A2A",
        saffron: "#D68A3C",
        ochre: "#B97E2E",
        sage: "#5F7A52",
        indigo: "#2C4A6B",
        stamp: "#8B2E20"
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"]
      },
      boxShadow: {
        warm: "0 10px 24px rgba(194, 74, 42, 0.35), 0 2px 0 rgba(0, 0, 0, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
