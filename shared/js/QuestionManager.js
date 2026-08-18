// ─────────────────────────────────────────────────────────────────────────
// QuestionManager
// Owns everything related to question banks: resolving teacher codes,
// loading/storing question data, and selecting/weighting which question
// comes up next. Games only ever call getNextQuestion() and recordAnswer()
// (plus a small number of other selection helpers below) — they never need
// to know where question files live, how teacher codes resolve to a bank,
// or how selection/weighting/shuffling works internally.
//
// Three bank shapes are supported today, chosen by the `questionType`
// passed in to loadBank()/loadBankFromCode():
//   'multichoice' — a plain array of { q, o, a } objects (question text,
//                    options, correct-option index). Normalised to
//                    { q, a, c, weight }, where `a` is the options array
//                    and `c` is the correct index (renamed from o/a to
//                    avoid colliding with the `a` key used elsewhere).
//   'category'    — either a bare array of { prompt, correct, distractors }
//                    objects, or the same list wrapped as
//                    { subject, categories: [...] }. Normalised to
//                    { prompt, correct, distractors, weight }.
//   'matching'    — a single object { name, cards: [{ term, definition }] }.
//                    Normalised to a flat array of { term, definition, weight }.
// ─────────────────────────────────────────────────────────────────────────
const QuestionManager = {

    // Where question-bank JSON files live, and the registry that maps a
    // teacher/subject code (e.g. "93bf") to a {subject, bank} pair.
    ROOT: "../../question-banks",
    REGISTRY: "../../question-banks/banks.json",

    // Currently loaded bank state. `questions` holds normalised records —
    // their exact shape depends on the bank type loaded (see file header),
    // but every record carries a `weight` field, which is what drives the
    // spaced-repetition-style selection in getNextQuestion() below.
    // `bankName`/`bankCode` remember the active teacher code so games can
    // display/restore it without knowing anything about how it was resolved.
    questions: null,
    bankName: '',
    bankCode: '',
    questionType: '',
    banks: {},
    bankNames: {},
    runQuestionType: '',

    // Resolves a teacher code against the shared registry, then fetches the
    // requested question-type file (e.g. "multichoice.json") from the
    // subject/bank folder named in that registry entry.
    // Returns { data } on success, where `data` is whatever that file's raw
    // parsed JSON was (its shape depends on questionType — see file header),
    // or { error } on failure, where error is one of:
    //   'code-not-found' — the code isn't in the registry
    //   'fetch-failed'   — registry or question file couldn't be loaded
    async loadBankFromCode(code, questionType) {
        try {
            const registryResponse = await fetch(this.REGISTRY, { cache: 'no-store' });
            if (!registryResponse.ok) return { error: 'fetch-failed' };

            const registry = await registryResponse.json();
            const bankDetails = registry[code];
            if (!bankDetails || !bankDetails.subject || !bankDetails.bank) return { error: 'code-not-found' };

            const questionFile =
                `${this.ROOT}/${bankDetails.subject}/${bankDetails.bank}/${questionType}.json`;

            const questionsResponse = await fetch(questionFile, { cache: 'no-store' });
            if (!questionsResponse.ok) return { error: 'fetch-failed' };

            const loadedData = await questionsResponse.json();
            if (loadedData === null || loadedData === undefined) return { error: 'fetch-failed' };

            return { data: loadedData };

        } catch (error) {
            console.error("Unable to load question bank:", error);
            return { error: 'fetch-failed' };
        }
    },

    // Loads a question bank by teacher/subject code, e.g. "93bf" -> Year 9
    // Biology, and stores it as the active bank. A valid code is REQUIRED —
    // there is no general-knowledge fallback, so an empty or unrecognised
    // code always fails and nothing is loaded.
    // `questionType` selects both which file is requested (see
    // loadBankFromCode) and how the raw JSON is validated/normalised — see
    // the file header for the three supported shapes.
    async loadBank(code, questionType) {
        code = (code || '').trim().toLowerCase();
        if (!code) return { ok: false, error: 'code-required' };

        const loaded = await this.loadBankFromCode(code, questionType);
        if (!loaded.data) return { ok: false, error: loaded.error };

        const raw = loaded.data;
        this.questionType = questionType || 'multichoice';

        if (questionType === 'category') {
            // Bare array of { prompt, correct, distractors }, or wrapped as
            // { subject, categories: [...] }.
            const list = Array.isArray(raw) ? raw : raw.categories;
            const valid = Array.isArray(list) && list.length > 0 && list.every(c =>
                c && typeof c.prompt === 'string' &&
                Array.isArray(c.correct) && Array.isArray(c.distractors) &&
                c.correct.length > 0
            );
            if (!valid) return { ok: false, error: 'fetch-failed' };

            this.questions = list.map(item => ({
                prompt: item.prompt, correct: item.correct, distractors: item.distractors, weight: 1
            }));
            this.bankName = (!Array.isArray(raw) && raw.subject) ? raw.subject : ('Bank ' + code);
            this.bankCode = code;
            return { ok: true, name: this.bankName };
        }

        if (questionType === 'matching') {
            // A single object: { name, cards: [{ term, definition }, ...] }.
            const valid = raw && typeof raw.name === 'string' && Array.isArray(raw.cards) &&
                raw.cards.length >= 4 &&
                raw.cards.every(c => typeof c.term === 'string' && typeof c.definition === 'string' && c.term && c.definition);
            if (!valid) return { ok: false, error: 'fetch-failed' };

            this.questions = raw.cards.map(c => ({ term: c.term, definition: c.definition, weight: 1 }));
            this.bankName = raw.name;
            this.bankCode = code;
            return { ok: true, name: this.bankName };
        }

        // Default: 'multichoice' — a plain top-level array of { q, o, a }.
        if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'fetch-failed' };
        this.questions = raw.map(item => ({ q: item.q, a: item.o, c: item.a, weight: 1 }));
        this.bankName = code.toUpperCase();
        this.bankCode = code;
        return { ok: true, name: this.bankName };
    },

    // Loads the class selected in the Hub. Games must use this instead of
    // accepting or persisting their own class-code input.
    async loadCurrentBank(questionType) {
        if (!window.PlatformManager || !PlatformManager.hasClassCode()) {
            return { ok: false, error: 'class-code-required' };
        }
        return this.loadBank(PlatformManager.getClassCode(), questionType);
    },

    // Mixed-format games load every compatible file once. Missing format
    // files are skipped, so a run is only randomised across banks that the
    // current class actually has.
    async loadCurrentBanks(questionTypes) {
        if (!window.PlatformManager || !PlatformManager.hasClassCode()) {
            return { ok: false, error: 'class-code-required', available: [] };
        }
        const code = PlatformManager.getClassCode();
        const enforced = window.ArcadeQuestionPolicy?.format;
        const requested = questionTypes?.length ? questionTypes : ['multichoice', 'matching', 'category'];
        const types = enforced && enforced !== 'mixed' && requested.includes(enforced) ? [enforced] : requested;
        const banks = {}, names = {};
        for (const type of types) {
            const result = await this.loadBank(code, type);
            if (result.ok) { banks[type] = this.questions.slice(); names[type] = this.bankName; }
        }
        this.banks = banks; this.bankNames = names;
        const available = Object.keys(banks);
        if (!available.length) return { ok: false, error: 'no-compatible-banks', available };
        const configured = window.GAME_CONFIG?.questionType;
        this.useBank(banks[configured] ? configured : available[0]);
        return { ok: true, available, names };
    },

    getAvailableQuestionTypes() { return Object.keys(this.banks).filter(type => this.banks[type]?.length); },
    useBank(type) {
        if (!this.banks[type]?.length) return false;
        this.questions = this.banks[type]; this.questionType = type;
        this.bankName = this.bankNames[type] || this.bankName;
        return true;
    },
    beginMixedRun(rngFn) {
        const types = this.getAvailableQuestionTypes();
        if (!types.length) return null;
        this.runQuestionType = types[Math.floor((rngFn || Math.random)() * types.length)];
        return this.runQuestionType;
    },
    getRunQuestionType() { return this.runQuestionType || this.questionType; },

    // The active bank's display name (uppercased teacher code for
    // multichoice banks, or the bank/subject's own name for category and
    // matching banks) and the raw code itself, e.g. for restoring the input
    // field on restart.
    getBankName() {
        return this.bankName;
    },
    getBankCode() {
        return this.bankCode;
    },
    // Whether a bank is currently loaded and has at least one question/card.
    hasQuestions() {
        return !!(this.questions && this.questions.length > 0);
    },

    // Picks a question weighted by q.weight — questions answered wrong
    // recently are proportionally more likely to come up again, questions
    // answered right recently are proportionally less likely, so practice
    // naturally concentrates on whatever a student is actually struggling
    // with.
    // preferEasy (optional): pulls from the easiest ~30% of the bank
    // (lowest weight = most reliably answered correctly recently) instead
    // of the full weighted pool.
    // exclude (optional): an array of question objects (previously returned
    // by this method) to leave out of the pool — used to avoid repeats
    // within a single quiz session. If excluding everything would empty the
    // pool, the exclusion is ignored for that pick (matching the common
    // "reset once you've seen them all" pattern used across the games).
    getNextQuestion(preferEasy, exclude) {
        if (!this.questions || this.questions.length === 0) return null;

        let pool = this.questions;
        if (exclude && exclude.length) {
            const filtered = pool.filter(q => !exclude.includes(q));
            if (filtered.length > 0) pool = filtered;
        }

        if (preferEasy) {
            let sorted = [...pool].sort((a, b) => (a.weight ?? 1) - (b.weight ?? 1));
            let easyPool = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.3)));
            return easyPool[Math.floor(Math.random() * easyPool.length)];
        }

        let totalWeight = pool.reduce((sum, q) => sum + (q.weight ?? 1), 0);
        let r = Math.random() * totalWeight;
        for (let q of pool) {
            r -= (q.weight ?? 1);
            if (r <= 0) return q;
        }
        return pool[pool.length - 1]; // floating-point fallback, practically never hit
    },

    // Picks a question/card uniformly at random, ignoring weight entirely —
    // for bonus/one-off prompts that shouldn't skew towards whatever the
    // student's been struggling with. Accepts an optional rngFn (defaults
    // to Math.random) so games with their own seeded RNG can stay
    // deterministic.
    getRandomQuestion(rngFn) {
        if (!this.questions || this.questions.length === 0) return null;
        const random = rngFn || Math.random;
        return this.questions[Math.floor(random() * this.questions.length)];
    },

    // Returns up to `count` distinct questions/cards in random order
    // (Fisher-Yates shuffle, no repeats), for games that need a batch of
    // items at once (e.g. a memory-match round) rather than one at a time.
    // sourceArray (optional) shuffles a caller-supplied subset instead of
    // the full bank — used internally by getDistractors() below.
    // rngFn (optional) again defaults to Math.random.
    getRandomSet(count, rngFn, sourceArray) {
        const source = sourceArray || this.questions;
        if (!source || source.length === 0) return [];
        const random = rngFn || Math.random;
        const copy = source.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, Math.min(count, copy.length));
    },

    // Picks up to `count` other questions/cards (never the one passed in as
    // `exclude`), for building multiple-choice options out of a
    // term/definition-style bank (the "correct" card plus a few random
    // wrong ones).
    getDistractors(exclude, count, rngFn) {
        if (!this.questions) return [];
        const others = this.questions.filter(q => q !== exclude);
        return this.getRandomSet(count, rngFn, others);
    },

    // Every question starts at weight 1. A correct answer halves it (floor
    // 0.1 by default — it can still come up, just rarely). A wrong answer
    // doubles it (cap 16 by default — it comes up often, but never so often
    // it crowds out everything else). Games call this after every answered
    // question. `opts` (optional) lets a game override the floor/cap for
    // its own difficulty curve, e.g. { cap: 8 }; the multiplier (halve/
    // double) is always the same.
    recordAnswer(q, wasCorrect, opts) {
        if (!q) return;
        const floor = (opts && typeof opts.floor === 'number') ? opts.floor : 0.1;
        const cap = (opts && typeof opts.cap === 'number') ? opts.cap : 16;
        let w = q.weight ?? 1;
        q.weight = wasCorrect ? Math.max(floor, w * 0.5) : Math.min(cap, w * 2);
        if (!wasCorrect && window.MistakeRematchManager) {
            window.MistakeRematchManager.recordWrong(q, {
                bankCode: this.bankCode,
                bankName: this.bankName,
                questionType: this.questionType,
                candidates: this.questions
            });
        }
    },

    // For games that persist adaptive weighting across sessions (rather
    // than letting it reset to 1 every time a bank is loaded): snapshots
    // the current weights keyed by each question's `keyField` (defaults to
    // 'q', the multichoice question text), and restores a previously-saved
    // snapshot back onto the freshly-loaded bank. Questions not present in
    // a restored snapshot simply keep their default weight of 1.
    getWeightsSnapshot(keyField) {
        const field = keyField || 'q';
        const map = {};
        (this.questions || []).forEach(item => { map[item[field]] = item.weight; });
        return map;
    },
    restoreWeights(weightMap, keyField) {
        if (!weightMap || !this.questions) return;
        const field = keyField || 'q';
        this.questions.forEach(item => {
            if (typeof weightMap[item[field]] === 'number') item.weight = weightMap[item[field]];
        });
    }
};

// Classic scripts can reference the top-level `QuestionManager` binding, but
// reusable managers deliberately access shared services through `window`.
// Export the same singleton there so both styles resolve to one bank state.
if (typeof window !== 'undefined') window.QuestionManager = QuestionManager;
