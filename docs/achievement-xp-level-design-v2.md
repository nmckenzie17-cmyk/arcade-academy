# Arcade Academy Achievements, XP and Player Levels — v2 Design

Status: **design approved in principle; not implemented yet**. The level-by-level and remaining Secret reward list is still to come, so implementation should wait for that reward manifest.

This document extends the proposed achievement catalogue in `achievement-catalogue-proposal.md`. Achievement IDs, not display numbers, will be the stable identifiers. The supplied list contains duplicate/missing display numbers, so numbers must not be saved in Firebase or referenced by code.

The level reward schedule, Hub Upgrades rules, Level 5–100 hub/theme ideas, and dynamic per-game reward pools are defined in `level-reward-roadmap.md`.

## 1. Achievement XP

Every regular achievement grants account-wide experience exactly once and grants nothing else directly.

| Tier | XP reward |
|---|---:|
| Bronze | 100 XP |
| Silver | 1,000 XP |
| Gold | 10,000 XP |
| Platinum | 50,000 XP |
| Secret | One immediate level plus its linked bonus cosmetic |

Secret achievements do not add a fixed XP amount. They advance the player exactly one level while preserving the XP already carried toward the next level. A Secret must never grant its level or reward twice.

**Reward boundary:** Bronze, Silver, Gold, and Platinum achievements award XP only. All regular-achievement cosmetic options from the v1 catalogue are removed. Cosmetics can be unlocked only by level-ups and Secret achievements.

Practice mode grants no achievements, XP, coins, score, cosmetic progress, or level rewards.

## 2. Level curve

The XP cost to advance from current level `L` to `L + 1` is:

```text
XPToNextLevel(L) = (6 / 5 × L³) − (15 × L²) + (100 × L)
```

Examples:

| Current level | XP to next level | Total ordinary XP from Level 1 |
|---:|---:|---:|
| 1 | 86.2 | 86.2 |
| 2 | 149.6 | 235.8 |
| 3 | 197.4 | 433.2 |
| 5 | 275.0 | 945.0 |
| 10 | 700.0 | 3,355.0 |
| 15 | 2,175.0 | 10,680.0 |
| 20 | 5,600.0 | 30,870.0 |

XP carries over. For example, earning 100 XP at Level 1 spends 86.2 XP on the level-up and leaves 13.8 XP toward Level 3.

To avoid floating-point errors, implementation should store **XP tenths as integers**:

```javascript
function xpTenthsToNextLevel(level) {
  return (12 * level ** 3) - (150 * level ** 2) + (1000 * level);
}
```

Accordingly, 100 XP is stored as `1000` XP-tenths. The UI divides by 10 for display.

There is no provisional level cap. The formula continues to apply beyond Level 20. A future cap can be introduced only with an explicit prestige/overflow policy so earned XP is never lost.

## 3. Level-up processing

Ordinary achievement XP is processed in a loop because a single Silver, Gold, or Platinum achievement can award several levels:

```text
add achievement XP to xpIntoLevel
while xpIntoLevel >= cost(currentLevel):
  subtract cost(currentLevel)
  increase currentLevel by 1
  grant that new level's rewards once
retain remaining xpIntoLevel
```

A Secret achievement performs:

```text
increase currentLevel by 1
leave xpIntoLevel unchanged
grant that new level's rewards once
grant the Secret's linked cosmetic/reward once
```

The level reward manifest is deliberately pending. It should support profile or game cosmetics, shared coins, cosmetic chests/currency, named game-specific unlocks, and very small single-player-only upgrades where explicitly approved.

Level rewards must never improve online multiplayer damage, health, question difficulty, matchmaking, or leaderboard scoring.

## 4. Hub presentation

The signed-in hub will show the player level **above the existing overall statistics bar** without redesigning that bar.

```text
LEVEL 12
642.4 / 1,113.6 XP
[███████████░░░░░░░░]
Next reward: [reward name]
```

The level panel includes current level, carried XP, next-level cost, a progress bar, the next reward preview once approved, and queued level-up animation. The existing overall statistics and status bar remain unchanged.

## 5. Achievement record and idempotency

Suggested account document fields:

```javascript
achievementSystem: {
  version: 1,
  level: 1,
  xpTenthsIntoLevel: 0,
  lifetimeXpTenthsAwarded: 0,
  unlockedCount: 0,
  unlocked: {
    first_steps: {
      unlockedAt: 1730000000000,
      tier: "bronze",
      xpTenthsAwarded: 1000
    }
  },
  grantedLevelRewards: {
    "2": { grantedAt: 1730000000000, rewardIds: ["level_2_reward"] }
  }
},
cosmetics: {
  unlocked: {
    level_2_badge: { unlockedAt: 1730000000000, source: "level:2" }
  },
  equipped: { profileBadge: "level_2_badge" }
}
```

An unlock operation must atomically check the stable achievement ID, add its unlock record, apply XP or the Secret level, process every crossed level, grant crossed-level rewards, and commit the result. Only Secret achievements add a direct reward during this transaction. This prevents duplicate XP after reloads, retries, offline synchronization, or two open devices.

## 6. Firebase and Spark-plan constraints

The canonical achievement/level state belongs in the signed-in student's existing Firebase user data so it follows them across devices. A local cache can support offline display and queue candidate unlock events.

On the Spark plan there is no trusted Cloud Functions verification layer. Firestore transactions and Security Rules can protect ownership and document shape, but Rules cannot reliably prove complex gameplay events such as a no-damage boss victory. Therefore ordinary participation/progress achievements may synchronize from the client, duplicate grants must be prevented transactionally, ranked achievements remain disabled with leaderboards, and online multiplayer advantages are never valid rewards.

## 7. Cross-game cosmetic system

Jetpack Journey's existing cosmetic presentation becomes the visual interaction model, not a separate coin shop.

- Each game registers cosmetic definitions and preview assets/sprites.
- Its **Cosmetics** tab is hidden until the account owns at least one cosmetic usable in that game.
- Owned cosmetics show a visual preview, name, source, and Equip button.
- Level and Secret cosmetics are not purchasable with shared coins.
- A cosmetic can target one game, several compatible games, or the global hub/profile.
- Cosmetics never alter hitboxes, educational content, damage, health, timing, or score calculation.

Jetpack Journey migration:

- Hide its current cosmetic purchase controls.
- Preserve already-owned cosmetics; do not remove existing student items.
- Convert definitions to level/Secret unlock sources when the final mapping arrives.
- Keep the tab hidden for accounts with no owned Jetpack cosmetic.

For other games, add the tab only after shared cosmetic ownership/equip APIs exist. Do not copy separate persistence logic into ten games.

## 8. Revised and additional catalogue entries

These entries amend the v1 proposal. As regular achievements, they grant tier XP only.

| Stable ID | Achievement | Requirement | Tier/XP |
|---|---|---|---|
| `cavern_blooded_feet` | Cavern Crammer: Blooded Feet | Defeat 20 enemies | Silver / 1,000 XP |
| `fortress_wave_10_untouched` | Fortress Facts: Untouched Ramparts | Reach wave 10 without taking damage | Silver / 1,000 XP |
| `jetpack_all_stages` | Jetpack Journey: Era Tourist | Travel through every stage in one valid run | Platinum / 50,000 XP |
| `note_all_songs` | Note Knowledge: Song Connoisseur | Play every enabled song | Platinum / 50,000 XP |
| `pinball_double_ball_20` | Pinball Postulation: Seeing Double | Trigger the double-ball effect 20 times | Silver / 1,000 XP |
| `tanks_damageless_cpu` | Thinking Tanks: Damageless | Defeat the computer without taking damage | Platinum / 50,000 XP |
| `rocket_all_bosses` | Rocket Recall: Planetary Defender | Defeat every boss type | Silver / 1,000 XP |
| `rocket_god_pilot` | Rocket Recall: God Pilot | Defeat every boss type in one run without taking damage | Platinum / 50,000 XP |
| `shuriken_all_bosses` | Shuriken Scholar: Blooded Blades | Defeat every boss type | Platinum / 50,000 XP |
| `wild_west_enemy_50` | Wild West Wordslinger: Bloody Bullets | Defeat 50 enemies | Bronze / 100 XP |

Existing amended signature requirements:

- `shuriken_shadow_master`: reach wave 15 while upgrading only one weapon family.
- `wild_west_quickest_mind`: defeat two bosses with at least 90% qualifying question accuracy.
- `rocket_planetary_defender`: Silver, not Platinum.

## 9. Secret achievement additions and reward safety

| Stable ID | Hidden requirement | Tier behaviour | Reward direction |
|---|---|---|---|
| `secret_by_a_thread` | Win/survive at exactly 1 HP | Immediate level | Skeleton player cosmetic in compatible character-based games |
| `secret_two_at_once` | Defeat two enemies almost simultaneously | Immediate level | Double-shot starting modifier in approved single-player modes, plus twin-shot cosmetic |
| `secret_death_defying` | Survive 10 waves/levels below 25% health in one run | Immediate level | Cracked-heart aura / Death Defying title / Tattered cape/rocket/flame effect |
| `secret_rainbow_madness` | Complete and survive Jetpack Journey's Rainbow Madness stage | Immediate level | Rainbow jetpack / Spectrum fuel trail / rainbow effect on projectiles (shurikens in shuriken scholar, bullets in rocket recall, enemy death in wild west wordslinger, ball in pinball, Arrows in fortress facts, note dissappearance in note knowledge etc) |
| `secret_quiz_master` | Correctly complete every eligible question in 4 distinct banks | Immediate level | Arcane scholar outfit / Four-book orbit / Quiz Master title | Gives Scholar theme for all games

`secret_two_at_once` is an explicit exception to the cosmetic-first policy. Its modifier applies only to single-player Rocket Recall, Shuriken Scholar, and Fortress Facts; never affects multiplayer or leaderboard eligibility; is visibly identified as a Secret reward; and is excluded from unmodified-run challenges unless explicitly permitted.

The other supplied Secret concepts remain in the v1 catalogue with rewards pending: Wrong Way, Right Place; Strange Synergy; One in a Thousand; Hidden Challenger; Cabinet Tap; and Against All Advice.

## 10. Decisions still required before implementation

1. The reward for every player level, or a repeating reward rule after a chosen level.
2. Final cosmetic/reward IDs for each Secret achievement.
3. Whether level-up coin rewards count toward lifetime coins earned (recommended: **no**, avoiding achievement feedback loops).
4. Whether gameplay-changing Secret rewards make runs leaderboard-ineligible (recommended: **yes**).
5. Whether existing Jetpack cosmetics remain grandfathered for current owners (recommended: **yes**).
6. Exact definitions for “significantly trailing”, “difficult shot”, “hidden area”, and “unusual combination”.
7. Whether Level 1 is the starting displayed level (recommended: **yes**).
