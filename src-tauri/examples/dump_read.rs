//! Affiche la quantité lue dans chaque case d'une capture, pour régler la lecture des chiffres.
//! `cargo run --example dump_read -- capture.png [x y largeur hauteur]` (zone du coffre).
use poe2_stash_tracker_lib::vision;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut img = image::open(&args[1]).expect("image illisible").to_rgb8();
    if let [x, y, w, h] = args[2..].iter().map(|v| v.parse().expect("nombre attendu")).collect::<Vec<u32>>()[..] {
        img = image::imageops::crop_imm(&img, x, y, w, h).to_image();
    }
    let slots = vision::find_filled_slots(&img);
    let side = vision::slot_side(&slots).expect("aucune case");
    println!("{} cases de {side} px", slots.len());
    for s in &slots {
        let glyphs = |diagonal| -> String {
            vision::quantity_glyphs(&img, s, side, diagonal).iter().map(|g| vision::classify(g).unwrap_or('?')).collect()
        };
        println!("{:>5},{:>5}  {:?} palier {}  (4-voisinage « {} », 8-voisinage « {} »)", s.x, s.y, vision::read_quantity(&img, s, side), vision::tier_mark(&img, s, side), glyphs(false), glyphs(true));
    }
}
