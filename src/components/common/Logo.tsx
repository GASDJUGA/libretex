type LogoProps = {
  size?: number;
  className?: string;
};

/** JuTeX's own mark: a "J" with a lowered "T", on the accent color. */
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
      <rect width="64" height="64" rx="14" fill="var(--jt-accent)" />
      <path fill="#ffffff" d="M20 14h8v20a10 10 0 0 1 -20 0h8a2 2 0 0 0 4 0z" />
      <path fill="#ffffff" fillOpacity="0.85" d="M28 24h24v7h-8.5v21h-7V31H28z" />
    </svg>
  );
}
