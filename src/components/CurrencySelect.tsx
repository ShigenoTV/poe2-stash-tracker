import { CURRENCIES, CURRENCY_LABEL, type Currency } from "../lib/currency";

interface Props {
  value: Currency;
  onChange: (c: Currency) => void;
  /** Chaos est grisé quand aucun taux Chaos n'est connu. */
  chaosAvailable: boolean;
}

export function CurrencySelect({ value, onChange, chaosAvailable }: Props) {
  return (
    <div className="currency-select" role="group" aria-label="Devise affichée">
      {CURRENCIES.map((c) => {
        const disabled = c === "chaos" && !chaosAvailable;
        return (
          <button
            key={c}
            type="button"
            className={value === c && !disabled ? "active" : ""}
            disabled={disabled}
            title={disabled ? "Taux Chaos indisponible : fais un nouveau scan" : undefined}
            onClick={() => onChange(c)}
          >
            {CURRENCY_LABEL[c]}
          </button>
        );
      })}
    </div>
  );
}
