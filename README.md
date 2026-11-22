# OliverBlox

A small, kid-safe 3D sandbox game that runs entirely in the browser. No accounts, no ads, no chat with strangers.

## Play

An endless world of meadows, forests, beaches, sea and snowy mountains, with villages to find. Walk in any direction and it keeps going.

| | Tablet | PC |
| --- | --- | --- |
| Pick a hero | Arrows on the start screen | Arrows on the start screen |
| Move | Left stick | WASD or arrow keys |
| Run | Push the stick all the way | Hold Shift |
| Jump | Arrow button | Space |
| Crawl | Caterpillar button | C |
| Fly (god mode) | Hero button; arrow goes up, the down button goes down | F; Space up, C down |
| Swim | Walk into deep water | Walk into deep water |
| Look around | Drag the screen, pinch to zoom | Drag the mouse, wheel to zoom |
| Fight | Pick the sword or wand, then tap the screen or the swords button | Click, or Q |
| Build | Pick a colour and tap the world; the pickaxe removes | Click; right-click removes; 1-9 pick a tool |
| Vehicles | Car button (top right) gives any car or boat | Same; E gets in and out |
| Talk, shop, befriend | Robot button for Bolt; the yellow button near a villager, shopkeeper or animal | Same; E for the yellow button |

- **Forts:** the 🏰 on the map is a skeleton fort. Walking up to it brings out a giant skeleton; beating it pays 25 coins and 5 stars, and the fort stays won (🏳️).
- **More bad guys:** quick rogues that outrun a walk, and mages that throw slow purple orbs he can sidestep.
- **Treasure:** gold chests are hidden out in the wilds; walking into one gives 8 coins.
- **Houses:** stand by a village house and tap the door button to go inside; tap it again to leave.
- **Garage unlocks:** the car and the rowing boat are free; the rest are bought once with coins.
- **Program Bolt:** the puzzle button opens a strip of picture commands (forward, turn left, turn right, place a block). Line some up, pick how many times to repeat, press play, and Bolt carries them out. It builds with whichever colour is selected.
- **Play together:** the two-people button asks for a room name. Everyone who types the same name is in the same world, sees each other, and builds together. It needs the AI helper set up (see below), because it runs through your own Cloudflare Worker.
- **Map:** the round map in the top right turns with the view, so up on the map is straight ahead. The 🏠 on its rim points to the nearest village. Tap the map to make it big.
- **Quests:** villagers with a ❗ over their head have a job (find stars, bonk skeletons, build with blocks, befriend an animal). Chips on the left show progress; go back when they show 🎁 to collect coins.
- **Shop:** the villager with the 🛒 sells an axe, a great sword, extra hearts and running shoes for coins. Skeletons drop a coin each too.
- **Pets:** walk up to any animal and tap the paw button; it follows him from then on.
- Stars are marked by beams of light, and each skeleton beaten gives one more. Bolt counts them out loud.
- Skeletons only appear out in the wilds, never near the start or a village. They are slower than a walk. Running out of hearts just pops the hero back to a quiet spot.
- Everything saves itself in the browser.
- Grown-ups: hold the gear button for two seconds for the AI settings, the chat transcript and the erase button.

## AI characters

Bolt and the villagers use scripted lines until you connect them to Claude. See [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).

## Develop

```
npm install
npm run dev      # play locally with live reload
npm run build    # type-check and build into dist/
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## Roadmap

1. Open world: endless terrain, heroes, vehicles, animals, building, stars (done)
2. Villages, weapons and skeletons, garage, talking characters (done)
3. Quests, shop and pets (done)
4. Forts, treasure, house interiors, garage unlocks, program Bolt, playing together (done)
5. Shared enemies and quests when playing together; more places to find

## Credits

3D models are CC0 (public domain): heroes, skeletons, weapons, animations, forest scenery and village and fort buildings, furniture and treasure chests by [Kay Lousberg](https://www.kaylousberg.com), vehicles and animals by [Kenney](https://kenney.nl).
