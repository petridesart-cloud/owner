import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Re·Form Pilates Studio",
    short_name: "Re·Form",
    description: "Book Reformer and Mat Pilates in Limassol.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBF8FC",
    theme_color: "#E9DDF5",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Schedule", url: "/schedule" },
      { name: "My classes", url: "/bookings" },
    ],
  };
}
