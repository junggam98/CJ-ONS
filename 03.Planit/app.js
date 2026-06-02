/**
 * Planit — app.js
 * localStorage 기반 싱글페이지 앱 로직
 */

/* ===================================================
   STATE
=================================================== */
let currentDate = getTodayStr();
let currentView = 'daily';
let saveTimer = null;
let glossaryEditId = null;
let currentGlossaryTag = 'all';
let currentFeedbackTag = 'all';
let selectedGlossTags = [];
let selectedFeedbackTags = [];
let onboardingStep = 0;
let currentTheme = 'dark';
let dragSrcIndex = null;

/* ===================================================
   STORAGE HELPERS
=================================================== */
function getStorage() {
  try { return JSON.parse(localStorage.getItem('planner_v1') || '{}'); }
  catch { return {}; }
}
function setStorage(data) {
  localStorage.setItem('planner_v1', JSON.stringify(data));
}
function getDayData(date) {
  return getStorage()[date] || {};
}
function setDayData(date, patch) {
  const data = getStorage();
  data[date] = { ...(data[date] || {}), ...patch };
  setStorage(data);
}
function getGlossary() {
  return getStorage()['__glossary'] || [];
}
function setGlossary(terms) {
  const data = getStorage();
  data['__glossary'] = terms;
  setStorage(data);
}
function getFeedback() {
  return getStorage()['__feedback'] || [];
}
function setFeedback(items) {
  const data = getStorage();
  data['__feedback'] = items;
  setStorage(data);
}
function getUserInfo() {
  try { return JSON.parse(localStorage.getItem('planner_user') || '{}'); }
  catch { return {}; }
}
function setUserInfo(info) {
  localStorage.setItem('planner_user', JSON.stringify(info));
}

/* ===================================================
   DATE HELPERS
=================================================== */
function getTodayStr() {
  const d = new Date();
  return toDateStr(d);
}

function toDateStr(d) {
  // toISOString() returns UTC → timezone shift 방지를 위해 로컬 날짜 사용
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); // 정오로 설정해 DST 엣지케이스 방지
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  return {
    main: `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[d.getDay()]})`,
    sub: `${d.getFullYear()}년`,
  };
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/* ===================================================
   ONBOARDING
=================================================== */
function initOnboarding() {
  const user = getUserInfo();
  if (!user.name) {
    document.getElementById('onboarding-overlay').classList.remove('hidden');
  } else {
    document.getElementById('sidebar-username').textContent = user.name + ' 님';
  }
}

function nextStep() {
  if (onboardingStep === 0) {
    const nameInput = document.getElementById('user-name-input');
    const name = nameInput.value.trim();
    if (!name) {
      shake(nameInput);
      return;
    }
  }
  setStepDot(onboardingStep, false);
  setStep(onboardingStep, false);
  onboardingStep++;
  setStep(onboardingStep, true);
  setStepDot(onboardingStep, true);
}

function prevStep() {
  setStepDot(onboardingStep, false);
  setStep(onboardingStep, false);
  onboardingStep--;
  setStep(onboardingStep, true);
  setStepDot(onboardingStep, true);
}

function setStep(i, active) {
  document.getElementById(`step-${i}`)?.classList.toggle('active', active);
}
function setStepDot(i, active) {
  document.getElementById(`dot-${i}`)?.classList.toggle('active', active);
}

function finishOnboarding() {
  const name = document.getElementById('user-name-input').value.trim() || '기획자';
  setUserInfo({ name, joinDate: getTodayStr() });
  document.getElementById('sidebar-username').textContent = name + ' 님';
  document.getElementById('onboarding-overlay').classList.add('hidden');
}

/* ===================================================
   VIEW SWITCHING
=================================================== */
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.getElementById(`nav-${view}`).classList.add('active');

  if (view === 'dashboard') renderDashboard();
  if (view === 'glossary') renderGlossary();
}

/* ===================================================
   DAILY VIEW — DATE NAVIGATION
=================================================== */
function initDatePicker() {
  document.getElementById('date-picker').value = currentDate;
  updateDateDisplay();
}

function updateDateDisplay() {
  const { main, sub } = formatDate(currentDate);
  document.getElementById('date-main').textContent = main;
  document.getElementById('date-sub').textContent = sub;
  document.getElementById('date-picker').value = currentDate;
}

function navigateDate(offset) {
  currentDate = addDays(currentDate, offset);
  updateDateDisplay();
  loadDay(currentDate);
}

function goToToday() {
  currentDate = getTodayStr();
  updateDateDisplay();
  loadDay(currentDate);
}

/* ===================================================
   DAILY VIEW — LOAD / SAVE
=================================================== */
function loadDay(date) {
  if (date) currentDate = date;
  const day = getDayData(currentDate);

  // Emoji selectors
  ['weather', 'mood'].forEach(type => {
    const groupId = type === 'weather' ? 'weather-group' : 'mood-group';
    document.querySelectorAll(`#${groupId} .emoji-btn`).forEach(b => b.classList.remove('selected'));
    const val = day[type];
    if (val) {
      const btn = document.querySelector(`#${groupId} [data-value="${val}"]`);
      if (btn) btn.classList.add('selected');
    }
  });

  // Text fields
  const textFields = ['mindset', 'meetings', 'ideas', 'issues', 'learned', 'references', 'kpt-keep', 'kpt-problem', 'kpt-try', 'tomorrow'];
  textFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id.startsWith('kpt-')) {
      const key = id.replace('kpt-', '');
      el.value = day.kpt?.[key] || '';
    } else {
      el.value = day[id] || '';
    }
  });

  // Goals
  const goals = day.goals || ['', '', ''];
  document.querySelectorAll('.goal-input').forEach((inp, i) => {
    inp.value = goals[i] || '';
  });
  updateGoalCount();

  // Todos
  renderTodos(day.todos || []);

  // Learned terms
  renderLearnedTerms(day.learnedTerms || []);

  // Images
  renderDayImages(day.images || []);

  updateDateDisplay();
  triggerSaveIndicator();
}

function selectEmoji(type, btn) {
  const groupId = type === 'weather' ? 'weather-group' : 'mood-group';
  document.querySelectorAll(`#${groupId} .emoji-btn`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  scheduleSave();
}

/* ===== GOALS ===== */
function updateGoals() {
  updateGoalCount();
  scheduleSave();
}
function updateGoalCount() {
  const count = Array.from(document.querySelectorAll('.goal-input')).filter(i => i.value.trim()).length;
  document.getElementById('goal-count').textContent = `${count}/3`;
}

/* ===================================================
   TODOS
=================================================== */
function renderTodos(todos) {
  const list = document.getElementById('todo-list');
  list.innerHTML = '';
  todos.forEach((todo, i) => list.appendChild(createTodoEl(todo, i)));
  updateTodoProgress(todos);
}

function createTodoEl(todo, index) {
  const el = document.createElement('div');
  el.className = 'todo-item';
  el.setAttribute('draggable', 'true');
  el.dataset.index = index;

  el.innerHTML = `
    <span class="todo-drag-handle" aria-hidden="true" title="드래그로 순서 변경">${svgIcon('grip-vertical', 14)}</span>
    <div class="todo-checkbox ${todo.done ? 'checked' : ''}" onclick="toggleTodo(${index})" role="checkbox" aria-checked="${todo.done}" aria-label="${todo.done ? '완료됨' : '미완료'}"></div>
    <span class="todo-text ${todo.done ? 'done' : ''}" ondblclick="startEditTodo(${index})">${esc(todo.text)}</span>
    <button class="todo-edit-btn" onclick="startEditTodo(${index})" title="수정" aria-label="수정">${svgIcon('pencil', 12)}</button>
    <button class="todo-delete" onclick="deleteTodo(${index})" title="삭제" aria-label="삭제">${svgIcon('x', 12)}</button>
  `;

  // 드래그 이벤트
  el.addEventListener('dragstart', e => {
    dragSrcIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setTimeout(() => el.classList.add('dragging'), 0);
  });

  el.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });

  el.addEventListener('dragenter', e => {
    e.preventDefault();
    if (dragSrcIndex !== null && dragSrcIndex !== index) {
      el.classList.add('drag-over');
    }
  });

  el.addEventListener('dragleave', e => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
  });

  el.addEventListener('drop', e => {
    e.stopPropagation();
    e.preventDefault();
    el.classList.remove('drag-over');
    if (dragSrcIndex === null || dragSrcIndex === index) return;

    const day = getDayData(currentDate);
    const todos = day.todos || [];
    const [moved] = todos.splice(dragSrcIndex, 1);
    todos.splice(index, 0, moved);
    setDayData(currentDate, { todos });
    renderTodos(todos);
    triggerSaveIndicator();
    showToast('순서를 변경했어요!');
  });

  el.addEventListener('dragend', () => {
    document.querySelectorAll('.todo-item').forEach(item => {
      item.classList.remove('dragging', 'drag-over');
    });
    dragSrcIndex = null;
  });

  return el;
}

function startEditTodo(index) {
  const item = document.querySelector(`.todo-item[data-index="${index}"]`);
  if (!item) return;
  const span = item.querySelector('.todo-text');
  if (!span || span.querySelector('input')) return;

  const day = getDayData(currentDate);
  const todos = day.todos || [];
  const currentText = todos[index]?.text || '';

  // 편집 중에는 드래그 비활성화
  item.setAttribute('draggable', 'false');
  span.classList.remove('done');
  span.innerHTML = '';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-edit-input';
  input.value = currentText;
  span.appendChild(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const newText = input.value.trim();
    if (newText && todos[index]) {
      todos[index].text = newText;
      setDayData(currentDate, { todos });
      triggerSaveIndicator();
    }
    renderTodos(getDayData(currentDate).todos || []);
  };
  const cancel = () => {
    if (committed) return;
    committed = true;
    renderTodos(getDayData(currentDate).todos || []);
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commit(); }
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
}

function addTodo() {
  const input = document.getElementById('todo-input');
  const text = input.value.trim();
  if (!text) { shake(input); return; }
  const day = getDayData(currentDate);
  const todos = [...(day.todos || []), { text, done: false }];
  setDayData(currentDate, { todos });
  input.value = '';
  renderTodos(todos);
  triggerSaveIndicator();
}

function toggleTodo(index) {
  const day = getDayData(currentDate);
  const todos = day.todos || [];
  todos[index].done = !todos[index].done;
  setDayData(currentDate, { todos });
  renderTodos(todos);
  triggerSaveIndicator();
}

function deleteTodo(index) {
  const day = getDayData(currentDate);
  const todos = day.todos || [];
  todos.splice(index, 1);
  setDayData(currentDate, { todos });
  renderTodos(todos);
  triggerSaveIndicator();
}

function updateTodoProgress(todos) {
  const total = todos.length;
  const done = todos.filter(t => t.done).length;
  document.getElementById('todo-progress').textContent = `${done}/${total}`;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('todo-bar').style.width = pct + '%';
}

/* ===================================================
   COLLAPSIBLE SECTIONS
=================================================== */
function toggleSection(btn) {
  btn.classList.toggle('collapsed');
  const content = btn.nextElementSibling;
  content.classList.toggle('open');
}

/* ===================================================
   LEARNED TERMS (tags on daily view)
=================================================== */
function renderLearnedTerms(terms) {
  document.getElementById('learned-terms').innerHTML = terms.map((t, i) => `
    <div class="tag-chip">
      <span>${esc(t)}</span>
      <button onclick="removeLearnedTerm(${i})" aria-label="삭제">✕</button>
    </div>
  `).join('');
}

function addLearnedTerm() {
  const input = document.getElementById('term-input');
  const term = input.value.trim();
  if (!term) return;

  const day = getDayData(currentDate);
  const terms = day.learnedTerms || [];
  if (!terms.includes(term)) {
    terms.push(term);
    setDayData(currentDate, { learnedTerms: terms });

    // 용어 사전에 없으면 자동 추가
    const glossary = getGlossary();
    const alreadyExists = glossary.some(g => g.term.toLowerCase() === term.toLowerCase());
    if (!alreadyExists) {
      glossary.unshift({
        id: Date.now().toString(),
        term,
        definition: '',
        tags: [],
        date: currentDate,
        fromDaily: true,
      });
      setGlossary(glossary);
      document.getElementById('glossary-count').textContent = glossary.length;
      showToast(`"${term}"을(를) 용어 사전에 추가했어요! 용어 사전에서 설명을 채워보세요 📚`);
    }
  }

  input.value = '';
  renderLearnedTerms(terms);
  triggerSaveIndicator();
}

function removeLearnedTerm(index) {
  const day = getDayData(currentDate);
  const terms = day.learnedTerms || [];
  terms.splice(index, 1);
  setDayData(currentDate, { learnedTerms: terms });
  renderLearnedTerms(terms);
  triggerSaveIndicator();
}

/* ===================================================
   AUTO SAVE (debounce)
=================================================== */
function scheduleSave() {
  const indicator = document.getElementById('save-indicator');
  indicator.classList.add('saving');
  document.getElementById('save-text').textContent = '저장 중...';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrentDay, 900);
}

function saveCurrentDay() {
  const weather = document.querySelector('#weather-group .emoji-btn.selected')?.dataset.value || '';
  const mood = document.querySelector('#mood-group .emoji-btn.selected')?.dataset.value || '';
  const goals = Array.from(document.querySelectorAll('.goal-input')).map(i => i.value);

  setDayData(currentDate, {
    weather, mood,
    mindset: val('mindset'),
    goals,
    meetings: val('meetings'),
    ideas: val('ideas'),
    issues: val('issues'),
    learned: val('learned'),
    references: val('references'),
    kpt: {
      keep: val('kpt-keep'),
      problem: val('kpt-problem'),
      try: val('kpt-try'),
    },
    tomorrow: val('tomorrow'),
    savedAt: new Date().toISOString(),
  });
  triggerSaveIndicator();
}

function triggerSaveIndicator() {
  const indicator = document.getElementById('save-indicator');
  indicator.classList.remove('saving');
  document.getElementById('save-text').textContent = '자동 저장됨';
}

/* ===================================================
   GLOSSARY VIEW
=================================================== */
function renderGlossary() {
  const glossary = getGlossary();
  const search = (document.getElementById('glossary-search')?.value || '').toLowerCase();

  // Badge count
  document.getElementById('glossary-count').textContent = glossary.length;

  // Build tag filter pills
  const allTags = [...new Set(glossary.flatMap(g => g.tags || []))].sort();
  const filterContainer = document.getElementById('tag-filters');
  filterContainer.innerHTML = pill('all', '전체', currentGlossaryTag === 'all', "filterByTag(this)");
  allTags.forEach(tag => {
    filterContainer.innerHTML += pill(tag, tag, currentGlossaryTag === tag, "filterByTag(this)");
  });

  // Filter
  const filtered = glossary.filter(g => {
    const matchSearch = !search
      || g.term.toLowerCase().includes(search)
      || g.definition.toLowerCase().includes(search);
    const matchTag = currentGlossaryTag === 'all' || (g.tags || []).includes(currentGlossaryTag);
    return matchSearch && matchTag;
  });

  const grid = document.getElementById('glossary-grid');
  const empty = document.getElementById('glossary-empty');

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = filtered.map(renderGlossaryCard).join('');
}

function renderGlossaryCard(term) {
  const tags = (term.tags || []).map(t => `<span class="glossary-tag">${esc(t)}</span>`).join('');
  const date = term.date
    ? new Date(term.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : '';
  const fromDailyBadge = term.fromDaily
    ? `<span class="daily-origin-badge">배움 기록</span>`
    : '';
  const defHtml = term.definition
    ? `<div class="glossary-def">${esc(term.definition)}</div>`
    : `<div class="glossary-def glossary-def-empty" onclick="editGlossaryTerm('${term.id}')" title="클릭해서 설명 추가">설명을 추가해 주세요 →</div>`;

  return `
    <div class="glossary-card${!term.definition ? ' needs-def' : ''}" data-id="${term.id}">
      <div class="glossary-actions">
        <button class="icon-btn" onclick="editGlossaryTerm('${term.id}')" title="수정" aria-label="수정">${svgIcon('pencil', 13)}</button>
        <button class="icon-btn" onclick="deleteGlossaryTerm('${term.id}')" title="삭제" aria-label="삭제">${svgIcon('trash-2', 13)}</button>
      </div>
      <div class="glossary-term">${esc(term.term)}${fromDailyBadge}</div>
      ${defHtml}
      <div class="glossary-footer">
        <div class="glossary-tags">${tags}</div>
        <span class="glossary-date">${date}</span>
      </div>
    </div>
  `;
}

function filterGlossary() { renderGlossary(); }

function filterByTag(btn) {
  currentGlossaryTag = btn.dataset.tag;
  renderGlossary();
}

/* Glossary Modal */
function openGlossaryModal(id = null) {
  glossaryEditId = id;
  selectedGlossTags = [];

  // Reset form
  ['gloss-term', 'gloss-def', 'gloss-custom-tag'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('#gloss-preset-tags .preset-tag').forEach(b => b.classList.remove('selected'));
  document.getElementById('gloss-selected-tags').innerHTML = '';
  document.getElementById('glossary-modal-title').textContent = id ? '용어 수정' : '용어 추가';

  if (id) {
    const term = getGlossary().find(g => g.id === id);
    if (term) {
      document.getElementById('gloss-term').value = term.term;
      document.getElementById('gloss-def').value = term.definition;
      selectedGlossTags = [...(term.tags || [])];
      selectedGlossTags.forEach(tag => {
        const btn = document.querySelector(`#gloss-preset-tags [data-tag="${tag}"]`);
        if (btn) btn.classList.add('selected');
      });
      renderSelectedTagsFor('gloss');
    }
  }

  openModal('glossary-modal');
  setTimeout(() => document.getElementById('gloss-term')?.focus(), 120);
}

function closeGlossaryModal(e) {
  if (e && e.target !== document.getElementById('glossary-modal')) return;
  closeModal('glossary-modal');
}

function togglePresetTag(btn, scope) {
  const tag = btn.dataset.tag;
  const arr = scope === 'gloss' ? selectedGlossTags : selectedFeedbackTags;
  const idx = arr.indexOf(tag);
  if (idx > -1) { arr.splice(idx, 1); btn.classList.remove('selected'); }
  else { arr.push(tag); btn.classList.add('selected'); }
  renderSelectedTagsFor(scope);
}

function addCustomTag(scope) {
  const inputId = scope === 'gloss' ? 'gloss-custom-tag' : 'feedback-custom-tag';
  const input = document.getElementById(inputId);
  if (!input) return;
  const tag = input.value.trim();
  const arr = scope === 'gloss' ? selectedGlossTags : selectedFeedbackTags;
  if (tag && !arr.includes(tag)) {
    arr.push(tag);
    input.value = '';
    renderSelectedTagsFor(scope);
  }
}

function renderSelectedTagsFor(scope) {
  const arr = scope === 'gloss' ? selectedGlossTags : selectedFeedbackTags;
  const containerId = scope === 'gloss' ? 'gloss-selected-tags' : 'feedback-selected-tags';
  document.getElementById(containerId).innerHTML = arr.map((t, i) => `
    <div class="tag-chip">
      <span>${esc(t)}</span>
      <button onclick="removeTagFromScope(${i},'${scope}')" aria-label="삭제">✕</button>
    </div>
  `).join('');
}

function removeTagFromScope(i, scope) {
  const arr = scope === 'gloss' ? selectedGlossTags : selectedFeedbackTags;
  const tag = arr[i];
  arr.splice(i, 1);
  const presetSelector = scope === 'gloss' ? '#gloss-preset-tags' : '#feedback-preset-tags';
  const btn = document.querySelector(`${presetSelector} [data-tag="${tag}"]`);
  if (btn) btn.classList.remove('selected');
  renderSelectedTagsFor(scope);
}

function saveGlossaryTerm() {
  const term = document.getElementById('gloss-term').value.trim();
  const definition = document.getElementById('gloss-def').value.trim();

  if (!term) { shake(document.getElementById('gloss-term')); return; }
  if (!definition) { shake(document.getElementById('gloss-def')); return; }

  const glossary = getGlossary();
  if (glossaryEditId) {
    const i = glossary.findIndex(g => g.id === glossaryEditId);
    if (i !== -1) glossary[i] = { ...glossary[i], term, definition, tags: [...selectedGlossTags] };
  } else {
    glossary.unshift({
      id: Date.now().toString(),
      term, definition,
      tags: [...selectedGlossTags],
      date: getTodayStr(),
    });
  }

  setGlossary(glossary);
  closeModal('glossary-modal');
  renderGlossary();
}

function editGlossaryTerm(id) { openGlossaryModal(id); }

function deleteGlossaryTerm(id) {
  if (!confirm('이 용어를 삭제할까요?')) return;
  setGlossary(getGlossary().filter(g => g.id !== id));
  renderGlossary();
}

/* ===================================================
   DASHBOARD
=================================================== */
function renderDashboard() {
  renderStats();
  renderHeatmap();
  renderKPTSummary();
  renderFeedbackNotes();
}

function renderStats() {
  const data = getStorage();
  const dayKeys = Object.keys(data).filter(k => !k.startsWith('__') && /^\d{4}-\d{2}-\d{2}$/.test(k));

  document.getElementById('stat-streak').textContent = calculateStreak(dayKeys);
  document.getElementById('stat-completion').textContent = calculateWeeklyCompletion(data) + '%';
  document.getElementById('stat-terms').textContent = getGlossary().length;
  document.getElementById('stat-records').textContent = dayKeys.length;
}

function calculateStreak(keys) {
  if (!keys.length) return 0;
  const sorted = [...keys].sort();
  const today = getTodayStr();
  let streak = 0;
  let check = today;
  for (let i = 0; i < 400; i++) {
    if (sorted.includes(check)) {
      streak++;
      check = addDays(check, -1);
    } else {
      if (i === 0) { check = addDays(today, -1); if (sorted.includes(check)) { continue; } }
      break;
    }
  }
  return streak;
}

function calculateWeeklyCompletion(data) {
  let total = 0, done = 0;
  for (let i = 0; i < 7; i++) {
    const key = addDays(getTodayStr(), -i);
    const day = data[key];
    if (day?.todos?.length) {
      total += day.todos.length;
      done += day.todos.filter(t => t.done).length;
    }
  }
  return total > 0 ? Math.round(done / total * 100) : 0;
}

function renderHeatmap() {
  const data = getStorage();
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayStr = getTodayStr();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  // Update title
  document.getElementById('heatmap-title').textContent = `📅 ${month + 1}월 기록 현황`;

  const container = document.getElementById('heatmap');
  container.innerHTML = '';

  // Day labels
  const labels = document.createElement('div');
  labels.className = 'heatmap-day-labels';
  ['일', '월', '화', '수', '목', '금', '토'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'heatmap-day-label';
    el.textContent = d;
    labels.appendChild(el);
  });
  container.appendChild(labels);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'heatmap-week-grid';

  // Empty prefix cells
  for (let i = 0; i < firstDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'heatmap-day empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayData = data[dateStr];
    const level = getDayLevel(dayData);

    const cell = document.createElement('div');
    cell.className = `heatmap-day l${level}${dateStr === todayStr ? ' today' : ''}`;
    cell.title = `${month + 1}/${d}: ${level > 0 ? '기록됨' : '기록 없음'}`;
    cell.textContent = d;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${month + 1}월 ${d}일 기록 보기`);
    cell.onclick = () => {
      currentDate = dateStr;
      switchView('daily');
      loadDay(dateStr);
    };
    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

function getDayLevel(dayData) {
  if (!dayData) return 0;
  let score = 0;
  if (dayData.mindset || (dayData.goals || []).some(g => g)) score++;
  if ((dayData.todos || []).length > 0) score++;
  if (dayData.learned || dayData.meetings) score++;
  if (dayData.kpt?.keep || dayData.kpt?.problem) score++;
  return Math.min(score, 3);
}

function renderKPTSummary() {
  const data = getStorage();
  const records = Object.keys(data)
    .filter(k => !k.startsWith('__') && /^\d{4}-\d{2}-\d{2}$/.test(k))
    .filter(k => {
      const kpt = data[k].kpt;
      return kpt && (kpt.keep || kpt.problem || kpt.try);
    })
    .sort().reverse().slice(0, 5);

  const container = document.getElementById('kpt-summary');
  if (!records.length) {
    container.innerHTML = '<div class="empty-state-inline">아직 회고 기록이 없어요. 오늘의 기록에서 KPT를 작성해보세요!</div>';
    return;
  }

  container.innerHTML = records.map(date => {
    const { kpt } = data[date];
    const { main } = formatDate(date);
    const trunc = (str, n) => str ? (str.length > n ? str.substring(0, n) + '…' : str) : '—';
    return `
      <div class="kpt-summary-item">
        <div class="kpt-summary-date">${main}</div>
        <div class="kpt-summary-body">
          <div class="kpt-summary-col keep">
            <div class="kpt-col-label">✅ Keep</div>
            <p>${esc(trunc(kpt.keep, 80))}</p>
          </div>
          <div class="kpt-summary-col problem">
            <div class="kpt-col-label">⚠️ Problem</div>
            <p>${esc(trunc(kpt.problem, 80))}</p>
          </div>
          <div class="kpt-summary-col try">
            <div class="kpt-col-label">🚀 Try</div>
            <p>${esc(trunc(kpt.try, 80))}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ===================================================
   FEEDBACK NOTES
=================================================== */
function renderFeedbackNotes() {
  const feedback = getFeedback();
  const allTags = [...new Set(feedback.flatMap(f => f.tags || []))].sort();

  // Tag filters
  const filterContainer = document.getElementById('feedback-tag-filters');
  filterContainer.innerHTML = pill('all', '전체', currentFeedbackTag === 'all', "filterFeedback(this)");
  allTags.forEach(tag => {
    filterContainer.innerHTML += pill(tag, tag, currentFeedbackTag === tag, "filterFeedback(this)");
  });

  // Filter
  const filtered = feedback.filter(f =>
    currentFeedbackTag === 'all' || (f.tags || []).includes(currentFeedbackTag)
  );

  const grid = document.getElementById('feedback-grid');
  const empty = document.getElementById('feedback-empty');

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = filtered.map(renderFeedbackCard).join('');
}

function renderFeedbackCard(f) {
  const tags = (f.tags || []).map(t => `<span class="feedback-tag">${esc(t)}</span>`).join('');
  const date = f.date
    ? new Date(f.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : '';
  return `
    <div class="feedback-card" data-id="${f.id}">
      <div class="feedback-actions">
        <button class="icon-btn" onclick="deleteFeedback('${f.id}')" title="삭제" aria-label="삭제">${svgIcon('trash-2', 13)}</button>
      </div>
      <div class="feedback-from">${svgIcon('message-circle', 13)} ${esc(f.from || '출처 미상')}</div>
      <div class="feedback-content">${esc(f.content)}</div>
      <div class="feedback-footer">
        <div class="feedback-tags">${tags}</div>
        <span class="feedback-date">${date}</span>
      </div>
    </div>
  `;
}

function filterFeedback(btn) {
  currentFeedbackTag = btn.dataset.tag;
  renderFeedbackNotes();
}

function openFeedbackModal() {
  selectedFeedbackTags = [];
  document.getElementById('feedback-content').value = '';
  document.getElementById('feedback-from').value = '';
  document.getElementById('feedback-selected-tags').innerHTML = '';
  document.querySelectorAll('#feedback-preset-tags .preset-tag').forEach(b => b.classList.remove('selected'));
  openModal('feedback-modal');
  setTimeout(() => document.getElementById('feedback-content')?.focus(), 120);
}

function closeFeedbackModal(e) {
  if (e && e.target !== document.getElementById('feedback-modal')) return;
  closeModal('feedback-modal');
}

function saveFeedback() {
  const content = document.getElementById('feedback-content').value.trim();
  if (!content) { shake(document.getElementById('feedback-content')); return; }

  const feedback = getFeedback();
  feedback.unshift({
    id: Date.now().toString(),
    content,
    from: document.getElementById('feedback-from').value.trim(),
    tags: [...selectedFeedbackTags],
    date: getTodayStr(),
  });
  setFeedback(feedback);
  closeModal('feedback-modal');
  renderFeedbackNotes();
}

function deleteFeedback(id) {
  if (!confirm('이 피드백을 삭제할까요?')) return;
  setFeedback(getFeedback().filter(f => f.id !== id));
  renderFeedbackNotes();
}

/* ===================================================
   EXPORT
=================================================== */
function exportData(format) {
  const data = getStorage();
  const user = getUserInfo();

  if (format === 'json') {
    const blob = new Blob([JSON.stringify({ user, data }, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `Planit_${getTodayStr()}.json`);
  } else if (format === 'csv') {
    const dayKeys = Object.keys(data)
      .filter(k => !k.startsWith('__') && /^\d{4}-\d{2}-\d{2}$/.test(k))
      .sort();

    const headers = ['날짜', '날씨', '기분', '마음가짐', '목표1', '목표2', '목표3',
      '할일완료', '할일전체', '오늘배운것', 'Keep', 'Problem', 'Try', '내일준비'];

    const rows = dayKeys.map(date => {
      const d = data[date];
      const todos = d.todos || [];
      const row = [
        date,
        d.weather || '',
        d.mood || '',
        d.mindset || '',
        (d.goals || [])[0] || '',
        (d.goals || [])[1] || '',
        (d.goals || [])[2] || '',
        todos.filter(t => t.done).length,
        todos.length,
        d.learned || '',
        d.kpt?.keep || '',
        d.kpt?.problem || '',
        d.kpt?.try || '',
        d.tomorrow || '',
      ];
      return row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    // UTF-8 BOM for Excel compatibility
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `Planit_${getTodayStr()}.csv`);
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


/* ===================================================
   IMAGE PASTE / UPLOAD
=================================================== */
function compressImage(dataUrl, maxWidth = 1400, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * maxWidth / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function addDayImage(dataUrl) {
  const compressed = await compressImage(dataUrl);
  const day = getDayData(currentDate);
  const images = day.images || [];
  images.push({ id: Date.now().toString(), dataUrl: compressed, addedAt: new Date().toISOString() });
  try {
    setDayData(currentDate, { images });
    renderDayImages(images);
    triggerSaveIndicator();
    showToast('이미지를 추가했어요! 📸');
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      showToast('저장 공간이 부족합니다. 이미지를 삭제해 주세요.');
    }
  }
}

function renderDayImages(images) {
  const grid = document.getElementById('day-images');
  const hint = document.getElementById('image-paste-hint');
  if (!grid) return;

  const hasImages = images && images.length > 0;
  if (hint) hint.style.display = hasImages ? 'none' : '';

  grid.innerHTML = hasImages
    ? images.map(img => `
        <div class="day-image-item">
          <img src="${img.dataUrl}" class="day-image-thumb"
            onclick="openImageLightbox('${img.id}')" alt="캡처 이미지" loading="lazy" />
          <button class="day-image-delete" onclick="deleteDayImage('${img.id}')" title="삭제" aria-label="이미지 삭제">✕</button>
        </div>`).join('')
    : '';
}

function deleteDayImage(id) {
  const day = getDayData(currentDate);
  const images = (day.images || []).filter(img => img.id !== id);
  setDayData(currentDate, { images });
  renderDayImages(images);
  triggerSaveIndicator();
}

function openImageLightbox(id) {
  const day = getDayData(currentDate);
  const img = (day.images || []).find(i => i.id === id);
  if (!img) return;
  document.getElementById('lightbox-img').src = img.dataUrl;
  document.getElementById('image-lightbox').classList.add('open');
}

function closeImageLightbox(e) {
  if (e && e.target !== document.getElementById('image-lightbox')) return;
  document.getElementById('image-lightbox').classList.remove('open');
}

function handleImageFileSelect(e) {
  const files = [...(e.target.files || [])].filter(f => f.type.startsWith('image/'));
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => addDayImage(ev.target.result);
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function setupImagePasteZone() {
  const zone = document.getElementById('image-paste-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-active'); });
  zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-active'); });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-active');
    [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/')).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => addDayImage(ev.target.result);
      reader.readAsDataURL(file);
    });
  });
}

/* ===================================================
   PDF EXPORT (html2canvas + jsPDF — 실제 파일 다운로드)
=================================================== */
async function renderPDF(container, filename) {
  if (!window.html2canvas || !window.jspdf) {
    showToast('PDF 라이브러리 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  document.body.appendChild(container);
  showToast('PDF 생성 중...');
  try {
    const canvas = await html2canvas(container, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
    });
    document.body.removeChild(container);

    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF('p', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    let heightLeft = imgH;
    let yPos = 0;
    pdf.addImage(imgData, 'JPEG', 0, yPos, imgW, imgH);
    heightLeft -= pdfH;
    while (heightLeft > 0) {
      yPos -= pdfH;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, yPos, imgW, imgH);
      heightLeft -= pdfH;
    }
    pdf.save(filename);
    showToast('PDF 저장 완료! 📄');
  } catch (e) {
    if (document.body.contains(container)) document.body.removeChild(container);
    showToast('PDF 생성에 실패했습니다.');
    console.error(e);
  }
}

function makePDFContainer(innerHtml) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;padding:52px;' +
    'font-family:Pretendard,"Noto Sans KR",sans-serif;color:#1e1b3c;line-height:1.65;z-index:-1;';
  el.innerHTML = innerHtml;
  return el;
}

async function exportLearningPDF() {
  const day  = getDayData(currentDate);
  const { main, sub } = formatDate(currentDate);
  const user = getUserInfo();
  const eh   = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const br   = s => eh(s).replace(/\n/g,'<br>');
  const images = day.images || [];

  const imagesHtml = images.length > 0 ? `
    <div style="margin-bottom:28px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#7b5cf6;border-bottom:1px solid #ede9fe;padding-bottom:6px;margin-bottom:12px;">캡처 이미지</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${images.map(img=>`<img src="${img.dataUrl}" style="max-width:330px;max-height:240px;border-radius:8px;border:1px solid #ede9fe;object-fit:contain;" />`).join('')}
      </div>
    </div>` : '';

  const html = `
    <div style="border-bottom:2.5px solid #7b5cf6;padding-bottom:18px;margin-bottom:32px;">
      <div style="background:#ede9fe;color:#7b5cf6;border-radius:50px;padding:3px 14px;font-size:11px;font-weight:700;letter-spacing:.06em;display:inline-block;margin-bottom:10px;">배움 기록</div>
      <div style="font-size:22px;font-weight:800;color:#1e1b3c;margin-bottom:3px;">${eh(main)} ${eh(sub)}</div>
      <div style="font-size:13px;color:#8688b2;">${eh(user.name||'기획자')} 님의 배움 기록</div>
    </div>
    <div style="margin-bottom:28px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#7b5cf6;border-bottom:1px solid #ede9fe;padding-bottom:6px;margin-bottom:12px;">오늘 배운 것</div>
      <div style="font-size:14px;line-height:1.85;color:#3a3858;">${br(day.learned)||'<span style="color:#b0b0cc;font-style:italic;">기록 없음</span>'}</div>
    </div>
    <div style="margin-bottom:28px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#7b5cf6;border-bottom:1px solid #ede9fe;padding-bottom:6px;margin-bottom:12px;">새로 알게 된 용어</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${(day.learnedTerms||[]).length>0
          ? (day.learnedTerms||[]).map(t=>`<span style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:50px;padding:3px 12px;font-size:12px;color:#7b5cf6;font-weight:600;">${eh(t)}</span>`).join('')
          : '<span style="color:#b0b0cc;font-style:italic;font-size:13px;">기록 없음</span>'}
      </div>
    </div>
    <div style="margin-bottom:28px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#7b5cf6;border-bottom:1px solid #ede9fe;padding-bottom:6px;margin-bottom:12px;">참고 자료 / 레퍼런스</div>
      <div style="font-size:14px;line-height:1.85;color:#3a3858;">${br(day.references)||'<span style="color:#b0b0cc;font-style:italic;">기록 없음</span>'}</div>
    </div>
    ${imagesHtml}
    <div style="margin-top:48px;padding-top:14px;border-top:1px solid #ede9fe;display:flex;justify-content:space-between;font-size:11px;color:#b0b0cc;">
      <span>Planit</span>
      <span>${new Date().toLocaleDateString('ko-KR')} 출력</span>
    </div>`;

  await renderPDF(makePDFContainer(html), `배움기록_${currentDate}.pdf`);
}

async function exportWorkPDF() {
  const day  = getDayData(currentDate);
  const { main, sub } = formatDate(currentDate);
  const user = getUserInfo();
  const eh   = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const br   = s => eh(s).replace(/\n/g,'<br>');
  const sec  = (label, content) => `
    <div style="margin-bottom:28px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#4facfe;border-bottom:1px solid #e0eeff;padding-bottom:6px;margin-bottom:12px;">${label}</div>
      <div style="font-size:14px;line-height:1.85;color:#3a3858;">${br(content)||'<span style="color:#b0b0cc;font-style:italic;">기록 없음</span>'}</div>
    </div>`;

  const html = `
    <div style="border-bottom:2.5px solid #4facfe;padding-bottom:18px;margin-bottom:32px;">
      <div style="background:#ebf5ff;color:#4facfe;border-radius:50px;padding:3px 14px;font-size:11px;font-weight:700;letter-spacing:.06em;display:inline-block;margin-bottom:10px;">업무 기록</div>
      <div style="font-size:22px;font-weight:800;color:#1e1b3c;margin-bottom:3px;">${eh(main)} ${eh(sub)}</div>
      <div style="font-size:13px;color:#8688b2;">${eh(user.name||'기획자')} 님의 업무 기록</div>
    </div>
    ${sec('회의 메모', day.meetings)}
    ${sec('아이디어 메모', day.ideas)}
    ${sec('이슈 &amp; 해결', day.issues)}
    <div style="margin-top:48px;padding-top:14px;border-top:1px solid #e0eeff;display:flex;justify-content:space-between;font-size:11px;color:#b0b0cc;">
      <span>Planit</span>
      <span>${new Date().toLocaleDateString('ko-KR')} 출력</span>
    </div>`;

  await renderPDF(makePDFContainer(html), `업무기록_${currentDate}.pdf`);
}

/* ===================================================
   THEME TOGGLE
=================================================== */
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('planner_theme', currentTheme);
}

/* ===================================================
   TOAST
=================================================== */
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ===================================================
   MODAL HELPERS
=================================================== */
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

/* ===================================================
   UTILITY
=================================================== */
function val(id) {
  return document.getElementById(id)?.value || '';
}

// 동적 렌더링용 인라인 SVG 헬퍼 (Lucide 스타일)
function svgIcon(name, size = 14) {
  const sw = 2; // stroke-width
  const paths = {
    'pencil':       '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    'trash-2':      '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'x':            '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'grip-vertical':'<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    'message-circle':'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">${paths[name] || ''}</svg>`;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}

function pill(tag, label, isActive, clickHandler) {
  return `<button class="tag-filter ${isActive ? 'active' : ''}" data-tag="${esc(tag)}" onclick="${clickHandler}">${esc(label)}</button>`;
}

function shake(el) {
  if (!el) return;
  el.style.transition = 'none';
  el.style.borderColor = 'var(--danger)';
  el.focus();
  setTimeout(() => { el.style.borderColor = ''; el.style.transition = ''; }, 1600);
}

/* ===================================================
   INIT
=================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // 저장된 테마 적용
  const savedTheme = localStorage.getItem('planner_theme') || 'dark';
  currentTheme = savedTheme;
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Lucide 2D 아이콘 렌더링
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  initOnboarding();
  initDatePicker();
  loadDay(currentDate);
  renderGlossary();
  setupImagePasteZone();

  // Global keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentDay();
    }
  });

  // 전역 이미지 붙여넣기 (Ctrl+V)
  document.addEventListener('paste', e => {
    if (currentView !== 'daily') return;
    const imageItem = [...(e.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => addDayImage(ev.target.result);
      reader.readAsDataURL(file);
    }
  });
});
