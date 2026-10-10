import { describeAlert, type PriceAlert } from "../lib/alerts";

interface Props {
  alerts: PriceAlert[];
  onDismiss: (key: string | null) => void;
}

/** Alertes de prix du jour, en haut de l'app. */
export function AlertsBanner({ alerts, onDismiss }: Props) {
  if (alerts.length === 0) return null;
  return (
    <section className="alerts" aria-label="Alertes de prix">
      <ul>
        {alerts.map((a) => (
          <li key={a.key} className={a.change24h > 0 ? "alert-up" : "alert-down"}>
            <span className="alert-arrow">{a.change24h > 0 ? "▲" : "▼"}</span>
            {a.icon && <img src={a.icon} alt="" />}
            <span className="alert-text">{describeAlert(a)}</span>
            <button type="button" className="alert-close" title="Fermer" onClick={() => onDismiss(a.key)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {alerts.length > 1 && (
        <button type="button" className="ghost" onClick={() => onDismiss(null)}>
          Tout fermer
        </button>
      )}
    </section>
  );
}
