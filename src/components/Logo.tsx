// Re·Form wordmark in a soft lilac-to-white circle (recreated from the studio's
// Instagram avatar; swap for the original artwork when available).
export function Logo({ size = 120, className = "", decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Re·Form Pilates Studio"}
    >
      <defs>
        <radialGradient id="rf-glow" cx="50%" cy="85%" r="80%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#E9DDF5" />
          <stop offset="100%" stopColor="#C9A8E6" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#rf-glow)" />
      <text
        x="100"
        y="114"
        textAnchor="middle"
        fontFamily="var(--font-cormorant), 'Cormorant Garamond', Georgia, serif"
        fontWeight={300}
        fontSize="50"
        fill="#5B4470"
        letterSpacing="0.5"
      >
        Re·Form
      </text>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-serif text-[1.65rem] font-light tracking-wide text-plum-700 ${className}`}>
      Re<span aria-hidden className="mx-[1px]">·</span>Form
    </span>
  );
}
