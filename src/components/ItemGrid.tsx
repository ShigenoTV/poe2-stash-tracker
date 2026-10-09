import { compactQuantity, formatValue } from "../lib/format";
import type { SnapshotItem } from "../lib/types";

export function ItemGrid({ items }: { items: SnapshotItem[] }) {
  if (items.length === 0) {
    return <p className="empty">Aucun objet dans cette catégorie.</p>;
  }
  return (
    <ul className="item-grid">
      {items.map((item) => {
        const total = item.unitExalted === null ? null : item.unitExalted * item.quantity;
        const tooltip =
          total === null
            ? `${item.name} × ${item.quantity} · sans prix`
            : `${item.name} × ${item.quantity} · ${formatValue(item.unitExalted!)} ex/u · ${formatValue(total)} ex`;
        return (
          <li key={item.id} className="item-tile" title={tooltip}>
            {item.icon ? (
              <img src={item.icon} alt="" className="item-icon" />
            ) : (
              <span className="item-name">{item.name}</span>
            )}
            {/* Une icône capturée en jeu porte déjà sa quantité. */}
            {!item.icon?.startsWith("data:") && <span className="item-qty">{compactQuantity(item.quantity)}</span>}
            {total === null && <span className="item-unpriced" aria-label="sans prix">?</span>}
          </li>
        );
      })}
    </ul>
  );
}
