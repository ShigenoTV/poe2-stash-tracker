import { formatSnapshotDate, formatValue } from "../lib/format";
import type { Snapshot } from "../lib/types";

interface Props {
  snapshot: Snapshot;
  totalExalted: number;
}

export function SnapshotHeader({ snapshot, totalExalted }: Props) {
  const totalDivine = totalExalted / snapshot.exaltedPerDivine;
  return (
    <header className="snapshot-header">
      <div>
        <div className="eyebrow">Snapshot · {snapshot.league}</div>
        <h1>{formatSnapshotDate(snapshot.takenAt)}</h1>
      </div>
      <div className="networth">
        <div className="networth-main">{formatValue(totalDivine)} div</div>
        <div className="networth-sub">{formatValue(totalExalted)} ex</div>
      </div>
      <button type="button" className="primary" disabled title="Disponible à l'étape Acquisition">
        Nouveau snapshot
      </button>
    </header>
  );
}
