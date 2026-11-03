import Link from "next/link";

export function BrandMark({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <span
      className={`${className} grid place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" fill="none" className="h-2/3 w-2/3">
        <path d="M24 7 7 15l17 8 17-8-17-8Z" fill="currentColor" opacity="0.95" />
        <path d="M7 24l17 8 17-8" stroke="#FDE68A" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M7 32.5l17 8 17-8" stroke="#FDE68A" strokeWidth="2.6" strokeLinecap="round" opacity="0.6" />
      </svg>
    </span>
  );
}

export function Brand({ subtitle = "کلاس‌های مجازی" }: { subtitle?: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <BrandMark />
      <span className="leading-tight">
        <span className="block font-display text-lg text-brand-900">دبستان مهر</span>
        <span className="block text-[11.5px] text-ink-muted">{subtitle}</span>
      </span>
    </Link>
  );
}
