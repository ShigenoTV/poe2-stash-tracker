/** Quantité compacte façon stash : 264, 3K, 12K, 1.2M. */
export function compactQuantity(n: number): string {
  if (n < 1000) return String(Math.floor(n));
  if (n < 10_000) return `${trimZero((Math.floor(n / 100) / 10).toFixed(1))}K`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}K`;
  return `${trimZero((Math.floor(n / 100_000) / 10).toFixed(1))}M`;
}

/** Valeur monétaire courte : 0.42, 12.5, 1 234. */
export function formatValue(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) < 1) return n.toFixed(2);
  if (Math.abs(n) < 100) return trimZero(n.toFixed(1));
  return Math.round(n).toLocaleString("fr-FR");
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatSnapshotDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
