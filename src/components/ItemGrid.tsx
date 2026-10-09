import { formatMoney, fromExalted, type Currency, type Rates } from "../lib/currency";
import type { SnapshotItem } from "../lib/types";

interface Props {
  items: SnapshotItem[];
  currency: Currency;
  rates: Rates;
  /** Objets corrigeables : ceux dont l'onglet a été lu pendant cette session. */
  canEdit: (item: SnapshotItem) => boolean;
  onEdit: (item: SnapshotItem) => void;
}

/** Tendance du prix sur 24 h (7 jours au survol), quand poe.ninja la fournit. */
function Trend({ item }: { item: SnapshotItem }) {
  const day = item.change24h;
  if (day === null || day === undefined) return <span className="item-row-trend" />;
  const week = item.change7d;
  const flat = Math.abs(day) < 1;
  const title = `24 h : ${day > 0 ? "+" : ""}${day} %${week === null || week === undefined ? "" : ` · 7 j : ${week > 0 ? "+" : ""}${week} %`}`;
  return (
    <span className={`item-row-trend ${flat ? "muted" : day > 0 ? "delta-up" : "delta-down"}`} title={title}>
      {flat ? "≈" : day > 0 ? "▲" : "▼"} {Math.abs(day).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
    </span>
  );
}

/** Liste des objets, du plus précieux au moins précieux, valeur totale alignée à droite. */
export function ItemGrid({ items, currency, rates, canEdit, onEdit }: Props) {
  if (items.length === 0) {
    return <p className="empty">Aucun objet dans cette catégorie.</p>;
  }
  const money = (exalted: number) => formatMoney(fromExalted(exalted, currency, rates), currency);
  return (
    <ul className="item-list">
      {items.map((item) => {
        const total = item.unitExalted === null ? null : item.unitExalted * item.quantity;
        const editable = canEdit(item);
        return (
          <li
            key={item.id}
            className={`item-row${editable ? " editable" : ""}`}
            title={editable ? "Clique pour corriger l'objet" : undefined}
            onClick={editable ? () => onEdit(item) : undefined}
          >
            <span className="item-row-icon">{item.icon && <img src={item.icon} alt="" />}</span>
            <span className="item-row-name">
              {item.name}
              {item.doubtful && (
                <span className="badge-doubt" title="Reconnaissance incertaine : clique pour vérifier l'objet">
                  à vérifier
                </span>
              )}
            </span>
            <Trend item={item} />
            <span className="item-row-stash muted" title="Onglet du coffre">{item.stash || "—"}</span>
            <span className="item-row-qty">× {item.quantity.toLocaleString("fr-FR")}</span>
            <span className="item-row-unit muted">{item.unitExalted === null ? "" : `${money(item.unitExalted)} / u`}</span>
            <span className={`item-row-total${total === null ? " muted" : ""}`}>
              {total === null ? "sans prix" : money(total)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

