type LogoMarkProps = { size?: number };

/** The f-mark (fingerscore-handoff/brand/mark.svg): a lowercase f whose crossbar is one closed and one open hole. */
export function LogoMark({ size = 30 }: LogoMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M30 60 V22 C30 11 36 6 46 7" fill="none" stroke="#15171C" strokeWidth="8" strokeLinecap="round" />
      <circle cx="17" cy="29" r="5.5" fill="#0E6E68" />
      <circle cx="43" cy="29" r="5" fill="none" stroke="#15171C" strokeWidth="3" />
    </svg>
  );
}

/** The wordmark: "finger" in ink, "score" in teal. Reads as one word. */
export function Wordmark({ className }: { className?: string }) {
  return <span className={className}>finger<span className="brand-accent">score</span></span>;
}
