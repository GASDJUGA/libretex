type LogoProps = {
  size?: number;
  className?: string;
};

/** JuTeX's own mark: an "L" with a lowered "T", in the accent green. */
export function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="JuTeX"
    >
      <rect width="64" height="64" rx="14" fill="var(--lt-accent)" />
      <path fill="#ffffff" d="M14 14h8v22h12v8H14z" />
      <path fill="#ffffff" fillOpacity="0.85" d="M28 24h24v7h-8.5v21h-7V31H28z" />
    </svg>
  );
}
