import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <span className="chip mb-2 bg-brand-50 text-brand-800">{eyebrow}</span>
        )}
        <h1 className="font-display text-[26px] leading-tight text-ink sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
