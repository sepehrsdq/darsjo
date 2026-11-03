import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

const tones = {
  brand: "bg-brand-50 text-brand-700",
  sun: "bg-amber-50 text-sun-700",
  sky: "bg-blue-50 text-sky",
  berry: "bg-pink-50 text-berry",
  leaf: "bg-emerald-50 text-leaf",
  grape: "bg-violet-50 text-grape",
} as const;

export function StatCard({
  icon: IconComponent,
  label,
  value,
  hint,
  tone = "brand",
}: {
  icon: Icon;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: keyof typeof tones;
}) {
  return (
    <div className="card card-hover flex items-start gap-4 p-5">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tones[tone]}`}>
        <IconComponent size={24} weight="duotone" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] text-ink-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-ink">{value}</p>
        {hint && <p className="mt-1 truncate text-[11.5px] text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}
