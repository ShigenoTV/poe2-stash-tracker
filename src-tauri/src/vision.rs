//! Analyse d'une capture du coffre : repérage des cases remplies et lecture des quantités.

use image::RgbImage;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// Fond bleu nuit d'une case occupée (ex. RGB 1,1,28).
fn is_slot_background(p: &image::Rgb<u8>) -> bool {
    let [r, g, b] = p.0;
    let (r, g, b) = (i32::from(r), i32::from(g), i32::from(b));
    b >= r + 8 && b >= g + 8 && b >= 18 && r < 40 && b < 110
}

/// Composantes connexes (4-voisinage) d'un masque, renvoyées sous forme de boîtes.
fn components(mask: &[bool], width: u32, height: u32) -> Vec<(Rect, u32)> {
    let (w, h) = (width as usize, height as usize);
    let mut seen = vec![false; mask.len()];
    let mut out = Vec::new();
    let mut stack = Vec::new();
    for start in 0..mask.len() {
        if !mask[start] || seen[start] {
            continue;
        }
        seen[start] = true;
        stack.push(start);
        let (mut x0, mut y0, mut x1, mut y1, mut count) = (w, h, 0, 0, 0u32);
        while let Some(i) = stack.pop() {
            let (x, y) = (i % w, i / w);
            x0 = x0.min(x);
            y0 = y0.min(y);
            x1 = x1.max(x);
            y1 = y1.max(y);
            count += 1;
            let mut push = |j: usize| {
                if mask[j] && !seen[j] {
                    seen[j] = true;
                    stack.push(j);
                }
            };
            if x > 0 { push(i - 1); }
            if x + 1 < w { push(i + 1); }
            if y > 0 { push(i - w); }
            if y + 1 < h { push(i + w); }
        }
        out.push((
            Rect { x: x0 as u32, y: y0 as u32, w: (x1 - x0 + 1) as u32, h: (y1 - y0 + 1) as u32 },
            count,
        ));
    }
    out
}

/// Cases occupées : zones bleu nuit regroupées par case, triées de haut en bas puis de gauche à droite.
///
/// Une icône peut couper le fond d'une case en plusieurs morceaux : on estime d'abord la
/// taille d'une case (médiane des grands morceaux carrés), puis on regroupe les morceaux
/// qui tiennent ensemble dans une case.
pub fn find_filled_slots(img: &RgbImage) -> Vec<Rect> {
    let mask: Vec<bool> = img.pixels().map(is_slot_background).collect();
    let mut parts: Vec<Rect> = components(&mask, img.width(), img.height())
        .into_iter()
        .filter(|(_, count)| *count >= 15)
        .map(|(r, _)| r)
        .collect();

    let mut sides: Vec<u32> = parts
        .iter()
        .filter(|r| r.w >= 24 && r.h >= 24 && r.w.abs_diff(r.h) <= 4)
        .map(|r| r.w.max(r.h))
        .collect();
    if sides.is_empty() {
        return Vec::new();
    }
    sides.sort_unstable();
    let side = sides[sides.len() / 2];
    let max_union = side + side / 8;

    parts.sort_by_key(|r| std::cmp::Reverse(r.w * r.h));
    let mut clusters: Vec<Rect> = Vec::new();
    for part in parts {
        let merged = clusters.iter_mut().find_map(|c| {
            let u = union(c, &part);
            let fits = (u.w <= max_union || u.w == c.w) && (u.h <= max_union || u.h == c.h);
            (fits && overlaps_or_near(c, &part, side / 6)).then_some((c, u))
        });
        match merged {
            Some((c, u)) => *c = u,
            None => clusters.push(part),
        }
    }

    let min_side = side * 5 / 6;
    let mut slots: Vec<Rect> = clusters
        .into_iter()
        .filter(|r| r.w >= min_side && r.h >= min_side)
        .collect();
    slots.sort_by_key(|r| (r.y / (side / 2), r.x));
    slots
}

fn union(a: &Rect, b: &Rect) -> Rect {
    let x = a.x.min(b.x);
    let y = a.y.min(b.y);
    Rect { x, y, w: (a.x + a.w).max(b.x + b.w) - x, h: (a.y + a.h).max(b.y + b.h) - y }
}

fn overlaps_or_near(a: &Rect, b: &Rect, gap: u32) -> bool {
    a.x <= b.x + b.w + gap && b.x <= a.x + a.w + gap && a.y <= b.y + b.h + gap && b.y <= a.y + a.h + gap
}

/// Taille de la grille normalisée d'un chiffre.
pub const GLYPH_W: usize = 8;
pub const GLYPH_H: usize = 12;

/// Chiffre isolé : boîte dans l'image et densité de blanc par cellule (0..=255).
#[derive(Debug, Clone)]
pub struct Glyph {
    pub rect: Rect,
    pub cells: [u8; GLYPH_W * GLYPH_H],
}

/// Texte des quantités : blanc quasi pur, peu saturé.
fn is_digit_ink(p: &image::Rgb<u8>) -> bool {
    let [r, g, b] = p.0;
    let (lo, hi) = (r.min(g).min(b), r.max(g).max(b));
    lo >= 185 && hi - lo <= 45
}

/// Isole les chiffres de la quantité, en haut à gauche de la case.
pub fn quantity_glyphs(img: &RgbImage, slot: &Rect, side: u32) -> Vec<Glyph> {
    let x0 = slot.x + 1;
    let y0 = slot.y + 1;
    let w = (slot.w.min(side) * 4 / 5).min(img.width() - x0);
    let h = (side * 2 / 5).min(img.height() - y0);
    let mask: Vec<bool> = (0..h)
        .flat_map(|y| (0..w).map(move |x| (x, y)))
        .map(|(x, y)| is_digit_ink(img.get_pixel(x0 + x, y0 + y)))
        .collect();

    let min_h = side * 3 / 20;
    let max_h = side * 8 / 25;
    let mut parts: Vec<Rect> = components(&mask, w, h)
        .into_iter()
        .filter(|(r, count)| *count >= 4 && r.h >= min_h && r.h <= max_h && r.w <= r.h)
        .map(|(r, _)| Rect { x: r.x + x0, y: r.y + y0, ..r })
        .collect();
    parts.sort_by_key(|r| r.x);

    // La quantité commence près du bord gauche, puis les chiffres se suivent sur une ligne.
    let Some(first) = parts.iter().position(|r| r.x < slot.x + side / 4) else {
        return Vec::new();
    };
    let mut line = vec![parts[first]];
    for r in &parts[first + 1..] {
        let last = line.last().unwrap();
        let aligned = r.y.abs_diff(line[0].y) <= side / 12 && r.h.abs_diff(line[0].h) <= side / 12;
        if aligned && r.x <= last.x + last.w + side / 10 {
            line.push(*r);
        }
    }
    line.iter().map(|r| Glyph { rect: *r, cells: normalize(img, r) }).collect()
}

fn normalize(img: &RgbImage, r: &Rect) -> [u8; GLYPH_W * GLYPH_H] {
    let mut cells = [0u8; GLYPH_W * GLYPH_H];
    for cy in 0..GLYPH_H {
        for cx in 0..GLYPH_W {
            let (sx0, sx1) = span(r.x, r.w, cx, GLYPH_W);
            let (sy0, sy1) = span(r.y, r.h, cy, GLYPH_H);
            let (mut ink, mut total) = (0u32, 0u32);
            for y in sy0..sy1 {
                for x in sx0..sx1 {
                    total += 1;
                    ink += u32::from(is_digit_ink(img.get_pixel(x, y)));
                }
            }
            cells[cy * GLYPH_W + cx] = (ink * 255 / total.max(1)) as u8;
        }
    }
    cells
}

/// Plage de pixels source couverte par la cellule `i` sur `n` (au moins un pixel).
fn span(start: u32, len: u32, i: usize, n: usize) -> (u32, u32) {
    let a = start + (len as usize * i / n) as u32;
    let b = start + (len as usize * (i + 1)).div_ceil(n) as u32;
    (a, b.max(a + 1))
}

/// Forme moyenne de chaque chiffre, apprise sur des captures réelles
/// (voir `examples/train_digits.rs`).
#[rustfmt::skip]
const DIGIT_TEMPLATES: [(char, f32, &str); 10] = [
    ('0', 0.846, "003fd4ffffd43f003fbfaa7f7fd4bf3f7fff5500007fff7fbfbf2a090955ff7fff7f00090955ff7fff7f00000055ffbfff7f0000095bffbfff7f00091b61ff7fffbf2a121b5bff7fbfff55090955ff7f7fff7f00007fbf3f3fbfd47f7faa3f00"), // 7 exemples
    ('1', 0.308, "7f7f7f7fffffffffffff7f7fffffffff7f7f0000ffffffff00000000ffffffff00000000ffffffff00000000ffffffff00000000ffffffff00000000ffffffff00000000ffffffff00000000ffffffff08080000ffffffff10100000ffffffff"), // 16 exemples
    ('2', 0.615, "7fff7f7fffff7f00ffff00007fffff007f7f000c00ffff000c0c000c00ffff0023170c0000ffff00170c0c007fff7f000c0c0000ffff0000170c007fff7f000c0c007fff7f00000c007fff7f000000007fffff7f7f7f7f7fffffffffffffffff"), // 11 exemples
    ('3', 0.533, "7fff7f7fffff7f00ff7f00007fffff007f00000000ffff00120000007fffff000000007fff7f00000000007fffff7f00000000007fffff000000000000ffff7f1200000000ffff7f000000007fffff0000007f7fff7f7f007f7fff7f7f000000"), // 7 exemples
    ('4', 0.600, "000000007fff7f000000003fbfff7f0000003fbfffff7f0000007fbfbfff7f003fbf7f007fff7f007fbf3f007fff7f00bf7f00007fff7f00ffbf7f7fbfffbf7f7f7f7f7fbfffbf7f000000007fff7f00000010107fff7f00001020107fff7f00"), // 4 exemples
    ('5', 0.571, "00ffffffffffff0000ff7f7f7f7f7f0000ff0000000000007fff000000000000ffff7f7f7f0000007f7f7fffff7f7f000000000000ffff000000000000ffff7f0e0e0e0000ffff7f1c1c1c0000ffff001c0e0e007fff7f000e00007fff7f0000"), // 9 exemples
    ('6', 0.667, "00003f7fffffbf3f003fbfbf7f7f7f3f007fff7f000000003fbfbf3f000000007fff7f3f7f7f3f00bfff7f3fbfffbf3fffff7f003fbfffbfffff7f00007fffff7fff7f0000007fff7fff7f00003fbfbf3fbfbf3f007fff7f003fbfbf7fbfbf3f"), // 9 exemples
    ('7', 0.533, "ffffffffffffffff7f7f7f7f7fffff7f0000000000ffff000000000000ff7f0020000000ff7f00000000007fff000000000000ffff00000000007fff7f0000000000ff7f00000000007fff000000000000ff7f00000000007fff000000000000"), // 4 exemples
    ('8', 0.600, "003fbfffffbf7f3f3fbfbf7f7f7fbf7f7fff7f0000007f7f7fff7f0000007f7f3fbfffbf7f7f3f00003fbfffffbf3f00003f7f7fbfffbf3f3fbf7f003fbfffbfbf7f000000007fffff7f000000007fffbfbf3f00003fbfbf3fbfbf7f7fbfbf3f"), // 5 exemples
    ('9', 0.667, "003fbfbfbfbf3f003fbfbf3f7fffbf3f7fff7f003fbfff7fbfff7f0d007fff7fffff7f0d0d7fffffbfff7f00007fffff7fffbf7f7fbfffbf3f7fbfff7fbfff7f0d0d26193fbfff7f000d26197fffbf3f3f3f0000bfbf3f007fbf7f7fbf3f0000"), // 5 exemples
];

/// Reconnaît un chiffre : forme la plus proche, en tenant compte de la largeur relative.
pub fn classify(glyph: &Glyph) -> Option<char> {
    let aspect = glyph.rect.w as f32 / glyph.rect.h as f32;
    DIGIT_TEMPLATES
        .iter()
        .map(|(c, ref_aspect, cells)| {
            let shape: f32 = cells
                .as_bytes()
                .chunks(2)
                .zip(glyph.cells.iter())
                .map(|(hex, v)| {
                    let t = u8::from_str_radix(std::str::from_utf8(hex).unwrap(), 16).unwrap();
                    (f32::from(t) - f32::from(*v)).abs() / 255.0
                })
                .sum::<f32>()
                / (GLYPH_W * GLYPH_H) as f32;
            (*c, shape + (aspect - ref_aspect).abs() * 0.5)
        })
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .filter(|(_, d)| *d < 0.35)
        .map(|(c, _)| c)
}

/// Quantité lue dans une case, ou `None` si aucun chiffre n'est reconnu.
pub fn read_quantity(img: &RgbImage, slot: &Rect, side: u32) -> Option<u32> {
    let digits: Option<String> = quantity_glyphs(img, slot, side).iter().map(classify).collect();
    digits.filter(|d| !d.is_empty())?.parse().ok()
}

/// Taille de case courante (médiane des cases carrées).
pub fn slot_side(slots: &[Rect]) -> Option<u32> {
    let mut sides: Vec<u32> = slots.iter().filter(|r| r.w.abs_diff(r.h) <= 4).map(|r| r.w.min(r.h)).collect();
    sides.sort_unstable();
    sides.get(sides.len() / 2).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRAGMENTS: &[Option<u32>] = &[
        Some(159), Some(166), Some(15), Some(58), Some(160), Some(12), Some(47), Some(31), Some(2),
        Some(236), Some(186), Some(24), Some(10), Some(76), Some(108),
        Some(229), Some(35), Some(9), Some(55), Some(221), Some(123),
        Some(5000), Some(29), Some(1), None, Some(35), Some(68),
        Some(75), Some(27), Some(18), Some(1), Some(3),
        Some(36), Some(146), Some(1), Some(490),
    ];

    fn fixture(name: &str) -> RgbImage {
        let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
        image::open(path).unwrap().to_rgb8()
    }

    #[test]
    fn reads_fragments_tab() {
        let img = fixture("fragments-tab.png");
        let slots = find_filled_slots(&img);
        let side = slot_side(&slots).unwrap();
        assert_eq!(side, 70);
        let read: Vec<Option<u32>> = slots.iter().map(|s| read_quantity(&img, s, side)).collect();
        assert_eq!(read, FRAGMENTS);
    }

    #[test]
    fn reads_stash_inside_full_screenshot() {
        // Zone du coffre dans la capture plein écran 2560x1440.
        let full = fixture("fullscreen-2560x1440.png");
        let stash = image::imageops::crop_imm(&full, 0, 150, 880, 900).to_image();
        let slots = find_filled_slots(&stash);
        let side = slot_side(&slots).unwrap();
        let mut read: Vec<u32> = slots.iter().filter_map(|s| read_quantity(&stash, s, side)).collect();
        let mut want: Vec<u32> = FRAGMENTS.iter().flatten().copied().collect();
        read.sort_unstable();
        want.sort_unstable();
        assert_eq!(read, want);
    }
}
