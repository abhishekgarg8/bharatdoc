import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BharatDoc",
    short_name: "BharatDoc",
    description: "Record consultations, generate clinical summaries, and save PDF records.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF5EA",
    theme_color: "#C24A2A",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
