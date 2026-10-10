//! Nom de l'onglet du coffre affiché en jeu : on repère l'onglet sélectionné dans la rangée
//! d'onglets, puis Windows lit son texte (OCR intégré au système).

use crate::vision::Rect;
use image::RgbaImage;

/// Hauts et bas de la rangée d'onglets, en unités d'un écran de 1080 de haut. Sans dossier,
/// les onglets sont juste sous le titre ; avec des dossiers (« Stash », « Stockage »…), une
/// rangée de dossiers s'intercale et les onglets descendent.
const LAYOUTS: [(f64, f64); 2] = [(97.0, 122.0), (134.0, 159.0)];
/// Zone horizontale parcourue : de la flèche gauche à la flèche droite de la rangée ; au-delà,
/// les onglets passent sous la flèche droite et ne sont plus qu'en partie visibles.
const ROW_X: (f64, f64) = (30.0, 585.0);
/// Le premier onglet commence juste après la flèche gauche.
const FIRST_TAB_X: (f64, f64) = (40.0, 62.0);
const MIN_TAB_W: f64 = 20.0;
const MAX_TAB_W: f64 = 260.0;
/// Un pixel plus clair que ça appartient à un onglet, pas au fond entre deux onglets.
const TAB_LUM: f64 = 22.0;
/// L'onglet sélectionné se fond dans le cadre du coffre : son bas est plus clair que son haut,
/// au contraire des autres (rapport ≈ 1,25–1,35 contre 0,7–1).
const SELECTED_RATIO: f64 = 1.12;
const SELECTED_MARGIN: f64 = 0.2;

fn lum(img: &RgbaImage, x: u32, y: u32) -> f64 {
    let [r, g, b, _] = img.get_pixel(x.min(img.width() - 1), y.min(img.height() - 1)).0;
    (f64::from(r) + f64::from(g) + f64::from(b)) / 3.0
}

struct Tab {
    x0: u32,
    x1: u32,
    ratio: f64,
}

/// Onglets d'une disposition, ou `None` si la rangée ne ressemble pas à des onglets.
fn tabs_in_layout(img: &RgbaImage, unit: f64, (top, bottom): (f64, f64)) -> Option<Vec<Tab>> {
    let px = |v: f64| (v * unit).round() as u32;
    let rows = [px(top + 5.0), px((top + bottom) / 2.0), px(bottom - 5.0)];
    if px(bottom) >= img.height() {
        return None;
    }
    let end = px(ROW_X.1).min(img.width());
    let is_tab = |x: u32| {
        let mut v = rows.map(|y| lum(img, x, y));
        v.sort_by(f64::total_cmp);
        v[1] > TAB_LUM
    };
    let mut spans = Vec::new();
    let mut start = None;
    for x in px(ROW_X.0)..end {
        match (is_tab(x), start) {
            (true, None) => start = Some(x),
            (false, Some(s)) => {
                spans.push((s, x));
                start = None;
            }
            _ => {}
        }
    }
    // Un onglet coupé par le bord de la zone n'est pas fiable.
    let spans: Vec<_> = spans.into_iter().filter(|&(a, b)| f64::from(b - a) >= MIN_TAB_W * unit).collect();
    let first = spans.first()?;
    let first_x = f64::from(first.0) / unit;
    if spans.len() < 2 || first_x < FIRST_TAB_X.0 || first_x > FIRST_TAB_X.1 {
        return None;
    }
    if spans.iter().any(|&(a, b)| f64::from(b - a) > MAX_TAB_W * unit) {
        return None;
    }
    let (y_top, y_bottom) = (px(top + 4.0), px(bottom - 3.0));
    Some(
        spans
            .into_iter()
            .map(|(x0, x1)| {
                let margin = px(3.0);
                let cols: Vec<u32> = (x0 + margin..x1.saturating_sub(margin)).collect();
                let median = |y: u32| {
                    let mut v: Vec<f64> = cols.iter().map(|&x| lum(img, x, y)).collect();
                    v.sort_by(f64::total_cmp);
                    v.get(v.len() / 2).copied().unwrap_or(0.0)
                };
                Tab { x0, x1, ratio: median(y_bottom) / median(y_top).max(1.0) }
            })
            .collect(),
    )
}

/// Zone du texte de l'onglet sélectionné, en pixels ; `None` si aucun ne se détache nettement.
/// `unit` : pixels par unité d'écran 1080 (hauteur de l'écran / 1080).
pub fn selected_tab_text(img: &RgbaImage, unit: f64) -> Option<Rect> {
    let mut found = None;
    for layout in LAYOUTS {
        let Some(tabs) = tabs_in_layout(img, unit, layout) else { continue };
        let mut by_ratio: Vec<&Tab> = tabs.iter().collect();
        by_ratio.sort_by(|a, b| b.ratio.total_cmp(&a.ratio));
        let best = by_ratio[0];
        if best.ratio < SELECTED_RATIO || by_ratio[1].ratio > best.ratio - SELECTED_MARGIN {
            continue;
        }
        if found.is_some() {
            // Deux dispositions plausibles à la fois : on ne devine pas.
            return None;
        }
        let px = |v: f64| (v * unit).round() as u32;
        let (top, bottom) = layout;
        found = Some(Rect {
            x: best.x0 + px(4.0),
            y: px(top + 3.0),
            w: (best.x1 - best.x0).saturating_sub(px(8.0)),
            h: px(bottom - top - 6.0),
        });
    }
    found
}

/// Nettoie le texte lu : le cadenas affiché après le nom est parfois lu comme une lettre isolée.
pub fn clean_name(text: &str) -> Option<String> {
    let mut words: Vec<&str> = text.split_whitespace().collect();
    if words.len() >= 2 {
        let last = words[words.len() - 1];
        let mut chars = last.chars();
        if let (Some(c), None) = (chars.next(), chars.next()) {
            if !c.is_ascii_digit() {
                words.pop();
            }
        }
    }
    let name = words.join(" ");
    let name = name.trim_matches(|c: char| !c.is_alphanumeric() && c != ')' && c != '(').trim();
    (!name.is_empty()).then(|| name.to_string())
}

/// Nom de l'onglet sélectionné, lu dans la capture complète de la fenêtre du jeu.
pub fn read(img: &RgbaImage) -> Option<String> {
    let unit = f64::from(img.height()) / 1080.0;
    let rect = selected_tab_text(img, unit)?;
    let crop = image::imageops::crop_imm(img, rect.x, rect.y, rect.w, rect.h).to_image();
    clean_name(&ocr::recognize(&crop)?)
}

#[cfg(windows)]
mod ocr {
    use image::RgbaImage;
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    /// L'OCR de Windows lit mal les petits textes : on agrandit le nom jusqu'à cette hauteur.
    const MIN_HEIGHT: u32 = 60;

    pub fn recognize(img: &RgbaImage) -> Option<String> {
        let scale = (MIN_HEIGHT as f32 / img.height().max(1) as f32).max(1.0);
        let img = image::imageops::resize(
            img,
            (img.width() as f32 * scale) as u32,
            (img.height() as f32 * scale) as u32,
            image::imageops::FilterType::Triangle,
        );
        run(&img).ok().filter(|t| !t.trim().is_empty())
    }

    fn run(img: &RgbaImage) -> windows::core::Result<String> {
        // Déjà initialisé sur ce thread : l'erreur est sans conséquence.
        let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
        let bgra: Vec<u8> = img.pixels().flat_map(|p| [p[2], p[1], p[0], 255]).collect();
        let writer = DataWriter::new()?;
        writer.WriteBytes(&bgra)?;
        let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
            &writer.DetachBuffer()?,
            BitmapPixelFormat::Bgra8,
            img.width() as i32,
            img.height() as i32,
            BitmapAlphaMode::Premultiplied,
        )?;
        let engine = OcrEngine::TryCreateFromUserProfileLanguages()
            .or_else(|_| OcrEngine::TryCreateFromLanguage(&Language::CreateLanguage(&HSTRING::from("en-US"))?))?;
        Ok(engine.RecognizeAsync(&bitmap)?.join()?.Text()?.to_string())
    }
}

#[cfg(not(windows))]
mod ocr {
    pub fn recognize(_: &image::RgbaImage) -> Option<String> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> RgbaImage {
        let path = format!("{}/tests/fixtures/tabs/{name}", env!("CARGO_MANIFEST_DIR"));
        image::open(&path).unwrap_or_else(|e| panic!("{path}: {e}")).to_rgba8()
    }

    /// Centre horizontal du texte de l'onglet sélectionné, en unités 1080.
    fn selected_center(name: &str, screen_height: f64) -> Option<f64> {
        let unit = screen_height / 1080.0;
        selected_tab_text(&fixture(name), unit).map(|r| (f64::from(r.x) + f64::from(r.w) / 2.0) / unit)
    }

    #[test]
    fn finds_the_selected_tab_below_folders() {
        // Captures de Max (2560×1440), dossiers affichés ; onglets cur, fragm, brea sélectionnés.
        let cur = selected_center("folders-cur.png", 1440.0).expect("cur");
        let fragm = selected_center("folders-fragm.png", 1440.0).expect("fragm");
        let brea = selected_center("folders-brea.png", 1440.0).expect("brea");
        assert!((50.0..122.0).contains(&cur), "{cur}");
        assert!((134.0..227.0).contains(&fragm), "{fragm}");
        assert!((239.0..321.0).contains(&brea), "{brea}");
    }

    #[test]
    fn finds_the_selected_tab_without_folders() {
        let c = selected_center("no-folders-1440.png", 1440.0).expect("1440");
        assert!((50.0..103.0).contains(&c), "{c}");
        let c = selected_center("no-folders-1080.png", 1080.0).expect("1080");
        assert!((49.0..103.0).contains(&c), "{c}");
        let craft = selected_center("geforce-now.png", 1438.0).expect("geforce");
        assert!((163.0..250.0).contains(&craft), "{craft}");
    }

    #[test]
    fn finds_nothing_without_tabs() {
        let blank = RgbaImage::from_pixel(900, 300, image::Rgba([10, 10, 10, 255]));
        assert!(selected_tab_text(&blank, 1440.0 / 1080.0).is_none());
    }

    #[test]
    fn drops_the_lock_icon() {
        assert_eq!(clean_name("cur X").as_deref(), Some("cur"));
        assert_eq!(clean_name("trade 1").as_deref(), Some("trade 1"));
        assert_eq!(clean_name(" Socketables ® ").as_deref(), Some("Socketables"));
        assert_eq!(clean_name("x"), Some("x".into()));
        assert_eq!(clean_name("  "), None);
    }
}
