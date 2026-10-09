//! Fichier de prix publié chaque heure par le workflow `prices.yml`
//! (voir `scripts/fetch-prices.mjs`) et sa correspondance avec l'inventaire.

#![allow(dead_code)] // Branché sur l'UI à l'étape « Prix ».

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceFile {
    pub league: String,
    pub fetched_at: String,
    /// Monnaie de référence de poe.ninja (ex. `divine`), dans laquelle `value` est exprimé.
    pub primary: String,
    /// Combien d'unités de chaque monnaie vaut 1 `primary`.
    pub rates: HashMap<String, f64>,
    pub items: Vec<PricedItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PricedItem {
    pub id: String,
    pub name: String,
    pub category: String,
    pub icon: Option<String>,
    pub value: f64,
    pub volume: Option<f64>,
}

/// Normalise un nom d'objet pour le rapprochement GGG ↔ poe.ninja.
pub fn normalize_name(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .replace(['\u{2019}', '`'], "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub struct PriceIndex<'a> {
    file: &'a PriceFile,
    by_name: HashMap<String, &'a PricedItem>,
}

impl<'a> PriceIndex<'a> {
    pub fn new(file: &'a PriceFile) -> Self {
        let by_name = file
            .items
            .iter()
            .map(|item| (normalize_name(&item.name), item))
            .collect();
        Self { file, by_name }
    }

    pub fn find(&self, type_line: &str) -> Option<&'a PricedItem> {
        self.by_name.get(&normalize_name(type_line)).copied()
    }

    /// Valeur d'un objet exprimée dans `currency` (ex. `exalted`), ou `None` si le taux manque.
    pub fn value_in(&self, item: &PricedItem, currency: &str) -> Option<f64> {
        if currency == self.file.primary {
            return Some(item.value);
        }
        self.file.rates.get(currency).map(|rate| item.value * rate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> PriceFile {
        PriceFile {
            league: "Standard".into(),
            fetched_at: "2026-10-09T13:17:00Z".into(),
            primary: "divine".into(),
            rates: HashMap::from([("exalted".into(), 400.0)]),
            items: vec![PricedItem {
                id: "chaos".into(),
                name: "Chaos Orb".into(),
                category: "Currency".into(),
                icon: None,
                value: 0.05,
                volume: Some(1000.0),
            }],
        }
    }

    #[test]
    fn matches_names_loosely() {
        let file = sample();
        let index = PriceIndex::new(&file);
        assert!(index.find("  chaos   orb ").is_some());
        assert!(index.find("Divine Orb").is_none());
    }

    #[test]
    fn converts_through_rates() {
        let file = sample();
        let index = PriceIndex::new(&file);
        let chaos = index.find("Chaos Orb").unwrap();
        assert_eq!(index.value_in(chaos, "divine"), Some(0.05));
        assert_eq!(index.value_in(chaos, "exalted"), Some(20.0));
        assert_eq!(index.value_in(chaos, "mirror"), None);
    }
}
