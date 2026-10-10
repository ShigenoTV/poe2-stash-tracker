//! Détail des glyphes lus dans une case : `cargo run --example dump_glyphs -- capture.png x y w h sx sy`.
use poe2_stash_tracker_lib::vision;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let n: Vec<u32> = a[2..].iter().map(|v| v.parse().unwrap()).collect();
    let img = image::open(&a[1]).unwrap().to_rgb8();
    let img = image::imageops::crop_imm(&img, n[0], n[1], n[2], n[3]).to_image();
    let slots = vision::find_filled_slots(&img);
    let side = vision::slot_side(&slots).unwrap();
    let s = slots.iter().find(|s| s.x == n[4] && s.y == n[5]).expect("case");
    for diag in [false, true] {
        for g in vision::quantity_glyphs(&img, s, side, diag) {
            println!("diag {diag} {:?} -> {:?} {}", (g.rect.x - s.x, g.rect.y - s.y, g.rect.w, g.rect.h), vision::classify(&g), g.cells.iter().map(|c| format!("{c:02x}")).collect::<String>());
        }
    }
}
