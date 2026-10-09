import { formatValue } from "./format";

/** Devise dans laquelle l'app affiche les valeurs. */
export type Currency = "exalted" | "chaos" | "divine";

export const CURRENCIES: Currency[] = ["exalted", "chaos", "divine"];

export const CURRENCY_LABEL: Record<Currency, string> = { exalted: "Exalted", chaos: "Chaos", divine: "Divine" };
export const CURRENCY_ABBR: Record<Currency, string> = { exalted: "ex", chaos: "c", divine: "div" };

/** Taux poe.ninja : combien de chaque devise vaut 1 Divine. */
export interface Rates {
  exaltedPerDivine: number;
  chaosPerDivine?: number | null;
}

/** La devise demandée, ou Divine si son taux manque (Chaos absent d'un ancien snapshot). */
export function usable(currency: Currency, rates: Rates): Currency {
  return currency === "chaos" && !rates.chaosPerDivine ? "divine" : currency;
}

export function fromDivine(divine: number, currency: Currency, rates: Rates): number {
  switch (usable(currency, rates)) {
    case "exalted":
      return divine * rates.exaltedPerDivine;
    case "chaos":
      return divine * rates.chaosPerDivine!;
    default:
      return divine;
  }
}

export function fromExalted(exalted: number, currency: Currency, rates: Rates): number {
  return currency === "exalted" ? exalted : fromDivine(exalted / rates.exaltedPerDivine, currency, rates);
}

/** « 12.5 div », « 9 640 ex », « 133 c ». */
export function formatMoney(value: number, currency: Currency): string {
  return `${formatValue(value)} ${CURRENCY_ABBR[currency]}`;
}

const KEY = "displayCurrency";

export function loadCurrency(): Currency {
  try {
    const v = localStorage.getItem(KEY);
    return CURRENCIES.includes(v as Currency) ? (v as Currency) : "divine";
  } catch {
    return "divine";
  }
}

export function saveCurrency(currency: Currency): void {
  try {
    localStorage.setItem(KEY, currency);
  } catch {
    // Stockage indisponible : le choix vaut pour la session.
  }
}
