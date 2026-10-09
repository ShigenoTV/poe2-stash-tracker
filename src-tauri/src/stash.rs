//! Acquisition des coffres. L'API OAuth de GGG ne sert pas encore le realm `poe2`
//! (endpoints `/stash` « PoE1 only »), d'où une interface avec plusieurs fournisseurs :
//! `SessionProvider` (POESESSID) d'abord, `OAuthProvider` dès que GGG ouvre PoE2.

#![allow(dead_code)] // Implémenté à l'étape « Acquisition ».

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StashTabInfo {
    pub id: String,
    pub index: u32,
    pub name: String,
    pub kind: String,
    pub colour: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StashItem {
    pub type_line: String,
    pub base_type: String,
    pub icon: String,
    pub stack_size: u32,
    pub frame_type: u8,
}

#[derive(Debug)]
pub enum StashError {
    Unauthorized,
    RateLimited { retry_after_secs: u32 },
    Unavailable(String),
}

pub trait StashProvider {
    fn list_tabs(&self, league: &str) -> Result<Vec<StashTabInfo>, StashError>;
    fn fetch_tab(&self, league: &str, tab: &StashTabInfo) -> Result<Vec<StashItem>, StashError>;
}
