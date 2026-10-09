import type { StashScanner } from "../lib/useStashScanner";

/** Ligue et heure des prix, avec actualisation. */
export function PricesControl({ scanner }: { scanner: StashScanner }) {
  const { prices, pricesBusy } = scanner;
  const at = prices && new Date(prices.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="prices-control">
      {prices && (
        <span className="muted" title="Prix poe.ninja, publiés toutes les heures">
          {prices.league} · prix de {at}
        </span>
      )}
      <button type="button" className="ghost" onClick={scanner.refreshPrices} disabled={pricesBusy}>
        {pricesBusy ? "Actualisation…" : "Actualiser les prix"}
      </button>
    </div>
  );
}
