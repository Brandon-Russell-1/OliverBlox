# OliverBlox

A small, kid-safe 3D sandbox game that runs entirely in the browser. No accounts, no ads, no chat with strangers.

## Play

- **Tablet:** left stick moves, the arrow button jumps, drag the screen to look around, tap the world to place a block. Pick the pickaxe to remove blocks.
- **PC:** WASD or arrow keys move, Space jumps, drag the mouse to look, click to place, right-click to remove, 1-9 pick a tool, E gets in and out of the car.
- Find the 10 stars. Bolt the robot tells you how many are left.
- The world saves itself in the browser. Grown-ups: hold the gear button for two seconds to start a fresh world.

## Develop

```
npm install
npm run dev      # play locally with live reload
npm run build    # type-check and build into dist/
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## Roadmap

1. Single-player core: world, building, car, stars, saving (done)
2. Quests, more things to pick up and drive, block coding
3. AI characters through a Cloudflare Worker
4. Invite-code multiplayer
