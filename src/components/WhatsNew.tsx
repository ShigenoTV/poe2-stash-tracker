import type { ReleaseNotes } from "../lib/changelog";

interface Props {
  releases: ReleaseNotes[];
  title: string;
  onClose: () => void;
}

/** Notes de version : après une mise à jour, ou en cliquant sur le numéro de version. */
export function WhatsNew({ releases, title, onClose }: Props) {
  return (
    <div className="whatsnew-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="whatsnew" role="dialog" aria-label={title}>
        <div className="settings-head">
          <h2>{title}</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="whatsnew-body">
          {releases.length === 0 && <p className="muted">Pas de notes pour cette version.</p>}
          {releases.map((r) => (
            <article key={r.version}>
              <h3>
                Version {r.version}
                {r.date && <span className="muted"> · {new Date(r.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>}
              </h3>
              <ul>
                {r.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
