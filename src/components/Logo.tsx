import Image from "next/image";

// Her round lilac Instagram logo. `src` is her uploaded logo (Admin → Photos) when there is one.
export function Logo({ size = 120, src = "/logo-instagram.png", className = "", decorative = false, priority = false }: {
  size?: number; src?: string; className?: string; decorative?: boolean; priority?: boolean;
}) {
  return (
    <Image
      src={src}
      width={size}
      height={size}
      priority={priority}
      unoptimized={src.startsWith("http")}
      alt={decorative ? "" : "Re·Form Pilates Studio"}
      className={`rounded-full ${className}`}
    />
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-serif text-[1.65rem] font-light tracking-wide text-plum-700 ${className}`}>
      Re<span aria-hidden className="mx-[1px]">·</span>Form
    </span>
  );
}
