import { useMemo, useState } from "react";
import type { PriceFile, ScannedSlot } from "../lib/scanner";

interface Props {
  slot: ScannedSlot;
  prices: PriceFile;
  onPick: (itemId: string) => void;
  onClose: () => void;
}

/** Choix de l'objet d'une case : suggestions par icône, puis recherche par nom. */
export function SlotEditor({ slot, prices, onPick, onClose }: Props) {
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
        <img src={`data:image/png;base64,${slot.iconPngBase64}`} alt="" />
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
