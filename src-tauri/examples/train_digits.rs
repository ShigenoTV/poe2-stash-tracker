//! Apprend les formes des chiffres à partir d'une capture dont on connaît les quantités.
//! `cargo run --example train_digits -- capture.png "159,166,15,..."` (ordre des cases,
//! `-` pour une case sans quantité). Affiche le tableau à coller dans `vision.rs`.
use poe2_stash_tracker_lib::vision::{self, GLYPH_H, GLYPH_W};
use std::collections::BTreeMap;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let img = image::open(&args[1]).expect("image illisible").to_rgb8();
    let expected: Vec<&str> = args[2].split(',').collect();
    let slots = vision::find_filled_slots(&img);
    let side = vision::slot_side(&slots).unwrap();
    assert_eq!(slots.len(), expected.len(), "nombre de cases différent");

    let mut sums: BTreeMap<char, (Vec<f32>, f32, u32)> = BTreeMap::new();
    for (slot, want) in slots.iter().zip(&expected) {
        if *want == "-" {
            continue;
        }
        let mut glyphs = vision::quantity_glyphs(&img, slot, side, false);
        if glyphs.len() != want.len() {
            glyphs = vision::quantity_glyphs(&img, slot, side, true);
        }
        if glyphs.len() != want.len() {
            eprintln!("case {slot:?} : {} glyphes pour « {want} », ignorée", glyphs.len());
            continue;
        }
        for (g, c) in glyphs.iter().zip(want.chars()) {
            let e = sums.entry(c).or_insert((vec![0.0; GLYPH_W * GLYPH_H], 0.0, 0));
            for (acc, v) in e.0.iter_mut().zip(g.cells.iter()) {
                *acc += f32::from(*v);
            }
            e.1 += g.rect.w as f32 / g.rect.h as f32;
            e.2 += 1;
        }
    }
    println!("const DIGIT_TEMPLATES: [(char, f32, &str); {}] = [", sums.len());
    for (c, (cells, aspect, n)) in &sums {
        let hex: String = cells.iter().map(|v| format!("{:02x}", (v / *n as f32).round() as u8)).collect();
        println!("    ('{c}', {:.3}, \"{hex}\"), // {n} exemples", aspect / *n as f32);
    }
    println!("];");
}
