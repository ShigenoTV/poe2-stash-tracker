//! Lecture des en-têtes de rate limit de l'API GGG.
//!
//! GGG renvoie, pour chaque règle listée dans `X-Rate-Limit-Rules` (ex. `Ip,Account`),
//! deux en-têtes au format `hits:période:pénalité` séparés par des virgules :
//! `X-Rate-Limit-<Règle>` (la limite) et `X-Rate-Limit-<Règle>-State` (l'état courant).
//! Le débit n'est jamais codé en dur : on s'adapte à ce que le serveur annonce.

#![allow(dead_code)] // Branché sur le client HTTP à l'étape « Acquisition ».

use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Window {
    pub hits: u32,
    pub period_secs: u32,
    pub restricted_secs: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule {
    pub name: String,
    pub limits: Vec<Window>,
    pub state: Vec<Window>,
}

fn parse_windows(value: &str) -> Vec<Window> {
    value
        .split(',')
        .filter_map(|part| {
            let mut it = part.trim().split(':').map(|n| n.parse::<u32>().ok());
            Some(Window {
                hits: it.next()??,
                period_secs: it.next()??,
                restricted_secs: it.next()??,
            })
        })
        .collect()
}

/// Construit les règles à partir d'une fonction de lecture d'en-tête (insensible à la casse).
pub fn parse_rules<'a>(header: impl Fn(&str) -> Option<&'a str>) -> Vec<Rule> {
    let Some(names) = header("x-rate-limit-rules") else {
        return Vec::new();
    };
    names
        .split(',')
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(|name| {
            let key = format!("x-rate-limit-{}", name.to_ascii_lowercase());
            Rule {
                name: name.to_string(),
                limits: header(&key).map(parse_windows).unwrap_or_default(),
                state: header(&format!("{key}-state"))
                    .map(parse_windows)
                    .unwrap_or_default(),
            }
        })
        .collect()
}

/// Délai à respecter avant la prochaine requête.
///
/// - une pénalité active (`restricted_secs > 0` dans l'état) impose d'attendre sa fin ;
/// - si une fenêtre est pleine, on attend une période complète par prudence ;
/// - sinon, on espace les requêtes selon la fenêtre la plus stricte.
pub fn next_delay(rules: &[Rule], retry_after_secs: Option<u32>) -> Duration {
    let mut wait = Duration::from_secs(u64::from(retry_after_secs.unwrap_or(0)));
    for rule in rules {
        for (limit, state) in rule.limits.iter().zip(rule.state.iter()) {
            if state.restricted_secs > 0 {
                wait = wait.max(Duration::from_secs(u64::from(state.restricted_secs)));
            } else if limit.hits > 0 && state.hits >= limit.hits {
                wait = wait.max(Duration::from_secs(u64::from(limit.period_secs)));
            } else if limit.hits > 0 {
                let spacing = Duration::from_secs_f64(
                    f64::from(limit.period_secs) / f64::from(limit.hits),
                );
                wait = wait.max(spacing);
            }
        }
    }
    wait
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn headers(pairs: &[(&str, &'static str)]) -> HashMap<String, &'static str> {
        pairs.iter().map(|(k, v)| (k.to_ascii_lowercase(), *v)).collect()
    }

    #[test]
    fn parses_rules_and_state() {
        let h = headers(&[
            ("X-Rate-Limit-Rules", "Ip,Account"),
            ("X-Rate-Limit-Ip", "45:60:120,180:1800:600"),
            ("X-Rate-Limit-Ip-State", "3:60:0,10:1800:0"),
            ("X-Rate-Limit-Account", "30:60:60"),
            ("X-Rate-Limit-Account-State", "1:60:0"),
        ]);
        let rules = parse_rules(|k| h.get(k).copied());
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].name, "Ip");
        assert_eq!(
            rules[0].limits[1],
            Window { hits: 180, period_secs: 1800, restricted_secs: 600 }
        );
        assert_eq!(rules[1].state[0].hits, 1);
    }

    #[test]
    fn no_rules_header_means_no_rules() {
        assert!(parse_rules(|_| None).is_empty());
    }

    #[test]
    fn active_penalty_wins() {
        let h = headers(&[
            ("X-Rate-Limit-Rules", "Ip"),
            ("X-Rate-Limit-Ip", "45:60:120"),
            ("X-Rate-Limit-Ip-State", "46:60:97"),
        ]);
        let rules = parse_rules(|k| h.get(k).copied());
        assert_eq!(next_delay(&rules, None), Duration::from_secs(97));
    }

    #[test]
    fn full_window_waits_a_period_and_retry_after_is_respected() {
        let h = headers(&[
            ("X-Rate-Limit-Rules", "Account"),
            ("X-Rate-Limit-Account", "30:60:60"),
            ("X-Rate-Limit-Account-State", "30:60:0"),
        ]);
        let rules = parse_rules(|k| h.get(k).copied());
        assert_eq!(next_delay(&rules, None), Duration::from_secs(60));
        assert_eq!(next_delay(&rules, Some(120)), Duration::from_secs(120));
    }

    #[test]
    fn spacing_follows_strictest_window() {
        let h = headers(&[
            ("X-Rate-Limit-Rules", "Ip"),
            ("X-Rate-Limit-Ip", "45:60:120,180:1800:600"),
            ("X-Rate-Limit-Ip-State", "1:60:0,1:1800:0"),
        ]);
        let rules = parse_rules(|k| h.get(k).copied());
        // 1800 s / 180 = 10 s est plus strict que 60 s / 45 ≈ 1,33 s.
        assert_eq!(next_delay(&rules, None), Duration::from_secs(10));
    }
}
