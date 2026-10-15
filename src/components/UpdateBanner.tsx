import type { Updater } from "../lib/useUpdater";

export function UpdateBanner({ updater }: { updater: Updater }) {
  const { update, progress, error, install } = updater;
  if (!update) return null;
  const installing = progress !== undefined;
  return (
    <div className="update-banner" role="status">
      <span>
        Version {update.version} disponible
        {error && <span className="update-error"> · échec : {error}</span>}
      </span>
      <button type="button" onClick={install} disabled={installing}>
        {installing
          ? progress === null
            ? "Téléchargement…"
            : `Téléchargement ${progress}%`
          : "Mettre à jour et redémarrer"}
      </button>
    </div>
  );
}

const STATE_LABEL = {
  idle: null,
  checking: "Recherche…",
  upToDate: "À jour",
  available: "Mise à jour disponible",
  error: "Recherche impossible",
} as const;

/** Bouton « Rechercher une mise à jour » et numéro de version, dans la barre d'onglets. */
export function UpdateCheck({ updater, onShowNotes }: { updater: Updater; onShowNotes: () => void }) {
  const { version, state, error, check } = updater;
  const label = STATE_LABEL[state];
  return (
    <div className="update-check">
      {version && (
        <button type="button" className="version-link" title="Notes de version" onClick={onShowNotes}>
          v{version}
        </button>
      )}
      {label && (
        <span className={state === "error" ? "update-error" : "muted"} title={error ?? undefined}>
          {label}
        </span>
      )}
      <button type="button" onClick={() => check(true)} disabled={state === "checking"}>
        Rechercher une mise à jour
      </button>
    </div>
  );
}
