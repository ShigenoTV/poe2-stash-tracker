import { formatMoney, fromExalted, type Currency, type Rates } from "../lib/currency";
import { formatSnapshotDate } from "../lib/format";
import type { Snapshot } from "../lib/types";

interface Props {
  snapshot: Snapshot;
  totalExalted: number;
  currency: Currency;
  rates: Rates;
}

export function SnapshotHeader({ snapshot, totalExalted, currency, rates }: Props) {
  // En sous-titre, l'autre grosse devise pour garder un repère.
  const secondary: Currency = currency === "divine" ? "exalted" : "divine";
  return (
    <header className="snapshot-header">
      <div>
        <div className="eyebrow">Snapshot · {snapshot.league}</div>
        <h1>{formatSnapshotDate(snapshot.takenAt)}</h1>
      </div>
      <div className="networth">
        <div className="networth-main">{formatMoney(fromExalted(totalExalted, currency, rates), currency)}</div>
        <div className="networth-sub">{formatMoney(fromExalted(totalExalted, secondary, rates), secondary)}</div>
      </div>
    </header>
  );
}
