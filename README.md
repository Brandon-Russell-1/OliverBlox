# OliverBlox

A small, kid-safe 3D sandbox game that runs entirely in the browser. No accounts, no ads, no chat with strangers.

## Play

An endless world of meadows, forests, beaches, sea and snowy mountains. Walk in any direction and it keeps going.

| | Tablet | PC |
| --- | --- | --- |
| Move | Left stick | WASD or arrow keys |
| Run | Push the stick all the way | Hold Shift |
| Jump | Arrow button | Space |
| Crawl | Caterpillar button | C |
| Fly (god mode) | Hero button; arrow goes up, the down button goes down | F; Space up, C down |
| Swim | Walk into deep water | Walk into deep water |
| Look around | Drag the screen, pinch to zoom | Drag the mouse, wheel to zoom |
| Build | Tap the world; pick the pickaxe to remove | Click; right-click removes; 1-9 pick a tool |
| Car | Walk up to it and tap the car button | E |

- Stars are marked by beams of light. Bolt the robot counts them out loud.
- Everything saves itself in the browser. Grown-ups: hold the gear button for two seconds to start over.

## Develop

```
npm install
npm run dev      # play locally with live reload
npm run build    # type-check and build into dist/
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## Roadmap

1. Open world: endless terrain, character, car, animals, building, stars (done)
2. Villages, quests, more vehicles and things to pick up, block coding
3. AI characters through a Cloudflare Worker
4. Invite-code multiplayer

## Credits

3D models are CC0 (public domain): characters, animations and forest scenery by [Kay Lousberg](https://www.kaylousberg.com), car and animals by [Kenney](https://kenney.nl).
