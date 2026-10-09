import { useCallback, useEffect, useMemo, useState } from "react";
import { CurrencySelect } from "./components/CurrencySelect";
import { CategorySidebar, type CategoryFilter } from "./components/CategorySidebar";
import { ItemGrid } from "./components/ItemGrid";
import { NetWorthChart } from "./components/NetWorthChart";
import { loadHistory, recordSnapshot, type HistoryPoint } from "./lib/history";
import { ScannerView } from "./components/ScannerView";
import { SnapshotHeader } from "./components/SnapshotHeader";
import { UpdateBanner, UpdateCheck } from "./components/UpdateBanner";
import { useUpdater } from "./lib/useUpdater";
import { useStashScanner } from "./lib/useStashScanner";
import { loadSnapshot, saveSnapshot } from "./lib/snapshot";
import { loadCurrency, saveCurrency, usable, type Currency, type Rates } from "./lib/currency";
import { CATEGORIES, type Category, type Snapshot } from "./lib/types";
import "./styles.css";

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(loadSnapshot);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  useEffect(() => {
    loadHistory().then(setHistory).catch(() => {});
  }, []);
  const onSnapshot = useCallback((s: Snapshot) => {
    setSnapshot(s);
    saveSnapshot(s);
    recordSnapshot(s).then(setHistory).catch((err) => console.warn("Historique non enregistré :", err));
  }, []);
  const [filter, setFilter] = useState<CategoryFilter>("All");
  const updater = useUpdater();
  const scanner = useStashScanner(onSnapshot);
  const [view, setView] = useState<"snapshot" | "scanner">("snapshot");
  const [chosenCurrency, setChosenCurrency] = useState<Currency>(loadCurrency);
  const pickCurrency = useCallback((c: Currency) => {
    setChosenCurrency(c);
    saveCurrency(c);
  }, []);

  // Taux du snapshot affiché ; le fichier de prix chargé complète un ancien snapshot sans taux Chaos.
  const rates: Rates = useMemo(
    () => ({
      exaltedPerDivine: snapshot?.exaltedPerDivine ?? scanner.prices?.rates.exalted ?? 1,
      chaosPerDivine: snapshot?.chaosPerDivine ?? scanner.prices?.rates.chaos ?? null,
    }),
    [snapshot, scanner.prices],
  );
  const currency = usable(chosenCurrency, rates);

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
        <CurrencySelect value={currency} onChange={pickCurrency} chaosAvailable={!!rates.chaosPerDivine} />
      </nav>
      {view === "scanner" ? (
        <main className="content">
          <ScannerView scanner={scanner} currency={chosenCurrency} />
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
          <SnapshotHeader snapshot={snapshot} totalExalted={totalExalted} currency={currency} rates={rates} />
          <div className="body">
            <CategorySidebar selected={filter} totals={totals} onSelect={setFilter} currency={currency} rates={rates} />
            <main className="content">
              <NetWorthChart history={history} league={snapshot.league} currency={currency} rates={rates} />
              <ItemGrid items={visible} currency={currency} rates={rates} />
            </main>
          </div>
        </>
      )}
    </div>
  );
}
