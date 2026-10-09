import { useMemo, useState } from "react";
import { compareHoldings, type Holdings } from "../lib/compare";
import { formatMoney, fromExalted, type Currency, type Rates } from "../lib/currency";
import type { HistoryPoint } from "../lib/history";
import type { PriceFile } from "../lib/scanner";
import type { Snapshot } from "../lib/types";

const REFERENCES = [
  { key: "session", label: "Session", ms: 0 },
  { key: "1h", label: "1 h", ms: 3600e3 },
  { key: "24h", label: "24 h", ms: 24 * 3600e3 },
  { key: "7d", label: "7 j", ms: 7 * 24 * 3600e3 },
] as const;
type RefKey = (typeof REFERENCES)[number]["key"];

/** Nombre de lignes montrées avant « Tout voir ». */
const PREVIEW = 8;

interface Props {
  snapshot: Snapshot;
  session: { startedAt: number; holdings: Holdings } | null;
  history: HistoryPoint[];
  prices: PriceFile | null;
  currency: Currency;
  rates: Rates;
}

/** Dernier point détaillé de la ligue enregistré au plus tard à `at`. */
function pointAt(history: HistoryPoint[], league: string, at: number): HistoryPoint | null {
  let found: HistoryPoint | null = null;
  for (const p of history) if (p.league === league && p.items && p.at <= at && (!found || p.at > found.at)) found = p;
  return found;
}

/** Objets entrés et sortis du coffre depuis un moment choisi, valorisés au prix actuel. */
export function ChangesPanel({ snapshot, session, history, prices, currency, rates }: Props) {
  const [ref, setRef] = useState<RefKey>("session");
  const [all, setAll] = useState(false);

  const reference = useMemo((): { holdings: Holdings; at: number } | null => {
    if (ref === "session") return session && { holdings: session.holdings, at: session.startedAt };
    const ms = REFERENCES.find((r) => r.key === ref)!.ms;
    const p = pointAt(history, snapshot.league, Date.now() - ms);
    return p && { holdings: p.items!, at: p.at };
  }, [ref, session, history, snapshot.league]);

  const result = useMemo(() => reference && compareHoldings(reference.holdings, snapshot, prices), [reference, snapshot, prices]);
  const money = (exalted: number) => formatMoney(fromExalted(exalted, currency, rates), currency);
  const signed = (exalted: number) => `${exalted > 0 ? "+" : exalted < 0 ? "−" : ""}${money(Math.abs(exalted))}`;
  const rows = result ? (all ? result.rows : result.rows.slice(0, PREVIEW)) : [];

  return (
    <section className="chart changes">
      <div className="chart-head">
        <h2>Entrées et sorties</h2>
        <div className="chart-ranges" role="group" aria-label="Comparer avec">
          {REFERENCES.map((r) => (
            <button key={r.key} type="button" className={ref === r.key ? "active" : ""} onClick={() => setRef(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {!result ? (
        <p className="chart-empty muted">Pas encore de snapshot assez ancien pour cette comparaison.</p>
      ) : (
        <>
          <p className="chart-summary">
            Depuis {new Date(reference!.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} :{" "}
            <strong className={result.totalExalted > 0 ? "delta-up" : result.totalExalted < 0 ? "delta-down" : ""}>
              {signed(result.totalExalted)}
            </strong>{" "}
            <span className="muted">au prix actuel</span>
          </p>
          {rows.length === 0 ? (
            <p className="chart-empty muted">Aucun objet n'a bougé.</p>
          ) : (
            <ul className="changes-list">
              {rows.map((r) => {
                const diff = r.after - r.before;
                return (
                  <li key={r.id}>
                    <span className="item-row-icon">{r.icon && <img src={r.icon} alt="" />}</span>
                    <span className="item-row-name">{r.name}</span>
                    <span className={diff > 0 ? "delta-up" : "delta-down"}>
                      {diff > 0 ? "+" : "−"}
                      {Math.abs(diff).toLocaleString("fr-FR")}
                    </span>
                    <span className="item-row-total">{r.valueExalted === null ? <span className="muted">sans prix</span> : signed(r.valueExalted)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {result.rows.length > PREVIEW && (
            <button type="button" className="ghost changes-more" onClick={() => setAll((a) => !a)}>
              {all ? "Réduire" : `Tout voir (${result.rows.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
