interface NavaLogoProps {
  size?: number;
  className?: string;
}

export const NavaLogo = ({ size = 80, className = "" }: NavaLogoProps) => {
  return (
    <div
      className={`relative flex items-center justify-center rounded-3xl bg-gradient-primary shadow-glow ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="font-bold text-primary-foreground leading-none"
        style={{ fontSize: size * 0.55 }}
      >
        N
      </span>
      <svg
        viewBox="0 0 60 20"
        className="absolute bottom-2 left-1/2 -translate-x-1/2"
        style={{ width: size * 0.55 }}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path
          d="M2 10 Q 10 2, 18 10 T 34 10 T 50 10 T 58 10"
          className="text-primary-foreground/80"
        />
      </svg>
    </div>
  );
};
