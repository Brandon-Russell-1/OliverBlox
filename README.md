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
- **Grown-up controls:** in the grown-ups panel, switch music or skeletons off, see minutes played today, and set a daily limit. When the limit is reached a "time for a break" screen covers the game until a grown-up raises it.
- **Works offline:** after the first visit the game is kept on the device, so it loads quickly and opens without internet (playing alone; chat and playing together need a connection).
- **The guide:** a banner at the top shows one goal at a time: a picture of what to do, a red arrow pointing to it, and how far away it is. Bolt explains each new goal out loud, and it shows as 🎯 on the map. It walks through eleven goals, from the first star to the dungeon treasure, skipping any already done.
- **Bag:** the 🎒 button shows what he is carrying (fish, bones from skeletons, gems from chests and treasure) and what he owns. Hats can be put on and taken off from here.
- **Market:** the village shop also buys. The top row lists what is in his bag; a tap sells one for coins.
- **Map zoom:** the ➕ and ➖ buttons under the map zoom it in and out, and the choice is remembered. Tapping the map still makes it big.
- **Caves and dungeons:** the 🕳️ on the map is a cave: a ring of boulders round a dark hole. Standing on the hole and tapping the button goes down into a dungeon, a dark stone maze lit only by his torch. A giant skeleton guards the treasure in the middle (40 coins and 6 stars). The ladder where he arrived goes back up. The first cave is north-west of the start.
- **Mazes:** the 🏛️ on the map is a stone maze with a big treasure chest in the middle (20 coins and 3 stars). The way in is on one side. The first is north of the start.
- **Ring race:** every village has a 🏁 flag. Tapping the button there starts a race through eight rings round the village, on foot or in a car, with 90 seconds on the clock. Faster pays more coins.
- **Fishing:** stand on a shore facing the water and a 🎣 button appears. Cast, wait for the float to dip (the button turns to ❗), then tap to reel in. Each fish is 2 coins.
- **His house:** one house in each village is his. It has a 🏡 sign floating over it with his name, shows as 🏡 on the map, and is the only one with a door button. Inside is his room, the same one from every village.
- **Arranging the room:** tap a piece of furniture to pick it up (it lifts), then tap the floor to put it there. Tap a picked-up piece again to turn it. The two buttons at the top right change the wall and floor colours. It all stays where he leaves it. The room starts with a bed and a rug; a lamp, shelf, cabinet, couch and table are sold at the market.
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
11. More mini-games, decorated dungeon walls, skeletons that respect walls

## Credits

3D models are CC0 (public domain): heroes, skeletons, weapons, animations, forest scenery and village and fort buildings, furniture and treasure chests by [Kay Lousberg](https://www.kaylousberg.com), vehicles, animals and sound effects by [Kenney](https://kenney.nl).
