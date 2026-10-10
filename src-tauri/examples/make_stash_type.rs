//! Crée l'empreinte de référence d'un onglet spécial à partir d'une capture plein écran
//! (coffre ouvert, rangée de dossiers affichée) :
//! `cargo run --example make_stash_type -- capture.png stash-types/breach.bin`
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let [_, input, output] = args.as_slice() else {
        eprintln!("usage : make_stash_type <capture.png> <sortie.bin>");
        std::process::exit(2);
    };
    let img = image::open(input).expect("capture illisible").to_rgba8();
    let fp = poe2_stash_tracker_lib::stashtype::fingerprint(&img, true).expect("capture trop petite");
    std::fs::write(output, fp).expect("écriture impossible");
}
