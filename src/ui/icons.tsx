type LogoMarkProps = { size?: number };

export function LogoMark({ size = 28 }: LogoMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="10" y="2" width="8" height="24" rx="4" fill="#15171C" />
      <circle cx="14" cy="8" r="1.6" fill="#FFFFFF" />
      <circle cx="14" cy="13" r="1.6" fill="#FFFFFF" />
      <circle cx="14" cy="18" r="1.6" fill="#FFFFFF" />
      <circle cx="14" cy="23" r="1.6" fill="#5FD3C6" />
    </svg>
  );
}
