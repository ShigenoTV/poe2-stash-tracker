import { useEffect, useState } from "react";
import { listLeagues, type League } from "../lib/scanner";
import type { StashScanner } from "../lib/useStashScanner";
import { ConfirmButton } from "./ConfirmButton";

interface Props {
  scanner: StashScanner;
  onResetHistory: () => void;
  onResetAll: () => void;
  onClose: () => void;
}

export function SettingsPanel({ scanner, onResetHistory, onResetAll, onClose }: Props) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listLeagues()
      .then((l) => {
        setLeagues(l.leagues);
        setSelected(l.selected ?? "");
      })
      .catch((e) => setError(String(e)));
  }, []);

  function pick(id: string) {
    setSelected(id);
    scanner.changeLeague(id || null);
  }

  return (
    <div className="settings" role="dialog" aria-label="Réglages">
      <div className="settings-head">
        <h2>Réglages</h2>
        <button type="button" className="ghost" onClick={onClose}>
          Fermer
        </button>
      </div>

      <label className="settings-row">
        <span>Ligue</span>
        <select value={selected} onChange={(e) => pick(e.target.value)} disabled={scanner.pricesBusy}>
          <option value="">Ligue en cours{leagues[0] ? ` (${leagues[0].name})` : ""}</option>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="update-error">Ligues indisponibles : {error}</p>}

      <div className="settings-row">
        <span>
          Courbe du net worth
          <small className="muted">Efface l'historique de la ligue affichée et les onglets lus.</small>
        </span>
        <ConfirmButton label="Remettre à zéro" onConfirm={onResetHistory} />
      </div>
      <div className="settings-row">
        <span>
          Tout remettre à zéro
          <small className="muted">Snapshot, courbes, onglets lus et objets corrigés à la main.</small>
        </span>
        <ConfirmButton label="Tout effacer" onConfirm={onResetAll} />
      </div>
    </div>
  );
}
