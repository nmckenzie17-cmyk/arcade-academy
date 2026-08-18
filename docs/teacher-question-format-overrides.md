# Teacher question-format overrides

Teachers can set a class default from **Class Question Format** and a student
override from **Student Settings**. The effective setting is resolved in this
order:

1. Student override, when it is not `mixed`.
2. Class setting, when it is not `mixed`.
3. Each game's normal configuration.

Supported stored values are `mixed`, `multichoice`, `matching`, `category`,
`type-answer`, `falling-words-basic`, `falling-words-definition`, and
`falling-words-category`. The Teacher Dashboard presents the final three as
subcategories of a single Falling Words question type.
Class settings are stored in `classSettings/{className}`. Student overrides are
stored as `questionFormatOverride` on the student's `users/{uid}` document.

The Hub hides games whose `questionType` or `supportedQuestionFormats` does not
contain the effective forced format. Host-choice multiplayer games are hidden
while a teacher override is active because their room setting can conflict
with the override.

Converted mixed-format games receive the policy through
`window.ArcadeQuestionPolicy`; `QuestionManager.loadCurrentBanks()` then loads
only the enforced bank. `mixed` removes the override and restores normal game
behaviour.

Deploy `firestore.rules` before using this feature. The rules allow signed-in
students to read class settings, teachers to write them, and prevent students
from changing their own teacher-assigned override.
