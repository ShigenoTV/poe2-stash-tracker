import { useEffect, useState } from "react";
import { formatMoney, fromExalted, type Currency, type Rates } from "../lib/currency";
import { formatSnapshotDate } from "../lib/format";
import type { Snapshot } from "../lib/types";

/** En dessous, le gain par heure n'a pas encore de sens. */
const MIN_RATE_MS = 5 * 60e3;

interface Props {
  snapshot: Snapshot;
  totalExalted: number;
  currency: Currency;
  rates: Rates;
  /** Gain depuis le début de la session, au prix actuel. */
  session: { startedAt: number; gainExalted: number } | null;
  onNewSession: () => void;
}

function duration(ms: number): string {
  const min = Math.floor(ms / 60e3);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

export function SnapshotHeader({ snapshot, totalExalted, currency, rates, session, onNewSession }: Props) {
  // En sous-titre, l'autre grosse devise pour garder un repère.
  const secondary: Currency = currency === "divine" ? "exalted" : "divine";
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30e3);
    return () => clearInterval(id);
  }, []);

  const money = (exalted: number) => formatMoney(fromExalted(Math.abs(exalted), currency, rates), currency);
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  const elapsed = session ? Math.max(0, now - session.startedAt) : 0;
  const perHour = session && elapsed >= MIN_RATE_MS ? (session.gainExalted * 3600e3) / elapsed : null;

  return (
    <header className="snapshot-header">
      <div>
        <div className="eyebrow">Snapshot · {snapshot.league}</div>
        <h1>{formatSnapshotDate(snapshot.takenAt)}</h1>
      </div>
      {session && (
        <div className="session" title="Objets gagnés ou dépensés depuis le début de la session, au prix actuel">
          <div className="eyebrow">Session · {duration(elapsed)}</div>
          <div className="session-gain">
            <span className={session.gainExalted > 0 ? "delta-up" : session.gainExalted < 0 ? "delta-down" : ""}>
              {sign(session.gainExalted)}
              {money(session.gainExalted)}
            </span>
            {perHour !== null && (
              <span className="muted">
                {" "}
                · {sign(perHour)}
                {money(perHour)}/h
              </span>
            )}
            <button type="button" className="ghost session-reset" onClick={onNewSession}>
              Nouvelle session
            </button>
          </div>
        </div>
      )}
      <div className="networth">
        <div className="networth-main">{formatMoney(fromExalted(totalExalted, currency, rates), currency)}</div>
        <div className="networth-sub">{formatMoney(fromExalted(totalExalted, secondary, rates), secondary)}</div>
      </div>
    </header>
  );
}
