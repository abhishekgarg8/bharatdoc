import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BottomNav } from "@/components/bottom-nav";

describe("BottomNav", () => {
  it("routes search to the dedicated clinic search screen", () => {
    render(<BottomNav active="home" settingsBadgeCount={0} />);

    expect(screen.getByRole("link", { name: /search/i })).toHaveAttribute("href", "/search");
  });
});
