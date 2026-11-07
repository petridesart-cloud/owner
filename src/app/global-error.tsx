"use client";
import "./globals.css";
import { ErrorScreen } from "@/components/ErrorScreen";

// Replaces the root layout when it fails, so it brings its own document and styles.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <title>Something went wrong · Re·Form Pilates</title>
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
