//! Commandes Tauri : lecture du coffre, à sa place fixe dans la fenêtre du jeu.

use crate::capture;
use crate::icons;
use crate::library::{Identification, LibraryState};
use crate::stashtype;
use crate::tabname;
use crate::vision::{self, Rect};
use base64::Engine;
use image::{imageops, RgbImage, RgbaImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::Mutex;

/// Zone du coffre en fractions de l'image (0..1), pour survivre à un changement de résolution.
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct Region {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Region {
    /// Grille du coffre ouvert. L'interface du jeu est ancrée à gauche et suit la hauteur de
    /// l'écran : mesurée identique en 1920×1080 et 2560×1440 (x 18, y 123, 637×642 sur 1080).
    pub fn stash(width: u32, height: u32) -> Region {
        let unit = f64::from(height) / 1080.0;
        let (w, h) = (f64::from(width.max(1)), f64::from(height.max(1)));
        Region { x: 18.0 * unit / w, y: 123.0 * unit / h, w: 637.0 * unit / w, h: 642.0 * unit / h }
    }
}

/// Un coffre ouvert montre des cases de taille régulière, dont plusieurs avec une quantité ;
/// le décor du jeu (coffre fermé) n'en produit pas.
fn looks_like_stash(scan: &ScanResult) -> bool {
    scan.slot_side.is_some() && scan.slots.iter().filter(|s| s.quantity.is_some()).count() >= 2
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedSlot {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub quantity: Option<u32>,
    /// Palier lu sur la case (2 = Greater, 3 = Perfect, 0 = objet de base ou sans palier).
    pub tier: u8,
    /// Image de la case, envoyée seulement quand l'objet est inconnu ou douteux (sinon l'icône
    /// poe.ninja suffit) : moins de PNG à encoder et à garder côté interface.
    pub icon_png_base64: Option<String>,
    #[serde(skip)]
    icon: RgbImage,
    /// Empreinte de l'icône, renvoyée par l'UI pour corriger l'objet (`label_slot`).
    pub descriptor: String,
    /// `None` si les prix et icônes de référence n'ont pas pu être chargés.
    pub identification: Option<Identification>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub slot_side: Option<u32>,
    pub slots: Vec<ScannedSlot>,
    /// Raison pour laquelle les objets n'ont pas pu être identifiés.
    pub identify_error: Option<String>,
    /// Nom de l'onglet sélectionné, lu en jeu ; `None` s'il n'a pas pu être lu.
    pub tab_name: Option<String>,
    /// Type d'onglet spécial reconnu à sa disposition (« Breach »…), `None` pour un onglet ordinaire.
    pub stash_type: Option<String>,
}

fn png_base64(img: &RgbImage) -> Result<String, String> {
    let mut bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Zone du coffre découpée dans la capture, convertie en RGB : seule la zone est convertie,
/// pas l'écran entier.
fn crop_captured(rgba: &RgbaImage, region: Option<Region>) -> Result<RgbImage, String> {
    let (x, y, w, h) = region_rect(rgba.width(), rgba.height(), region.unwrap_or_else(|| Region::stash(rgba.width(), rgba.height())))?;
    Ok(RgbImage::from_fn(w, h, |px, py| {
        let [r, g, b, _] = rgba.get_pixel(x + px, y + py).0;
        image::Rgb([r, g, b])
    }))
}

pub fn scan_image(img: &RgbImage) -> Result<ScanResult, String> {
    let slots = vision::find_filled_slots(img);
    let side = vision::slot_side(&slots);
    let scanned = slots
        .iter()
        .map(|s: &Rect| {
            let icon = imageops::crop_imm(img, s.x, s.y, s.w, s.h).to_image();
            Ok(ScannedSlot {
                x: s.x,
                y: s.y,
                w: s.w,
                h: s.h,
                quantity: side.and_then(|side| vision::read_quantity(img, s, side)),
                tier: side.map_or(0, |side| vision::tier_mark(img, s, side)),
                descriptor: base64::engine::general_purpose::STANDARD.encode(icons::describe_slot(&icon).0),
                icon_png_base64: None,
                icon,
                identification: None,
            })
        })
        .collect::<Result<_, String>>()?;
    Ok(ScanResult { slot_side: side, slots: scanned, identify_error: None, tab_name: None, stash_type: None })
}

/// Rectangle en pixels d'une zone exprimée en fractions de l'image.
fn region_rect(width: u32, height: u32, region: Region) -> Result<(u32, u32, u32, u32), String> {
    let clamp = |v: f64| v.clamp(0.0, 1.0);
    let x = (clamp(region.x) * f64::from(width)) as u32;
    let y = (clamp(region.y) * f64::from(height)) as u32;
    let w = ((clamp(region.w) * f64::from(width)) as u32).min(width - x);
    let h = ((clamp(region.h) * f64::from(height)) as u32).min(height - y);
    if w < 50 || h < 50 {
        return Err("Zone trop petite.".into());
    }
    Ok((x, y, w, h))
}

#[cfg(test)]
fn crop_region(img: &RgbImage, region: Region) -> Result<RgbImage, String> {
    let (x, y, w, h) = region_rect(img.width(), img.height(), region)?;
    Ok(imageops::crop_imm(img, x, y, w, h).to_image())
}

async fn identify_all(
    app: &tauri::AppHandle,
    library: &LibraryState,
    result: &mut ScanResult,
) -> Result<(), String> {
    let mut lib = library.0.lock().await;
    match lib.ensure_loaded(app).await {
        Ok(()) => {
            for slot in &mut result.slots {
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(&slot.descriptor)
                    .map_err(|e| e.to_string())?;
                slot.identification = Some(lib.identify(&icons::Descriptor(bytes), slot.tier));
            }
        }
        Err(err) => result.identify_error = Some(err),
    }
    for slot in &mut result.slots {
        if !slot.identification.as_ref().is_some_and(Identification::confident) {
            slot.icon_png_base64 = Some(png_base64(&slot.icon)?);
        }
    }
    Ok(())
}

/// Vignette grise de la zone, pour détecter un changement d'onglet à moindre coût.
fn thumbnail(img: &RgbImage) -> Vec<u8> {
    let gray = image::DynamicImage::ImageRgb8(img.clone()).to_luma8();
    imageops::resize(&gray, 48, 48, imageops::FilterType::Triangle).into_raw()
}

/// Écart moyen entre deux vignettes (0..255).
fn thumb_diff(a: &[u8], b: &[u8]) -> f32 {
    let sum: u32 = a.iter().zip(b).map(|(x, y)| u32::from(x.abs_diff(*y))).sum();
    sum as f32 / a.len().max(1) as f32
}

/// Au-dessus, la zone a changé (autre onglet, coffre fermé…).
const CHANGE_THRESHOLD: f32 = 3.0;

#[derive(Default)]
pub struct AutoScanState(Mutex<AutoScanInner>);

#[derive(Default)]
struct AutoScanInner {
    /// Vignette vue au tour précédent, en attente de confirmation (image stable).
    pending: Option<Vec<u8>>,
    /// Vignette du dernier scan effectué.
    scanned: Option<Vec<u8>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum AutoScanResult {
    /// Rien n'a bougé depuis le dernier scan.
    Unchanged,
    /// La zone change ; on attend qu'elle se stabilise.
    Changing,
    /// Nouvelle image stable, scannée.
    Scanned { scan: ScanResult },
    /// Image stable, mais le coffre n'est pas ouvert.
    NoStash,
}

/// Un tour du scan automatique : capture, puis scan seulement si la zone a changé
/// et qu'elle est restée identique deux tours de suite (fin d'animation, de survol…).
#[tauri::command]
pub async fn auto_scan(
    app: tauri::AppHandle,
    library: tauri::State<'_, LibraryState>,
    auto: tauri::State<'_, AutoScanState>,
    region: Option<Region>,
) -> Result<AutoScanResult, String> {
    let captured = tauri::async_runtime::spawn_blocking(capture::capture_game_window)
        .await
        .map_err(|e| e.to_string())??;
    let screen = RgbaImage::from_raw(captured.width, captured.height, captured.rgba)
        .ok_or("Capture : taille d'image incohérente")?;
    let stash = crop_captured(&screen, region)?;
    let thumb = thumbnail(&stash);

    {
        let mut state = auto.0.lock().map_err(|e| e.to_string())?;
        if state.scanned.as_deref().is_some_and(|s| thumb_diff(s, &thumb) < CHANGE_THRESHOLD) {
            state.pending = None;
            return Ok(AutoScanResult::Unchanged);
        }
        let stable = state.pending.as_deref().is_some_and(|p| thumb_diff(p, &thumb) < CHANGE_THRESHOLD);
        if !stable {
            state.pending = Some(thumb);
            return Ok(AutoScanResult::Changing);
        }
        state.pending = None;
        state.scanned = Some(thumb);
    }

    let mut scan = scan_image(&stash)?;
    if !looks_like_stash(&scan) {
        return Ok(AutoScanResult::NoStash);
    }
    identify_all(&app, &library, &mut scan).await?;
    (scan.stash_type, scan.tab_name) = tauri::async_runtime::spawn_blocking(move || {
        (stashtype::detect(&screen).map(String::from), tabname::read(&screen))
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(AutoScanResult::Scanned { scan })
}

/// Oublie le dernier scan automatique : le prochain tour rescannera la zone.
#[tauri::command]
pub fn reset_auto_scan(auto: tauri::State<'_, AutoScanState>) -> Result<(), String> {
    *auto.0.lock().map_err(|e| e.to_string())? = AutoScanInner::default();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> RgbImage {
        let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
        image::open(path).unwrap().to_rgb8()
    }

    #[test]
    fn fixed_region_finds_the_open_stash_at_both_resolutions() {
        for name in ["fullscreen-1920x1080.png", "fullscreen-2560x1440.png"] {
            let img = fixture(name);
            let scan = scan_image(&crop_region(&img, Region::stash(img.width(), img.height())).unwrap()).unwrap();
            assert!(scan.slots.len() >= 36, "{name}: {} cases", scan.slots.len());
            assert!(looks_like_stash(&scan), "{name}");
        }
        let img = fixture("fullscreen-2560x1440.png");
        let scan = scan_image(&crop_region(&img, Region::stash(img.width(), img.height())).unwrap()).unwrap();
        assert_eq!(scan.slots.iter().filter(|s| s.quantity.is_some()).count(), 35);
    }

    #[test]
    fn reads_every_quantity_in_1080p() {
        let img = fixture("fullscreen-1920x1080.png");
        let scan = scan_image(&crop_region(&img, Region::stash(img.width(), img.height())).unwrap()).unwrap();
        let read: Vec<Option<u32>> = scan.slots.iter().map(|s| s.quantity).collect();
        #[rustfmt::skip]
        let want = [
            Some(159), Some(166), Some(19), Some(65), Some(150), Some(16), Some(47), Some(32), Some(2),
            Some(236), Some(186), Some(26), Some(9), Some(81), Some(110),
            Some(229), Some(41), Some(9), Some(50), Some(245), Some(123),
            Some(5000), Some(29), Some(1), None, Some(39), Some(68),
            Some(84), Some(28), Some(1), Some(18), Some(9), Some(3),
            Some(37), Some(146), Some(1), Some(523),
        ];
        assert_eq!(read, want);
    }

    #[test]
    fn reads_geforce_now_stream() {
        // Plein écran GeForce NOW (2558×1438) : cadre bleu autour du coffre et chiffres compressés.
        let img = fixture("geforce-now.png");
        let scan = scan_image(&crop_region(&img, Region::stash(img.width(), img.height())).unwrap()).unwrap();
        let want = [
            "99", "102", "16", "125", "39", "10", "20", "33", "10", "99", "73", "18", "11", "414", "101", "32", "12",
            "1", "20", "126", "126", "1829", "44", "2", "-", "15", "66", "289", "14", "2", "124", "2", "6", "5", "8",
            "3",
        ];
        assert_eq!(scan.slots.len(), want.len());
        let right = scan
            .slots
            .iter()
            .zip(want)
            .filter(|(s, w)| s.quantity.map_or("-".to_string(), |q| q.to_string()) == *w)
            .count();
        assert!(right >= 32, "{right}/36 bonnes lectures");
    }

    #[test]
    fn game_scenery_is_not_a_stash() {
        let img = fixture("fullscreen-1920x1080.png");
        // Même taille de zone, déplacée sur le décor au centre de l'écran.
        let mut region = Region::stash(img.width(), img.height());
        region.x = 0.36;
        region.w = 0.3;
        let scan = scan_image(&crop_region(&img, region).unwrap()).unwrap();
        assert!(!looks_like_stash(&scan));
    }

    #[test]
    fn thumbnails_detect_tab_change_but_not_noise() {
        let path = format!("{}/tests/fixtures/fragments-tab.png", env!("CARGO_MANIFEST_DIR"));
        let img = image::open(path).unwrap().to_rgb8();
        let mut noisy = img.clone();
        for (i, p) in noisy.pixels_mut().enumerate() {
            if i % 7 == 0 {
                p.0[0] = p.0[0].saturating_add(6);
            }
        }
        let other = imageops::flip_horizontal(&img);
        let t = thumbnail(&img);
        assert!(thumb_diff(&t, &thumbnail(&noisy)) < CHANGE_THRESHOLD);
        assert!(thumb_diff(&t, &thumbnail(&other)) > CHANGE_THRESHOLD);
    }
}
