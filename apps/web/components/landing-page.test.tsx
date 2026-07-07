import { render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/landing-page";

vi.mock("next/image", () => ({
  default: ({ src, alt, priority: _priority, fill: _fill, sizes: _sizes, ...props }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
    sizes?: string;
  }) => <img src={String(src)} alt={alt ?? ""} {...props} />
}));

describe("LandingPage", () => {
  it("renders the photo-led hero with accurate v1 copy", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: "AI Scribe for Indian clinics" })).toBeInTheDocument();
    expect(
      screen.getByText("Turn every consultation into an AI-drafted, doctor-reviewed summary and Patient ID PDF.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Save that as a PDF automatically with the Patient ID")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Indian doctor reviewing a consultation with a patient while a phone records on the desk"
      })
    ).toHaveAttribute("src", "/images/bharatdoc-hero-clinic-consultation-recording.png");

    expect(screen.getByRole("link", { name: "FAQs" })).toHaveAttribute("href", "/faqs");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/signup");
    for (const link of screen.getAllByRole("link", { name: /get started/i })) {
      expect(link).toHaveAttribute("href", "/onboarding");
    }
    expect(screen.getByRole("link", { name: /see how it works/i })).toHaveAttribute("href", "#how-it-works");
  });

  it("keeps landing copy grounded in supported v1 behavior", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: "How BharatDoc works" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Record" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Doctor-reviewed summaries" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Offline-safe recording" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clinic-scoped records" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Start with your next consultation" })).toBeInTheDocument();

    expect(screen.queryByText(/hundreds of doctors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2\+ hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp native/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ICD codes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/listens in the background/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Turn consultations into clinical notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Record a consultation, review the AI-drafted summary/i)).not.toBeInTheDocument();
  });

  it("renders exactly two narrated product walkthrough videos with accessible transcripts", () => {
    const { container } = render(<LandingPage />);

    expect(screen.getByRole("heading", { name: "Watch BharatDoc in use" })).toBeInTheDocument();
    expect(screen.getByText("Narration in these walkthroughs is AI-generated.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "From consultation to clinical note" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review and use generated documentation" })).toBeInTheDocument();
    expect(screen.getByText("See how a doctor can use BharatDoc to capture a consultation workflow and review the generated documentation.")).toBeInTheDocument();
    expect(screen.getByText("See how generated output can be reviewed, corrected, and prepared for use in the doctor's normal workflow.")).toBeInTheDocument();

    const videos = Array.from(container.querySelectorAll("video"));
    expect(videos).toHaveLength(2);
    expect(videos.map((video) => video.getAttribute("src"))).toEqual([
      "/videos/issue-21-consultation-to-note.mp4",
      "/videos/issue-21-review-documentation.mp4"
    ]);

    for (const video of videos) {
      expect(video).toHaveAttribute("controls");
      expect(video).toHaveAttribute("preload", "metadata");
      expect(video).not.toHaveAttribute("autoplay");
      expect(video.querySelector("track")?.getAttribute("kind")).toBe("captions");
    }

    expect(screen.getByText(/Transcript: From consultation to clinical note/i)).toBeInTheDocument();
    expect(screen.getByText(/Transcript: Review and use generated documentation/i)).toBeInTheDocument();
  });
});
