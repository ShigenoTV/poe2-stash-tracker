import { useCallback, useEffect, useMemo, useState } from "react";
import { CurrencySelect } from "./components/CurrencySelect";
import { CategorySidebar, type CategoryFilter } from "./components/CategorySidebar";
import { ItemGrid } from "./components/ItemGrid";
import { NetWorthChart } from "./components/NetWorthChart";
import { clearHistory, loadHistory, recordSnapshot, type HistoryPoint } from "./lib/history";
import { PricesControl } from "./components/PricesControl";
import { ScanControl } from "./components/ScanControl";
import { SettingsPanel } from "./components/SettingsPanel";
import { SlotEditor } from "./components/SlotEditor";
import { forgetLabels } from "./lib/scanner";
import { SnapshotHeader } from "./components/SnapshotHeader";
import { UpdateBanner, UpdateCheck } from "./components/UpdateBanner";
import { useUpdater } from "./lib/useUpdater";
import { useStashScanner } from "./lib/useStashScanner";
import { clearSnapshot, loadSnapshot, revalue, saveSnapshot } from "./lib/snapshot";
import { loadCurrency, saveCurrency, usable, type Currency, type Rates } from "./lib/currency";
import { CATEGORIES, type Category, type Snapshot, type SnapshotItem } from "./lib/types";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<SnapshotItem | null>(null);

  // Nouveaux prix (actualisation, autre ligue) sans onglet lu depuis le lancement :
  // le snapshot enregistré est revalorisé, sans ajouter de point à la courbe.
  const { prices, tabs } = scanner;
  useEffect(() => {
    if (!prices || tabs.length > 0) return;
    setSnapshot((s) => {
      if (!s) return s;
      const next = revalue(s, prices);
      saveSnapshot(next);
      return next;
    });
  }, [prices, tabs.length]);

  // Les onglets lus sont vidés aussi : sinon le prochain scan les recompte aussitôt.
  const resetHistory = useCallback(async () => {
    const league = snapshot?.league ?? null;
    setSnapshot(null);
    clearSnapshot();
    await scanner.restart();
    await clearHistory(league).then(setHistory).catch(() => {});
  }, [snapshot, scanner]);

  const resetAll = useCallback(async () => {
    setSnapshot(null);
    clearSnapshot();
    setFilter("All");
    await scanner.restart();
    await Promise.all([clearHistory(null).then(setHistory), forgetLabels()]).catch(() => {});
    setSettingsOpen(false);
  }, [scanner]);

  // Case d'origine d'un objet, tant que son onglet a été lu pendant cette session.
  const slotOf = (item: SnapshotItem) => {
    const src = item.source;
    return src ? tabs[src.tab]?.scan.slots.find((s) => s.x === src.x && s.y === src.y) : undefined;
  };
  const editingSlot = editing ? slotOf(editing) : undefined;
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
      <nav className="topbar">
        <ScanControl scanner={scanner} />
        <div className="topbar-right">
          <PricesControl scanner={scanner} />
          <UpdateCheck updater={updater} />
          <CurrencySelect value={currency} onChange={pickCurrency} chaosAvailable={!!rates.chaosPerDivine} />
          <button type="button" className="ghost" onClick={() => setSettingsOpen((o) => !o)}>
            Réglages
          </button>
        </div>
      </nav>
      {settingsOpen && (
        <SettingsPanel
          scanner={scanner}
          onResetHistory={resetHistory}
          onResetAll={resetAll}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {editing && editingSlot && scanner.prices && (
        <SlotEditor
          slot={editingSlot}
          prices={scanner.prices}
          onPick={(id) => {
            scanner.relabel(editingSlot, id).catch(() => {});
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {!snapshot ? (
        <main className="content empty-state">
          <p>Aucun snapshot pour l'instant.</p>
          {scanner.auto ? (
            <p className="muted">Ouvre ton coffre dans le jeu : chaque onglet affiché est lu automatiquement.</p>
          ) : (
            <button type="button" className="primary" onClick={() => scanner.setAuto(true)}>
              Activer le scan
            </button>
          )}
        </main>
      ) : (
        <>
          <SnapshotHeader snapshot={snapshot} totalExalted={totalExalted} currency={currency} rates={rates} />
          <div className="body">
            <CategorySidebar selected={filter} totals={totals} onSelect={setFilter} currency={currency} rates={rates} />
            <main className="content">
              <NetWorthChart
                history={history}
                league={snapshot.league}
                currency={currency}
                rates={rates}
                onReset={resetHistory}
              />
              <ItemGrid
                items={visible}
                currency={currency}
                rates={rates}
                onEdit={(item) => slotOf(item) && setEditing(item)}
                canEdit={(item) => !!slotOf(item)}
              />
            </main>
          </div>
        </>
      )}
    </div>
  );
}
