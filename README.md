# OliverBlox

A small, kid-safe 3D sandbox game that runs entirely in the browser. No accounts, no ads, no chat with strangers.

## Play

An endless world of meadows, forests, beaches, sea and snowy mountains, with villages to find. Walk in any direction and it keeps going.

| | Tablet | PC |
| --- | --- | --- |
| Pick a hero | Arrows on the start screen | Arrows on the start screen |
| Pick a name | Type it in the box on the start screen | Same |
| Move | Left stick | WASD or arrow keys |
| Run | Push the stick all the way | Hold Shift |
| Jump | Arrow button | Space |
| Crawl | Caterpillar button | C |
| Fly | Hero button; arrow goes up, the down button goes down. Buildings, walls and boulders are solid; fly over them | F; Space up, C down |
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
- **Play together:** the two-people button asks for a room name. Everyone who types the same name is in the same world: they see each other, build together and fight the same skeletons, and everyone gets the star and coin when one is beaten. It needs the AI helper set up (see below), because it runs through your own Cloudflare Worker.
- **Names:** each player types their own name on the start screen (letters only, up to 12). Friends see it under their face, and the AI characters use it.
- **Finding friends:** each player gets an animal face. It floats over their hero at the same size however far away they are, and shows on the map, pinned to the rim when they are off it. The room panel shows your own face first, then your friends'.
- **Emoji messages:** the smiley button opens eight emoji. Tapping one shows it over your hero for everyone in the room. Pictures from that list are the only thing players can send each other.
- **Townsfolk:** Gus the guard, Robin the ranger and Tess the tinker stroll around each village and like a chat.
- **Smarter skeletons:** they wander when nobody is about and keep apart so they surround rather than pile up. Rogues circle and dart in, mages back away to keep their distance, and a badly hurt warrior runs off for a moment.
- **Day and night:** a day lasts eight minutes, about a third of it night. Night is moonlit, never pitch dark, and more skeletons are about.
- **Music:** a gentle tune made up on the spot (no music files), slower and lower at night.
- **Bolt puzzles:** in the puzzle panel, the target button puts a star a few squares away. The program has to walk Bolt onto it; each one solved pays 3 coins and sets a harder one.
- **Colour jobs:** Mira sometimes asks for blocks of one colour ("three red blocks"). The job's chip shows the colour.
- **Shared with friends:** stars and treasure chests now vanish for everyone when one player takes them, and everyone gets the prize. Friends' building counts toward building jobs. Friends are shown in their car or boat, with their pet beside them.
- **Grown-up controls:** in the grown-ups panel, switch music or skeletons off, see minutes played today, set a daily limit, and choose the graphics setting. Left on Automatic, the game watches its own speed and, if it runs slowly, turns off shadows, then softens the picture, then shortens the view. Best looking and Fastest fix it at either end. When the limit is reached a "time for a break" screen covers the game until a grown-up raises it.
- **Works offline:** after the first visit the game is kept on the device, so it loads quickly and opens without internet (playing alone; chat and playing together need a connection).
- **Weather:** showers roll in about every seven minutes and last about a minute: rain, a greyer sky, and thunder and lightning in the heavy ones. It never rains indoors or underground.
- **Airstrip and plane:** the 🛫 on the map is a runway. Picking ✈️ in the garage parks a propeller plane there. Push forward to speed up, press the up button to climb once it is fast enough, and the down button to descend. Flying too slowly loses height. He can only get out on the ground.
- **Builder's kit:** the 🧰 button opens ready-made shapes (wall, tower, stairs, hut, bridge, pyramid) that build in one tap, facing the way he faces, in whichever colour is selected; eight more materials (wood, stone, grass, sand, pink, black, sky, lime); and an undo button that takes back the last thirty edits.
- **Backups:** the grown-ups panel has **Back up** and **Restore**, which keep the save on your own Cloudflare Worker under the player's name, so it can be moved to another device with the same helper address, family code and name. With the helper set up it also backs up by itself every three minutes. **Save to file** and **Load file** do the same without a Worker.
- **Village names and differences:** each village has its own name, announced on arrival. Not every wandering townsperson lives in every village, and each market stocks a different selection of hats and furniture.
- **Racing together:** when a friend in the same village starts the ring race, it starts for everyone there, and a message shows when someone finishes.
- **Roofs, windows and doors:** the builder's kit also has a roof slope (📐, which rises away from him whichever way he faces), a glass window (🪟) and a door (🚪) that can be walked through.
- **Tag:** with friends in the room, 🏃 in the menu starts a 90-second game. Whoever is "it" passes it on by touching someone; a timer shows at the top.
- **Copying a build:** in the builder's kit, 📸 remembers whatever is built near him and 🖼️ builds it again wherever he taps.
- **Places to find:** villages have an inner ring of houses and an outer ring of bigger buildings, with fields, carts and market clutter between them. Skeleton forts are walled strongholds with a gate, towers, tents, camp fires and war machines, held by a garrison and a giant skeleton; some minutes after a fort is won the skeletons take it back. Between the villages lie farms, mines, lumber camps, watch towers, ruins, shrines, traders, fishing camps and skeleton camps, each marked on the map. Every building with a 🚪 sign over its door can be walked into: each kind has its own inside, and coins to find that are put back later.
- **Getting stronger:** the market sells extra hearts (up to ten, each a little dearer than the last) and up to three pieces of armor; each piece shows as a 🛡️ after the hearts and takes one blow before a heart is lost, then mends itself. Every eight stars earn a skill point: a yellow 💪 button appears, and it can be spent on spin attack 🌀, fast feet 🏃, big jump 🦘, strong magic ✨ or quick heal 💗, three levels each. The 💪 in the menu shows the skills at any time.
- **Party:** up to three AI friends travel with him and share what they win; 👥 at the top shows who, and adds or drops them. The other AI friends go about their own day around the villages.
- **Horse:** walk up to any horse in a village and tap 🐴 to ride it for free; 🐴 in the vehicles list (25 coins, once) calls one from anywhere. It turns on the spot, jumps with the jump button, and he can swing his sword from the saddle; skeletons can still reach him there.
- **Rocket and moon:** a launch pad beside the airstrip (🚀 on the map) is where the rocket is built, five pieces from the bottom up at 12 coins each. With all five in place the yellow button launches it: a countdown, a climb on a pillar of flame, and a landing on the moon. The moon has low gravity, craters, a small base, a rover, friendly aliens who wave and talk, and twelve glowing crystals (a star each, and they sell for 8 coins at the market; they come back after ten minutes). The rocket there flies him home, and so does the 🏡 button.
- **Cities and hamlets:** about one village in three away from home has grown into a city, with a third street, a castle and watchtowers (🏙️ on the map). Hamlets of a few cottages are scattered between.
- **More creatures:** elephants, giraffes, lions, tigers, pandas, monkeys, koalas, beavers and parrots roam the land, penguins and polar bears keep to the snow and crabs to the beach; any can become a pet. Birds fly overhead in flocks, butterflies flutter over the grass and fish jump in the sea.
- **More bad guys:** big brute skeletons (worth 3 extra coins), blue frost mages, pale ghosts that only come out at night, and a rare fast golden skeleton worth 10 coins.
- **Made in code:** models that came without animations are moved by the game itself: horses gallop and graze, flags and banners flap, a shield goes up when armor takes a blow, legs kick when swimming, aliens hop and wave.
- **Big map:** tapping the round map, or 🗺️ in the menu, opens a map that fills the screen, with north at the top. It shows every village and city (with its name), fort, maze, cave, camp, farm and other place for a long way round, plus stars, friends, the rocket and the airstrip. ➕ and ➖ change how far it reaches, up to about 1.3 km each way. Tap it again to close.
- **Music for each place:** the tune changes with where he is: a bouncy one in villages, a tense one near skeletons and forts, a rocking one by the sea, bells in the snow, deep notes in caves, a floating one on the moon, a soft one indoors, and a slower one at night.
- **Online voice:** some tablets (Amazon Fire among them) have no speaking voice of their own. On those the game asks the helper to make the speech instead; this needs the helper's address and family code filled in on that tablet. It can also be picked by hand in the voice list. Each phrase is made once and then kept, both by the helper and on the tablet.
- **A living world:** the sun and moon cross the sky, clouds drift and thicken before rain, stars come out at night, the sea has moving waves that mirror the sky and lap at the shore, plants sway in the wind, feet and wheels kick up dust and ripples, and there are footsteps, wind, waves, birdsong and crickets to hear. The richer sky is switched off automatically on slower devices.
- **AI friends:** Nova, Rex, Zip, Luna, Max and Pip are computer-run friends who share the world. Each wears a 🤖 badge with their name, so it is always clear they are not real children, and they say so if asked. They wander, hunt for stars (which count for him), fight skeletons and go fishing. Walking up to one shows a 🤖 button to talk; asking them to follow, find stars, fight, fish or explore makes them do it. About every four minutes each decides for itself what to do next, and a short message shows the choice. With the AI helper set up, Claude does their talking and deciding; without it they use scripted lines and choose at random. They can be switched off in the grown-ups panel.
- **Menu:** the ☰ button at the top opens everything that is not needed every second: 🏡 home, 🚗 vehicles, 🎒 bag, 🧰 builder's kit, 🧩 program Bolt, 😀 emoji and 👫 play together.
- **Home button:** 🏡 in the menu takes him straight to his own front door in the nearest village, from anywhere, including indoors and underground.
- **Always a goal:** after the guided goals, the banner keeps setting small ones (find a few stars, bonk a few skeletons, catch a fish) worth 5 coins each.
- **The guide:** a banner at the top shows one goal at a time: a picture of what to do, a red arrow pointing to it, and how far away it is. Bolt explains each new goal out loud, and it shows as 🎯 on the map. It walks through eleven goals, from the first star to the dungeon treasure, skipping any already done.
- **Bag:** the 🎒 button shows what he is carrying (fish, bones from skeletons, gems from chests and treasure) and what he owns. Hats can be put on and taken off from here.
- **Market:** the village shop also buys. The top row lists what is in his bag; a tap sells one for coins.
- **Map zoom:** the ➕ and ➖ buttons under the map zoom it in and out, and the choice is remembered. Tapping the map still makes it big.
- **Caves and dungeons:** the 🕳️ on the map is a cave: a ring of boulders round a dark hole. Walking onto the hole goes down into a dungeon, a dark stone maze lit only by his torch. A giant skeleton guards the treasure in the middle (40 coins and 6 stars). Walking back onto the ladder where he arrived goes back up. The first cave is north-west of the start.
- **Mazes:** the 🏛️ on the map is a stone maze with a big treasure chest in the middle (20 coins and 3 stars). The way in is on one side. The first is north of the start.
- **Ring race:** every village has a 🏁 flag. Tapping the button there starts a race through eight rings round the village, on foot or in a car, with 90 seconds on the clock. Faster pays more coins.
- **Fishing:** stand on a shore facing the water and a 🎣 button appears. Cast, wait for the float to dip (the button turns to ❗), then tap to reel in. Each fish is 2 coins.
- **His house:** one house in each village is his. It has a 🏡 sign floating over it with his name and shows as 🏡 on the map. Its front door faces the village well; walking up to it takes him inside, with a fade; walking to the door in the room takes him back out. Inside is his room, the same one from every village.
- **Arranging the room:** tap a piece of furniture to pick it up (it lifts), then tap the floor to put it there. Tap a picked-up piece again to turn it. The two buttons at the top right change the wall and floor colours. It all stays where he leaves it. The room starts with a bed and a rug; a lamp, shelf, cabinet, couch and table are sold at the market.
- **Friends' houses:** when friends are in the room, the next houses along in the village become theirs, each with a sign showing their animal face and name. Walking in shows their room as they arranged it, to look at but not change. Friends are only drawn when in the same place: outdoors together, or in the same house.
- **Away:** a 💤 shows over anyone who has not touched the controls for three minutes, and skeletons leave them alone.
- **Giving to friends:** standing next to a friend, the bag shows a 🎁 and their face. Tapping a fish, bone, gem or the coins hands one over.
- **Hats:** the shop sells a party hat, a top hat and a crown. Tapping one he owns puts it on or takes it off.
- **Letter jobs:** Robin the ranger asks him to find a letter. Three big letters stand around the village; touching the right one finishes the job, and touching a wrong one names it. The jobs work through the alphabet.
- **Riding together:** stand next to a friend who is driving and tap the 🚙 button to ride along; tap again to hop out.
- **Sound effects:** recorded sounds for building, fighting, coins and doors, from Kenney's packs.
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

## Run your own copy

Everything here is free to run. You need a GitHub account; the AI characters and playing together also need a free Cloudflare account and, for the AI only, an Anthropic API key that you pay for by use.

### 1. The game on its own

1. Fork this repository on GitHub.
2. In your fork, open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Push any change to `main` (or run the **Deploy to GitHub Pages** workflow by hand from the **Actions** tab).
4. The game is then at `https://<your-username>.github.io/<repo-name>/`.

That is a complete game: the characters speak from scripted lines, and each device plays alone. Progress is saved in the browser on that device.

### 2. AI characters and playing together (optional)

Both run through one small Cloudflare Worker in the `worker` folder. It keeps your API key off the public site, and only answers requests that come from your game's address and carry a passphrase you choose (the "family code").

1. Edit `worker/wrangler.toml` and change `ALLOWED_ORIGINS` to your own site's origin, for example `https://<your-username>.github.io`. This is the step people miss: without it the Worker refuses your game with error 403.
2. Follow [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md): log in, deploy, and set the two secrets.

   ```
   cd worker
   npm install
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put FAMILY_CODE
   ```

   Type each `secret put` line exactly as shown and paste the value only when it asks. `ANTHROPIC_API_KEY` and `FAMILY_CODE` are the real names, not placeholders.
3. In the game, hold the gear button for two seconds and enter the Worker's address and your family code. Do this once on each device.

Playing together needs no API key: skip the `ANTHROPIC_API_KEY` secret and it still works, with the characters on their scripted lines.

### Costs and safety

- GitHub Pages and the Cloudflare Worker, including the rooms for playing together, are on free plans.
- The AI uses Claude Opus 5.5 with very short replies, at roughly a cent or less each; [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) shows how to switch to the much cheaper Haiku 5.5. Set a monthly spending limit in the Anthropic console before giving the game to a child.
- The characters' rules live in `worker/src/index.ts`, on the server, so nothing typed into the game can change them. Read and adjust them to suit your child: the wording assumes a player of about six.
- Players can only send each other emoji from a fixed list, and only people with your Worker address and family code can join a room.
- The grown-ups panel (hold the gear) has the chat transcript, a daily time limit, and switches for music and fighting.

### Making it yours

- **Name and icon:** the title is in `index.html` and `public/manifest.webmanifest`; the icon is `public/icon.svg`.
- **Characters' personalities:** `CHARACTERS` in `worker/src/index.ts`, with their offline lines in `src/chat.ts`.
- **Jobs the villagers give:** `src/quests.ts`.
- **The guided goals:** `STEPS` in `src/main.ts`.
- **The world's shape:** `baseHeight` in `src/terrain.ts`.

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
5. Shared skeletons, friend markers, emoji, townsfolk (done)
6. Day and night, music, Bolt puzzles, colour jobs, shared stars and treasure, grown-up controls, offline (done)
7. Mazes, ring race, fishing, a house to furnish, hats, letter jobs, riding together, recorded sounds (done)
8. Caves and dungeons, hats and held weapons shown to friends, shared time of day, smaller download (done)
9. Guide, bag, market selling, map zoom (done)
10. A labelled house he arranges himself, giving to friends (done)
11. Walk-in doors and caves, weather, airstrip and plane, builder's kit (done)
12. A menu, a home button, ongoing goals, skeletons that respect walls (done)
13. Backups, village differences, stone walls, skeletons that go round walls, shared race, copying builds (done)
14. Roofs, windows and doors, dungeon torches, tag with friends, cottage doors facing the village (done)

## Credits

3D models are CC0 (public domain): heroes, skeletons, weapons, animations, forest scenery and village and fort buildings, furniture and treasure chests by [Kay Lousberg](https://www.kaylousberg.com), vehicles, animals and sound effects by [Kenney](https://kenney.nl).
