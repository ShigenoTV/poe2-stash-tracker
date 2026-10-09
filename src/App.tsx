import { useCallback, useMemo, useState } from "react";
import { CategorySidebar, type CategoryFilter } from "./components/CategorySidebar";
import { ItemGrid } from "./components/ItemGrid";
import { ScannerView } from "./components/ScannerView";
import { SnapshotHeader } from "./components/SnapshotHeader";
import { UpdateBanner, UpdateCheck } from "./components/UpdateBanner";
import { useUpdater } from "./lib/useUpdater";
import { loadSnapshot, saveSnapshot } from "./lib/snapshot";
import { CATEGORIES, type Category, type Snapshot } from "./lib/types";
import "./styles.css";

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(loadSnapshot);
  const onSnapshot = useCallback((s: Snapshot) => {
    setSnapshot(s);
    saveSnapshot(s);
  }, []);
  const [filter, setFilter] = useState<CategoryFilter>("All");
  const updater = useUpdater();
  const [view, setView] = useState<"snapshot" | "scanner">("snapshot");

  const totals = useMemo(() => {
    const t = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    for (const item of snapshot?.items ?? []) {
      t[item.category] += (item.unitExalted ?? 0) * item.quantity;
    }
    return t;
  }, [snapshot]);

  const totalExalted = Object.values(totals).reduce((a, b) => a + b, 0);

  const visible = useMemo(
    () =>
      (snapshot?.items ?? [])
        .filter((i) => filter === "All" || i.category === filter)
        .sort((a, b) => (b.unitExalted ?? 0) * b.quantity - (a.unitExalted ?? 0) * a.quantity),
    [snapshot, filter],
  );

  return (
    <div className="app">
      <UpdateBanner updater={updater} />
      <nav className="tabs">
        <button type="button" className={view === "snapshot" ? "active" : ""} onClick={() => setView("snapshot")}>
          Snapshot
        </button>
        <button type="button" className={view === "scanner" ? "active" : ""} onClick={() => setView("scanner")}>
          Scanner
        </button>
        <UpdateCheck updater={updater} />
      </nav>
      {view === "scanner" ? (
        <main className="content">
          <ScannerView onSnapshot={onSnapshot} />
        </main>
      ) : !snapshot ? (
        <main className="content empty-state">
          <p>Aucun snapshot pour l'instant.</p>
          <button type="button" className="primary" onClick={() => setView("scanner")}>
            Scanner mon coffre
          </button>
        </main>
      ) : (
        <>
          <SnapshotHeader snapshot={snapshot} totalExalted={totalExalted} />
          <div className="body">
            <CategorySidebar selected={filter} totals={totals} onSelect={setFilter} />
            <main className="content">
              <ItemGrid items={visible} />
            </main>
          </div>
        </>
      )}
    </div>
  );
}
