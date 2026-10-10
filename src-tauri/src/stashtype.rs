//! Type d'un onglet spécial du coffre (Currency, Breach, Essence…), reconnu à sa disposition :
//! chaque onglet spécial a son propre fond et ses cases à des places fixes, quel que soit le nom
//! que le joueur lui a donné.

use image::RgbaImage;

/// Empreinte : la zone du coffre réduite à une grille de couleurs moyennes, suivie de la rangée
/// de boutons du haut en plus fin. Les pages en grille (Tablets, Trials, Wombgifts) se
/// ressemblent beaucoup : seuls leurs boutons (« Catalysts », « Fragments »…) les distinguent.
const GRID: (u32, u32) = (24, 24);
const HEADER_GRID: (u32, u32) = (32, 3);
const MAIN_LEN: usize = (GRID.0 * GRID.1 * 3) as usize;
pub const FINGERPRINT_LEN: usize = MAIN_LEN + (HEADER_GRID.0 * HEADER_GRID.1 * 3) as usize;
/// Zones de l'empreinte en unités 1080 (avec la rangée de dossiers), à l'intérieur du cadre dont
/// la couleur suit celle de l'onglet.
const ZONE: (f64, f64, f64, f64) = (30.0, 172.0, 640.0, 780.0);
const HEADER_ZONE: (f64, f64, f64, f64) = (80.0, 182.0, 590.0, 214.0);
/// Les boutons changent d'aspect selon la page choisie : l'écart y compte pour moitié.
const HEADER_WEIGHT: f64 = 0.5;
/// Sans rangée de dossiers, tout le coffre remonte d'autant.
const NO_FOLDERS_SHIFT: f64 = -37.0;
/// Écart moyen par canal : ≈ 0–3 pour le même onglet aux contenus différents, ≥ 10 entre deux
/// types d'onglets.
const MAX_DISTANCE: f64 = 6.0;

/// Empreintes de référence, tirées de captures de chaque onglet spécial. Une page à onglets
/// internes (Fragment : Fragments, Tablets…) a une référence par page.
const REFERENCES: [(&str, &[u8; FINGERPRINT_LEN]); 13] = [
    ("Currency", include_bytes!("../stash-types/currency.bin")),
    ("Fragment", include_bytes!("../stash-types/fragment.bin")),
    ("Fragment", include_bytes!("../stash-types/fragment-tablets.bin")),
    ("Fragment", include_bytes!("../stash-types/fragment-trials.bin")),
    ("Fragment", include_bytes!("../stash-types/fragment-trials2.bin")),
    ("Essence", include_bytes!("../stash-types/essence.bin")),
    ("Delirium", include_bytes!("../stash-types/delirium.bin")),
    ("Socketable", include_bytes!("../stash-types/socketable.bin")),
    ("Ritual", include_bytes!("../stash-types/ritual.bin")),
    ("Breach", include_bytes!("../stash-types/breach.bin")),
    ("Breach", include_bytes!("../stash-types/breach-wombgifts.bin")),
    ("Abyss", include_bytes!("../stash-types/abyss.bin")),
    ("Expedition", include_bytes!("../stash-types/expedition.bin")),
];

/// Empreinte de la zone du coffre dans la capture complète de la fenêtre du jeu.
pub fn fingerprint(img: &RgbaImage, folders: bool) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(FINGERPRINT_LEN);
    average_grid(img, folders, ZONE, GRID, &mut out)?;
    average_grid(img, folders, HEADER_ZONE, HEADER_GRID, &mut out)?;
    Some(out)
}

/// Couleur moyenne de chaque case d'une grille posée sur une zone (unités 1080).
fn average_grid(
    img: &RgbaImage,
    folders: bool,
    (x0, y0, x1, y1): (f64, f64, f64, f64),
    (cols, rows): (u32, u32),
    out: &mut Vec<u8>,
) -> Option<()> {
    let unit = f64::from(img.height()) / 1080.0;
    let dy = if folders { 0.0 } else { NO_FOLDERS_SHIFT };
    let px = |v: f64| (v * unit).round() as u32;
    let (left, top, right, bottom) = (px(x0), px(y0 + dy), px(x1), px(y1 + dy));
    if right > img.width() || bottom > img.height() {
        return None;
    }
    for gy in 0..rows {
        for gx in 0..cols {
            let cx0 = left + (right - left) * gx / cols;
            let cx1 = left + (right - left) * (gx + 1) / cols;
            let cy0 = top + (bottom - top) * gy / rows;
            let cy1 = top + (bottom - top) * (gy + 1) / rows;
            let mut sum = [0u64; 3];
            for y in cy0..cy1 {
                for x in cx0..cx1 {
                    let p = img.get_pixel(x, y).0;
                    for c in 0..3 {
                        sum[c] += u64::from(p[c]);
                    }
                }
            }
            let n = u64::from((cx1 - cx0) * (cy1 - cy0)).max(1);
            out.extend(sum.map(|s| (s / n) as u8));
        }
    }
    Some(())
}

fn mean_diff(a: &[u8], b: &[u8]) -> f64 {
    let total: u64 = a.iter().zip(b).map(|(&x, &y)| u64::from(x.abs_diff(y))).sum();
    total as f64 / a.len().max(1) as f64
}

/// Écart entre deux empreintes : le pire de la zone entière et de la rangée de boutons.
fn distance(a: &[u8], b: &[u8]) -> f64 {
    let main = mean_diff(&a[..MAIN_LEN], &b[..MAIN_LEN]);
    let header = mean_diff(&a[MAIN_LEN..], &b[MAIN_LEN..]);
    main.max(header * HEADER_WEIGHT)
}

/// Type d'onglet spécial affiché, ou `None` pour un onglet ordinaire ou une vue inconnue.
pub fn detect(img: &RgbaImage) -> Option<&'static str> {
    let mut best: Option<(f64, &'static str)> = None;
    for folders in [true, false] {
        let Some(fp) = fingerprint(img, folders) else { continue };
        for (label, reference) in REFERENCES {
            let d = distance(&fp, reference);
            if best.is_none_or(|(bd, _)| d < bd) {
                best = Some((d, label));
            }
        }
    }
    best.filter(|&(d, _)| d <= MAX_DISTANCE).map(|(_, label)| label)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen(name: &str) -> RgbaImage {
        let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
        image::open(&path).unwrap_or_else(|e| panic!("{path}: {e}")).to_rgba8()
    }

    #[test]
    fn recognizes_the_currency_tab_without_folders() {
        // Autres captures, autres objets, sans rangée de dossiers et à d'autres résolutions.
        for name in ["fullscreen-2560x1440.png", "fullscreen-1920x1080.png", "geforce-now.png"] {
            assert_eq!(detect(&screen(name)), Some("Currency"), "{name}");
        }
    }

    #[test]
    fn ignores_a_screen_without_stash() {
        let dark = RgbaImage::from_pixel(1920, 1080, image::Rgba([12, 12, 12, 255]));
        assert_eq!(detect(&dark), None);
    }

    #[test]
    fn references_are_far_apart() {
        for (i, (a, ra)) in REFERENCES.iter().enumerate() {
            for (b, rb) in &REFERENCES[i + 1..] {
                if a != b {
                    assert!(distance(*ra, *rb) > 1.5 * MAX_DISTANCE, "{a} / {b}");
                }
            }
        }
    }
}
