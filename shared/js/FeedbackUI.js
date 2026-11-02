(function (global) {
  'use strict';
  function open(gameId, gameName) {
    let dialog = document.getElementById('arcade-feedback-dialog');
    if (!dialog) {
      dialog = document.createElement('section');
      dialog.id = 'arcade-feedback-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'arcade-feedback-title');
      dialog.style.cssText = 'position:fixed;z-index:12000;inset:0;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.82);font:16px system-ui,sans-serif;color:#fff';
      dialog.innerHTML = '<div style="width:min(520px,100%);padding:24px;background:#101b3c;border:2px solid #00d4ff;border-radius:14px;box-shadow:0 0 30px #00d4ff55"><button type="button" data-close style="float:right">Close</button><h2 id="arcade-feedback-title">Share feedback</h2><p data-context></p><label for="arcade-feedback-message">What would you like us to know?</label><textarea id="arcade-feedback-message" maxlength="2000" rows="6" style="display:block;width:100%;box-sizing:border-box;margin:8px 0 12px;padding:10px"></textarea><button type="button" data-submit>Send feedback</button><p data-status role="status" aria-live="polite"></p></div>';
      document.body.appendChild(dialog);
      dialog.querySelector('[data-close]').onclick = () => { dialog.hidden = true; };
    }
    dialog.hidden = false;
    dialog.querySelector('[data-context]').textContent = gameId ? `Feedback about ${gameName || gameId}` : 'General feedback about Arcade Academy';
    dialog.querySelector('#arcade-feedback-message').value = '';
    dialog.querySelector('[data-status]').textContent = '';
    const submit = dialog.querySelector('[data-submit]');
    submit.onclick = async () => {
      const text = dialog.querySelector('#arcade-feedback-message').value.trim();
      const status = dialog.querySelector('[data-status]');
      if (text.length < 3) { status.textContent = 'Please enter at least 3 characters.'; return; }
      submit.disabled = true;
      status.textContent = 'Sending…';
      try {
        const ok = await global.FirebaseManager?.submitStudentFeedback?.({ message: text, gameId, gameName });
        status.textContent = ok ? 'Thanks! Your feedback has been sent.' : 'Could not send feedback. Please check you are signed in and try again.';
        if (ok) dialog.querySelector('#arcade-feedback-message').value = '';
      } catch (_) { status.textContent = 'Could not send feedback. Please try again.'; }
      submit.disabled = false;
    };
  }
  function addButton(parent, id, gameId, gameName) {
    if (!parent || document.getElementById(id)) return;
    const button = document.createElement('button');
    button.id = id; button.type = 'button'; button.textContent = '💬 Feedback';
    button.style.cssText = 'display:block;width:100%;margin:10px 0 0;padding:11px 12px;color:#fff;background:#18274d;border:2px solid #00d4ff;border-radius:8px;font:700 13px system-ui,sans-serif;cursor:pointer';
    button.onclick = () => open(gameId, gameName);
    parent.insertAdjacentElement('afterend', button);
  }
  function attachHubButton() {
    const anchor = document.querySelector('.player-bar-actions');
    if (anchor && !document.getElementById('hub-feedback-button')) {
      const button = document.createElement('button');
      button.id = 'hub-feedback-button'; button.type = 'button'; button.className = 'class-btn class-btn-secondary'; button.textContent = '💬 Feedback';
      button.onclick = () => open(null, null); anchor.insertBefore(button, anchor.firstChild);
    }
  }
  function attachGameButton() {
    const gameId = global.GAME_CONFIG?.id;
    if (!gameId) return;
    const gameName = global.GAME_CONFIG?.title || gameId;
    const attach = () => {
      const challenge = document.getElementById('arcade-challenge-open');
      const existing = document.getElementById('arcade-feedback-button');
      if (challenge) {
        if (existing) { if (existing.previousElementSibling !== challenge) challenge.insertAdjacentElement('afterend', existing); }
        else addButton(challenge, 'arcade-feedback-button', gameId, gameName);
      }
      else {
        const start = document.querySelector(global.GAME_CONFIG?.startSelector);
        const anchor = document.getElementById('arcade-practice-button') || start;
        if (anchor && existing && existing.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', existing);
        else if (anchor) addButton(anchor, 'arcade-feedback-button', gameId, gameName);
      }
    };
    attach(); new MutationObserver(attach).observe(document.body, { childList:true, subtree:true });
  }
  global.FeedbackUI = { open, attachHubButton, attachGameButton };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachHubButton);
  else attachHubButton();
})(window);
