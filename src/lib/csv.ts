import { CURRENCY_LABEL, fromExalted, type Currency, type Rates } from "./currency";
import { CATEGORY_LABEL, type SnapshotItem } from "./types";

/** Nombre au format d'Excel français : virgule décimale, sans séparateur de milliers. */
function num(n: number | null | undefined, digits = 4): string {
  return n === null || n === undefined ? "" : String(Number(n.toFixed(digits))).replace(".", ",");
}

function cell(text: string): string {
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Objets du snapshot en CSV (séparateur « ; », lisible tel quel par Excel en français). */
export function snapshotCsv(items: SnapshotItem[], currency: Currency, rates: Rates): string {
  const label = CURRENCY_LABEL[currency];
  const head = ["Objet", "Catégorie", "Onglet", "Quantité", `Prix unitaire (${label})`, `Total (${label})`, "Variation 24 h (%)", "Variation 7 j (%)", "À vérifier"];
  const money = (exalted: number | null) => (exalted === null ? null : fromExalted(exalted, currency, rates));
  const lines = items.map((i) =>
    [
      cell(i.name),
      cell(CATEGORY_LABEL[i.category]),
      cell(i.stash ?? ""),
      String(i.quantity),
      num(money(i.unitExalted)),
      num(money(i.unitExalted === null ? null : i.unitExalted * i.quantity), 2),
      num(i.change24h, 1),
      num(i.change7d, 1),
      i.doubtful ? "oui" : "",
    ].join(";"),
  );
  return [head.join(";"), ...lines].join("\r\n") + "\r\n";
}
