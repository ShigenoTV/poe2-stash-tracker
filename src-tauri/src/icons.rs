//! Reconnaissance d'un objet à partir de son icône.
//!
//! Chaque icône est réduite à une petite grille de couleurs. On compare ensuite :
//! - aux cases déjà identifiées par le joueur (même rendu en jeu, donc très proches) ;
//! - aux icônes de poe.ninja, posées sur le fond bleu nuit d'une case.
//!
//! La zone des chiffres (en haut à gauche) est ignorée. La marque de palier I/II/III
//! (en bas à droite) l'est aussi face à poe.ninja, qui ne la dessine pas.

use image::{imageops, Rgb, RgbImage, RgbaImage};
use serde::{Deserialize, Serialize};

pub const GRID: usize = 16;
/// Fond d'une case occupée, utilisé pour poser les icônes transparentes de poe.ninja.
const SLOT_BACKGROUND: Rgb<u8> = Rgb([4, 4, 30]);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Descriptor(pub Vec<u8>);

fn is_digit_zone(cx: usize, cy: usize) -> bool {
    cx * 10 < GRID * 6 && cy * 10 < GRID * 4
}

fn is_tier_zone(cx: usize, cy: usize) -> bool {
    cx * 10 >= GRID * 6 && cy * 10 >= GRID * 7
}

fn describe(img: &RgbImage) -> Descriptor {
    let small = imageops::resize(img, GRID as u32, GRID as u32, imageops::FilterType::Triangle);
    Descriptor(small.into_raw())
}

/// Descripteur d'une case capturée en jeu (bordure de la case retirée).
pub fn describe_slot(slot: &RgbImage) -> Descriptor {
    let inset = (slot.width().min(slot.height()) / 16).max(1);
    let w = slot.width().saturating_sub(2 * inset).max(1);
    let h = slot.height().saturating_sub(2 * inset).max(1);
    describe(&imageops::crop_imm(slot, inset, inset, w, h).to_image())
}

/// Descripteur d'une icône de référence (PNG transparent), posée sur le fond d'une case.
pub fn describe_reference(icon: &RgbaImage) -> Descriptor {
    let mut flat = RgbImage::from_pixel(icon.width(), icon.height(), SLOT_BACKGROUND);
    for (x, y, p) in icon.enumerate_pixels() {
        let a = u32::from(p[3]);
        let bg = flat.get_pixel(x, y).0;
        let mix = |c: u8, b: u8| ((u32::from(c) * a + u32::from(b) * (255 - a)) / 255) as u8;
        flat.put_pixel(x, y, Rgb([mix(p[0], bg[0]), mix(p[1], bg[1]), mix(p[2], bg[2])]));
    }
    describe(&flat)
}

/// Distance moyenne (0 = identique, 1 = opposé) sur les cellules comparables.
/// Chaque canal est centré sur sa moyenne pour tolérer un éclairage un peu différent.
pub fn distance(a: &Descriptor, b: &Descriptor, ignore_tier: bool) -> f32 {
    let cells: Vec<usize> = (0..GRID * GRID)
        .filter(|&i| {
            let (cx, cy) = (i % GRID, i / GRID);
            !is_digit_zone(cx, cy) && !(ignore_tier && is_tier_zone(cx, cy))
        })
        .collect();
    let mean = |d: &Descriptor, ch: usize| {
        cells.iter().map(|&i| f32::from(d.0[i * 3 + ch])).sum::<f32>() / cells.len() as f32
    };
    let (ma, mb): (Vec<f32>, Vec<f32>) = (0..3).map(|ch| (mean(a, ch), mean(b, ch))).unzip();
    let mut total = 0.0;
    for &i in &cells {
        for ch in 0..3 {
            let va = f32::from(a.0[i * 3 + ch]) - ma[ch];
            let vb = f32::from(b.0[i * 3 + ch]) - mb[ch];
            // Moitié pour la forme centrée, moitié pour la couleur brute.
            total += 0.5 * (va - vb).abs() + 0.5 * (ma[ch] - mb[ch]).abs();
        }
    }
    total / (cells.len() * 3) as f32 / 255.0
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub item_id: String,
    pub distance: f32,
}

/// Les `n` références les plus proches, de la plus proche à la plus lointaine.
pub fn rank<'a>(
    target: &Descriptor,
    references: impl Iterator<Item = (&'a str, &'a Descriptor)>,
    ignore_tier: bool,
    n: usize,
) -> Vec<Candidate> {
    let mut all: Vec<Candidate> = references
        .map(|(id, d)| Candidate { item_id: id.to_string(), distance: distance(target, d, ignore_tier) })
        .collect();
    all.sort_by(|a, b| a.distance.total_cmp(&b.distance));
    all.dedup_by(|a, b| a.item_id == b.item_id);
    all.truncate(n);
    all
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vision;

    fn slot_images() -> Vec<RgbImage> {
        let path = format!("{}/tests/fixtures/fragments-tab.png", env!("CARGO_MANIFEST_DIR"));
        let img = image::open(path).unwrap().to_rgb8();
        vision::find_filled_slots(&img)
            .iter()
            .map(|s| imageops::crop_imm(&img, s.x, s.y, s.w, s.h).to_image())
            .collect()
    }

    #[test]
    fn each_slot_matches_itself_first() {
        let slots = slot_images();
        let refs: Vec<(String, Descriptor)> =
            slots.iter().enumerate().map(|(i, s)| (i.to_string(), describe_slot(s))).collect();
        for (i, s) in slots.iter().enumerate() {
            // Légère variation de cadrage : on décale la capture d'un pixel.
            let shifted = imageops::crop_imm(s, 1, 1, s.width() - 1, s.height() - 1).to_image();
            let best = rank(&describe_slot(&shifted), refs.iter().map(|(id, d)| (id.as_str(), d)), false, 2);
            assert_eq!(best[0].item_id, i.to_string(), "case {i}");
        }
    }

    #[test]
    fn tiers_are_told_apart_only_when_tier_zone_counts() {
        // Cases 0, 1, 2 : même icône aux paliers I, II, III.
        let slots = slot_images();
        let d: Vec<Descriptor> = slots.iter().take(3).map(describe_slot).collect();
        assert!(distance(&d[1], &d[2], false) > distance(&d[1], &d[2], true));
    }

    #[test]
    fn transparent_reference_sits_on_slot_background() {
        let icon = RgbaImage::from_pixel(8, 8, image::Rgba([255, 255, 255, 0]));
        let d = describe_reference(&icon);
        assert_eq!(&d.0[..3], &SLOT_BACKGROUND.0);
    }
}
