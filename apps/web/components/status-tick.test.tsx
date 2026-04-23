import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusTick } from "@/components/status-tick";

describe("StatusTick", () => {
  it("renders the recorded status label", () => {
    render(<StatusTick status="recorded" />);

    expect(screen.getByLabelText("Recorded")).toBeInTheDocument();
    expect(screen.getByText("Recorded")).toBeInTheDocument();
  });

  it("renders the PDF saved status label", () => {
    render(<StatusTick status="pdf_saved" />);

    expect(screen.getByLabelText("PDF saved")).toBeInTheDocument();
    expect(screen.getByText("PDF saved")).toBeInTheDocument();
  });
});
