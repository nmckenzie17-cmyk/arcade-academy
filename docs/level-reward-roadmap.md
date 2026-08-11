# Arcade Academy Level Reward Roadmap

This is a design specification. Reward IDs and artwork remain to be finalised before AchievementManager implementation.

## Reward priority and schedule

Each level grants exactly one primary reward category. If a rule appears to overlap, use this priority:

1. **Hub effects:** Level 5, Level 10, and every multiple of 10 thereafter.
2. **Cross-game visual themes:** every level ending in 5 after Level 10 (15, 25, 35 … 95).
3. **Coins:** Level 2, then every level ending in 1 (11, 21, 31 …). Amount: `(level - 1) × 100` coins.
4. **Game reward rotation:** every remaining level.

Coin examples:

| Level | Coins |
|---:|---:|
| 2 | 100 |
| 11 | 1,000 |
| 21 | 2,000 |
| 51 | 5,000 |
| 91 | 9,000 |

Level-up coins do not count toward lifetime earned-coin achievements, preventing an achievement/level feedback loop.

## Hub effects through Level 100

Hub effects are equipped and changed from **Hub Upgrades**, never from an individual game's shop.

| Level | Hub effect idea |
|---:|---|
| 5 | **Golden Hover:** hovered game cards use a gold border and restrained gold glow. |
| 10 | **Dark Silver Cabinets:** all game-card backgrounds use a dark brushed-silver treatment. |
| 20 | **Academy Badge:** an equipable level badge appears in the hub’s top-left corner. |
| 30 | **Neon Grid:** a subtle animated arcade grid appears behind the hub, with reduced-motion fallback. |
| 40 | **Holographic Cards:** game cards gain an angled light sweep on hover. |
| 50 | **Hero Marquee:** the Arcade Academy title gains an equipable illuminated cabinet-marquee frame. |
| 60 | **Living Level Badge:** the top-left badge gains a gentle animated pulse and tier colour. |
| 70 | **Pixel Constellation:** low-intensity achievement-star particles appear in empty hub background space. |
| 80 | **Cabinet Headers:** game cards gain retro cabinet header plates around their titles. |
| 90 | **Arcade Skyline:** an equipable parallax pixel-arcade skyline appears behind the hub. |
| 100 | **Centurion Hub:** an animated platinum/prismatic hub theme with a Level 100 crest and unique transition. |

All effects must preserve text contrast, touch usability, reduced-motion preferences, and the existing overall-statistics layout.

## Cross-game visual themes

These are managed in **Hub Upgrades** because they alter shared fonts, colours, panels, or presentation across games. They do not change gameplay.

| Level | Theme idea |
|---:|---|
| 15 | **Academy Cyan:** cyan game titles, blue focus glow, and matching HUD accents. |
| 25 | **Rose Circuit:** rose titles with VT323-style supporting labels and circuit borders. |
| 35 | **Golden Scholar:** gold headings, parchment-gold question trim, and warm button highlights. |
| 45 | **Mono CRT:** monochrome phosphor palette, scanline option, and terminal-style headings. |
| 55 | **Synthwave:** magenta/cyan title gradient, sunset panels, and neon horizon accents. |
| 65 | **Storybook:** warm paper panels, ink-coloured titles, and illustrated chapter dividers. |
| 75 | **Frozen Focus:** ice-blue titles, glass-like panels, and snow-pixel transitions. |
| 85 | **Solar Arcade:** ember-orange headings, dark-space panels, and solar-flare highlights. |
| 95 | **Prismatic Academy:** shifting title colour, spectrum focus borders, and restrained rainbow transitions. |

Themes should use bundled/shared fonts where possible. Any new font must be added once to global styling, be readable for students, and include a robust fallback.

## Dynamic game reward rotation

For levels not reserved above:

1. Read enabled games dynamically from `GameConfig`.
2. Sort by a stable `rewardRotationOrder`, falling back to game ID.
3. Select the next game round-robin.
4. Select that game's next ungranted configured level reward.
5. Save the resolved `{ level, gameId, rewardId }` in Firebase.

Adding/removing games changes only future unresolved levels. Previously awarded levels never move to another game. If a removed game returns, existing ownership remains. If the selected game has exhausted its rewards, continue to the next eligible game.

Each game should target approximately **80% cosmetic rewards and 20% small gameplay rewards**. Gameplay rewards are single-player only, never apply to multiplayer, and make a run ineligible for future ranked/leaderboard challenge categories unless explicitly allowed.

## Suggested per-game reward pools

Each initial pool below contains six cosmetic rewards and one small gameplay reward. Of the two additional cosmetics per game, one is a playful crossover referencing another Arcade Academy game and one is unique to that game's own theme. This keeps the pools approximately 86% cosmetic and 14% gameplay, comfortably within the cosmetic-first goal.

| Game | Type | Suggested reward |
|---|---|---|
| Cavern Crammer | Cosmetic | Ninja outfit |
| Cavern Crammer | Cosmetic | Gem-spark jump trail |
| Cavern Crammer | Cosmetic | enemies are skinned with wild west themes (ie spikes are cactus etc) |
| Cavern Crammer | Cosmetic | Silver cavern coin appearance |
| Cavern Crammer | Cosmetic · Crossover | **Rocket Recall Relic:** astronaut-miner helmet with a tiny rocket antenna |
| Cavern Crammer | Cosmetic · Unique | **Deep Crystal Explorer:** bioluminescent cave suit and matching crystal outline |
| Cavern Crammer | Gameplay | **Reinforced Step:** the first crumbling platform each run lasts slightly longer |
| Fortress Facts | Cosmetic | Obsidian castle skin |
| Fortress Facts | Cosmetic | Wild west towers and castle themes |
| Fortress Facts | Cosmetic | Starburst tower projectile effect |
| Fortress Facts | Cosmetic | Moonlit battlefield background |
| Fortress Facts | Cosmetic · Crossover | **Shuriken Scholar Standard:** Japanese castle and towers|
| Fortress Facts | Cosmetic · Unique | **Royal Aurora Keep:** castle walls lit by animated northern lights |
| Fortress Facts | Gameplay | **Prepared Quiver:** begin single-player runs with one extra ammo |
| Jetpack Journey | Cosmetic | Vampire jetpack and player |
| Jetpack Journey | Cosmetic | Alien jetpack and player |
| Jetpack Journey | Cosmetic | Time-traveller outfit |
| Jetpack Journey | Cosmetic | Pixel-ring boost effect |
| Jetpack Journey | Cosmetic · Crossover | **Note Knowledge Flight:** musical-note fuel trail that changes colour between stages |
| Jetpack Journey | Cosmetic · Unique | **Temporal Ace:** clockwork jetpack with spinning time-dial exhausts |
| Jetpack Journey | Gameplay | **Efficient Ignition:** slightly reduce initial fuel drain in single-player runs |
| Note Knowledge | Cosmetic | Midnight grand-piano theme |
| Note Knowledge | Cosmetic | Neon piano tiles |
| Note Knowledge | Cosmetic | Explosion effects on note touch |
| Note Knowledge | Cosmetic | Concert-hall background |
| Note Knowledge | Cosmetic · Crossover | **Pinball Postulation Remix:** neon pinball note tiles with bumper-flash hit effects |
| Note Knowledge | Cosmetic · Unique | **Maestro's Stage:** velvet concert backdrop and conductor-themed piano trim |
| Note Knowledge | Gameplay | **Grace Note:** one short chain-preservation grace window per run |
| Pinball Postulation | Cosmetic | Prismatic pinball skin |
| Pinball Postulation | Cosmetic | Neon academy table theme |
| Pinball Postulation | Cosmetic | Star-shaped bumper flashes |
| Pinball Postulation | Cosmetic | Fireball trail |
| Pinball Postulation | Cosmetic · Crossover | **Fortress Facts Table:** castle bumpers, tower lanes, and royal-flag targets |
| Pinball Postulation | Cosmetic · Unique | **Cosmic Multiball:** galaxy pinballs with orbit-ring trails |
| Pinball Postulation | Gameplay | **Table Nudge:** one automatic outlane rescue per run |
| Thinking Tanks | Cosmetic | Academy-blue tank skin |
| Thinking Tanks | Cosmetic | Chalk-line projectile trail |
| Thinking Tanks | Cosmetic | explosion effect (from rocket recall) |
| Thinking Tanks | Cosmetic | Moon-desert battlefield palette |
| Thinking Tanks | Cosmetic · Crossover | **Tic-Tac-Toe Treads:** X/O armour decals and a grid-pattern aiming trail |
| Thinking Tanks | Cosmetic · Unique | **Iron Strategist:** engraved command tank with animated rank pennant |
| Thinking Tanks | Gameplay | **Range Finder:** add one extra trajectory guide marker in CPU matches only |
| Rocket Recall | Cosmetic | Stealth fighter skin and ground is japanese temples |
| Rocket Recall | Cosmetic | Wild west fighter colours, and wild west ground|
| Rocket Recall | Cosmetic | Twin-ion engine trail |
| Rocket Recall | Cosmetic | Nova explosion effect |
| Rocket Recall | Cosmetic · Crossover | **Jetpack Journey Escort:** jetpack-shaped support fins and matching boost trail |
| Rocket Recall | Cosmetic · Unique | **Void Vanguard:** black-hole ship skin with a gravitational lens engine effect |
| Rocket Recall | Gameplay | **Emergency Plating:** absorb one small hit per single-player run |
| Shuriken Scholar | Cosmetic | White-shadow ninja outfit (and samurai outfit) |
| Shuriken Scholar | Cosmetic | Alien ninja outfit (and samurai outfit) also bow and shuriken are neon |
| Shuriken Scholar | Cosmetic | Neon smoke colour (and servant is neon as well) |
| Shuriken Scholar | Cosmetic | Animated academy headband |
| Shuriken Scholar | Cosmetic · Crossover | **Wild West Ronin:** cowboy hat, dust-coloured robes, and sheriff-star shuriken |
| Shuriken Scholar | Cosmetic · Unique | **Eclipse Shinobi:** moon-shadow outfit with a solar-eclipse smoke ring |
| Shuriken Scholar | Gameplay | **Tactical Rethink:** reroll one upgrade choice per single-player run |
| Tic-Tac-Toe | Cosmetic | Holographic board theme |
| Tic-Tac-Toe | Cosmetic | Gemstone X and O pieces |
| Tic-Tac-Toe | Cosmetic | Confetti line-win animation |
| Tic-Tac-Toe | Cosmetic | Classroom-chalk background |
| Tic-Tac-Toe | Cosmetic · Crossover | **Thinking Tanks Grid:** tank-tread board frame with shell-impact placement effects |
| Tic-Tac-Toe | Cosmetic · Unique | **Quantum Noughts:** holographic symbols that ripple when a line is completed |
| Tic-Tac-Toe | Gameplay | **Second Thought:** retry one missed turn-question in a CPU match only |
| Wild West Wordslinger | Cosmetic | Fish crosshair and fish effect on enemy death|
| Wild West Wordslinger | Cosmetic | Sheriff-star crosshair and gold coin effect on enemy death|
| Wild West Wordslinger | Cosmetic | musical note crosshair and music note effect on enemy death|
| Wild West Wordslinger | Cosmetic | enemys become aliens (pulled from rocket recalls sprites)|
| Wild West Wordslinger | Cosmetic · Crossover | **Cavern Crammer Prospector:** crystal enemy defeats and gemstone crosshair |
| Wild West Wordslinger | Cosmetic · Unique | **Ghost Town Legend:** spectral gunslinger crosshair with pale-blue dust effects |
| Wild West Wordslinger | Gameplay | **Loaded Chamber:** begin a single-player run with one extra ammo |

## Cosmetic placement rules

- Hub borders, backgrounds, badges, fonts, shared themes, menu effects, and other non-gameplay presentation belong in **Hub Upgrades**.
- Player sprites, characters, weapon appearances, projectiles, trails, game backgrounds, and game HUD skins belong in that game's **Cosmetics** tab.
- A game's Cosmetics tab remains hidden until the player owns at least one compatible level or Secret cosmetic.
- Regular achievements grant XP only. Cosmetics originate only from level rewards or Secret achievements.
