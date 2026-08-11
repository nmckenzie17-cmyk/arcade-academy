# Arcade Academy Achievement Catalogue — Proposal v1

> Superseded/extended by the approved XP, level, cosmetic-tab, and revised game-achievement direction in `achievement-xp-level-design-v2.md`. Keep this file as the original catalogue reference until the final reward manifest is supplied.

This catalogue proposes **150 achievements**. It is a design document only: none are implemented yet. Every regular achievement grants tier XP only; cosmetic rewards are reserved for level-ups and Secret achievements.

## Guardrails used throughout

- “Run” means a scored, non-practice attempt that reaches the game’s normal completion/game-over boundary.
- Practice mode does not advance achievements, except a future explicitly labelled practice/tutorial achievement.
- Accuracy awards require the stated minimum sample and only count teacher-assigned/approved question banks. Repeating a recently mastered item should not inflate the qualifying sample.
- Session-to-session improvement compares two valid sessions in the same bank/difficulty, each with at least 10 questions. A rolling baseline prevents deliberate low-score farming.
- “Different games”, “all games”, and mastery requirements are calculated dynamically from enabled `GameConfig` entries.
- Multiplayer opponent milestones count distinct authenticated opponents and limit repeat credit from the same opponent per day. CPU achievements are tracked separately.
- Bronze, Silver, Gold, and Platinum achievements grant XP only. They never directly grant cosmetics or gameplay items.
- Only level-ups and Secret achievements can unlock cosmetics.
- Bronze = introductory, Silver = sustained progress, Gold = difficult, Platinum = exceptional mastery, Secret = hidden until unlocked.

## Getting Started (15)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| First Steps | First-Time | Start the first non-practice game | Bronze |
| Run Complete | First-Time | Finish the first valid run | Bronze |
| Curious Mind | First-Time | Answer the first educational question | Bronze |
| Bright Start | First-Time | Answer the first question correctly | Bronze |
| First Coin | First-Time | Earn the first shared coin | Bronze |
| First Investment | First-Time | Purchase the first permanent upgrade | Bronze |
| A New Look | First-Time | Unlock the first cosmetic | Bronze |
| First Target | First-Time | Defeat the first enemy in a supported game | Bronze |
| Bigger They Are | First-Time | Defeat the first boss in a supported game | Bronze |
| Ready Player Two | Multiplayer | Complete the first human multiplayer match | Bronze |
| First Victory | Multiplayer | Win the first human multiplayer match | Bronze |
| Machine Learner | Multiplayer | Complete the first match against a CPU | Bronze |
| Achievement Unlocked | Meta | Unlock any other achievement | Bronze |
| Perfect Start | Questions | Complete the first valid perfect question round with at least 5 questions | Bronze |
| Welcome Back | Dedication | Return on a different calendar day | Bronze |

## Brain Power — Questions and Accuracy (20)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Question Cadet | Questions | Answer 10 questions | Bronze |
| Question Scout | Questions | Answer 25 questions | Bronze |
| Brainiac I | Questions | Answer 50 questions | Bronze |
| Brainiac II | Questions | Answer 100 questions | Bronze |
| Brainiac III | Questions | Answer 250 questions | Silver |
| Brainiac IV | Questions | Answer 500 questions | Silver |
| Brainiac V | Questions | Answer 1,000 questions | Gold |
| Brainiac VI | Questions | Answer 2,500 questions | Gold |
| Brainiac VII | Questions | Answer 5,000 questions | Platinum |
| Brainiac VIII | Questions | Answer 10,000 questions | Platinum |
| Correct Course I | Questions | Give 100 correct answers | Bronze |
| Correct Course II | Questions | Give 1,000 correct answers | Gold |
| Hot Streak | Questions | Give 10 correct answers consecutively | Bronze |
| White Hot | Questions | Give 25 correct answers consecutively | Silver |
| Perfect Recall | Questions | Give 50 correct answers consecutively across valid rounds | Gold |
| Curriculum Explorer | Questions | Answer 25+ questions in 5 approved question banks | Gold |
| Question Polyglot | Questions | Complete 10+ questions in 4 registered question types | Silver |

## Perfect Recall — Accuracy (10)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Finding Your Feet | Accuracy | Maintain 60% accuracy over 25 qualifying questions | Bronze |
| Steady Aim | Accuracy | Maintain 70% accuracy over 50 qualifying questions | Bronze |
| Sharp Mind | Accuracy | Maintain 80% accuracy over 100 qualifying questions | Silver |
| Excellent Recall | Accuracy | Maintain 90% accuracy over 150 qualifying questions | Gold |
| Near Perfection | Accuracy | Maintain 95% accuracy over 250 qualifying questions | Platinum |
| Flawless Round | Accuracy | Achieve 100% in a valid round of at least 10 questions | Silver |
| Flawless Fifty | Accuracy | Achieve 100% across 50 qualifying questions in one bank | Gold |
| Consistent Scholar | Accuracy | Achieve 80%+ in 5 valid sessions | Silver |
| Bank Master | Accuracy | Reach 90% over 100 non-repeated qualifying questions in one bank | Gold |

## Never Give Up — Improvement (12)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Better Than Yesterday | Improvement | Beat the previous valid session’s accuracy | Bronze |
| Five Percent Stronger | Improvement | Improve a rolling bank accuracy baseline by 5 percentage points | Bronze |
| Ten Percent Stronger | Improvement | Improve a rolling bank accuracy baseline by 10 points | Silver |
| Breakthrough | Improvement | Improve a rolling bank accuracy baseline by 20 points over at least 50 questions | Gold |
| Personal Best | Improvement | Beat a previous non-zero high score | Bronze |
| Hat Trick of High Scores | Improvement | Set 3 new personal bests without resetting progress | Silver |
| Record Chaser | Improvement | Set 5 new personal bests across at least 3 sessions | Gold |
| Double Take | Improvement | Reach twice the first established personal best in one game | Gold |
| Learned From It | Improvement | Correctly answer a question previously answered incorrectly | Bronze |
| Error Hunter | Improvement | Correct 25 distinct previously missed questions | Silver |
| Weakness to Strength | Improvement | Raise a bank from below 60% to at least 80% over 50+ later questions | Gold |
| New Streak Record | Improvement | Beat the account’s previous best correct-answer streak 5 times | Gold |

## Arcade Veteran — Dedication and Economy (16)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Quarter Hour | Playtime | Accumulate 15 minutes across valid sessions | Bronze |
| Warming Up | Playtime | Accumulate 30 minutes | Bronze |
| One Hour Hero | Playtime | Accumulate 1 hour | Bronze |
| Arcade Apprentice | Playtime | Accumulate 2 hours | Silver |
| Arcade Regular | Playtime | Accumulate 5 hours across at least 5 sessions | Silver |
| Dedicated Learner | Playtime | Accumulate 10 hours across at least 10 sessions | Gold |
| Arcade Veteran | Playtime | Accumulate 25 hours across at least 25 sessions | Gold |
| Fifty-Hour Scholar | Playtime | Accumulate 50 hours across at least 40 sessions | Platinum |
| Century Player | Playtime | Accumulate 100 hours across at least 75 sessions | Platinum |
| Coin Collector I | Economy | Earn 100 lifetime coins | Bronze |
| Coin Collector II | Economy | Earn 500 lifetime coins | Bronze |
| Coin Collector III | Economy | Earn 1,000 lifetime coins | Silver |
| Coin Collector IV | Economy | Earn 5,000 lifetime coins | Silver |
| Coin Collector V | Economy | Earn 10,000 lifetime coins | Gold |
| Coin Collector VI | Economy | Earn 50,000 lifetime coins | Gold |
| Coin Collector VII | Economy | Earn 100,000 lifetime coins | Platinum |

## Explorer, Returning Player, and Collection (16)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Game Sampler | Exploration | Play 2 different enabled games | Bronze |
| Triple Feature | Exploration | Play 3 different enabled games | Bronze |
| Arcade Tourist | Exploration | Play 5 different enabled games | Silver |
| Grand Tour | Exploration | Play every currently enabled game | Gold |
| Solo Circuit | Exploration | Play every enabled single-player game | Silver |
| Party Circuit | Exploration | Play every enabled multiplayer game | Silver |
| Versatile Scholar | Exploration | Answer correctly in 5 different games | Gold |
| Score Safari | Exploration | Establish a non-zero high score in 5 different games | Gold |
| Three-Day Player | Returning | Play on 3 different days | Bronze |
| Five-Day Player | Returning | Play on 5 different days | Bronze |
| Ten-Day Scholar | Returning | Play on 10 different days | Silver |
| Dedicated Visitor | Returning | Play on 25 different days | Gold |
| Hundred-Day Academy | Returning | Play on 100 different days, not necessarily consecutive | Platinum |
| Wardrobe Starter | Collection | Own 5 cosmetics | Bronze |
| Style Collector | Collection | Own 25 cosmetics across at least 3 games | Gold |
| Academy Curator | Collection | Unlock at least one cosmetic from every enabled game | Platinum |

## Competitor — Multiplayer and CPU (14)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Matchmaker I | Multiplayer | Complete 5 human multiplayer matches | Bronze |
| Matchmaker II | Multiplayer | Complete 10 human multiplayer matches | Silver |
| Matchmaker III | Multiplayer | Complete 25 human multiplayer matches | Silver |
| Matchmaker IV | Multiplayer | Complete 50 human multiplayer matches | Gold |
| Matchmaker V | Multiplayer | Complete 100 human multiplayer matches across at least 10 days | Platinum |
| Winner’s Circle I | Multiplayer | Win 5 human multiplayer matches | Bronze |
| Winner’s Circle II | Multiplayer | Win 10 human multiplayer matches | Silver |
| Winner’s Circle III | Multiplayer | Win 25 human multiplayer matches | Gold |
| Winner’s Circle IV | Multiplayer | Win 50 human matches across at least 5 distinct opponents | Platinum |
| Friendly Rival | Multiplayer | Complete matches against 5 distinct authenticated opponents | Silver |
| Low CPU Cleared | Multiplayer | Defeat Low CPU | Bronze |
| Medium CPU Cleared | Multiplayer | Defeat Medium CPU | Silver |
| High CPU Cleared | Multiplayer | Defeat High CPU | Gold |
| Comeback Kid | Multiplayer | Win after trailing by the game-configured comeback margin | Gold |

## Multiplayer Brain Power and Leaderboards (10)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Smart Victory | Multiplayer Questions | Win a valid match with 70%+ accuracy over at least 10 questions | Bronze |
| Sharp Victory | Multiplayer Questions | Win with 80%+ accuracy over at least 10 questions | Silver |
| Brilliant Victory | Multiplayer Questions | Win with 90%+ accuracy over at least 10 questions | Gold |
| Perfect Victory | Multiplayer Questions | Win with 100% accuracy over at least 10 questions | Platinum |
| Rally and Win | Multiplayer Questions | Answer incorrectly, then give 5 consecutive correct answers and win | Silver |
| Scholar vs Machine | Multiplayer Questions | Defeat High CPU with 85%+ accuracy over at least 10 questions | Platinum |
| Class Top Ten | Leaderboard | Enter a class top 10 for any game with at least 10 ranked students | Silver |
| Class Podium | Leaderboard | Enter a class top 3 with at least 10 ranked students | Gold |
| Class Champion | Leaderboard | Hold class #1 after the ranking refresh with at least 10 ranked students | Gold |
| Multi-Game Champion | Leaderboard | Hold class #1 in 3 games, not necessarily simultaneously | Platinum |

## Combat, Runs, and Upgrades (14)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Enemy Hunter I | Combat | Defeat 10 enemies across supported games | Bronze |
| Enemy Hunter II | Combat | Defeat 100 enemies | Silver |
| Enemy Hunter III | Combat | Defeat 1,000 enemies | Gold |
| Enemy Hunter IV | Combat | Defeat 5,000 enemies | Platinum |
| Boss Hunter | Combat | Defeat 10 bosses | Silver |
| Untouchable Boss | Challenge | Defeat a boss without taking damage | Gold |
| Last Heart | Challenge | Survive a stage after reaching exactly 1 HP | Gold |
| Runner I | Runs | Complete 5 valid runs | Bronze |
| Runner II | Runs | Complete 25 valid runs | Silver |
| Runner III | Runs | Complete 100 valid runs across at least 20 sessions | Platinum |
| Clean Run | Challenge | Complete a supported run without taking damage | Gold |
| Bare Essentials | Challenge | Complete a supported run without buying an in-run upgrade | Gold |
| Upgrade Enthusiast | Upgrades | Purchase 50 permanent upgrades across games | Gold |
| Completionist Engineer | Upgrades | Fully complete one game’s permanent upgrade catalogue | Platinum |

## Current Game Mastery — Signature Achievements (10)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Cavern Crammer: Vault Seeker | Game Mastery | Discover every configured hidden vault type in Cavern Crammer | Gold |
| Fortress Facts: Unbroken Kingdom | Game Mastery | Complete a configured late wave with the king taking no damage | Gold |
| Jetpack Journey: Time Flyer | Game Mastery | Reach the game-configured mastery distance in one run | Gold |
| Note Knowledge: Perfect Performance | Game Mastery | Complete a configured advanced song/round with 100% question accuracy | Gold |
| Pinball Postulation: Multiball Mind | Game Mastery | Reach the configured bumper-combo tier while completing its question launches | Gold |
| Thinking Tanks: Calculated Shot | Game Mastery | Win with a configured long-range or banked shot and 80%+ question accuracy | Gold |
| Rocket Recall: Planetary Defender | Game Mastery | Defeat every configured boss type | Platinum |
| Shuriken Scholar: Shadow Master | Game Mastery | Reach the configured extreme wave using one weapon family | Platinum |
| Tic-Tac-Toe: Grand Strategist | Game Mastery | Win valid matches from each configured starting position and beat High CPU | Gold |
| Wild West Wordslinger: Quickest Mind | Game Mastery | Clear a configured late stage with 90%+ reload-question accuracy | Platinum |

## Mastery Progression and Meta (10)

| Achievement | Category | Requirement | Difficulty |
|---|---|---|---|
| Game Rookie | Mastery | Complete a game’s configured Rookie checklist | Bronze |
| Game Skilled | Mastery | Complete a game’s configured Skilled checklist | Silver |
| Game Expert | Mastery | Complete a game’s configured Expert checklist | Gold |
| Game Master | Mastery | Complete the game’s major non-secret achievement checklist | Platinum |
| Game Legend | Mastery | Complete the game’s configured extreme checklist | Platinum |
| Trophy Shelf I | Meta | Earn 10 achievements | Bronze |
| Trophy Shelf II | Meta | Earn 25 achievements | Silver |
| Trophy Shelf III | Meta | Earn 50 achievements | Gold |
| Trophy Shelf IV | Meta | Earn 100 achievements | Platinum |
| Arcade Legend | Meta | Earn Game Master status in every currently enabled game | Platinum |

## Secrets (8)

Before unlock, every entry appears as **??? — “Keep playing to discover this achievement.”** The reward name becomeis visible, but the description only becomes visible only after unlock.

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

Each approved entry should ultimately gain: stable `id`, `version`, `scope`, `familyId`, `familyRank`, `setId`, eligibility predicates, event/stat requirements, anti-farming policy, XP tier, progress visibility, and localisation keys. Only Secret entries may also contain direct reward IDs. Requirements involving multiple conditions should use an `all`/`any` condition tree rather than executable JavaScript in configuration.
