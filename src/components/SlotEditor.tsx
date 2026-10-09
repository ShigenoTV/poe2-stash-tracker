import { useMemo, useState } from "react";
import { slotIcon, type PriceFile, type ScannedSlot } from "../lib/scanner";

interface Props {
  slot: ScannedSlot;
  /** Icône de l'objet actuel, quand le scan n'a pas gardé l'image de la case. */
  fallbackIcon?: string;
  prices: PriceFile;
  onPick: (itemId: string) => void;
  onClose: () => void;
}

/** Choix de l'objet d'une case : suggestions par icône, puis recherche par nom. */
export function SlotEditor({ slot, fallbackIcon, prices, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(prices.items.map((i) => [i.id, i])), [prices]);

  const suggestions = (slot.identification?.candidates ?? [])
    .map((c) => byId.get(c.itemId))
    .filter((i) => i !== undefined);

  const q = query.trim().toLowerCase();
  const matches = q
    ? prices.items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 30)
    : suggestions;

  return (
    <div className="slot-editor" role="dialog" aria-label="Choisir l'objet">
      <div className="slot-editor-head">
        {(slotIcon(slot) ?? fallbackIcon) && <img src={slotIcon(slot) ?? fallbackIcon} alt="" />}
        <input
          autoFocus
          placeholder="Rechercher un objet…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" onClick={onClose}>
          Fermer
        </button>
      </div>
      <ul className="slot-editor-list">
        {matches.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onPick(item.id)}>
              {item.icon && <img src={item.icon} alt="" />}
              <span>{item.name}</span>
              <span className="muted">{item.category}</span>
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="muted">Aucun objet trouvé.</li>}
      </ul>
    </div>
  );
}
