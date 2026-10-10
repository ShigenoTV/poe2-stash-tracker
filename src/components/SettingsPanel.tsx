import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { AlertSettings } from "../lib/alerts";
import { listLeagues, type League } from "../lib/scanner";
import type { StashScanner } from "../lib/useStashScanner";
import { ConfirmButton } from "./ConfirmButton";

interface Props {
  scanner: StashScanner;
  alerts: AlertSettings;
  onAlertsChange: (s: AlertSettings) => void;
  onResetHistory: () => void;
  onResetAll: () => void;
  onClose: () => void;
}

const CHANGES = [10, 15, 25, 50];
const HELD = [0.5, 1, 5, 10, 50];

export function SettingsPanel({ scanner, alerts, onAlertsChange, onResetHistory, onResetAll, onClose }: Props) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Démarrage avec Windows (l'app s'ouvre alors directement dans la zone de notification).
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/plugin-autostart")
      .then((a) => a.isEnabled())
      .then(setAutostart)
      .catch(() => setAutostart(null));
  }, []);
  async function toggleAutostart(on: boolean) {
    try {
      const a = await import("@tauri-apps/plugin-autostart");
      await (on ? a.enable() : a.disable());
      setAutostart(await a.isEnabled());
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    listLeagues()
      .then((l) => {
        setLeagues(l.leagues);
        setSelected(l.selected ?? "");
      })
      .catch((e) => setError(`Ligues indisponibles : ${e}`));
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
      {error && <p className="update-error">{error}</p>}

      {autostart !== null && (
        <label className="settings-row">
          <span>
            Démarrer avec Windows
            <small className="muted">L'app se lance dans la zone de notification et lit le coffre en arrière-plan.</small>
          </span>
          <input
            type="checkbox"
            className="settings-check"
            checked={autostart}
            onChange={(e) => toggleAutostart(e.target.checked)}
          />
        </label>
      )}

      <label className="settings-row">
        <span>
          Alertes de prix
          <small className="muted">Bandeau dans l'app quand un objet que tu possèdes monte ou chute fort sur 24 h.</small>
        </span>
        <input
          type="checkbox"
          className="settings-check"
          checked={alerts.enabled}
          onChange={(e) => onAlertsChange({ ...alerts, enabled: e.target.checked })}
        />
      </label>
      {alerts.enabled && (
        <>
          <label className="settings-row">
            <span>Variation sur 24 h d'au moins</span>
            <select value={alerts.minChange} onChange={(e) => onAlertsChange({ ...alerts, minChange: Number(e.target.value) })}>
              {CHANGES.map((c) => (
                <option key={c} value={c}>
                  ± {c} %
                </option>
              ))}
            </select>
          </label>
          <label className="settings-row">
            <span>Pour un objet dont tu as au moins</span>
            <select
              value={alerts.minHeldDivine}
              onChange={(e) => onAlertsChange({ ...alerts, minHeldDivine: Number(e.target.value) })}
            >
              {HELD.map((h) => (
                <option key={h} value={h}>
                  {h.toLocaleString("fr-FR")} div
                </option>
              ))}
            </select>
          </label>
        </>
      )}

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
