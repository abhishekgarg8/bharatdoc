interface DemoSearchParams {
  demo?: string;
}

export function isExplicitDemoModeEnabled(searchParams?: DemoSearchParams): boolean {
  return searchParams?.demo === "1" && process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true";
}
