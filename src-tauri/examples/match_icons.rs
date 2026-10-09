//! Montre, pour chaque case d'un onglet capturé, les objets poe.ninja les plus proches.
//! `cargo run --example match_icons -- onglet.png latest.json dossier_icones`
//! (icônes copiées sur la branche prices, sous `icons/<hash>-<nom>.png`).
use image::imageops;
use poe2_stash_tracker_lib::{icons, vision};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let img = image::open(&args[1]).expect("onglet illisible").to_rgb8();
    let prices: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&args[2]).unwrap()).unwrap();
    let only = args.get(4).cloned();
    let refs: Vec<(String, icons::Descriptor)> = prices["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|i| only.as_deref().is_none_or(|c| i["category"] == c))
        .filter_map(|i| {
            let url = i["icon"].as_str()?;
            let parts: Vec<&str> = url.rsplitn(3, '/').collect();
            let file = format!("{}/{}-{}", args[3], parts[1], parts[0]);
            let icon = image::open(file).ok()?.to_rgba8();
            Some((
                i["name"].as_str()?.to_string(),
                icons::describe_reference(&icon),
            ))
        })
        .collect();
    eprintln!("{} références", refs.len());

    let slots = vision::find_filled_slots(&img);
    let side = vision::slot_side(&slots).unwrap();
    for s in &slots {
        let crop = imageops::crop_imm(&img, s.x, s.y, s.w, s.h).to_image();
        let d = icons::describe_slot(&crop);
        let best = icons::rank(&d, refs.iter().map(|(n, d)| (n.as_str(), d)), true, 3);
        let q = vision::read_quantity(&img, s, side);
        let list: Vec<String> = best
            .iter()
            .map(|c| format!("{} {:.3}", c.item_id, c.distance))
            .collect();
        println!(
            "({:>3},{:>3}) x{:<5} {}",
            s.x,
            s.y,
            q.map_or("-".into(), |v| v.to_string()),
            list.join(" | ")
        );
    }
}
