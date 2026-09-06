import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function groupBy<T>(rows: T[], key: (row: T) => string) {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const bucket = key(row);
    acc[bucket] = acc[bucket] ? [...acc[bucket], row] : [row];
    return acc;
  }, {});
}
