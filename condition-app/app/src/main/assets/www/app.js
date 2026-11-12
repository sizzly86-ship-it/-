'use strict';
/* 컨디션 노트 — 상태, 저장, 이벤트, 폰 기능 연결. 화면은 views.js, 계산은 logic.js. */

/* ---------- 네이티브 브리지 (브라우저 미리보기에서는 localStorage로 대체) ---------- */
var N = window.Native || {
  loadData: function () { try { return localStorage.getItem('cond') || ''; } catch (e) { return ''; } },
  saveData: function (j) { try { localStorage.setItem('cond', j); } catch (e) {} },
  hasUsageAccess: function () { return false; },
  openUsageAccess: function () { toast('안드로이드 앱에서만 동작합니다'); },
  getSessions: function () { return '[]'; },
  setReminders: function () {},
  notifPermission: function () { return 'granted'; },
  requestNotif: function () {},
  exportFile: function (name, mime, text) { console.log(name, text.length); toast('안드로이드 앱에서만 동작합니다'); },
  shareText: function (t) { console.log(t); toast('안드로이드 앱에서만 동작합니다'); },
  importData: function () { toast('안드로이드 앱에서만 동작합니다'); },
  launchTarget: function () { return ''; }
};

/* ---------- 상태 ---------- */
// 저장 파일이 깨졌으면 새 데이터로 덮어쓰기 전에 따로 보관하고, 하루 전 자동 백업에서 복구를 시도한다
function tryParse(raw) { try { var j = JSON.parse(raw); return j && j.days ? L.normalize(j) : null; } catch (e) { return null; } }
var S = null, loadNote = '';
(function () {
  var raw = N.loadData();
  if (raw) S = tryParse(raw);
  if (raw && !S) {
    if (N.quarantine) N.quarantine();
    var bak = N.loadBackup ? N.loadBackup() : '';
    S = bak ? tryParse(bak) : null;
    loadNote = S ? '저장 파일이 손상되어 최근 백업으로 복구했어요' : '저장 파일을 읽지 못해 새로 시작합니다';
  }
  if (!S) S = L.freshState();
})();

function today() { return L.todayOf(Date.now()); }
var ui = { tab: 'today', date: today(), editSleep: false, focus: '', month: '', period: 30, sheet: null, ob: 0, chartPts: [], chartW: 340 };

var saveTimer = null, lastPushed = '';
function save() { clearTimeout(saveTimer); saveTimer = null; N.saveData(JSON.stringify(S)); pushReminders(); }
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); } // 글자 입력 중에는 잠깐 모았다가 저장
function flush() { if (saveTimer) save(); }
function day(d) {
  if (!S.days[d]) S.days[d] = { log: {} };
  if (!S.days[d].log) S.days[d].log = {};
  return S.days[d];
}
function peek(d) { return S.days[d] || { log: {} }; }
function itemById(id) { return S.items.filter(function (x) { return x.id === id; })[0]; }
function remindersOn() { return L.REMINDERS.some(function (r) { return S.settings.rem[r[0]].on; }); }
// 알림 설정이나 "오늘 이미 기록함" 상태가 바뀌었을 때만 폰에 다시 예약한다
function pushReminders(force) {
  if (!S.onboarded) return; // 첫 실행 안내를 마치기 전에는 알림을 걸지 않는다
  var p = JSON.stringify(L.reminderPayload(S, today()));
  if (!force && p === lastPushed) return;
  lastPushed = p; N.setReminders(p);
}
function statPairs() { return ui.period ? L.pairs(S, L.addDays(today(), -(ui.period - 1))) : L.pairs(S); }

var toastTimer;
function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 2400);
}
function tick() { if (N.haptic) N.haptic(); }

/* ---------- 수면 자동 추정 ---------- */
function sleepWindow(d) {
  var start = L.parse(L.addDays(d, -1)); start.setHours(18);
  var end = L.parse(d); end.setHours(15);
  return [start.getTime(), Math.min(end.getTime(), Date.now())];
}
// d일 아침의 수면을 추정해 넣는다. 창(오후 3시)이 닫히기 전의 결과는 임시(prov)로 표시해 두고 나중에 다시 계산한다
function applySleep(d, sessions) {
  var w = sleepWindow(d), cur = peek(d).sleep;
  if (w[1] <= w[0]) return false;
  var closed = Date.now() >= L.parse(d).setHours(15);
  var r = estimateSleep(sessions, w[0], w[1], { minorMin: S.settings.minorMin, minWake: L.parse(d).setHours(2) });
  if (r) {
    day(d).sleep = { bed: r.bed, wake: r.wake, wakeups: r.wakeups };
    if (!closed) S.days[d].sleep.prov = true;
    return true;
  }
  if (cur && cur.prov && closed) { delete cur.prov; return true; }
  return false;
}
function refreshSleep() {
  if (!N.hasUsageAccess()) return;
  var t = today(), from = sleepWindow(L.addDays(t, -6))[0], sessions;
  try { sessions = JSON.parse(N.getSessions(String(from), String(Date.now()))); } catch (e) { return; }
  var changed = false;
  for (var i = 0; i <= 6; i++) {
    var d = L.addDays(t, -i), cur = peek(d).sleep;
    if (cur && (cur.manual || (i > 0 && !cur.prov))) continue; // 직접 입력했거나 이미 확정된 지난 날은 건드리지 않는다
    if (applySleep(d, sessions)) changed = true;
  }
  if (changed) save();
}
function refreshSleepFor(d) {
  if (!N.hasUsageAccess()) return;
  var w = sleepWindow(d);
  try { if (applySleep(d, JSON.parse(N.getSessions(String(w[0]), String(w[1]))))) save(); } catch (e) {}
}

/* ---------- 날씨·대기질 (Open-Meteo, 키 필요 없음) ---------- */
function getJson(url) {
  return fetch(url).then(function (r) { return r.json(); }).then(function (j) { return j && !j.error ? j : null; }).catch(function () { return null; });
}
var weatherBusy = false;
function refreshWeather() {
  var c = L.CITIES.filter(function (x) { return x[0] === S.settings.city; })[0];
  if (!c || weatherBusy) return;
  if (S.weatherAt && Date.now() - S.weatherAt < 3 * 3600000 && S.weatherCity === c[0]) return;
  var t = today(), q = 'latitude=' + c[1] + '&longitude=' + c[2] + '&timezone=Asia%2FSeoul&past_days=31&forecast_days=1';
  weatherBusy = true;
  Promise.all([
    getJson('https://api.open-meteo.com/v1/forecast?' + q + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,surface_pressure_mean'),
    getJson('https://air-quality-api.open-meteo.com/v1/air-quality?' + q + '&hourly=pm10,pm2_5')
  ]).then(function (res) {
    weatherBusy = false;
    var j = res[0], air = res[1] && res[1].hourly ? L.dailyAir(res[1].hourly) : {};
    if (!j || !j.daily || !j.daily.time) return; // 실패하면 다음에 앱을 열 때 다시 시도한다
    if (S.settings.city !== c[0]) { refreshWeather(); return; } // 받는 사이 지역을 바꿨으면 새 지역으로 다시
    var D = j.daily, realToday = L.fmt(new Date()), recent = L.addDays(t, -7);
    D.time.forEach(function (d, i) {
      if (D.temperature_2m_max[i] == null || D.temperature_2m_min[i] == null) return;
      if (!S.days[d] && d < recent) return; // 기록이 없는 오래된 날까지 채우지는 않는다
      var a = air[d] || {}, old = peek(d).weather, keep = old && old.city === c[0] ? old : {};
      day(d).weather = {
        tmax: D.temperature_2m_max[i], tmin: D.temperature_2m_min[i],
        rain: D.precipitation_sum ? D.precipitation_sum[i] : null, hum: D.relative_humidity_2m_mean ? D.relative_humidity_2m_mean[i] : null,
        pres: D.surface_pressure_mean ? D.surface_pressure_mean[i] : null,
        // 대기질 요청만 실패했으면 전에 받아 둔 값을 지우지 않는다
        pm10: a.pm10 != null ? a.pm10 : (keep.pm10 != null ? keep.pm10 : null), pm25: a.pm25 != null ? a.pm25 : (keep.pm25 != null ? keep.pm25 : null),
        city: c[0], final: d < realToday
      };
    });
    S.weatherAt = Date.now(); S.weatherCity = c[0];
    save();
    if (!document.activeElement || !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) render(); // 입력 중이면 화면을 갈아엎지 않는다
  });
}

/* ---------- 그리기 ---------- */
var VIEWS = { today: viewHome, history: viewHistory, stats: viewStats, settings: viewSettings };
// 테마별 [상태바 색, 아래 내비게이션 바 색, 밝은 배경 여부]
var CHROME = { a: ['#f2f4f6', '#ffffff', true], b: ['#0d1020', '#12162a', false], c: ['#f5efe6', '#fffdf8', true] };
var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  var th = S.settings.theme || 'a';
  if (S.settings.autoNight && darkQuery && darkQuery.matches) th = 'b';
  document.documentElement.dataset.theme = th;
  var c = CHROME[th];
  if (N.setChrome) N.setChrome(c[0], S.onboarded ? c[1] : c[0], c[2]);
}
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', function () { applyTheme(); render(); });
function render() {
  var v = document.getElementById('view'), y = window.scrollY, ob = !S.onboarded;
  document.body.classList.toggle('onboarding', ob);
  v.innerHTML = ob ? viewOnboarding() : VIEWS[ui.tab]();
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    var on = b.dataset.tab === ui.tab; b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (!ob && ui.tab === 'stats') bindChart();
  window.scrollTo(0, y);
  if (ui.sheet && EDIT_SHEETS[ui.sheet.type]) renderSheet(); // 입력 창이 열려 있으면 그 안의 선택 표시도 갱신
}
// animate: 처음 열 때만 아래에서 올라오는 움직임을 준다. 다시 그릴 때는 스크롤 위치를 지킨다
function renderSheet(animate) {
  var el = document.getElementById('sheet'), old = el.querySelector('.sheet-body'), top = old ? old.scrollTop : 0, html = sheetHtml();
  if (!html) ui.sheet = null;
  if (animate) el.classList.remove('open');
  el.innerHTML = html;
  if (animate) void el.offsetWidth;
  el.classList.toggle('open', !!ui.sheet);
  document.body.classList.toggle('sheet-open', !!ui.sheet);
  var body = el.querySelector('.sheet-body');
  if (body && !animate) body.scrollTop = top;
}
function openSheet(sh) {
  ui.sheet = sh; ui.editSleep = false; renderSheet(true);
  var f = document.querySelector('#sheet input[type=text]'); if (f && sh.type === 'newItem') f.focus();
}
function closeSheet() {
  var was = ui.sheet;
  ui.sheet = null; ui.editSleep = false; renderSheet();
  if (was && EDIT_SHEETS[was.type]) { flush(); render(); } // 입력 창에서 바꾼 내용을 뒤 화면에 반영
}
function ask(title, body, ok, danger, cb) { openSheet({ type: 'confirm', title: title, body: body, ok: ok, danger: danger, cb: cb }); }
function setTab(tab) {
  ui.tab = tab; ui.editSleep = false;
  if (tab === 'history') ui.month = today().slice(0, 7);
  window.scrollTo(0, 0); render();
}
function bindChart() {
  var box = document.getElementById('trend');
  if (!box || !ui.chartPts.length) return;
  var svg = box.querySelector('svg'), tip = box.querySelector('.tip'), cross = svg.querySelector('#cross');
  function show(ev) {
    var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * ui.chartW, best = ui.chartPts[0];
    ui.chartPts.forEach(function (p) { if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; });
    cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x); cross.setAttribute('visibility', 'visible');
    var dot = svg.querySelector('#dot');
    dot.setAttribute('cx', best.x); dot.setAttribute('cy', best.y); dot.setAttribute('visibility', 'visible');
    tip.textContent = shortLabel(best.d) + ' · ' + best.v + '점';
    tip.hidden = false;
    tip.style.left = Math.max(56, Math.min(r.width - 56, best.x / ui.chartW * r.width)) + 'px';
  }
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', function () { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); svg.querySelector('#dot').setAttribute('visibility', 'hidden'); });
}

/* ---------- 탭 바 ---------- */
document.getElementById('tabs').innerHTML = [['today', 'home', '홈'], ['history', 'cal', '달력'], ['stats', 'chart', '분석'], ['settings', 'set', '설정']].map(function (t) {
  return '<button data-tab="' + t[0] + '">' + ic(t[1]) + '<span>' + t[2] + '</span></button>';
}).join('');
document.getElementById('tabs').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab === 'today') ui.date = today();
  setTab(b.dataset.tab);
});

/* ---------- 누르기 ---------- */
// 먹은 것·한 것 기록을 바꿨다는 표시 (분석에서 "기록한 날"로 치고, 자기 전 알림을 건너뛰는 기준)
function markLog(dd) { dd.touched = true; dd.logAt = Date.now(); }
function setLog(dd, it, v) {
  if (v > 0) dd.log[it.id] = v; else delete dd.log[it.id];
  if (it.cat !== 'feel') markLog(dd);
}
function moveItem(id, dir) {
  var it = itemById(id), same = S.items.filter(function (x) { return x.cat === it.cat; }), other = same[same.indexOf(it) + dir];
  if (!other) return;
  var a = S.items.indexOf(it), b = S.items.indexOf(other);
  S.items[a] = other; S.items[b] = it;
}
// 각 동작은 화면을 다시 그릴 필요가 없으면 false를 돌려준다
var ACTIONS = {
  prev: function () { ui.date = L.addDays(ui.date, -1); ui.editSleep = false; },
  next: function () { if (ui.date < today()) ui.date = L.addDays(ui.date, 1); ui.editSleep = false; },
  goToday: function () { ui.date = today(); ui.editSleep = false; },
  openY: function () { ui.date = L.addDays(today(), -1); openSheet({ type: 'log' }); },
  editItems: function () { closeSheet(); setTab('settings'); return false; },
  theme: function (b) { S.settings.theme = b.dataset.v; save(); applyTheme(); },
  tab: function (b) { setTab(b.dataset.to); return false; },
  open: function (b) { ui.date = b.dataset.d; ui.tab = 'today'; ui.editSleep = false; window.scrollTo(0, 0); },
  mprev: function () { var d = L.parse(ui.month + '-01'); d.setMonth(d.getMonth() - 1); ui.month = L.fmt(d).slice(0, 7); },
  mnext: function () { var d = L.parse(ui.month + '-01'); d.setMonth(d.getMonth() + 1); var m = L.fmt(d).slice(0, 7); if (m <= today().slice(0, 7)) ui.month = m; },
  period: function (b) { ui.period = +b.dataset.v; },
  bucket: function (b) { ui.bucket = b.dataset.v; },
  usage: function () { N.openUsageAccess(); return false; },
  notif: function () { N.requestNotif(); return false; },
  score: function (b) { var dd = day(ui.date), v = +b.dataset.v; if (dd.score === v) delete dd.score; else dd.score = v; tick(); save(); },
  stress: function (b) { var dd = day(ui.date), v = +b.dataset.v; if (dd.stress === v) delete dd.stress; else dd.stress = v; tick(); save(); },
  toggle: function (b) { var dd = day(ui.date), it = itemById(b.dataset.id); if (!it) return; setLog(dd, it, dd.log[it.id] ? 0 : 1); tick(); save(); },
  inc: function (b) { var dd = day(ui.date), it = itemById(b.dataset.id); if (!it) return; setLog(dd, it, (dd.log[it.id] || 0) + (it.unit === '분' ? 10 : 1)); tick(); save(); },
  dec: function (b) { var dd = day(ui.date), it = itemById(b.dataset.id); if (!it) return; setLog(dd, it, (dd.log[it.id] || 0) - (it.unit === '분' ? 10 : 1)); tick(); save(); },
  copyY: function (b) {
    var dd = day(ui.date), y = peek(L.addDays(ui.date, -1)), n = 0;
    S.items.forEach(function (it) { if (it.cat === b.dataset.cat && !it.off && y.log[it.id]) { dd.log[it.id] = y.log[it.id]; n++; } });
    if (n) { markLog(dd); tick(); save(); }
  },
  nothing: function () { markLog(day(ui.date)); save(); toast('기록할 게 없는 날로 표시했어요'); },
  sleepEdit: function () { ui.editSleep = true; },
  sleepCancel: function () { ui.editSleep = false; },
  sleepAuto: function () { delete day(ui.date).sleep; ui.editSleep = false; save(); refreshSleepFor(ui.date); },
  sleepSave: function () {
    var d = ui.date, bi = document.getElementById('bedIn').value, wi = document.getElementById('wakeIn').value;
    if (!bi || !wi) { toast('시각을 입력해 주세요'); return false; }
    var bh = +bi.split(':')[0], wake = L.parse(d), bed = L.parse(bh >= 15 ? L.addDays(d, -1) : d);
    wake.setHours(+wi.split(':')[0], +wi.split(':')[1]); bed.setHours(bh, +bi.split(':')[1]);
    if (wake <= bed) { toast('깬 시각이 잠든 시각보다 빨라요'); return false; }
    day(d).sleep = { bed: bed.getTime(), wake: wake.getTime(), wakeups: 0, manual: true };
    ui.editSleep = false; save();
  },
  ai: function () { N.shareText(L.aiText(S)); return false; },
  export: function () { flush(); N.exportFile('condition-backup-' + today() + '.json', 'application/json', JSON.stringify(S, null, 1)); return false; },
  csv: function () { flush(); N.exportFile('condition-' + today() + '.csv', 'text/csv', L.csv(S)); return false; },
  import: function () { N.importData(); return false; },
  wipe: function () {
    ask('모든 기록을 지울까요?', '점수, 수면, 먹은 것 기록이 전부 사라집니다. 항목과 알림 설정은 그대로 둡니다. 되돌릴 수 없으니 먼저 백업 파일로 내보내 두세요.', '전부 지우기', true, function () {
      S.days = {}; S.weatherAt = 0; save(); render(); refreshSleep(); refreshWeather(); toast('모든 기록을 지웠어요');
    });
    return false;
  },
  /* 첫 실행 안내 */
  obNext: function () {
    if (ui.ob < OB_STEPS - 1) { ui.ob++; window.scrollTo(0, 0); return; }
    S.onboarded = true; S.notifAsked = true; ui.tab = 'today'; ui.date = today(); save(); applyTheme(); pushReminders(true); refreshSleep(); refreshWeather(); window.scrollTo(0, 0);
  },
  obPrev: function () { if (ui.ob > 0) ui.ob--; window.scrollTo(0, 0); },
  obItem: function (b) { var it = itemById(b.dataset.id); if (!it) return; if (it.off) delete it.off; else it.off = true; save(); },
  /* 아래에서 올라오는 창 */
  sheet: function (b) { openSheet({ type: b.dataset.sheet, id: b.dataset.id, cat: b.dataset.cat }); return false; },
  sheetClose: function () { closeSheet(); return false; },
  sheetOk: function () { var cb = ui.sheet && ui.sheet.cb; closeSheet(); if (cb) cb(); },
  itemSave: function () {
    var sh = ui.sheet, name = document.getElementById('itName').value.trim().slice(0, 30), u = document.getElementById('itUnit'), unit = u ? u.value : '';
    if (!name) { toast('이름을 입력해 주세요'); return false; }
    if (sh.type === 'newItem') S.items.push({ id: 'i' + (S.nextId++), cat: sh.cat, name: name, unit: unit });
    else { var it = itemById(sh.id); if (it) { it.name = name; it.unit = unit; } }
    save(); closeSheet();
  },
  itemUp: function () { moveItem(ui.sheet.id, -1); save(); },
  itemDown: function () { moveItem(ui.sheet.id, 1); save(); },
  itemOff: function () { var it = itemById(ui.sheet.id); if (it.off) delete it.off; else it.off = true; save(); renderSheet(); },
  itemDel: function () {
    var it = itemById(ui.sheet.id);
    ask('「' + it.name + '」 항목을 삭제할까요?', '지난 기록과 분석에서도 보이지 않게 됩니다. 입력 화면에서만 빼려면 삭제 대신 숨기기를 쓰세요.', '삭제', true, function () {
      S.items = S.items.filter(function (x) { return x.id !== it.id; }); save(); render();
    });
    return false;
  }
};
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  var fn = ACTIONS[b.dataset.act]; if (!fn) return;
  if (fn(b) !== false) render();
});

/* ---------- 입력 ---------- */
document.addEventListener('input', function (e) {
  var el = e.target;
  if (!el.dataset.field) return;
  var dd = day(ui.date); dd[el.dataset.field] = el.value;
  if (el.dataset.field === 'foodMemo') markLog(dd);
  saveSoon();
});
document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
document.addEventListener('change', function (e) {
  var el = e.target, st = S.settings;
  if (el.dataset.field) flush(); // 여기서 화면을 다시 그리면 막 누르려던 버튼이 사라져 터치가 먹히지 않는다
  else if (el.dataset.set === 'city') { st.city = el.value; st.cityChosen = true; S.weatherAt = 0; save(); refreshWeather(); }
  else if (el.dataset.set === 'minorMin') { st.minorMin = +el.value; save(); refreshSleep(); }
  else if (el.dataset.set === 'autoNight') { st.autoNight = el.checked; save(); applyTheme(); render(); }
  else if (el.dataset.rem) {
    st.rem[el.dataset.rem].on = el.checked; save();
    if (el.checked && S.onboarded && N.notifPermission() !== 'granted') N.requestNotif();
  }
  else if (el.dataset.remwd) { st.rem[el.dataset.remwd].wd = el.checked; save(); }
  else if (el.dataset.remauto) { st.rem.night.auto = el.checked; save(); render(); }
  else if (el.dataset.remtime) { if (el.value) { st.rem[el.dataset.remtime].time = el.value; save(); } }
});

/* ---------- 폰에서 부르는 콜백 ---------- */
window.onImport = function (text) {
  var j = null;
  try { j = JSON.parse(text); } catch (e) {}
  if (!j || !j.days || typeof j.days !== 'object' || !Array.isArray(j.items)) { toast('컨디션 노트 백업 파일이 아니에요'); return; }
  ask('백업에서 가져올까요?', '지금 기록을 지우고 파일 내용(' + Object.keys(j.days).length + '일 치)으로 바꿉니다.', '가져오기', false, function () {
    S = L.normalize(j); S.onboarded = true; delete S.whatsNew; save(); applyTheme(); pushReminders(true); render(); refreshWeather(); toast('가져왔어요');
  });
};
window.onExported = function (ok) { toast(ok ? '내보냈어요' : '내보내지 못했어요'); };
// 뒤로 가기: 열린 창 → 편집 중 → 다른 탭 → 다른 날짜 순으로 닫고, 더 닫을 게 없으면 false(앱 종료)
window.onBack = function () {
  if (ui.sheet) { closeSheet(); return true; }
  if (!S.onboarded) { if (ui.ob > 0) { ui.ob--; render(); return true; } return false; }
  if (ui.editSleep) { ui.editSleep = false; render(); return true; }
  if (ui.tab !== 'today') { ui.date = today(); setTab('today'); return true; }
  if (ui.date !== today()) { ui.date = today(); render(); return true; }
  return false;
};
window.onResume = function () {
  flush();
  var target = N.launchTarget();
  var open = target && S.onboarded ? { morning: 'morning', evening: 'stress', night: 'log' }[target] : '';
  if (open) { ui.tab = 'today'; ui.date = today(); }
  else if (ui.tab === 'today' && ui.date === ui.lastToday && ui.date !== today()) ui.date = today();
  ui.lastToday = today();
  if (S.onboarded) {
    // 알림이 켜져 있는데 권한을 한 번도 묻지 않았으면 처음 한 번 묻는다
    if (window.Native && remindersOn() && !S.notifAsked && N.notifPermission() !== 'granted') { S.notifAsked = true; save(); N.requestNotif(); }
    refreshSleep(); pushReminders(); refreshWeather();
  }
  applyTheme();
  render();
  if (open) openSheet({ type: open }); // 알림을 눌러 들어오면 해당 입력 창을 바로 연다
};

/* ---------- 브라우저 미리보기용 예시 데이터 (?demo) ---------- */
if (!window.Native && /demo/.test(location.search)) {
  S = L.freshState(); S.onboarded = !/onboard/.test(location.search); S.weatherAt = Date.now(); S.weatherCity = '천안';
  S.settings.theme = (/theme=([abc])/.exec(location.search) || [0, 'a'])[1];
  var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (var k = 100; k >= 0; k--) {
    var dk = L.addDays(today(), -k), x = day(dk), pv = S.days[L.addDays(dk, -1)];
    var bedH = 23 + rnd() * 2.2, slp = 5.5 + rnd() * 3, base = L.parse(dk).getTime();
    x.sleep = { bed: base + (bedH - 24) * 3600000, wake: base + (bedH - 24 + slp) * 3600000, wakeups: rnd() < .3 ? 1 : 0 };
    var tmin = 2 + rnd() * 8, rg = 5 + rnd() * 11, pm = Math.round(8 + rnd() * rnd() * 70);
    x.weather = { tmin: +tmin.toFixed(1), tmax: +(tmin + rg).toFixed(1), rain: 0, hum: 55, pres: 1015 + Math.round(rnd() * 15), pm10: pm + 12, pm25: pm, city: '천안', final: true };
    x.touched = true; x.logAt = base + 22 * 3600000; x.stress = 1 + Math.floor(rnd() * 5);
    if (rnd() < .6) x.log.i2 = 1; if (rnd() < .5) x.log.i1 = 1; if (rnd() < .3) x.log.i9 = 1 + Math.floor(rnd() * 6);
    if (rnd() < .35) x.log.i5 = 40; if (rnd() < .3) x.log.i12 = 1; if (rnd() < .7) x.log.i17 = 1 + Math.floor(rnd() * 3);
    var sc = 5.5 + (slp - 7) * .8 + (pv ? (pv.log.i9 ? -1.8 : 0) + (pv.log.i2 ? .9 : 0) + (pv.log.i5 ? .7 : 0) + (pv.log.i12 ? -1 : 0) - (pv.stress - 3) * .4 - (L.range(pv.weather) > 12 ? .8 : 0) : 0) + (rnd() - .5) * 1.5;
    if (k !== 3 && k !== 0 && rnd() < .93) {
      x.score = Math.max(1, Math.min(10, Math.round(sc)));
      if (x.score <= 4 && rnd() < .6) x.log.i23 = 1; if (x.score <= 3 && rnd() < .5) x.log.i24 = 1; if (x.score >= 7 && rnd() < .6) x.log.i22 = 1;
    }
    if (k === 0) { delete x.stress; x.log = {}; delete x.touched; delete x.logAt; }
  }
}

window.onResume();
if (loadNote) toast(loadNote);
if (S.onboarded && S.whatsNew) { delete S.whatsNew; save(); openSheet({ type: 'whatsnew' }); }
