# Mixed question runs

Eligible games load the class's `multichoice`, `matching`, and `category`
banks through `QuestionManager.loadCurrentBanks()`. At the start of a run,
`QuestionManager.beginMixedRun()` chooses one of the banks that actually
exists. That format remains fixed for the run.

## Shared scoring

The shared rules live in `shared/js/MixedQuestionRound.js` in `POLICY`.

- Multiple choice asks four questions. Each correct answer is one reward unit.
- Matching presents four definitions that are dragged onto four terms. Only a
  correct first attempt earns that pair's reward unit.
- Category presents a 16-word grid containing four correct words. The first
  four selections are scored, one reward unit for each correct word.
- Every round returns `correct` from 0–4 and `rewardRatio` from 0–1.

Change question counts and grid size in `MixedQuestionRound.POLICY`. Change
the value of a reward unit in the individual game's integration point.

## Game reward mappings

- Angler Answerer: one bait per correct item, capped by bait capacity.
- Cavern Crammer: one boon option per correct item; death recovery counts the
  same first-attempt successes.
- Cube Curiosity: one upgrade option per correct item.
- Fortress Facts: one card/army option per correct item between waves; ammo
  questions apply the existing ammo amount once per correct item.
- Jetpack Journey: converts incorrect items into the existing matching-miss
  tier used for fuel and magnet strength; Headstart still requires 4/4.
- KO Klarity: one upgrade option per correct item.
- Rocket Recall: one reward option per correct item. Its existing first-round
  guaranteed starter remains intact.
- Rumbux Revision: one upgrade option per correct item.
- Shuriken Scholar: one power-up option per correct item.
- Wild West Wordslinger: category now requires four correct words. Other
  formats scale starting/reload rewards from the 0–4 result.

## Intentionally unchanged

- Note Knowledge: category selection is its core rhythm mechanic.
- Tic-Tac-Toe, Thinking Tanks, Dot-n-Box Deducer: retain synchronized
  host-selected multiplayer questions.
- Pool Practice: question type is synchronized in its multiplayer room and is
  coupled to Earn Your Shot / Bonus Pool.
- Pinball Postulation: retains its explicitly specified per-launch mixed
  question and ball reward rather than replacing one launch with a four-unit
  reward gate.
