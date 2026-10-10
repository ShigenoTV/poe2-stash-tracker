import { useCallback, useEffect, useMemo, useState } from "react";
import { CurrencySelect } from "./components/CurrencySelect";
import { CategorySidebar, type CategoryFilter } from "./components/CategorySidebar";
import { AlertsBanner } from "./components/AlertsBanner";
import { ChangesPanel } from "./components/ChangesPanel";
import { ItemGrid } from "./components/ItemGrid";
import { NetWorthChart } from "./components/NetWorthChart";
import { clearHistory, loadHistory, recordSnapshot, type HistoryPoint } from "./lib/history";
import { PricesControl } from "./components/PricesControl";
import { ScanControl } from "./components/ScanControl";
import { SettingsPanel } from "./components/SettingsPanel";
import { SlotEditor } from "./components/SlotEditor";
import { exportCsv, forgetLabels } from "./lib/scanner";
import { compareHoldings, holdingsOf, type Holdings } from "./lib/compare";
import { snapshotCsv } from "./lib/csv";
import {
  findAlerts,
  loadAlertSettings,
  loadSent,
  saveAlertSettings,
  saveSent,
  type AlertSettings,
  type PriceAlert,
} from "./lib/alerts";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
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
  const [onlyDoubtful, setOnlyDoubtful] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Alertes de prix : objets détenus dont le prix bouge fort sur 24 h, une fois par jour et par sens.
  const [alertSettings, setAlertSettingsState] = useState<AlertSettings>(loadAlertSettings);
  const setAlertSettings = useCallback((s: AlertSettings) => {
    setAlertSettingsState(s);
    saveAlertSettings(s);
  }, []);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  useEffect(() => {
    if (!snapshot) return;
    const sent = new Set(loadSent());
    const fresh = findAlerts(snapshot, alertSettings, new Date().toISOString().slice(0, 10)).filter((a) => !sent.has(a.key));
    if (fresh.length === 0) return;
    saveSent([...sent, ...fresh.map((a) => a.key)]);
    setAlerts((cur) => [...fresh, ...cur.filter((c) => !fresh.some((f) => f.id === c.id))]);
  }, [snapshot, alertSettings]);
  // Session : depuis le lancement de l'app (ou « Nouvelle session ») ; la référence est le
  // premier snapshot affiché.
  const [session, setSession] = useState<{ startedAt: number; holdings: Holdings } | null>(null);
  useEffect(() => {
    if (snapshot && !session) setSession({ startedAt: Date.now(), holdings: holdingsOf(snapshot) });
  }, [snapshot, session]);
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
    setSession(null);
    clearSnapshot();
    await scanner.restart();
    await clearHistory(league).then(setHistory).catch(() => {});
  }, [snapshot, scanner]);

  const resetAll = useCallback(async () => {
    setSnapshot(null);
    setSession(null);
    clearSnapshot();
    setFilter("All");
    await scanner.restart();
    await Promise.all([clearHistory(null).then(setHistory), forgetLabels()]).catch(() => {});
    setSettingsOpen(false);
  }, [scanner]);

  // Case d'origine d'un objet, tant que son onglet est connu (onglets gardés entre deux lancements).
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

  const inCategory = useMemo(
    () =>
      (snapshot?.items ?? [])
        .filter((i) => filter === "All" || i.category === filter)
        .sort((a, b) => (b.unitExalted ?? 0) * b.quantity - (a.unitExalted ?? 0) * a.quantity),
    [snapshot, filter],
  );
  const doubtfulCount = inCategory.filter((i) => i.doubtful).length;
  const showDoubtful = onlyDoubtful && doubtfulCount > 0;
  const visible = showDoubtful ? inCategory.filter((i) => i.doubtful) : inCategory;

  const sessionGain = useMemo(
    () =>
      session && snapshot
        ? { startedAt: session.startedAt, gainExalted: compareHoldings(session.holdings, snapshot, scanner.prices).totalExalted }
        : null,
    [session, snapshot, scanner.prices],
  );

  const exportVisible = useCallback(async () => {
    if (!snapshot) return;
    const stamp = new Date(snapshot.takenAt).toISOString().slice(0, 16).replace(/[:T]/g, "-");
    try {
      const path = await exportCsv(`poe2-coffre-${stamp}.csv`, snapshotCsv(visible, currency, rates));
      setExportStatus(`Exporté : ${path}`);
      revealItemInDir(path).catch(() => {});
    } catch (err) {
      setExportStatus(String(err));
    }
  }, [snapshot, visible, currency, rates]);

  return (
    <div className="app">
      <UpdateBanner updater={updater} />
      <AlertsBanner
        alerts={alerts}
        onDismiss={(key) => setAlerts((cur) => (key === null ? [] : cur.filter((a) => a.key !== key)))}
      />
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
          alerts={alertSettings}
          onAlertsChange={setAlertSettings}
          onResetHistory={resetHistory}
          onResetAll={resetAll}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {editing && editingSlot && scanner.prices && (
        <SlotEditor
          slot={editingSlot}
          fallbackIcon={editing.icon}
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
          <SnapshotHeader
            snapshot={snapshot}
            totalExalted={totalExalted}
            currency={currency}
            rates={rates}
            session={sessionGain}
            onNewSession={() => setSession({ startedAt: Date.now(), holdings: holdingsOf(snapshot) })}
          />
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
              <ChangesPanel
                snapshot={snapshot}
                session={session}
                history={history}
                prices={scanner.prices}
                currency={currency}
                rates={rates}
              />
              <div className="list-toolbar">
                {doubtfulCount > 0 && (
                  <button
                    type="button"
                    className={`ghost${showDoubtful ? " active" : ""}`}
                    onClick={() => setOnlyDoubtful((o) => !o)}
                    title="Objets dont la reconnaissance est incertaine : clique sur l'un d'eux pour le corriger"
                  >
                    {showDoubtful ? "Tout afficher" : `À vérifier (${doubtfulCount})`}
                  </button>
                )}
                <span className="muted list-toolbar-status" title={exportStatus ?? undefined}>
                  {exportStatus}
                </span>
                <button type="button" className="ghost" onClick={exportVisible} disabled={visible.length === 0}>
                  Exporter en CSV
                </button>
              </div>
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
