import { useEffect, useRef, useState } from "react";
import { describeAlert, type PriceAlert } from "../lib/alerts";

interface Props {
  alerts: PriceAlert[];
  onDismiss: (key: string | null) => void;
}

/** Alertes de prix du jour : une cloche avec leur nombre dans la barre du haut, la liste en menu déroulant. */
export function AlertsBell({ alerts, onDismiss }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => {
    if (alerts.length === 0) setOpen(false);
  }, [alerts.length]);
  if (alerts.length === 0) return null;
  const up = alerts.filter((a) => a.change24h > 0).length;
  const down = alerts.length - up;
  return (
    <div className="alerts-bell" ref={root}>
      <button
        type="button"
        className={open ? "alerts-toggle active" : "alerts-toggle"}
        title="Alertes de prix"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>🔔</span>
        <span className="alerts-count">{alerts.length}</span>
        {up > 0 && <span className="alert-up"><span className="alert-arrow">▲</span>{up}</span>}
        {down > 0 && <span className="alert-down"><span className="alert-arrow">▼</span>{down}</span>}
      </button>
      {open && (
        <section className="alerts-menu" role="dialog" aria-label="Alertes de prix">
          <div className="alerts-head">
            <span>Alertes de prix (24 h)</span>
            <button type="button" className="ghost" onClick={() => onDismiss(null)}>
              Tout effacer
            </button>
          </div>
          <ul>
            {alerts.map((a) => (
              <li key={a.key} className={a.change24h > 0 ? "alert-up" : "alert-down"}>
                <span className="alert-arrow">{a.change24h > 0 ? "▲" : "▼"}</span>
                {a.icon && <img src={a.icon} alt="" />}
                <span className="alert-text">{describeAlert(a)}</span>
                <button type="button" className="alert-close" title="Effacer" onClick={() => onDismiss(a.key)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
