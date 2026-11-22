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
| Talk | Robot button for Bolt; speech button near a villager | Same; E near a villager |

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
3. Quests, things to pick up, block coding
4. Invite-code multiplayer

## Credits

3D models are CC0 (public domain): heroes, skeletons, weapons, animations, forest scenery and village buildings by [Kay Lousberg](https://www.kaylousberg.com), vehicles and animals by [Kenney](https://kenney.nl).
