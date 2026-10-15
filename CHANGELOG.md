# Notes de version

Chaque version a sa section « ## X.Y.Z (date) » : l'appli l'affiche après la mise à jour
et la release GitHub la reprend. Ce qui n'est pas encore publié va sous « ## À venir ».

## À venir

- Image du jeu plus claire que d'habitude (HDR de Windows, luminosité relevée) : l'appli la ramène à la normale avant de reconnaître les objets et de lire les nombres. Avant, presque tout l'onglet Currency sortait « Objet non identifié » et des objets mal reconnus gonflaient la valeur (210 div en Abyss).
- Un avertissement « Image très claire (HDR ?) » s'affiche à côté du scan dans ce cas : désactiver le HDR pour le jeu reste le plus fiable.

## 0.1.8 (2026-10-15)

- Alertes de prix regroupées derrière une cloche dans la barre du haut, avec leur nombre : la liste s'ouvre au clic au lieu de recouvrir l'appli.
- Notes de version dans l'appli : affichées une fois après chaque mise à jour, et à tout moment en cliquant sur le numéro de version.

## 0.1.7 (2026-10-15)

- Sous-pages en grille (Wombgifts, Ultimatums, Tablets) : les cases voisines sont séparées et lues une par une.
- Wombgifts : nombre lu en bas à gauche de la case.
- Objet allumé sans nombre compté 1 (Ultimatums, Tablets).

## 0.1.6 (2026-10-11)

- Entrées et sorties sur une seule ligne, détail repliable en cliquant sur le titre.
- Prix : le dernier prix connu est gardé quand un objet disparaît quelques heures de poe.ninja.

## 0.1.5 (2026-10-11)

- Reconnaissance plus précise : les teintes des icônes départagent les objets de même forme.
- Chaque onglet est lu sur trois captures et les cases votent : moins d'erreurs ponctuelles.

## 0.1.4 (2026-10-10)

- Les corrections que tu fais à la main ne s'appliquent plus aux Omens voisins.

## 0.1.3 (2026-10-10)

- Lecture des quantités plus fiable dans les coffres spéciaux (reflets d'icône, dernière rangée, suffixe K).

## 0.1.2 (2026-10-10)

- Icône dans la zone de notification, démarrage avec Windows et une seule instance.
- Vrais noms d'onglets lus en jeu, et onglets spéciaux reconnus à leur disposition.
- Historique allégé : un point par heure au-delà de 24 h.

## 0.1.1 (2026-10-10)

- Alertes de prix : forte variation sur 24 h d'un objet que tu possèdes.

## 0.1.0 (2026-10-09)

- Lecture des quantités en 1080p corrigée.
- Onglets gardés d'une ouverture à l'autre, gain de session, entrées et sorties, tendance des prix et export CSV.
