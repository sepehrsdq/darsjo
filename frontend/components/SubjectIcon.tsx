"use client";

import {
  Atom,
  Book,
  BookOpen,
  Calculator,
  Flask,
  Globe,
  Palette,
  type Icon,
} from "@phosphor-icons/react";

const map: Record<string, Icon> = {
  calculator: Calculator,
  flask: Flask,
  "book-open": BookOpen,
  book: Book,
  globe: Globe,
  palette: Palette,
  atom: Atom,
};

export function SubjectIcon({ name, size = 24 }: { name?: string; size?: number }) {
  const Component = map[name || ""] || BookOpen;
  return <Component size={size} weight="duotone" aria-hidden="true" />;
}
