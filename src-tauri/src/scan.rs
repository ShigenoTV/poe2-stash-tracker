//! Commandes Tauri : capture de la fenêtre du jeu et lecture du coffre dans une zone choisie.

use crate::capture::{self, CaptureMethod};
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub slot_side: Option<u32>,
    pub slots: Vec<ScannedSlot>,
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
                icon_png_base64: png_base64(&icon)?,
            })
        })
        .collect::<Result<_, String>>()?;
    Ok(ScanResult { slot_side: side, slots: scanned })
}

#[tauri::command]
pub fn scan_region(state: tauri::State<'_, LastCapture>, region: Region) -> Result<ScanResult, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let img = guard.as_ref().ok_or("Aucune capture : capture d'abord la fenêtre du jeu.")?;
    let clamp = |v: f64| v.clamp(0.0, 1.0);
    let x = (clamp(region.x) * f64::from(img.width())) as u32;
    let y = (clamp(region.y) * f64::from(img.height())) as u32;
    let w = ((clamp(region.w) * f64::from(img.width())) as u32).min(img.width() - x);
    let h = ((clamp(region.h) * f64::from(img.height())) as u32).min(img.height() - y);
    if w < 50 || h < 50 {
        return Err("Zone trop petite.".into());
    }
    scan_image(&imageops::crop_imm(img, x, y, w, h).to_image())
}
