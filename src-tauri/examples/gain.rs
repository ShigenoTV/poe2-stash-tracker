//! Facteur de luminosité estimé d'une capture : `cargo run --example gain -- capture.png...`
use poe2_stash_tracker_lib::vision;

fn main() {
    for path in std::env::args().skip(1) {
        let Ok(img) = image::open(&path) else { continue };
        let img = img.to_rgb8();
        let slots = vision::find_filled_slots(&img);
        println!("{:.3} {path}", vision::brightness_gain(&img, &slots));
    }
}
