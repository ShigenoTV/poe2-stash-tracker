//! Outil de mise au point : `cargo run --example scan -- capture.png sortie.png`
use poe2_stash_tracker_lib::vision;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut img = image::open(&args[1]).expect("image illisible").to_rgb8();
    let slots = vision::find_filled_slots(&img);
    println!("{} cases", slots.len());
    for s in &slots {
        println!("{s:?}");
        for x in s.x..s.x + s.w {
            img.put_pixel(x, s.y, image::Rgb([255, 0, 0]));
            img.put_pixel(x, s.y + s.h - 1, image::Rgb([255, 0, 0]));
        }
        for y in s.y..s.y + s.h {
            img.put_pixel(s.x, y, image::Rgb([255, 0, 0]));
            img.put_pixel(s.x + s.w - 1, y, image::Rgb([255, 0, 0]));
        }
    }
    if let Some(out) = args.get(2) {
        img.save(out).unwrap();
    }
}
