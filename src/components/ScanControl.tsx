import { BRIGHT_CAPTURE } from "../lib/scanner";
import type { StashScanner } from "../lib/useStashScanner";

/** Bouton du scan automatique et état du coffre. */
export function ScanControl({ scanner }: { scanner: StashScanner }) {
  const { auto, stashOpen, tabs, lastAutoScan, error, brightness } = scanner;
  let status: string;
  if (!auto) status = "Scan en pause";
  else if (error) status = error;
  else if (stashOpen === false) status = "Ouvre ton coffre dans le jeu";
  else if (lastAutoScan)
    status = `${tabs.length} onglet${tabs.length > 1 ? "s" : ""} lu${tabs.length > 1 ? "s" : ""} · ${lastAutoScan.toLocaleTimeString("fr-FR")}`;
  else status = "En attente du coffre…";
  return (
    <div className="scan-control">
      <span className={`scan-dot${auto && !error ? (stashOpen ? " on" : " waiting") : ""}`} />
      <button type="button" className={auto ? "ghost" : "primary"} onClick={() => scanner.setAuto(!auto)}>
        {auto ? "Désactiver le scan" : "Activer le scan"}
      </button>
      <span className={auto && error ? "update-error" : "muted"} title={error ?? undefined}>
        {status}
      </span>
      {auto && !error && stashOpen && brightness >= BRIGHT_CAPTURE && (
        <span
          className="update-error"
          title="L'image du jeu est bien plus claire que d'habitude (HDR de Windows ou luminosité du jeu relevée). L'appli corrige, mais certains nombres peuvent être mal lus : désactive le HDR pour le jeu pour une lecture fiable."
        >
          Image très claire (HDR ?)
        </span>
      )}
    </div>
  );
}
