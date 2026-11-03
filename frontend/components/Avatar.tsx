import { initials } from "@/lib/format";

const palette = [
  "from-brand-400 to-brand-600",
  "from-sky to-indigo-500",
  "from-sun-400 to-sun-600",
  "from-berry to-rose-500",
  "from-grape to-purple-500",
  "from-leaf to-emerald-600",
];

function hash(value: string) {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) total += value.charCodeAt(index);
  return total;
}

export function Avatar({
  name,
  src,
  size = 40,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const gradient = palette[hash(name) % palette.length];
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br ${gradient} font-medium text-white ring-2 ring-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
