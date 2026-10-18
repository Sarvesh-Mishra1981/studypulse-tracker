// StudyPulse — Date-Wise Study & Revision Graph Tracker + Dual Live Timers

const STORAGE_KEYS = {
  LOGS: 'studypulse_study_logs_v1',
  TIMERS: 'studypulse_timers_state_v1',
  FIREBASE_CFG: 'studypulse_firebase_config_v1',
  QUICK_USER: 'studypulse_quick_google_user_v1',
  INITIALIZED: 'studypulse_initialized_v1',
};

// App State
let studyLogsMap = new Map(); // 'YYYY-MM-DD' -> { date, lectureHours, revisionHours, notes, updatedAt }
let selectedDate = getLocalDateString(0);
let currentChartType = 'stacked'; // 'stacked' | 'lines'
let currentRange = '14'; // '7' | '14' | '30' | 'logged'
let searchQuery = '';
let mainChart = null;
let chartDatesList = [];

// Dual Timer State
let timerState = {
  lectureSec: 0,
  revisionSec: 0,
  activeMode: null, // 'lecture' | 'revision' | null
  lastStartMs: null,
};
let timerIntervalId = null;

// Auth / Firebase State
let currentUser = null;
let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let firestoreUnsubscribe = null;
let firestoreModules = null;

// DOM Elements
const studyDateInput = document.getElementById('studyDate');
const selectedDateLabel = document.getElementById('selectedDateLabel');
const prevDayBtn = document.getElementById('prevDayBtn');
const nextDayBtn = document.getElementById('nextDayBtn');
const todayJumpBtn = document.getElementById('todayJumpBtn');
const dateStripContainer = document.getElementById('dateStripContainer');

const cardDateTitle = document.getElementById('cardDateTitle');
const selectedDateTotal = document.getElementById('selectedDateTotal');
const selectedDateSplit = document.getElementById('selectedDateSplit');

const modeTabs = document.querySelectorAll('.mode-tab');
const timerTabPane = document.getElementById('timerTabPane');
const studyForm = document.getElementById('studyForm');

// Timer DOM
const lectureTimerCard = document.getElementById('lectureTimerCard');
const lectureTimerBadge = document.getElementById('lectureTimerBadge');
const lectureClockDisplay = document.getElementById('lectureClockDisplay');
const lectureStartPauseBtn = document.getElementById('lectureStartPauseBtn');
const lectureResetBtn = document.getElementById('lectureResetBtn');

const revisionTimerCard = document.getElementById('revisionTimerCard');
const revisionTimerBadge = document.getElementById('revisionTimerBadge');
const revisionClockDisplay = document.getElementById('revisionClockDisplay');
const revisionStartPauseBtn = document.getElementById('revisionStartPauseBtn');
const revisionResetBtn = document.getElementById('revisionResetBtn');

const timerSessionPreview = document.getElementById('timerSessionPreview');
const saveTimersToDateBtn = document.getElementById('saveTimersToDateBtn');

// Manual Form DOM
const lectureHoursInput = document.getElementById('lectureHours');
const lectureSlider = document.getElementById('lectureSlider');
const revisionHoursInput = document.getElementById('revisionHours');
const revisionSlider = document.getElementById('revisionSlider');
const studyNotesInput = document.getElementById('studyNotes');
const liveBreakdownText = document.getElementById('liveBreakdownText');
const liveTotalBadge = document.getElementById('liveTotalBadge');

// Header Metrics & Graph DOM
const statTotalHours = document.getElementById('statTotalHours');
const statLectureHours = document.getElementById('statLectureHours');
const statRevisionHours = document.getElementById('statRevisionHours');
const statAvgHours = document.getElementById('statAvgHours');
const statLectureBar = document.getElementById('statLectureBar');
const statRevisionBar = document.getElementById('statRevisionBar');
const statLecturePct = document.getElementById('statLecturePct');
const statRevisionPct = document.getElementById('statRevisionPct');

const chartTypeControl = document.getElementById('chartTypeControl');
const rangeSelect = document.getElementById('rangeSelect');
const logsTableBody = document.getElementById('logsTableBody');
const searchLogsInput = document.getElementById('searchLogs');
const loadSampleBtn = document.getElementById('loadSampleBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const clearAllBtn = document.getElementById('clearAllBtn');

// Auth DOM
const syncStatusBtn = document.getElementById('syncStatusBtn');
const syncDot = document.getElementById('syncDot');
const syncStatusText = document.getElementById('syncStatusText');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const userProfileBar = document.getElementById('userProfileBar');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const signOutBtn = document.getElementById('signOutBtn');

const authModal = document.getElementById('authModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const quickGoogleForm = document.getElementById('quickGoogleForm');
const quickNameInput = document.getElementById('quickName');
const quickEmailInput = document.getElementById('quickEmail');
const firebaseConfigInput = document.getElementById('firebaseConfigInput');
const saveFirebaseConfigBtn = document.getElementById('saveFirebaseConfigBtn');
const clearFirebaseConfigBtn = document.getElementById('clearFirebaseConfigBtn');
const firebaseModalStatus = document.getElementById('firebaseModalStatus');
const toastEl = document.getElementById('toast');

// ============================================================================
// DATE & FORMATTING HELPERS
// ============================================================================

function getLocalDateString(offsetDays = 0, baseDateStr = null) {
  let d = new Date();
  if (baseDateStr) {
    const [y, m, day] = baseDateStr.split('-').map(Number);
    d = new Date(y, m - 1, day);
  }
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateObj(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatShortDate(dateStr) {
  return parseDateObj(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDateTitle(dateStr) {
  return parseDateObj(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getRelativeDayLabel(dateStr) {
  const today = getLocalDateString(0);
  const yesterday = getLocalDateString(-1);
  const tomorrow = getLocalDateString(1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  if (dateStr === tomorrow) return 'Tomorrow';
  return parseDateObj(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
}

function roundHours(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function formatClock(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatMinutesHuman(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hrs = (sec / 3600).toFixed(2);
  const mins = Math.floor(sec / 60);
  if (sec === 0) return '0m';
  if (mins === 0) return `${sec}s (${hrs}h)`;
  return `${mins}m (${hrs}h)`;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 3000);
}

// ============================================================================
// DATA PERSISTENCE
// ============================================================================

function getActiveStorageKey() {
  if (currentUser && currentUser.email) {
    return `${STORAGE_KEYS.LOGS}_${currentUser.email.toLowerCase()}`;
  }
  return STORAGE_KEYS.LOGS;
}

function loadLogsFromLocal() {
  studyLogsMap.clear();
  const raw =
    localStorage.getItem(getActiveStorageKey()) || localStorage.getItem(STORAGE_KEYS.LOGS);

  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((item) => {
          if (item && item.date) {
            studyLogsMap.set(item.date, {
              date: item.date,
              lectureHours: roundHours(item.lectureHours),
              revisionHours: roundHours(item.revisionHours),
              notes: item.notes || '',
              updatedAt: item.updatedAt || Date.now(),
            });
          }
        });
      }
    } catch (e) {
      console.error('Error loading study logs:', e);
    }
  } else if (!localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
    seedSampleWeek(false);
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  }
}

function saveLogsToLocal() {
  const arr = Array.from(studyLogsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const json = JSON.stringify(arr);
  localStorage.setItem(getActiveStorageKey(), json);
  localStorage.setItem(STORAGE_KEYS.LOGS, json);
}

function seedSampleWeek(notify = true) {
  const samples = [
    { offset: -6, lecture: 3.0, revision: 1.5, notes: 'Electrostatics & Calculus Lecture' },
    { offset: -5, lecture: 3.5, revision: 2.0, notes: 'Organic Chemistry & Problem Set' },
    { offset: -4, lecture: 2.0, revision: 3.0, notes: 'Formula Revision & PYQ Practice' },
    { offset: -3, lecture: 4.0, revision: 1.5, notes: 'Mechanics Live Class + Short Notes' },
    { offset: -2, lecture: 2.5, revision: 2.5, notes: 'Thermodynamics & Revision' },
    { offset: -1, lecture: 1.5, revision: 3.5, notes: 'Mock Test & Mistake Revision' },
    { offset: 0, lecture: 3.0, revision: 2.0, notes: 'Vectors Lecture & Daily Revision' },
  ];

  samples.forEach((s) => {
    const dateStr = getLocalDateString(s.offset);
    const entry = {
      date: dateStr,
      lectureHours: s.lecture,
      revisionHours: s.revision,
      notes: s.notes,
      updatedAt: Date.now(),
    };
    studyLogsMap.set(dateStr, entry);
    if (firestoreDb && currentUser?.mode === 'firebase') {
      pushEntryToFirestore(entry);
    }
  });

  saveLogsToLocal();
  selectDate(getLocalDateString(0));
  if (notify) showToast('Loaded 7-day sample study week!');
}

function getSortedEntries() {
  return Array.from(studyLogsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================================
// DATE-WISE NAVIGATION & SELECTION
// ============================================================================

function selectDate(dateStr) {
  selectedDate = dateStr;
  studyDateInput.value = dateStr;
  selectedDateLabel.textContent = getRelativeDayLabel(dateStr);
  cardDateTitle.textContent = formatFullDateTitle(dateStr);

  const existing = studyLogsMap.get(dateStr) || {
    date: dateStr,
    lectureHours: 0,
    revisionHours: 0,
    notes: '',
  };

  const total = roundHours(existing.lectureHours + existing.revisionHours);
  selectedDateTotal.textContent = `${total.toFixed(1)}h`;
  selectedDateSplit.textContent = `${existing.lectureHours}h Lec • ${existing.revisionHours}h Rev`;

  // Populate Manual Hours Form with this date's values
  lectureHoursInput.value = existing.lectureHours;
  lectureSlider.value = Math.min(12, existing.lectureHours);
  revisionHoursInput.value = existing.revisionHours;
  revisionSlider.value = Math.min(12, existing.revisionHours);
  studyNotesInput.value = existing.notes || '';

  updateManualPreview();
  renderDateStrip();
  updateHeaderStats();
  updateChart();
  renderHistoryTable();
}

function renderDateStrip() {
  // Show 7 days centered around selectedDate (or ending at today if close)
  const days = [];
  for (let i = -5; i <= 1; i++) {
    days.push(getLocalDateString(i, selectedDate));
  }

  dateStripContainer.innerHTML = days
    .map((dStr) => {
      const dObj = parseDateObj(dStr);
      const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const entry = studyLogsMap.get(dStr);
      const total = entry ? roundHours(entry.lectureHours + entry.revisionHours) : 0;
      const isSelected = dStr === selectedDate;

      return `
        <button type="button" class="day-pill ${isSelected ? 'active' : ''}" data-strip-date="${dStr}">
          <span class="day-pill-name">${dayName}</span>
          <span class="day-pill-num">${dayNum}</span>
          <span class="day-pill-hrs ${total === 0 ? 'zero' : ''}">${total > 0 ? `${total}h` : '—'}</span>
        </button>
      `;
    })
    .join('');
}

function updateManualPreview() {
  const lec = Math.max(0, roundHours(lectureHoursInput.value));
  const rev = Math.max(0, roundHours(revisionHoursInput.value));
  const tot = roundHours(lec + rev);
  liveBreakdownText.textContent = `${lec}h Lecture + ${rev}h Revision`;
  liveTotalBadge.textContent = `Total: ${tot.toFixed(1)} hrs`;
}

// ============================================================================
// DUAL LIVE STUDY TIMERS (LECTURE & REVISION)
// ============================================================================

function getEffectiveTimerSeconds() {
  let lec = timerState.lectureSec;
  let rev = timerState.revisionSec;
  if (timerState.activeMode && timerState.lastStartMs) {
    const deltaSec = Math.max(0, (Date.now() - timerState.lastStartMs) / 1000);
    if (timerState.activeMode === 'lecture') lec += deltaSec;
    if (timerState.activeMode === 'revision') rev += deltaSec;
  }
  return { lectureSec: lec, revisionSec: rev };
}

function persistTimerState() {
  localStorage.setItem(STORAGE_KEYS.TIMERS, JSON.stringify(timerState));
}

function restoreTimerState() {
  const raw = localStorage.getItem(STORAGE_KEYS.TIMERS);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    timerState = {
      lectureSec: Number(saved.lectureSec) || 0,
      revisionSec: Number(saved.revisionSec) || 0,
      activeMode: saved.activeMode || null,
      lastStartMs: saved.lastStartMs || null,
    };
    if (timerState.activeMode) {
      ensureTimerInterval();
    }
  } catch (_) {}
}

function commitElapsedToTimerState() {
  if (timerState.activeMode && timerState.lastStartMs) {
    const elapsed = Math.max(0, (Date.now() - timerState.lastStartMs) / 1000);
    if (timerState.activeMode === 'lecture') {
      timerState.lectureSec += elapsed;
    } else if (timerState.activeMode === 'revision') {
      timerState.revisionSec += elapsed;
    }
    timerState.lastStartMs = Date.now();
  }
}

function toggleTimer(mode) {
  commitElapsedToTimerState();

  if (timerState.activeMode === mode) {
    // Pause active timer
    timerState.activeMode = null;
    timerState.lastStartMs = null;
  } else {
    // Start requested timer (automatically pauses the other)
    timerState.activeMode = mode;
    timerState.lastStartMs = Date.now();
    ensureTimerInterval();
  }

  persistTimerState();
  renderTimerUI();
}

function resetTimer(mode) {
  commitElapsedToTimerState();
  if (mode === 'lecture') {
    timerState.lectureSec = 0;
    if (timerState.activeMode === 'lecture') {
      timerState.activeMode = null;
      timerState.lastStartMs = null;
    }
  } else if (mode === 'revision') {
    timerState.revisionSec = 0;
    if (timerState.activeMode === 'revision') {
      timerState.activeMode = null;
      timerState.lastStartMs = null;
    }
  }
  persistTimerState();
  renderTimerUI();
}

function ensureTimerInterval() {
  if (timerIntervalId) clearInterval(timerIntervalId);
  timerIntervalId = setInterval(() => {
    renderTimerUI();
    if (!timerState.activeMode) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  }, 500);
}

function renderTimerUI() {
  const { lectureSec, revisionSec } = getEffectiveTimerSeconds();

  lectureClockDisplay.textContent = formatClock(lectureSec);
  revisionClockDisplay.textContent = formatClock(revisionSec);

  const isLecRunning = timerState.activeMode === 'lecture';
  const isRevRunning = timerState.activeMode === 'revision';

  lectureTimerCard.classList.toggle('running', isLecRunning);
  revisionTimerCard.classList.toggle('running', isRevRunning);

  lectureTimerBadge.textContent = isLecRunning ? '● Running' : 'Paused';
  lectureTimerBadge.className = `timer-state-badge ${isLecRunning ? 'active-lecture' : ''}`;
  lectureStartPauseBtn.textContent = isLecRunning ? '⏸ Pause Lecture' : '▶ Start Lecture';

  revisionTimerBadge.textContent = isRevRunning ? '● Running' : 'Paused';
  revisionTimerBadge.className = `timer-state-badge ${isRevRunning ? 'active-revision' : ''}`;
  revisionStartPauseBtn.textContent = isRevRunning ? '⏸ Pause Revision' : '▶ Start Revision';

  timerSessionPreview.innerHTML = `Timer session: <strong>${formatMinutesHuman(
    lectureSec
  )} Lecture</strong> + <strong>${formatMinutesHuman(revisionSec)} Revision</strong>`;

  if (isLecRunning) {
    document.title = `⏱️ ${formatClock(lectureSec)} Lecture — StudyPulse`;
  } else if (isRevRunning) {
    document.title = `⏱️ ${formatClock(revisionSec)} Revision — StudyPulse`;
  } else {
    document.title = 'StudyPulse — Date-Wise Study & Revision Tracker';
  }
}

async function saveTimersToSelectedDate() {
  commitElapsedToTimerState();
  timerState.activeMode = null;
  timerState.lastStartMs = null;

  const { lectureSec, revisionSec } = getEffectiveTimerSeconds();
  if (lectureSec < 1 && revisionSec < 1) {
    showToast('Start the Lecture or Revision timer first before saving!');
    return;
  }

  // Convert seconds to hours (if user ran timer for a short test < 3 min, credit at least 0.1h so it plots visibly)
  const addLec = lectureSec > 0 ? Math.max(0.1, roundHours(lectureSec / 3600)) : 0;
  const addRev = revisionSec > 0 ? Math.max(0.1, roundHours(revisionSec / 3600)) : 0;

  const prev = studyLogsMap.get(selectedDate) || {
    date: selectedDate,
    lectureHours: 0,
    revisionHours: 0,
    notes: '',
  };

  const updated = {
    date: selectedDate,
    lectureHours: Math.min(24, roundHours(prev.lectureHours + addLec)),
    revisionHours: Math.min(24, roundHours(prev.revisionHours + addRev)),
    notes: prev.notes || '',
    updatedAt: Date.now(),
  };

  // Reset timers after logging
  timerState.lectureSec = 0;
  timerState.revisionSec = 0;
  persistTimerState();
  renderTimerUI();

  studyLogsMap.set(selectedDate, updated);
  saveLogsToLocal();
  selectDate(selectedDate);

  if (firestoreDb && currentUser?.mode === 'firebase') {
    await pushEntryToFirestore(updated);
  }

  showToast(
    `Added +${addLec}h Lecture & +${addRev}h Revision to ${formatShortDate(selectedDate)}!`
  );
}

// ============================================================================
// HEADER METRICS & DATE-WISE CHART
// ============================================================================

function updateHeaderStats() {
  const entries = getSortedEntries();
  let totalLec = 0;
  let totalRev = 0;

  entries.forEach((e) => {
    totalLec += e.lectureHours;
    totalRev += e.revisionHours;
  });

  totalLec = roundHours(totalLec);
  totalRev = roundHours(totalRev);
  const grandTotal = roundHours(totalLec + totalRev);
  const avg = entries.length > 0 ? roundHours(grandTotal / entries.length) : 0;

  const lecPct = grandTotal > 0 ? Math.round((totalLec / grandTotal) * 100) : 50;
  const revPct = grandTotal > 0 ? 100 - lecPct : 50;

  statTotalHours.textContent = `${grandTotal.toFixed(1)}h`;
  statLectureHours.textContent = `${totalLec.toFixed(1)}h`;
  statRevisionHours.textContent = `${totalRev.toFixed(1)}h`;
  statAvgHours.textContent = `${avg.toFixed(1)}h`;

  statLectureBar.style.width = `${lecPct}%`;
  statRevisionBar.style.width = `${revPct}%`;
  statLecturePct.textContent = `${lecPct}% Lecture`;
  statRevisionPct.textContent = `${revPct}% Revision`;
}

function buildDateWiseSeries() {
  if (currentRange === 'logged') {
    const entries = getSortedEntries();
    return entries;
  }

  // True continuous calendar dates ending at today (or selectedDate if later)
  const count = Number(currentRange) || 14;
  const todayStr = getLocalDateString(0);
  const anchor = selectedDate > todayStr ? selectedDate : todayStr;
  const result = [];

  for (let i = -(count - 1); i <= 0; i++) {
    const dStr = getLocalDateString(i, anchor);
    const existing = studyLogsMap.get(dStr);
    result.push(
      existing || {
        date: dStr,
        lectureHours: 0,
        revisionHours: 0,
        notes: '',
      }
    );
  }
  return result;
}

function updateChart() {
  const series = buildDateWiseSeries();
  chartDatesList = series.map((item) => item.date);

  const labels = series.map((item) => formatShortDate(item.date));
  const lectureData = series.map((item) => item.lectureHours);
  const revisionData = series.map((item) => item.revisionHours);
  const totalData = series.map((item) => roundHours(item.lectureHours + item.revisionHours));

  const ctx = document.getElementById('studyChart').getContext('2d');
  if (mainChart) mainChart.destroy();

  const isStacked = currentChartType === 'stacked';

  const datasets = isStacked
    ? [
        {
          type: 'line',
          label: 'Total Hours',
          data: totalData,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          borderWidth: 2.2,
          pointRadius: series.map((s) => (s.date === selectedDate ? 6 : 3.5)),
          pointBackgroundColor: series.map((s) =>
            s.date === selectedDate ? '#ffffff' : '#f59e0b'
          ),
          tension: 0.32,
          order: 0,
        },
        {
          type: 'bar',
          label: 'Lecture Time (hrs)',
          data: lectureData,
          backgroundColor: series.map((s) =>
            s.date === selectedDate ? '#818cf8' : 'rgba(99, 102, 241, 0.82)'
          ),
          borderRadius: 5,
          stack: 'dayStack',
          order: 1,
        },
        {
          type: 'bar',
          label: 'Revision Time (hrs)',
          data: revisionData,
          backgroundColor: series.map((s) =>
            s.date === selectedDate ? '#34d399' : 'rgba(16, 185, 129, 0.82)'
          ),
          borderRadius: 5,
          stack: 'dayStack',
          order: 1,
        },
      ]
    : [
        {
          type: 'line',
          label: 'Total Hours',
          data: totalData,
          borderColor: '#f59e0b',
          borderDash: [5, 4],
          borderWidth: 2.5,
          pointRadius: 4,
          tension: 0.32,
        },
        {
          type: 'line',
          label: 'Lecture Time (hrs)',
          data: lectureData,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.14)',
          borderWidth: 2.5,
          pointRadius: 4,
          tension: 0.32,
          fill: true,
        },
        {
          type: 'line',
          label: 'Revision Time (hrs)',
          data: revisionData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.14)',
          borderWidth: 2.5,
          pointRadius: 4,
          tension: 0.32,
          fill: true,
        },
      ];

  mainChart = new Chart(ctx, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_evt, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          const clickedDate = chartDatesList[idx];
          if (clickedDate) selectDate(clickedDate);
        }
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(148, 163, 184, 0.25)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex;
              return idx !== undefined ? formatFullDateTitle(chartDatesList[idx]) : '';
            },
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              const note = idx !== undefined ? series[idx]?.notes : '';
              return note ? `\nNote: ${note}` : '';
            },
          },
        },
      },
      scales: {
        x: {
          stacked: isStacked,
          grid: { color: 'rgba(148, 163, 184, 0.06)' },
          ticks: {
            color: (c) =>
              chartDatesList[c.index] === selectedDate ? '#f8fafc' : '#94a3b8',
            font: (c) => ({
              size: 11,
              weight: chartDatesList[c.index] === selectedDate ? '700' : '400',
            }),
          },
        },
        y: {
          stacked: isStacked,
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: {
            color: '#94a3b8',
            callback: (v) => `${v}h`,
          },
        },
      },
    },
  });
}

// ============================================================================
// DATE-WISE LOG TABLE
// ============================================================================

function renderHistoryTable() {
  const entries = getSortedEntries().reverse();
  const q = searchQuery.trim().toLowerCase();

  const filtered = entries.filter((e) => {
    if (!q) return true;
    return (
      e.date.toLowerCase().includes(q) ||
      formatFullDateTitle(e.date).toLowerCase().includes(q) ||
      (e.notes && e.notes.toLowerCase().includes(q))
    );
  });

  if (filtered.length === 0) {
    logsTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding: 1.5rem; color: var(--text-sub);">
          No study logs yet. Use the Live Timers or Manual Hours on the left to log a date!
        </td>
      </tr>
    `;
    return;
  }

  logsTableBody.innerHTML = filtered
    .map((entry) => {
      const total = roundHours(entry.lectureHours + entry.revisionHours);
      const isSel = entry.date === selectedDate;
      const safeNotes = entry.notes
        ? entry.notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        : '<span class="muted">—</span>';

      return `
        <tr class="${isSel ? 'selected-row' : ''}" data-row-date="${entry.date}">
          <td>
            <strong>${formatFullDateTitle(entry.date)}</strong>
            <span class="muted" style="font-size:0.7rem; margin-left:4px;">${entry.date}</span>
          </td>
          <td><span class="tag-hr lec">${entry.lectureHours}h</span></td>
          <td><span class="tag-hr rev">${entry.revisionHours}h</span></td>
          <td><span class="tag-hr tot">${total}h</span></td>
          <td>${safeNotes}</td>
          <td class="text-right">
            <button type="button" class="btn-ghost danger" data-delete-date="${entry.date}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupInteractions() {
  // Date Ribbon Navigation
  studyDateInput.addEventListener('change', () => {
    if (studyDateInput.value) selectDate(studyDateInput.value);
  });

  prevDayBtn.addEventListener('click', () => {
    selectDate(getLocalDateString(-1, selectedDate));
  });

  nextDayBtn.addEventListener('click', () => {
    selectDate(getLocalDateString(1, selectedDate));
  });

  todayJumpBtn.addEventListener('click', () => {
    selectDate(getLocalDateString(0));
  });

  dateStripContainer.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-strip-date]');
    if (pill) selectDate(pill.getAttribute('data-strip-date'));
  });

  // Mode Tabs (Live Timers vs Manual Hours)
  modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      modeTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      if (target === 'timer') {
        timerTabPane.classList.remove('hidden');
        studyForm.classList.add('hidden');
      } else {
        timerTabPane.classList.add('hidden');
        studyForm.classList.remove('hidden');
      }
    });
  });

  // Dual Timers Controls
  lectureStartPauseBtn.addEventListener('click', () => toggleTimer('lecture'));
  lectureResetBtn.addEventListener('click', () => resetTimer('lecture'));
  revisionStartPauseBtn.addEventListener('click', () => toggleTimer('revision'));
  revisionResetBtn.addEventListener('click', () => resetTimer('revision'));
  saveTimersToDateBtn.addEventListener('click', saveTimersToSelectedDate);

  // Manual Hours Sliders & Quick Buttons
  lectureHoursInput.addEventListener('input', () => {
    lectureSlider.value = Math.min(12, Number(lectureHoursInput.value) || 0);
    updateManualPreview();
  });
  lectureSlider.addEventListener('input', () => {
    lectureHoursInput.value = lectureSlider.value;
    updateManualPreview();
  });

  revisionHoursInput.addEventListener('input', () => {
    revisionSlider.value = Math.min(12, Number(revisionHoursInput.value) || 0);
    updateManualPreview();
  });
  revisionSlider.addEventListener('input', () => {
    revisionHoursInput.value = revisionSlider.value;
    updateManualPreview();
  });

  document.querySelectorAll('.q-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const inputEl = document.getElementById(targetId);
      const sliderEl = targetId === 'lectureHours' ? lectureSlider : revisionSlider;
      if (btn.hasAttribute('data-clear')) {
        inputEl.value = '0';
      } else {
        const add = Number(btn.getAttribute('data-add')) || 0;
        inputEl.value = String(Math.min(24, roundHours((Number(inputEl.value) || 0) + add)));
      }
      sliderEl.value = Math.min(12, Number(inputEl.value) || 0);
      updateManualPreview();
    });
  });

  // Save Manual Form
  studyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const lec = Math.max(0, roundHours(lectureHoursInput.value));
    const rev = Math.max(0, roundHours(revisionHoursInput.value));
    const notes = studyNotesInput.value.trim();

    if (lec + rev > 24) {
      showToast('Total hours in a single day cannot exceed 24h.');
      return;
    }

    const entry = {
      date: selectedDate,
      lectureHours: lec,
      revisionHours: rev,
      notes,
      updatedAt: Date.now(),
    };

    if (lec === 0 && rev === 0 && !notes) {
      studyLogsMap.delete(selectedDate);
    } else {
      studyLogsMap.set(selectedDate, entry);
    }

    saveLogsToLocal();
    selectDate(selectedDate);

    if (firestoreDb && currentUser?.mode === 'firebase') {
      await pushEntryToFirestore(entry);
    }

    showToast(`Updated ${formatFullDateTitle(selectedDate)} (${roundHours(lec + rev)}h total)!`);
  });

  // Chart Toolbar
  chartTypeControl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chart-type]');
    if (!btn) return;
    chartTypeControl.querySelectorAll('.seg-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentChartType = btn.getAttribute('data-chart-type');
    updateChart();
  });

  rangeSelect.addEventListener('change', () => {
    currentRange = rangeSelect.value;
    updateChart();
  });

  // Table Row Click (Select Date) or Delete
  logsTableBody.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-delete-date]');
    if (delBtn) {
      e.stopPropagation();
      const dStr = delBtn.getAttribute('data-delete-date');
      studyLogsMap.delete(dStr);
      saveLogsToLocal();
      selectDate(selectedDate);
      if (firestoreDb && currentUser?.mode === 'firebase') {
        await deleteEntryFromFirestore(dStr);
      }
      showToast(`Deleted log for ${formatShortDate(dStr)}.`);
      return;
    }

    const row = e.target.closest('[data-row-date]');
    if (row) {
      selectDate(row.getAttribute('data-row-date'));
    }
  });

  searchLogsInput.addEventListener('input', () => {
    searchQuery = searchLogsInput.value;
    renderHistoryTable();
  });

  loadSampleBtn.addEventListener('click', () => seedSampleWeek(true));

  exportCsvBtn.addEventListener('click', () => {
    const entries = getSortedEntries();
    if (!entries.length) {
      showToast('No logs to export.');
      return;
    }
    const header = 'Date,Lecture Hours,Revision Hours,Total Hours,Notes\n';
    const rows = entries
      .map(
        (e) =>
          `${e.date},${e.lectureHours},${e.revisionHours},${roundHours(
            e.lectureHours + e.revisionHours
          )},"${(e.notes || '').replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studypulse-${getLocalDateString(0)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  clearAllBtn.addEventListener('click', () => {
    if (!studyLogsMap.size) return;
    if (!confirm('Clear all study logs?')) return;
    studyLogsMap.clear();
    saveLogsToLocal();
    selectDate(selectedDate);
    showToast('Cleared all study logs.');
  });
}

// ============================================================================
// GOOGLE SIGN-IN & FIREBASE SYNC
// ============================================================================

function parseFirebaseConfigInput(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(
        match[0]
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
          .replace(/'/g, '"')
          .replace(/,\s*([}\]])/g, '$1')
      );
    } catch (e) {
      return null;
    }
  }
}

function updateAuthUI() {
  if (currentUser) {
    googleSignInBtn.classList.add('hidden');
    userProfileBar.classList.remove('hidden');
    userName.textContent = currentUser.displayName.split(' ')[0];
    userAvatar.src =
      currentUser.photoURL ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        currentUser.displayName
      )}&background=6366f1&color=fff&bold=true`;
    syncDot.className = 'status-dot cloud';
    syncStatusText.textContent = currentUser.mode === 'firebase' ? 'Cloud Synced' : 'Signed In';
  } else {
    googleSignInBtn.classList.remove('hidden');
    userProfileBar.classList.add('hidden');
    syncDot.className = 'status-dot local';
    syncStatusText.textContent = 'Local';
  }
}

async function loadFirebaseSDK() {
  if (firestoreModules) return firestoreModules;
  const [appMod, authMod, fsMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
  ]);
  firestoreModules = { ...appMod, ...authMod, ...fsMod };
  return firestoreModules;
}

async function initFirebaseWithConfig(configObj, triggerPopup = false) {
  try {
    firebaseModalStatus.textContent = 'Connecting to Firebase...';
    const fb = await loadFirebaseSDK();
    firebaseApp = fb.getApps().length === 0 ? fb.initializeApp(configObj) : fb.getApp();
    firebaseAuth = fb.getAuth(firebaseApp);
    firestoreDb = fb.getFirestore(firebaseApp);

    fb.onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        currentUser = {
          uid: user.uid,
          displayName: user.displayName || 'Google User',
          email: user.email || '',
          photoURL: user.photoURL || '',
          mode: 'firebase',
        };
        updateAuthUI();
        await startFirestoreSync(user.uid);
      }
    });

    if (triggerPopup) {
      const provider = new fb.GoogleAuthProvider();
      await fb.signInWithPopup(firebaseAuth, provider);
      authModal.classList.add('hidden');
      showToast('Signed in with Google Cloud!');
    }
    firebaseModalStatus.textContent = 'Firebase connected!';
  } catch (err) {
    firebaseModalStatus.textContent = `Error: ${err.message}`;
  }
}

async function startFirestoreSync(uid) {
  if (!firestoreDb || !firestoreModules) return;
  const { collection, doc, setDoc, onSnapshot } = firestoreModules;
  if (firestoreUnsubscribe) firestoreUnsubscribe();

  for (const entry of getSortedEntries()) {
    try {
      await setDoc(doc(firestoreDb, 'users', uid, 'studyLogs', entry.date), entry, { merge: true });
    } catch (_) {}
  }

  firestoreUnsubscribe = onSnapshot(collection(firestoreDb, 'users', uid, 'studyLogs'), (snap) => {
    snap.docChanges().forEach((ch) => {
      const d = ch.doc.data();
      if (ch.type === 'removed') {
        studyLogsMap.delete(ch.doc.id);
      } else if (d && d.date) {
        studyLogsMap.set(d.date, {
          date: d.date,
          lectureHours: roundHours(d.lectureHours),
          revisionHours: roundHours(d.revisionHours),
          notes: d.notes || '',
          updatedAt: d.updatedAt || Date.now(),
        });
      }
    });
    saveLogsToLocal();
    selectDate(selectedDate);
  });
}

async function pushEntryToFirestore(entry) {
  if (!firestoreDb || !firestoreModules || !currentUser?.uid) return;
  try {
    const { doc, setDoc } = firestoreModules;
    await setDoc(doc(firestoreDb, 'users', currentUser.uid, 'studyLogs', entry.date), entry, {
      merge: true,
    });
  } catch (_) {}
}

async function deleteEntryFromFirestore(dateStr) {
  if (!firestoreDb || !firestoreModules || !currentUser?.uid) return;
  try {
    const { doc, deleteDoc } = firestoreModules;
    await deleteDoc(doc(firestoreDb, 'users', currentUser.uid, 'studyLogs', dateStr));
  } catch (_) {}
}

function setupAuth() {
  const savedQuick = localStorage.getItem(STORAGE_KEYS.QUICK_USER);
  if (savedQuick) {
    try {
      currentUser = JSON.parse(savedQuick);
      updateAuthUI();
    } catch (_) {}
  }

  const savedCfg = localStorage.getItem(STORAGE_KEYS.FIREBASE_CFG);
  if (savedCfg) {
    firebaseConfigInput.value = savedCfg;
    const parsed = parseFirebaseConfigInput(savedCfg);
    if (parsed?.apiKey) initFirebaseWithConfig(parsed, false);
  }

  googleSignInBtn.addEventListener('click', () => authModal.classList.remove('hidden'));
  syncStatusBtn.addEventListener('click', () => authModal.classList.remove('hidden'));
  closeModalBtn.addEventListener('click', () => authModal.classList.add('hidden'));
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) authModal.classList.add('hidden');
  });

  quickGoogleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = quickNameInput.value.trim();
    const email = quickEmailInput.value.trim();
    if (!name || !email) return;

    currentUser = {
      uid: `quick_${email.toLowerCase()}`,
      displayName: name,
      email,
      photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(
        name
      )}&background=4285F4&color=fff&bold=true`,
      mode: 'quick',
    };
    localStorage.setItem(STORAGE_KEYS.QUICK_USER, JSON.stringify(currentUser));
    loadLogsFromLocal();
    saveLogsToLocal();
    updateAuthUI();
    selectDate(selectedDate);
    authModal.classList.add('hidden');
    showToast(`Signed in as ${name}!`);
  });

  saveFirebaseConfigBtn.addEventListener('click', async () => {
    const parsed = parseFirebaseConfigInput(firebaseConfigInput.value);
    if (!parsed || !parsed.apiKey || !parsed.projectId) {
      firebaseModalStatus.textContent = 'Please paste a valid Firebase config JSON.';
      return;
    }
    localStorage.setItem(STORAGE_KEYS.FIREBASE_CFG, JSON.stringify(parsed, null, 2));
    await initFirebaseWithConfig(parsed, true);
  });

  clearFirebaseConfigBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.FIREBASE_CFG);
    firebaseConfigInput.value = '';
    firebaseModalStatus.textContent = 'Reset Firebase config.';
  });

  signOutBtn.addEventListener('click', async () => {
    if (firebaseAuth && currentUser?.mode === 'firebase' && firestoreModules) {
      try {
        await firestoreModules.signOut(firebaseAuth);
      } catch (_) {}
    }
    localStorage.removeItem(STORAGE_KEYS.QUICK_USER);
    currentUser = null;
    updateAuthUI();
    loadLogsFromLocal();
    selectDate(selectedDate);
    showToast('Signed out.');
  });
}

// Initialize
function init() {
  setupAuth();
  loadLogsFromLocal();
  restoreTimerState();
  setupInteractions();
  renderTimerUI();
  selectDate(getLocalDateString(0));
}

init();
