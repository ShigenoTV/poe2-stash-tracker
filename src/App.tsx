import { useMemo, useState } from "react";
import { CategorySidebar, type CategoryFilter } from "./components/CategorySidebar";
import { ItemGrid } from "./components/ItemGrid";
import { SnapshotHeader } from "./components/SnapshotHeader";
import { UpdateBanner } from "./components/UpdateBanner";
import { mockSnapshot } from "./lib/mockData";
import { CATEGORIES, type Category } from "./lib/types";
import "./styles.css";

export default function App() {
  const snapshot = mockSnapshot;
  const [filter, setFilter] = useState<CategoryFilter>("All");

  const totals = useMemo(() => {
    const t = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    for (const item of snapshot.items) {
      t[item.category] += (item.unitExalted ?? 0) * item.quantity;
    }
    return t;
  }, [snapshot]);

  const totalExalted = Object.values(totals).reduce((a, b) => a + b, 0);

  const visible = useMemo(
    () =>
      snapshot.items
        .filter((i) => filter === "All" || i.category === filter)
        .sort((a, b) => (b.unitExalted ?? 0) * b.quantity - (a.unitExalted ?? 0) * a.quantity),
    [snapshot, filter],
  );

  return (
    <div className="app">
      <UpdateBanner />
      <SnapshotHeader snapshot={snapshot} totalExalted={totalExalted} />
      <div className="body">
        <CategorySidebar selected={filter} totals={totals} onSelect={setFilter} />
        <main className="content">
          <ItemGrid items={visible} />
        </main>
      </div>
    </div>
  );
}
