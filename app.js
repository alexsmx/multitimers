// ==================== State ====================
let timers = [];
let templates = [];
let logs = [];
let audioCtx = null;
let idleInterval = null;
let saveTimeout = null;
const SAVE_THROTTLE = 2000;

// ==================== Toast Notifications ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== Audio Context ====================
async function ensureAudioCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.error('Web Audio API not supported');
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  return audioCtx;
}

// Pre-initialize AudioContext on first user interaction
document.addEventListener('click', () => ensureAudioCtx(), { once: true });
document.addEventListener('keydown', () => ensureAudioCtx(), { once: true });

// ==================== Sound Generation ====================
async function playSound(type) {
  const ctx = await ensureAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;

  const sounds = {
    beep() {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.setValueAtTime(600, t + 0.1);
      osc.frequency.setValueAtTime(800, t + 0.2);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    },
    chime() {
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.2, t + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.2 + 0.5);
        osc.start(t + i * 0.2);
        osc.stop(t + i * 0.2 + 0.5);
      });
    },
    bell() {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1000;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
      osc.start(t);
      osc.stop(t + 1.5);
    },
    alarm() {
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 440, t + i * 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.3, t + i * 0.4);
        gain.gain.setValueAtTime(0, t + i * 0.4 + 0.3);
        osc.start(t + i * 0.4);
        osc.stop(t + i * 0.4 + 0.3);
      }
    },
    gentle() {
      [440, 554.37, 659.25, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const start = t + i * 0.3;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.8);
        osc.start(start);
        osc.stop(start + 0.8);
      });
    },
    digital() {
      [1200, 1100, 1000, 900].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const start = t + i * 0.1;
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.setValueAtTime(0, start + 0.08);
        osc.start(start);
        osc.stop(start + 0.08);
      });
    }
  };

  if (sounds[type]) sounds[type]();
}

async function playIdleSound() {
  const ctx = await ensureAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 440;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.08, t + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 1);
  osc.start(t);
  osc.stop(t + 1);
}

// ==================== Time Formatting ====================
function formatTime(totalSec) {
  const s = Math.max(0, Math.ceil(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatFinishTime(date) {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function formatLogDate(date) {
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

// ==================== Timer Class ====================
class Timer {
  constructor(opts) {
    this.id = opts.id || Date.now();
    this.name = opts.name || 'Timer';
    this.totalSeconds = opts.totalSeconds;
    this.remainingSeconds = opts.remainingSeconds ?? opts.totalSeconds;
    this.isRunning = opts.isRunning || false;
    this.targetEndTime = opts.targetEndTime || null;
    this.actualFinishTime = opts.actualFinishTime || null;
    this.isPomodoro = opts.isPomodoro || false;
    this.pomodoroPhase = opts.pomodoroPhase || 'work';
    this.pomodoroCycle = opts.pomodoroCycle || 0;
    this.pomodoroWorkTime = opts.pomodoroWorkTime || 0;
    this.pomodoroBreakTime = opts.pomodoroBreakTime || 0;
    this.sound = opts.sound || 'beep';
    this.interval = null;
  }

  start() {
    if (this.remainingSeconds <= 0) return;
    this.isRunning = true;
    this.targetEndTime = Date.now() + this.remainingSeconds * 1000;
    this.actualFinishTime = null;
    this.startInterval();
    saveTimersImmediate();
    stopIdleReminders();
  }

  pause() {
    this.isRunning = false;
    this.remainingSeconds = Math.max(0, (this.targetEndTime - Date.now()) / 1000);
    this.targetEndTime = null;
    clearInterval(this.interval);
    this.interval = null;
    saveTimersImmediate();
    checkIdleState();
  }

  reset() {
    clearInterval(this.interval);
    this.interval = null;
    this.isRunning = false;
    this.targetEndTime = null;
    this.actualFinishTime = null;
    if (this.isPomodoro) {
      this.remainingSeconds = this.pomodoroWorkTime;
      this.totalSeconds = this.pomodoroWorkTime;
      this.pomodoroPhase = 'work';
      this.pomodoroCycle = 0;
    } else {
      this.remainingSeconds = this.totalSeconds;
    }
    saveTimersImmediate();
    renderTimers();
    checkIdleState();
  }

  complete() {
    clearInterval(this.interval);
    this.interval = null;
    this.isRunning = false;
    this.remainingSeconds = 0;
    this.actualFinishTime = this.actualFinishTime || Date.now();
    this.targetEndTime = null;

    playSound(this.sound);
    sendNotification('Timer Complete!', `${this.name} has finished!`);

    if (this.isPomodoro) {
      this.handlePomodoroTransition();
    } else {
      saveTimersImmediate();
      renderTimers();
      checkIdleState();
    }
  }

  handlePomodoroTransition() {
    if (this.pomodoroPhase === 'work') {
      this.pomodoroPhase = 'break';
      this.totalSeconds = this.pomodoroBreakTime;
      this.remainingSeconds = this.pomodoroBreakTime;
      sendNotification(`${this.name} - Time for a break!`, '');
      setTimeout(() => {
        this.start();
        renderTimers();
      }, 1000);
    } else {
      this.pomodoroCycle++;
      this.pomodoroPhase = 'work';
      this.totalSeconds = this.pomodoroWorkTime;
      this.remainingSeconds = this.pomodoroWorkTime;
      sendNotification(`${this.name} - Back to work! (Cycle ${this.pomodoroCycle})`, '');
      setTimeout(() => {
        this.start();
        renderTimers();
      }, 1000);
    }
    this.actualFinishTime = null;
    saveTimersImmediate();
    renderTimers();
  }

  startInterval() {
    clearInterval(this.interval);
    this.interval = setInterval(() => {
      if (!this.isRunning || !this.targetEndTime) return;
      const remaining = (this.targetEndTime - Date.now()) / 1000;
      this.remainingSeconds = Math.max(0, remaining);
      if (this.remainingSeconds <= 0) {
        this.complete();
        return;
      }
      updateTimerDisplay(this);
      throttleSave();
    }, 100);
  }

  getProgress() {
    if (this.totalSeconds === 0) return 100;
    return ((this.totalSeconds - this.remainingSeconds) / this.totalSeconds) * 100;
  }

  getState() {
    if (this.remainingSeconds <= 0 && this.actualFinishTime) return 'completed';
    if (this.isRunning) return 'running';
    return 'paused';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      totalSeconds: this.totalSeconds,
      remainingSeconds: this.remainingSeconds,
      isRunning: this.isRunning,
      targetEndTime: this.targetEndTime,
      actualFinishTime: this.actualFinishTime,
      isPomodoro: this.isPomodoro,
      pomodoroPhase: this.pomodoroPhase,
      pomodoroCycle: this.pomodoroCycle,
      pomodoroWorkTime: this.pomodoroWorkTime,
      pomodoroBreakTime: this.pomodoroBreakTime,
      sound: this.sound
    };
  }
}

// ==================== Persistence ====================
function saveTimersImmediate() {
  try {
    localStorage.setItem('multiTimers', JSON.stringify(timers.map(t => t.toJSON())));
  } catch (e) {
    console.error('localStorage save error:', e);
  }
}

function throttleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimersImmediate();
    saveTimeout = null;
  }, SAVE_THROTTLE);
}

function saveTemplates() {
  try {
    localStorage.setItem('timerTemplates', JSON.stringify(templates));
  } catch (e) {
    console.error('localStorage save error:', e);
  }
}

function saveLogs() {
  try {
    localStorage.setItem('pomodoroLogs', JSON.stringify(logs));
  } catch (e) {
    console.error('localStorage save error:', e);
  }
}

function loadState() {
  try {
    const td = localStorage.getItem('multiTimers');
    if (td) {
      const parsed = JSON.parse(td);
      timers = parsed.map(d => {
        const t = new Timer(d);
        if (t.isRunning && t.targetEndTime) {
          const rem = (t.targetEndTime - Date.now()) / 1000;
          if (rem > 0) {
            t.remainingSeconds = rem;
            t.startInterval();
          } else {
            t.remainingSeconds = 0;
            t.isRunning = false;
            t.actualFinishTime = t.targetEndTime;
            t.targetEndTime = null;
          }
        }
        return t;
      });
    }
  } catch (e) {
    console.error('Error loading timers:', e);
    localStorage.removeItem('multiTimers');
  }

  try {
    const tp = localStorage.getItem('timerTemplates');
    if (tp) templates = JSON.parse(tp);
  } catch (e) {
    localStorage.removeItem('timerTemplates');
  }

  try {
    const lg = localStorage.getItem('pomodoroLogs');
    if (lg) logs = JSON.parse(lg);
  } catch (e) {
    localStorage.removeItem('pomodoroLogs');
  }
}

// ==================== Notifications ====================
function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 10000);
  }
}

// ==================== Idle Reminders ====================
function checkIdleState() {
  const anyRunning = timers.some(t => t.isRunning);
  if (!anyRunning) startIdleReminders();
}

function startIdleReminders() {
  stopIdleReminders();
  idleInterval = setInterval(() => {
    const anyRunning = timers.some(t => t.isRunning);
    if (anyRunning) {
      stopIdleReminders();
      return;
    }
    console.log(`[Idle Reminder] Triggered at ${new Date().toLocaleTimeString()} — no timers running`);
    sendNotification('\u23F0 Time to be productive!', 'No timers are running. Start one to stay focused!');
    playIdleSound();
    flashTitle();
  }, 5 * 60 * 1000);
}

function stopIdleReminders() {
  if (idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
  }
}

function flashTitle() {
  const original = document.title;
  let count = 0;
  const flash = setInterval(() => {
    document.title = count % 2 === 0 ? '\u26A0\uFE0F Start a timer!' : original;
    count++;
    if (count >= 6) {
      clearInterval(flash);
      document.title = original;
    }
  }, 500);
}

// ==================== Page Title ====================
function updatePageTitle() {
  const running = timers.filter(t => t.isRunning);
  const paused = timers.filter(t => !t.isRunning && t.remainingSeconds > 0 && !t.actualFinishTime);
  const active = running.length > 0 ? running : paused;

  if (active.length === 0) {
    document.title = '\u23F3 Multi Timer - No active timers';
    return;
  }

  active.sort((a, b) => a.remainingSeconds - b.remainingSeconds);
  const t = active[0];
  const icon = t.isRunning ? '\u25B6\uFE0F' : '\u23F8\uFE0F';
  document.title = `[${icon}] ${formatTime(t.remainingSeconds)} - ${t.name}`;
}

// ==================== Helpers ====================
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ==================== Collapsible Sections ====================
function initCollapsible() {
  document.querySelectorAll('.section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const targetId = toggle.dataset.target;
      const body = document.getElementById(targetId);
      if (body) {
        body.classList.toggle('collapsed');
        toggle.closest('.collapsible').classList.toggle('collapsed');
      }
    });
  });

  // On mobile, start with templates and create sections collapsed
  if (window.innerWidth <= 768) {
    document.getElementById('templates-body')?.classList.add('collapsed');
    document.getElementById('templates-section')?.classList.add('collapsed');
  }
}

// ==================== Rendering ====================
function renderTemplates() {
  const grid = document.getElementById('templates-grid');
  const empty = document.getElementById('templates-empty');
  grid.innerHTML = '';
  empty.style.display = templates.length === 0 ? 'block' : 'none';

  templates.forEach(tmpl => {
    const card = document.createElement('div');
    card.className = 'template-card' + (tmpl.isPomodoro ? ' pomodoro' : '');
    const totalSec = tmpl.minutes * 60 + tmpl.seconds;
    let durText = formatTime(totalSec);
    if (tmpl.isPomodoro) {
      const breakSec = (tmpl.breakMinutes || 0) * 60 + (tmpl.breakSeconds || 0);
      durText += ` / ${formatTime(breakSec)} break`;
    }
    card.innerHTML = `
      <div class="name">${tmpl.isPomodoro ? '\uD83C\uDF45 ' : ''}${escapeHtml(tmpl.name)}</div>
      <div class="duration">${durText}</div>
      <button class="delete-btn" title="Delete template">&times;</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
      createTimerFromTemplate(tmpl);
    });
    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      templates = templates.filter(t => t.id !== tmpl.id);
      saveTemplates();
      renderTemplates();
    });
    grid.appendChild(card);
  });
}

function renderTimers(newTimerId) {
  const grid = document.getElementById('timers-grid');
  const empty = document.getElementById('timers-empty');
  grid.innerHTML = '';
  empty.style.display = timers.length === 0 ? 'block' : 'none';

  timers.forEach(timer => {
    const card = document.createElement('div');
    const state = timer.getState();
    card.className = `timer-card ${state}`;
    card.id = `timer-${timer.id}`;
    if (newTimerId === timer.id) card.classList.add('just-created');
    updateCardClass(card, timer);

    let phaseHtml = '';
    if (timer.isPomodoro) {
      const phaseEmoji = timer.pomodoroPhase === 'work' ? '\uD83D\uDCBC' : '\u2615';
      const phaseLabel = timer.pomodoroPhase === 'work' ? 'Work' : 'Break';
      phaseHtml = `<div class="timer-phase">${phaseEmoji} ${phaseLabel} - Cycle ${timer.pomodoroCycle}</div>`;
    }

    let finishHtml = '';
    if (timer.isRunning && timer.targetEndTime && !timer.isPomodoro) {
      finishHtml = `<div class="timer-finish">\u23F0 Finishes at ${formatFinishTime(new Date(timer.targetEndTime))}</div>`;
    } else if (timer.actualFinishTime && !timer.isPomodoro) {
      finishHtml = `<div class="timer-finish">\u2705 Finished at ${formatFinishTime(new Date(timer.actualFinishTime))}</div>`;
    } else {
      finishHtml = `<div class="timer-finish"></div>`;
    }

    const progress = timer.getProgress();
    let progressClass = '';
    const pctRemaining = 100 - progress;
    if (state === 'completed') progressClass = 'completed';
    else if (pctRemaining <= 10) progressClass = 'danger';
    else if (pctRemaining <= 25) progressClass = 'warning';

    // Status label for paused/completed
    let statusLabel = '';
    if (state === 'paused' && timer.remainingSeconds > 0 && timer.remainingSeconds < timer.totalSeconds) {
      statusLabel = '<span class="timer-status-label paused-label">Paused</span>';
    } else if (state === 'completed') {
      statusLabel = '<span class="timer-status-label completed-label">Completed</span>';
    }

    card.innerHTML = `
      <div class="timer-header">
        <span class="timer-name">${escapeHtml(timer.name)}${statusLabel}</span>
        <button class="timer-delete" title="Delete timer">&times;</button>
      </div>
      ${phaseHtml}
      <div class="timer-display">${formatTime(timer.remainingSeconds)}</div>
      <div class="progress-bar"><div class="progress-fill ${progressClass}" style="width:${progress}%"></div></div>
      ${finishHtml}
      <div class="timer-controls">
        ${timer.isRunning
          ? `<button class="btn btn-pause" data-action="pause">\u23F8\uFE0F Pause</button>`
          : (timer.remainingSeconds > 0
            ? `<button class="btn btn-start" data-action="start">\u25B6\uFE0F Start</button>`
            : `<button class="btn btn-start" disabled>\u25B6\uFE0F Start</button>`)}
        <button class="btn btn-reset" data-action="reset">\uD83D\uDD04 Reset</button>
      </div>
    `;

    // Two-step delete
    const deleteBtn = card.querySelector('.timer-delete');
    let deleteTimeout = null;
    deleteBtn.addEventListener('click', () => {
      if (deleteBtn.classList.contains('confirming')) {
        clearTimeout(deleteTimeout);
        deleteTimer(timer.id);
      } else {
        deleteBtn.classList.add('confirming');
        deleteBtn.textContent = 'Delete?';
        deleteTimeout = setTimeout(() => {
          deleteBtn.classList.remove('confirming');
          deleteBtn.textContent = '\u00D7';
        }, 3000);
      }
    });

    card.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'start') timer.start();
        else if (action === 'pause') timer.pause();
        else if (action === 'reset') timer.reset();
        renderTimers();
      });
    });

    grid.appendChild(card);
  });

  // Auto-scroll to new timer
  if (newTimerId) {
    const el = document.getElementById(`timer-${newTimerId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updatePageTitle();
}

function updateTimerDisplay(timer) {
  const card = document.getElementById(`timer-${timer.id}`);
  if (!card) return;

  const display = card.querySelector('.timer-display');
  if (display) display.textContent = formatTime(timer.remainingSeconds);

  const progress = timer.getProgress();
  const pctRemaining = 100 - progress;
  const fill = card.querySelector('.progress-fill');
  if (fill) {
    fill.style.width = progress + '%';
    fill.className = 'progress-fill';
    if (pctRemaining <= 10) fill.classList.add('danger');
    else if (pctRemaining <= 25) fill.classList.add('warning');
  }

  updateCardClass(card, timer);

  const finish = card.querySelector('.timer-finish');
  if (finish && timer.isRunning && timer.targetEndTime && !timer.isPomodoro) {
    finish.textContent = `\u23F0 Finishes at ${formatFinishTime(new Date(timer.targetEndTime))}`;
  }

  updatePageTitle();
}

function updateCardClass(card, timer) {
  card.classList.remove('warning', 'danger', 'completed', 'running', 'paused');
  const state = timer.getState();
  card.classList.add(state);

  if (state !== 'completed') {
    const pct = 100 - timer.getProgress();
    if (pct <= 10) card.classList.add('danger');
    else if (pct <= 25) card.classList.add('warning');
  }
}

function renderLogs() {
  const container = document.getElementById('log-entries');
  const empty = document.getElementById('logs-empty');
  container.innerHTML = '';
  empty.style.display = logs.length === 0 ? 'block' : 'none';

  logs.forEach(log => {
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    let timersHtml = '';
    if (log.timers && log.timers.length > 0) {
      timersHtml = '<div class="entry-timers"><strong>Active timers:</strong><br>' +
        log.timers.map(t =>
          `${t.isPomodoro ? '\uD83C\uDF45 ' : '\u23F1\uFE0F '}${escapeHtml(t.name)} - ${t.status}` +
          (t.isPomodoro ? ` (Cycle ${t.pomodoroCycle})` : '') +
          ` [${t.remaining} / ${t.duration}]`
        ).join('<br>') + '</div>';
    }

    // Two-step delete for log entries
    entry.innerHTML = `
      <div class="entry-header">${escapeHtml(log.description)}</div>
      <div class="entry-time">${log.date} at ${log.time}</div>
      ${timersHtml}
      <button class="entry-delete" title="Delete entry">&times;</button>
    `;

    const deleteBtn = entry.querySelector('.entry-delete');
    let deleteTimeout = null;
    deleteBtn.addEventListener('click', () => {
      if (deleteBtn.dataset.confirming === 'true') {
        clearTimeout(deleteTimeout);
        logs = logs.filter(l => l.id !== log.id);
        saveLogs();
        renderLogs();
      } else {
        deleteBtn.dataset.confirming = 'true';
        deleteBtn.textContent = 'Delete?';
        deleteBtn.style.color = 'var(--danger)';
        deleteBtn.style.fontSize = '.75rem';
        deleteTimeout = setTimeout(() => {
          deleteBtn.dataset.confirming = 'false';
          deleteBtn.textContent = '\u00D7';
          deleteBtn.style.color = '';
          deleteBtn.style.fontSize = '';
        }, 3000);
      }
    });

    container.appendChild(entry);
  });
}

// ==================== Actions ====================
function createTimer() {
  const name = document.getElementById('timer-name').value.trim() || 'Timer';
  const minutes = parseInt(document.getElementById('timer-minutes').value) || 0;
  const seconds = parseInt(document.getElementById('timer-seconds').value) || 0;
  const totalSeconds = minutes * 60 + seconds;

  if (totalSeconds <= 0) {
    showToast('Please enter a valid time greater than 0.', 'error');
    return;
  }

  const isPomo = document.getElementById('pomodoro-mode').checked;
  let breakTime = 0;
  if (isPomo) {
    const bm = parseInt(document.getElementById('break-minutes').value) || 0;
    const bs = parseInt(document.getElementById('break-seconds').value) || 0;
    breakTime = bm * 60 + bs;
    if (breakTime <= 0) {
      showToast('Break duration must be greater than 0 for Pomodoro mode.', 'error');
      return;
    }
  }

  const sound = document.querySelector('input[name="sound"]:checked').value;
  const autoStart = document.getElementById('auto-start').checked;

  const timer = new Timer({
    id: Date.now(),
    name,
    totalSeconds,
    remainingSeconds: totalSeconds,
    isPomodoro: isPomo,
    pomodoroPhase: 'work',
    pomodoroCycle: 0,
    pomodoroWorkTime: isPomo ? totalSeconds : 0,
    pomodoroBreakTime: breakTime,
    sound
  });

  timers.push(timer);
  if (autoStart) timer.start();
  saveTimersImmediate();
  renderTimers(timer.id);
}

function createTimerFromTemplate(tmpl) {
  const totalSeconds = tmpl.minutes * 60 + tmpl.seconds;
  const breakTime = tmpl.isPomodoro ? (tmpl.breakMinutes || 0) * 60 + (tmpl.breakSeconds || 0) : 0;
  const sound = document.querySelector('input[name="sound"]:checked').value;

  const timer = new Timer({
    id: Date.now(),
    name: tmpl.name,
    totalSeconds,
    remainingSeconds: totalSeconds,
    isPomodoro: tmpl.isPomodoro,
    pomodoroPhase: 'work',
    pomodoroCycle: 0,
    pomodoroWorkTime: tmpl.isPomodoro ? totalSeconds : 0,
    pomodoroBreakTime: breakTime,
    sound
  });

  timers.push(timer);
  const autoStart = document.getElementById('auto-start').checked;
  if (autoStart) timer.start();
  saveTimersImmediate();
  renderTimers(timer.id);
}

function deleteTimer(id) {
  const timer = timers.find(t => t.id === id);
  if (timer) {
    clearInterval(timer.interval);
    timers = timers.filter(t => t.id !== id);
    saveTimersImmediate();
    renderTimers();
    checkIdleState();
  }
}

function saveTemplate() {
  const name = document.getElementById('timer-name').value.trim();
  const minutes = parseInt(document.getElementById('timer-minutes').value) || 0;
  const seconds = parseInt(document.getElementById('timer-seconds').value) || 0;

  if (!name) {
    showToast('Please enter a timer name to save as template.', 'error');
    return;
  }
  if (minutes * 60 + seconds <= 0) {
    showToast('Please enter a valid duration.', 'error');
    return;
  }

  const isPomo = document.getElementById('pomodoro-mode').checked;
  const tmpl = { id: Date.now(), name, minutes, seconds, isPomodoro: isPomo };

  if (isPomo) {
    tmpl.breakMinutes = parseInt(document.getElementById('break-minutes').value) || 0;
    tmpl.breakSeconds = parseInt(document.getElementById('break-seconds').value) || 0;
  }

  templates.push(tmpl);
  saveTemplates();
  renderTemplates();
  showToast('Template saved successfully!', 'success');
}

function logActivity() {
  const desc = document.getElementById('log-description').value.trim();
  if (!desc) {
    showToast('Please enter an activity description.', 'error');
    return;
  }

  const now = new Date();
  const entry = {
    id: Date.now(),
    description: desc,
    timestamp: now.toISOString(),
    date: formatLogDate(now),
    time: formatFinishTime(now),
    timers: timers.map(t => ({
      name: t.name,
      isPomodoro: t.isPomodoro,
      pomodoroCycle: t.isPomodoro ? t.pomodoroCycle : null,
      duration: formatTime(t.totalSeconds),
      remaining: formatTime(t.remainingSeconds),
      status: t.isRunning ? 'running' : (t.remainingSeconds <= 0 ? 'completed' : 'paused')
    }))
  };

  logs.unshift(entry);
  saveLogs();
  renderLogs();
  document.getElementById('log-description').value = '';
  showToast('Activity logged!', 'success');
}

function downloadLog() {
  if (logs.length === 0) {
    showToast('No logs to download.', 'warning');
    return;
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  let text = `Pomodoro Activity Log\nExported: ${formatLogDate(now)} at ${formatFinishTime(now)}\n${'='.repeat(50)}\n\n`;

  logs.forEach(log => {
    text += `${log.description}\n`;
    text += `Date: ${log.date} at ${log.time}\n`;
    if (log.timers && log.timers.length > 0) {
      text += 'Active timers:\n';
      log.timers.forEach(t => {
        text += `  - ${t.name} (${t.status})`;
        if (t.isPomodoro) text += ` [Cycle ${t.pomodoroCycle}]`;
        text += ` ${t.remaining} / ${t.duration}\n`;
      });
    }
    text += `${'-'.repeat(40)}\n\n`;
  });

  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pomodoro-log-${dateStr}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function clearLogs() {
  if (logs.length === 0) return;
  if (!confirm('Are you sure you want to clear all logs?')) return;
  logs = [];
  saveLogs();
  renderLogs();
  showToast('All logs cleared.', 'info');
}

function resetAllCycles() {
  if (!confirm('Reset all Pomodoro cycle counts to 0?')) return;
  timers.forEach(t => {
    if (t.isPomodoro) t.pomodoroCycle = 0;
  });
  saveTimersImmediate();
  renderTimers();
  showToast('All Pomodoro cycles reset.', 'info');
}

// ==================== Event Listeners ====================
document.getElementById('create-timer-btn').addEventListener('click', createTimer);
document.getElementById('save-template-btn').addEventListener('click', saveTemplate);
document.getElementById('log-activity-btn').addEventListener('click', logActivity);
document.getElementById('download-log-btn').addEventListener('click', downloadLog);
document.getElementById('clear-logs-btn').addEventListener('click', clearLogs);
document.getElementById('reset-cycles-btn').addEventListener('click', resetAllCycles);

document.getElementById('pomodoro-mode').addEventListener('change', (e) => {
  document.getElementById('break-inputs').classList.toggle('hidden', !e.target.checked);
});

// Preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('timer-minutes').value = btn.dataset.minutes;
    document.getElementById('timer-seconds').value = btn.dataset.seconds;
    if (btn.dataset.pomodoro) {
      document.getElementById('pomodoro-mode').checked = true;
      document.getElementById('break-inputs').classList.remove('hidden');
      document.getElementById('break-minutes').value = btn.dataset.breakMin;
      document.getElementById('break-seconds').value = btn.dataset.breakSec;
    }
  });
});

// Sound preview - only on radio change (fixes double-fire bug)
document.querySelectorAll('.sound-option input[type="radio"]').forEach(radio => {
  radio.addEventListener('change', () => {
    playSound(radio.value);
  });
});

// Enter key to create timer from form inputs
['timer-name', 'timer-minutes', 'timer-seconds'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createTimer();
  });
});

// FAB - scroll to create section and expand it
document.getElementById('fab-create').addEventListener('click', () => {
  const createBody = document.getElementById('create-body');
  const createSection = document.getElementById('create-section');
  if (createBody.classList.contains('collapsed')) {
    createBody.classList.remove('collapsed');
    createSection.classList.remove('collapsed');
  }
  createSection.scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => document.getElementById('timer-name').focus(), 400);
});

// ==================== Service Worker & PWA ====================
let swRegistration = null;

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js');
      console.log('[SW] Registered successfully');
    } catch (e) {
      console.error('[SW] Registration failed:', e);
    }
  }
}

function scheduleSwNotification(title, body, delayMs) {
  if (swRegistration && swRegistration.active) {
    swRegistration.active.postMessage({
      type: 'SCHEDULE_NOTIFICATION',
      title,
      body,
      delay: delayMs
    });
  }
}

// ==================== Wake Lock (keep screen on) ====================
let wakeLock = null;

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) {
      console.log('[WakeLock] Could not acquire:', e.message);
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}

// Re-acquire wake lock and recalc timers when page becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const anyRunning = timers.some(t => t.isRunning);
    if (anyRunning) requestWakeLock();

    // Recalculate all running timers on return from background
    timers.forEach(t => {
      if (t.isRunning && t.targetEndTime) {
        const rem = (t.targetEndTime - Date.now()) / 1000;
        if (rem <= 0) {
          t.complete();
        } else {
          t.remainingSeconds = rem;
        }
      }
    });
    renderTimers();
  }
});

// Hook into timer start to schedule SW notification + wake lock
const _origTimerStart = Timer.prototype.start;
Timer.prototype.start = function() {
  _origTimerStart.call(this);
  requestWakeLock();
  if (this.remainingSeconds > 0) {
    scheduleSwNotification(
      'Timer Complete!',
      `${this.name} has finished!`,
      this.remainingSeconds * 1000
    );
  }
};

// Release wake lock when all timers stop
const _origTimerPause = Timer.prototype.pause;
Timer.prototype.pause = function() {
  _origTimerPause.call(this);
  if (!timers.some(t => t.isRunning)) releaseWakeLock();
};

// ==================== Update App ====================
document.getElementById('update-app-btn').addEventListener('click', async () => {
  const btn = document.getElementById('update-app-btn');
  btn.textContent = 'Updating...';
  btn.disabled = true;
  try {
    // Delete all caches
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    // Unregister service worker so it re-installs fresh
    if (swRegistration) {
      await swRegistration.unregister();
    }
    showToast('Cache cleared! Reloading...', 'success');
    setTimeout(() => location.reload(true), 500);
  } catch (e) {
    console.error('Update failed:', e);
    showToast('Update failed. Try again.', 'error');
    btn.textContent = '\uD83D\uDD04 Update App';
    btn.disabled = false;
  }
});

// ==================== Init ====================
loadState();
initCollapsible();
renderTemplates();
renderTimers();
renderLogs();
registerServiceWorker();
requestNotificationPermission();
checkIdleState();
