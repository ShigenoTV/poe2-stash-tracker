//! Commandes Tauri : capture de la fenêtre du jeu et lecture du coffre dans une zone choisie.

use crate::capture::{self, CaptureMethod};
use crate::icons;
use crate::library::{Identification, LibraryState};
use crate::vision::{self, Rect};
use base64::Engine;
use image::{imageops, RgbImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::Mutex;

/// Dernière capture, gardée pour pouvoir relire une zone sans recapturer.
#[derive(Default)]
pub struct LastCapture(pub Mutex<Option<RgbImage>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePreview {
    pub width: u32,
    pub height: u32,
    pub method: CaptureMethod,
    /// PNG encodé en base64, réduit pour l'affichage.
    pub png_base64: String,
}

/// Zone du coffre en fractions de l'image (0..1), pour survivre à un changement de résolution.
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct Region {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedSlot {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub quantity: Option<u32>,
    pub icon_png_base64: String,
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
}

fn png_base64(img: &RgbImage) -> Result<String, String> {
    let mut bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

fn to_rgb(c: capture::Captured) -> Result<RgbImage, String> {
    let rgba = image::RgbaImage::from_raw(c.width, c.height, c.rgba)
        .ok_or("Capture : taille d'image incohérente")?;
    Ok(image::DynamicImage::ImageRgba8(rgba).to_rgb8())
}

#[tauri::command]
pub async fn capture_game(state: tauri::State<'_, LastCapture>) -> Result<CapturePreview, String> {
    let captured = tauri::async_runtime::spawn_blocking(capture::capture_game_window)
        .await
        .map_err(|e| e.to_string())??;
    let method = captured.method;
    let img = to_rgb(captured)?;
    let pw = img.width().min(1600);
    let preview = imageops::thumbnail(&img, pw, img.height() * pw / img.width().max(1));
    let result = CapturePreview { width: img.width(), height: img.height(), method, png_base64: png_base64(&preview)? };
    *state.0.lock().map_err(|e| e.to_string())? = Some(img);
    Ok(result)
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
                descriptor: base64::engine::general_purpose::STANDARD.encode(icons::describe_slot(&icon).0),
                icon_png_base64: png_base64(&icon)?,
                identification: None,
            })
        })
        .collect::<Result<_, String>>()?;
    Ok(ScanResult { slot_side: side, slots: scanned, identify_error: None })
}

fn crop_region(img: &RgbImage, region: Region) -> Result<RgbImage, String> {
    let clamp = |v: f64| v.clamp(0.0, 1.0);
    let x = (clamp(region.x) * f64::from(img.width())) as u32;
    let y = (clamp(region.y) * f64::from(img.height())) as u32;
    let w = ((clamp(region.w) * f64::from(img.width())) as u32).min(img.width() - x);
    let h = ((clamp(region.h) * f64::from(img.height())) as u32).min(img.height() - y);
    if w < 50 || h < 50 {
        return Err("Zone trop petite.".into());
    }
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
                slot.identification = Some(lib.identify(&icons::Descriptor(bytes)));
            }
        }
        Err(err) => result.identify_error = Some(err),
    }
    Ok(())
}

#[tauri::command]
pub async fn scan_region(
    app: tauri::AppHandle,
    capture: tauri::State<'_, LastCapture>,
    library: tauri::State<'_, LibraryState>,
    region: Region,
) -> Result<ScanResult, String> {
    let stash = {
        let guard = capture.0.lock().map_err(|e| e.to_string())?;
        let img = guard.as_ref().ok_or("Aucune capture : capture d'abord la fenêtre du jeu.")?;
        crop_region(img, region)?
    };
    let mut result = scan_image(&stash)?;
    identify_all(&app, &library, &mut result).await?;
    Ok(result)
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
}

/// Un tour du scan automatique : capture, puis scan seulement si la zone a changé
/// et qu'elle est restée identique deux tours de suite (fin d'animation, de survol…).
#[tauri::command]
pub async fn auto_scan(
    app: tauri::AppHandle,
    library: tauri::State<'_, LibraryState>,
    auto: tauri::State<'_, AutoScanState>,
    region: Region,
) -> Result<AutoScanResult, String> {
    let captured = tauri::async_runtime::spawn_blocking(capture::capture_game_window)
        .await
        .map_err(|e| e.to_string())??;
    let stash = crop_region(&to_rgb(captured)?, region)?;
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
    if !scan.slots.is_empty() {
        identify_all(&app, &library, &mut scan).await?;
    }
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
