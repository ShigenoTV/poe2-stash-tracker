//! Affiche le type d'onglet spécial reconnu sur des captures plein écran.
fn main() {
    for path in std::env::args().skip(1) {
        let img = image::open(&path).expect("capture illisible").to_rgba8();
        println!("{path}: {:?}", poe2_stash_tracker_lib::stashtype::detect(&img));
    }
}
