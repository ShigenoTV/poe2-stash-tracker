import { formatValue } from "../lib/format";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "../lib/types";

export type CategoryFilter = Category | "All";

interface Props {
  selected: CategoryFilter;
  totals: Record<Category, number>;
  onSelect: (c: CategoryFilter) => void;
}

export function CategorySidebar({ selected, totals, onSelect }: Props) {
  const entries: { key: CategoryFilter; label: string; value: number }[] = [
    { key: "All", label: "Tout", value: Object.values(totals).reduce((a, b) => a + b, 0) },
    ...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c], value: totals[c] })),
  ];
  return (
    <nav className="sidebar" aria-label="Catégories">
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          className={`sidebar-item${selected === e.key ? " active" : ""}`}
          onClick={() => onSelect(e.key)}
        >
          <span className={`dot cat-${e.key.toLowerCase()}`} />
          <span className="sidebar-label">{e.label}</span>
          <span className="sidebar-value">{formatValue(e.value)} ex</span>
        </button>
      ))}
    </nav>
  );
}
