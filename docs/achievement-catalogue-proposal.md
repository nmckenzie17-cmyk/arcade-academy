# Arcade Academy Achievement Catalogue — Proposal v1

This catalogue proposes **150 achievements**. It is a design document only: none of these achievements or rewards are implemented yet.

## Guardrails used throughout

- “Run” means a scored, non-practice attempt that reaches the game’s normal completion/game-over boundary.
- Practice mode does not advance achievements, except a future explicitly labelled practice/tutorial achievement.
- Accuracy awards require the stated minimum sample and only count teacher-assigned/approved question banks. Repeating a recently mastered item should not inflate the qualifying sample.
- Session-to-session improvement compares two valid sessions in the same bank/difficulty, each with at least 10 questions. A rolling baseline prevents deliberate low-score farming.
- “Different games”, “all games”, and mastery requirements are calculated dynamically from enabled `GameConfig` entries.
- Multiplayer opponent milestones count distinct authenticated opponents and limit repeat credit from the same opponent per day. CPU achievements are tracked separately.
- Rewards are cosmetic concepts, not final art commitments. Unlocking an achievement grants one selected reward, or a themed bundle where approved.
- Bronze = introductory, Silver = sustained progress, Gold = difficult, Platinum = exceptional mastery, Secret = hidden until unlocked.

## Getting Started (15)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| First Steps | First-Time | Start the first non-practice game | Bronze | Rookie profile badge / Pixel sneakers icon / Blue starter border |
| Run Complete | First-Time | Finish the first valid run | Bronze | Chequered badge / “Finisher” title / Finish-line banner |
| Curious Mind | First-Time | Answer the first educational question | Bronze | Question-mark badge / Pencil cursor / Notebook profile icon |
| Bright Start | First-Time | Answer the first question correctly | Bronze | Tiny lightbulb badge / Yellow name accent / Spark question-panel trim |
| First Coin | First-Time | Earn the first shared coin | Bronze | Coin profile icon / Gold score-counter digits / Coin cursor |
| First Investment | First-Time | Purchase the first permanent upgrade | Bronze | Wrench badge / Blueprint menu background / “Tinkerer” title |
| A New Look | First-Time | Unlock the first cosmetic | Bronze | Wardrobe badge / Colour-swatch icon / Dressing-room profile background |
| First Target | First-Time | Defeat the first enemy in a supported game | Bronze | Crosshair badge / Red hit-spark effect / “Rookie Fighter” title |
| Bigger They Are | First-Time | Defeat the first boss in a supported game | Bronze | Cracked crown badge / Boss-warning profile banner / Trophy hit effect |
| Ready Player Two | Multiplayer | Complete the first human multiplayer match | Bronze | Two-player badge / Split-colour border / Handshake victory sticker |
| First Victory | Multiplayer | Win the first human multiplayer match | Bronze | Bronze laurel badge / Victory pose / “Contender” title |
| Machine Learner | Multiplayer | Complete the first match against a CPU | Bronze | Circuit-board badge / Robot profile icon / Scanline border |
| Achievement Unlocked | Meta | Unlock any other achievement | Bronze | Trophy badge / Achievement-toast theme / “Collector of Goals” title |
| Perfect Start | Questions | Complete the first valid perfect question round with at least 5 questions | Bronze | Five-star badge / Clean white question-panel theme / Confetti answer effect |
| Welcome Back | Dedication | Return on a different calendar day | Bronze | Return-arrow badge / Sunrise profile background / “Back for More” title |

## Brain Power — Questions and Accuracy (20)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Question Cadet | Questions | Answer 10 questions | Bronze | Pencil badge / Paper button theme / Tiny question particles |
| Question Scout | Questions | Answer 25 questions | Bronze | Open-book badge / Notebook HUD / Blue ink name colour |
| Brainiac I | Questions | Answer 50 questions | Bronze | Brain badge / Thought-bubble icon / Scholar cap |
| Brainiac II | Questions | Answer 100 questions | Bronze | Bronze scholar border / Animated page-turn icon / “Learner” title |
| Brainiac III | Questions | Answer 250 questions | Silver | Silver brain badge / Formula profile background / Knowledge spark trail |
| Brainiac IV | Questions | Answer 500 questions | Silver | Electric brain border / Library banner / “Deep Thinker” title |
| Brainiac V | Questions | Answer 1,000 questions | Gold | Animated neuron border / Golden book icon / Lightning question trail |
| Brainiac VI | Questions | Answer 2,500 questions | Gold | Holographic scholar badge / Constellation HUD / “Knowledge Seeker” title |
| Brainiac VII | Questions | Answer 5,000 questions | Platinum | Prismatic brain emblem / Animated library background / Aurora answer effect |
| Brainiac VIII | Questions | Answer 10,000 questions | Platinum | Legendary brain crown / Infinite-pages border / “Question Master” title |
| Correct Course I | Questions | Give 100 correct answers | Bronze | Green tick badge / Correct-answer chime skin / Emerald button trim |
| Correct Course II | Questions | Give 1,000 correct answers | Gold | Golden tick border / Radiant answer flash / “On the Mark” title |
| Hot Streak | Questions | Give 10 correct answers consecutively | Bronze | Flame badge / Warm-orange name effect / Small fire trail |
| White Hot | Questions | Give 25 correct answers consecutively | Silver | Blue-flame border / Streak counter theme / “Quick Thinker” title |
| Perfect Recall | Questions | Give 50 correct answers consecutively across valid rounds | Gold | Animated brain border / Electric question trail / “Perfect Recall” title |
| Curriculum Explorer | Questions | Answer 25+ questions in 5 approved question banks | Gold | Bookshelf banner / Rotating subject icons / “Curriculum Explorer” title |
| Question Polyglot | Questions | Complete 10+ questions in 4 registered question types | Silver | Four-symbol badge / Shifting question panel / Spectrum cursor |

## Perfect Recall — Accuracy (10)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Finding Your Feet | Accuracy | Maintain 60% accuracy over 25 qualifying questions | Bronze | Copper target badge / Soft green panel trim / “Getting There” title |
| Steady Aim | Accuracy | Maintain 70% accuracy over 50 qualifying questions | Bronze | Target profile icon / Mint answer glow / Steady crosshair cursor |
| Sharp Mind | Accuracy | Maintain 80% accuracy over 100 qualifying questions | Silver | Silver owl badge / Focused blue border / “Sharp Mind” title |
| Excellent Recall | Accuracy | Maintain 90% accuracy over 150 qualifying questions | Gold | Golden memory badge / Recall-wave answer effect / Gold-edged question panel |
| Near Perfection | Accuracy | Maintain 95% accuracy over 250 qualifying questions | Platinum | Crystal halo border / White-gold name shimmer / “Near Perfect” title |
| Flawless Round | Accuracy | Achieve 100% in a valid round of at least 10 questions | Silver | Perfect-ten badge / Confetti answer burst / Clean arcade HUD |
| Flawless Fifty | Accuracy | Achieve 100% across 50 qualifying questions in one bank | Gold | Diamond book emblem / Prismatic tick trail / “Flawless Fifty” title |
| Consistent Scholar | Accuracy | Achieve 80%+ in 5 valid sessions | Silver | Five-ribbon badge / Consistency graph background / Calm blue aura |
| Bank Master | Accuracy | Reach 90% over 100 non-repeated qualifying questions in one bank | Gold | Mastered-book badge / Bank-themed profile banner / “Bank Master” title |

## Never Give Up — Improvement (12)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Better Than Yesterday | Improvement | Beat the previous valid session’s accuracy | Bronze | Up-arrow badge / Rising graph background / Green pulse name effect |
| Five Percent Stronger | Improvement | Improve a rolling bank accuracy baseline by 5 percentage points | Bronze | +5 badge / Lime progress-bar skin / “Improving” title |
| Ten Percent Stronger | Improvement | Improve a rolling bank accuracy baseline by 10 points | Silver | +10 silver emblem / Rising lightning trail / Growth-ring border |
| Breakthrough | Improvement | Improve a rolling bank accuracy baseline by 20 points over at least 50 questions | Gold | Shattered-ceiling badge / Ascending beam animation / “Breakthrough” title |
| Personal Best | Improvement | Beat a previous non-zero high score | Bronze | PB badge / Score sparkle effect / Personal-best banner |
| Hat Trick of High Scores | Improvement | Set 3 new personal bests without resetting progress | Silver | Triple-crown badge / Three-tone score digits / “Record Breaker” title |
| Record Chaser | Improvement | Set 5 new personal bests across at least 3 sessions | Gold | Animated record border / Golden scoreboard HUD / Comet score trail |
| Double Take | Improvement | Reach twice the first established personal best in one game | Gold | Mirrored badge / Double-exposure profile background / “Beyond Limits” title |
| Learned From It | Improvement | Correctly answer a question previously answered incorrectly | Bronze | Eraser-to-tick badge / Correction flash / “Second Chance” title |
| Error Hunter | Improvement | Correct 25 distinct previously missed questions | Silver | Marked-paper badge / Red-to-green answer animation / Detective glasses cosmetic |
| Weakness to Strength | Improvement | Raise a bank from below 60% to at least 80% over 50+ later questions | Gold | Phoenix-book emblem / Reforged profile border / “Never Give Up” title |
| New Streak Record | Improvement | Beat the account’s previous best correct-answer streak 5 times | Gold | Ascending flame trail / Record ladder banner / Animated streak crown |

## Arcade Veteran — Dedication and Economy (16)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Quarter Hour | Playtime | Accumulate 15 minutes across valid sessions | Bronze | Tiny clock badge / Quarter-hour dial icon / Blue timer digits |
| Warming Up | Playtime | Accumulate 30 minutes | Bronze | Stopwatch badge / Warm-up jacket / Clock-face cursor |
| One Hour Hero | Playtime | Accumulate 1 hour | Bronze | Bronze hourglass / “Regular” title / Hour-mark border |
| Arcade Apprentice | Playtime | Accumulate 2 hours | Silver | Silver clock badge / Pixel arcade background / Apprentice jacket |
| Arcade Regular | Playtime | Accumulate 5 hours across at least 5 sessions | Silver | Token-machine badge / Neon menu theme / “Arcade Regular” title |
| Dedicated Learner | Playtime | Accumulate 10 hours across at least 10 sessions | Gold | Animated study clock / Desk-at-night background / Focus aura |
| Arcade Veteran | Playtime | Accumulate 25 hours across at least 25 sessions | Gold | Veteran medal / CRT profile border / “Arcade Veteran” title |
| Fifty-Hour Scholar | Playtime | Accumulate 50 hours across at least 40 sessions | Platinum | Platinum clockwork border / Animated cabinet background / Scholar coat |
| Century Player | Playtime | Accumulate 100 hours across at least 75 sessions | Platinum | Century emblem / Time-warp trail / “Century Player” title |
| Coin Collector I | Economy | Earn 100 lifetime coins | Bronze | Coin pouch badge / Bronze coin cursor / Coin-count font |
| Coin Collector II | Economy | Earn 500 lifetime coins | Bronze | Stacked-coins icon / Gold button trim / Coin-jingle toast theme |
| Coin Collector III | Economy | Earn 1,000 lifetime coins | Silver | Silver vault badge / Coin-rain victory effect / “Saver” title |
| Coin Collector IV | Economy | Earn 5,000 lifetime coins | Silver | Treasure chest icon / Gilded HUD / Spinning-coin trail |
| Coin Collector V | Economy | Earn 10,000 lifetime coins | Gold | Golden vault border / High Roller jacket / “High Roller” title |
| Coin Collector VI | Economy | Earn 50,000 lifetime coins | Gold | Animated treasury background / Crowned coin badge / Liquid-gold name effect |
| Coin Collector VII | Economy | Earn 100,000 lifetime coins | Platinum | Platinum vault emblem / Endless coin fountain animation / “Arcade Tycoon” title |

## Explorer, Returning Player, and Collection (16)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Game Sampler | Exploration | Play 2 different enabled games | Bronze | Two-cabinet badge / Split-game banner / Two-tone border |
| Triple Feature | Exploration | Play 3 different enabled games | Bronze | Triple-ticket icon / Three-panel background / “Sampler” title |
| Arcade Tourist | Exploration | Play 5 different enabled games | Silver | Map-pin badge / Arcade map background / Souvenir hat |
| Grand Tour | Exploration | Play every currently enabled game | Gold | Arcade Academy skin / Animated cabinet border / “Grand Tour” title |
| Solo Circuit | Exploration | Play every enabled single-player game | Silver | Single-star badge / Solo spotlight background / Lone-hero cape |
| Party Circuit | Exploration | Play every enabled multiplayer game | Silver | Linked-controller badge / Party-light border / Team-colour banner |
| Versatile Scholar | Exploration | Answer correctly in 5 different games | Gold | Five-gem scholar badge / Rotating game icons / “Versatile Scholar” title |
| Score Safari | Exploration | Establish a non-zero high score in 5 different games | Gold | Score-map banner / Trophy passport icon / Multigame score-counter skin |
| Three-Day Player | Returning | Play on 3 different days | Bronze | Three-sun badge / Calendar cursor / Morning gradient background |
| Five-Day Player | Returning | Play on 5 different days | Bronze | Five-page calendar / Weekday colour border / “Returning Player” title |
| Ten-Day Scholar | Returning | Play on 10 different days | Silver | Silver calendar badge / Study-planner background / Date-stamp effect |
| Dedicated Visitor | Returning | Play on 25 different days | Gold | Golden calendar border / Seasonal banner / “Dedicated Visitor” title |
| Hundred-Day Academy | Returning | Play on 100 different days, not necessarily consecutive | Platinum | Animated yearbook border / Academy crest cape / “Academy Regular” title |
| Wardrobe Starter | Collection | Own 5 cosmetics | Bronze | Clothes-hanger badge / Wardrobe background / Swatch cursor |
| Style Collector | Collection | Own 25 cosmetics across at least 3 games | Gold | Animated wardrobe border / “Collector” title / Fashion-show victory animation |
| Academy Curator | Collection | Unlock at least one cosmetic from every enabled game | Platinum | Museum-gallery background / Prismatic curator badge / “Academy Curator” title |

## Competitor — Multiplayer and CPU (14)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Matchmaker I | Multiplayer | Complete 5 human multiplayer matches | Bronze | Five-link badge / Match-card border / Friendly wave emote |
| Matchmaker II | Multiplayer | Complete 10 human multiplayer matches | Silver | Silver controller badge / Lobby background / “Regular Rival” title |
| Matchmaker III | Multiplayer | Complete 25 human multiplayer matches | Silver | Arcade-versus banner / Animated VS icon / Team jacket |
| Matchmaker IV | Multiplayer | Complete 50 human multiplayer matches | Gold | Golden controller border / Versus lightning effect / “Competitor” title |
| Matchmaker V | Multiplayer | Complete 100 human multiplayer matches across at least 10 days | Platinum | Platinum linked-controller emblem / Animated arena background / “Seasoned Competitor” title |
| Winner’s Circle I | Multiplayer | Win 5 human multiplayer matches | Bronze | Bronze laurel / Small victory confetti / Winner ribbon |
| Winner’s Circle II | Multiplayer | Win 10 human multiplayer matches | Silver | Silver laurel border / Victory spotlight / “Challenger” title |
| Winner’s Circle III | Multiplayer | Win 25 human multiplayer matches | Gold | Golden champion banner / Trophy raise animation / Champion jacket |
| Winner’s Circle IV | Multiplayer | Win 50 human matches across at least 5 distinct opponents | Platinum | Platinum crown border / Arena fireworks / “Multiplayer Ace” title |
| Friendly Rival | Multiplayer | Complete matches against 5 distinct authenticated opponents | Silver | Handshake emblem / Friend-grid background / Two-colour name effect |
| Low CPU Cleared | Multiplayer | Defeat Low CPU | Bronze | Tin robot badge / Green circuit trail / “Bot Beginner” title |
| Medium CPU Cleared | Multiplayer | Defeat Medium CPU | Silver | Chrome robot badge / Amber circuit border / Robot victory pose |
| High CPU Cleared | Multiplayer | Defeat High CPU | Gold | Golden AI core emblem / Red scanline aura / “Machine Beater” title |
| Comeback Kid | Multiplayer | Win after trailing by the game-configured comeback margin | Gold | Phoenix-versus badge / Reverse-sweep animation / “Comeback Kid” title |

## Multiplayer Brain Power and Leaderboards (10)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Smart Victory | Multiplayer Questions | Win a valid match with 70%+ accuracy over at least 10 questions | Bronze | Brain-controller badge / Green victory panel / Scholar jersey |
| Sharp Victory | Multiplayer Questions | Win with 80%+ accuracy over at least 10 questions | Silver | Silver brain laurel / Focus beam victory effect / “Tactical Thinker” title |
| Brilliant Victory | Multiplayer Questions | Win with 90%+ accuracy over at least 10 questions | Gold | Golden brain crown / Electric arena border / Brilliant-blue name glow |
| Perfect Victory | Multiplayer Questions | Win with 100% accuracy over at least 10 questions | Platinum | Crystal controller crown / Perfect-win animation / “Flawless Competitor” title |
| Rally and Win | Multiplayer Questions | Answer incorrectly, then give 5 consecutive correct answers and win | Silver | Rally-arrow badge / Red-to-green trail / Recovery victory banner |
| Scholar vs Machine | Multiplayer Questions | Defeat High CPU with 85%+ accuracy over at least 10 questions | Platinum | Holographic AI trophy / Data-stream cape / “Scholar vs Machine” title |
| Class Top Ten | Leaderboard | Enter a class top 10 for any game with at least 10 ranked students | Silver | Top-10 badge / Numbered profile border / Scoreboard banner |
| Class Podium | Leaderboard | Enter a class top 3 with at least 10 ranked students | Gold | Podium profile background / Medal name effect / “Podium Player” title |
| Class Champion | Leaderboard | Hold class #1 after the ranking refresh with at least 10 ranked students | Gold | Class crown badge / Gold high-score box theme / Champion spotlight |
| Multi-Game Champion | Leaderboard | Hold class #1 in 3 games, not necessarily simultaneously | Platinum | Triple-crown animated border / Hall-of-fame banner / “All-Round Champion” title |

## Combat, Runs, and Upgrades (14)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Enemy Hunter I | Combat | Defeat 10 enemies across supported games | Bronze | Target badge / Small hit-spark / Hunter headband |
| Enemy Hunter II | Combat | Defeat 100 enemies | Silver | Silver crossed-weapons emblem / Red projectile trail / “Enemy Hunter” title |
| Enemy Hunter III | Combat | Defeat 1,000 enemies | Gold | Golden battle border / Impact-ring effect / Veteran armour appearance |
| Enemy Hunter IV | Combat | Defeat 5,000 enemies | Platinum | Animated horde emblem / Meteor impact effect / “Legendary Hunter” title |
| Boss Hunter | Combat | Defeat 10 bosses | Silver | Ten-skull badge / Boss-health-bar theme / “Boss Hunter” title |
| Untouchable Boss | Challenge | Defeat a boss without taking damage | Gold | Ghost armour skin / Golden evade trail / “Untouchable” title |
| Last Heart | Challenge | Survive a stage after reaching exactly 1 HP | Gold | Pulsing-heart border / Crimson low-health aura / “Last Heart” title |
| Runner I | Runs | Complete 5 valid runs | Bronze | Running-shoe badge / Start-line animation / Runner headband |
| Runner II | Runs | Complete 25 valid runs | Silver | Silver route-map badge / Motion-line trail / “Seasoned Runner” title |
| Runner III | Runs | Complete 100 valid runs across at least 20 sessions | Platinum | Endless-road border / Marathon cape / “Unstoppable” title |
| Clean Run | Challenge | Complete a supported run without taking damage | Gold | Polished shield emblem / Clean white trail / “Clean Run” title |
| Bare Essentials | Challenge | Complete a supported run without buying an in-run upgrade | Gold | Wooden-gear badge / Minimal HUD theme / “Bare Essentials” title |
| Upgrade Enthusiast | Upgrades | Purchase 50 permanent upgrades across games | Gold | Golden wrench border / Animated blueprint background / Mechanic outfit |
| Completionist Engineer | Upgrades | Fully complete one game’s permanent upgrade catalogue | Platinum | Master wrench emblem / Maxed-tree animation / “Completionist Engineer” title |

## Current Game Mastery — Signature Achievements (10)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Cavern Crammer: Vault Seeker | Game Mastery | Discover every configured hidden vault type in Cavern Crammer | Gold | Crystal miner helmet / Gem jump trail / Underground profile background |
| Fortress Facts: Unbroken Kingdom | Game Mastery | Complete a configured late wave with the king taking no damage | Gold | Ivory castle skin / Royal flag design / “Unbroken Kingdom” title |
| Jetpack Journey: Time Flyer | Game Mastery | Reach the game-configured mastery distance in one run | Gold | Chrono jetpack skin / Rainbow fuel trail / Time-warp profile border |
| Note Knowledge: Perfect Performance | Game Mastery | Complete a configured advanced song/round with 100% question accuracy | Gold | Golden piano theme / Musical-note particles / “Perfect Performance” title |
| Pinball Postulation: Multiball Mind | Game Mastery | Reach the configured bumper-combo tier while completing its question launches | Gold | Neon pinball skin / Electric bumper effects / Arcade-table profile background |
| Thinking Tanks: Calculated Shot | Game Mastery | Win with a configured long-range or banked shot and 80%+ question accuracy | Gold | Blueprint tank skin / Protractor projectile trail / “Calculated Shot” title |
| Rocket Recall: Planetary Defender | Game Mastery | Defeat every configured boss type | Platinum | Legendary spaceship skin / Nova laser colour / “Planetary Defender” title |
| Shuriken Scholar: Shadow Master | Game Mastery | Reach the configured extreme wave using one weapon family | Platinum | Master ninja outfit / Eclipse smoke colour / Animated shuriken border |
| Tic-Tac-Toe: Grand Strategist | Game Mastery | Win valid matches from each configured starting position and beat High CPU | Gold | Holographic X/O pieces / Grid profile border / “Grand Strategist” title |
| Wild West Wordslinger: Quickest Mind | Game Mastery | Clear a configured late stage with 90%+ reload-question accuracy | Platinum | Legendary gunslinger outfit / Golden dust trail / “Quickest Mind” title |

## Mastery Progression and Meta (10)

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| Game Rookie | Mastery | Complete a game’s configured Rookie checklist | Bronze | Game-themed rookie badge / Basic palette / Rookie title variant |
| Game Skilled | Mastery | Complete a game’s configured Skilled checklist | Silver | Game-themed silver border / Alternate HUD / Skilled title variant |
| Game Expert | Mastery | Complete a game’s configured Expert checklist | Gold | Distinctive game skin / Animated game emblem / Expert title variant |
| Game Master | Mastery | Complete the game’s major non-secret achievement checklist | Platinum | Game Master Skin / Animated profile border / “[Game] Master” title |
| Game Legend | Mastery | Complete the game’s configured extreme checklist | Platinum | Legendary animated skin / Unique victory animation / “[Game] Legend” title |
| Trophy Shelf I | Meta | Earn 10 achievements | Bronze | Small trophy shelf background / Bronze badge cluster / “Goal Getter” title |
| Trophy Shelf II | Meta | Earn 25 achievements | Silver | Silver trophy border / Achievement sparkle cursor / “Achievement Hunter” title |
| Trophy Shelf III | Meta | Earn 50 achievements | Gold | Animated trophy-room background / Gold badge aura / “Trophy Hunter” title |
| Trophy Shelf IV | Meta | Earn 100 achievements | Platinum | Platinum trophy crown / Living achievement wall / “Achievement Master” title |
| Arcade Legend | Meta | Earn Game Master status in every currently enabled game | Platinum | Animated Arcade Academy skin / Rainbow pixel border / “Arcade Legend” title |

## Secrets (8)

Before unlock, every entry appears as **??? — “Keep playing to discover this achievement.”** The requirement and reward name become visible only after unlock.

| Achievement | Category | Requirement | Difficulty | Possible Cosmetic Reward |
|---|---|---|---|---|
| By a Thread | Secret | Win or survive a valid encounter at exactly 1 HP | Secret | Stitched-heart badge / Flickering red outline / “By a Thread” title |
| Two at Once | Secret | Defeat two enemies within the game-configured simultaneous window | Secret | Twin-impact effect / Double-star badge / Echo projectile trail |
| Wrong Way, Right Place | Secret | Find a configured hidden area in a supported game | Secret | Secret-door profile background / Explorer lantern / Mysterious map border |
| Strange Synergy | Secret | Finish a run with a game-configured unusual upgrade combination | Secret | Mismatched costume / Glitch aura / “Mad Inventor” title |
| One in a Thousand | Secret | Encounter a configured rare event | Secret | Lucky pixel badge / Shimmering rarity border / “What Are the Odds?” title |
| Hidden Challenger | Secret | Discover a configured secret character or opponent | Secret | Silhouette profile icon / Shadow palette / Secret entrance animation |
| Cabinet Tap | Secret | Trigger a hidden hub or game animation through an easter egg | Secret | Tiny arcade-cabinet pet / CRT glitch cursor / Easter-egg badge |
| Against All Advice | Secret | Complete a game-defined deliberately unusual challenge | Secret | Upside-down badge / Chaotic rainbow trail / “Why Would You Do That?” title |

## Proposed achievement-set completion rewards

These are additional set rewards, not extra achievements in the count above.

| Set | Completion rule | Exclusive cosmetic reward ideas |
|---|---|---|
| Getting Started | Complete all launch-version introductory achievements | Animated “Class of Arcade Academy” badge / Starter varsity jacket |
| Brain Power | Complete all launch Brain Power achievements | Animated brain-and-lightning profile border / Scholar’s electric crown |
| Perfect Recall | Complete the accuracy set | Crystal question-panel theme / “Perfect Recall” animated title |
| Never Give Up | Complete the improvement set | Phoenix profile border / Rising flame character trail |
| Arcade Veteran | Complete the dedication set | Animated retro-cabinet background / Veteran bomber jacket |
| Explorer | Complete the dynamic exploration set | Arcade Academy mascot skin / Cabinet-carousel profile banner |
| Collector | Complete the collection set | Prismatic wardrobe frame / “Curator” animated title |
| Competitor | Complete the multiplayer participation set | Animated versus border / Championship warm-up jacket |
| Champion | Complete the leaderboard set | Golden podium background / Crowned scoreboard theme |
| One Game’s Mastery | Earn that game’s Master status | That game’s complete Master Skin and matching profile emblem |
| Secrets | Discover all currently enabled secrets | Glitching mystery border / Secret rainbow silhouette skin |

## Recommended launch scope

Launch with roughly **45–60 achievements**, then add the rest as telemetry and game event hooks become reliable. A balanced first release would contain:

- all 15 Getting Started achievements;
- the first 12 Brain Power/Accuracy milestones;
- 6 Improvement achievements;
- 8 Dedication/Economy achievements;
- 6 Exploration/Returning achievements;
- 4 Multiplayer achievements;
- one signature achievement for each game that already exposes the required event reliably;
- 2–3 secrets.

Leaderboard achievements should remain disabled while leaderboards are hidden. “All games” achievements should use a versioned eligible-game snapshot so adding a new game does not revoke an achievement already earned.

## Catalogue fields to carry into implementation later

Each approved entry should ultimately gain: stable `id`, `version`, `scope`, `familyId`, `familyRank`, `setId`, eligibility predicates, event/stat requirements, anti-farming policy, reward IDs, progress visibility, and localisation keys. Requirements involving multiple conditions should use an `all`/`any` condition tree rather than executable JavaScript in configuration.
