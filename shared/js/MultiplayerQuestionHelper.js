(function (global) {
  'use strict';

  let loadedKey = null;
  let questionType = null;

  async function load(settings) {
    if (!global.QuestionManager || typeof global.QuestionManager.loadBank !== 'function') {
      return { ok: false, error: 'QUESTION_MANAGER_UNAVAILABLE' };
    }
    const type = settings?.questionType;
    const classCode = settings?.classCode;
    if (!['matching', 'multichoice', 'category'].includes(type) || !classCode) {
      return { ok: false, error: 'QUESTION_SETTINGS_MISSING' };
    }
    const key = `${classCode}:${type}`;
    if (loadedKey === key && global.QuestionManager?.hasQuestions()) return { ok: true };
    const result = await global.QuestionManager.loadBank(classCode, type);
    if (result.ok) { loadedKey = key; questionType = type; }
    return result;
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function next() {
    const source = global.QuestionManager.getNextQuestion();
    if (!source) return null;
    let prompt;
    let answers;

    if (questionType === 'matching') {
      prompt = `Which definition matches “${source.term}”?`;
      answers = [{ text: source.definition, correct: true }].concat(
        global.QuestionManager.getDistractors(source, 3).map(item => ({ text: item.definition, correct: false }))
      );
    } else if (questionType === 'category') {
      prompt = source.prompt;
      const correct = source.correct[Math.floor(Math.random() * source.correct.length)];
      answers = [{ text: correct, correct: true }].concat(
        shuffle(source.distractors).slice(0, 3).map(text => ({ text, correct: false }))
      );
    } else {
      prompt = source.q;
      answers = source.a.map((text, index) => ({ text, correct: index === source.c }));
    }
    return { source, prompt, answers: shuffle(answers) };
  }

  function record(question, correct) {
    if (question?.source) global.QuestionManager.recordAnswer(question.source, correct);
  }

  global.MultiplayerQuestionHelper = { load, next, record };
})(window);
