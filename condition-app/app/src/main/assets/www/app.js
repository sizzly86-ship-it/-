'use strict';
/* 컨디션 노트 — 화면과 데이터 로직. 네이티브 기능은 window.Native(안드로이드 브리지)로 호출한다. */

var DAY = 86400000, MIN = 60000;
var CATS = [['supp', '영양제'], ['exercise', '운동'], ['alcohol', '술'], ['food', '음식'], ['etc', '그 밖에']];
var CITIES = [
  ['서울', 37.5665, 126.978], ['인천', 37.4563, 126.7052], ['수원', 37.2636, 127.0286], ['성남', 37.42, 127.1265],
  ['고양', 37.6584, 126.832], ['용인', 37.2411, 127.1776], ['춘천', 37.8813, 127.7298], ['강릉', 37.7519, 128.8761],
  ['원주', 37.3422, 127.9202], ['대전', 36.3504, 127.3845], ['세종', 36.48, 127.289], ['청주', 36.6424, 127.489],
  ['천안', 36.8151, 127.1139], ['아산', 36.7898, 127.0018], ['평택', 36.9921, 127.1129], ['전주', 35.8242, 127.148], ['광주', 35.1595, 126.8526], ['목포', 34.8118, 126.3922],
  ['여수', 34.7604, 127.6622], ['대구', 35.8714, 128.6014], ['포항', 36.019, 129.3435], ['안동', 36.5684, 128.7294],
  ['부산', 35.1796, 129.0756], ['울산', 35.5384, 129.3114], ['창원', 35.228, 128.6811], ['진주', 35.18, 128.1076],
  ['제주', 33.4996, 126.5312], ['서귀포', 33.2541, 126.56]
];
var DEFAULT_ITEMS = [
  ['supp', '종합비타민', ''], ['supp', '비타민D', ''], ['supp', '마그네슘', ''], ['supp', '오메가3', ''], ['supp', '유산균', ''],
  ['exercise', '웨이트', '분'], ['exercise', '유산소', '분'], ['exercise', '걷기', '분'], ['exercise', '스트레칭', ''],
  ['alcohol', '소주', '잔'], ['alcohol', '맥주', '잔'], ['alcohol', '와인', '잔'],
  ['food', '야식', ''], ['food', '과식', ''], ['food', '매운 음식', ''], ['food', '밀가루', ''], ['food', '기름진 음식', ''],
  ['food', '커피', '잔'], ['food', '오후 늦은 카페인', ''],
  ['etc', '낮잠', ''], ['etc', '야근', ''], ['etc', '반신욕', '']
];
var REMINDERS = [
  // [id, 이름, 설명, 기본 시각, 기본으로 평일만 울릴지]
  ['morning', '출근할 때', '아침 컨디션 점수', '08:00', false],
  ['evening', '퇴근할 때', '오늘 받은 스트레스', '18:30', true],
  ['night', '자기 전', '먹은 것 · 운동 · 영양제', '22:00', false]
];

/* ---------- 네이티브 브리지 (브라우저에서는 localStorage로 대체) ---------- */
var N = window.Native || {
  loadData: function () { return localStorage.getItem('cond') || ''; },
  saveData: function (j) { localStorage.setItem('cond', j); },
  hasUsageAccess: function () { return false; },
  openUsageAccess: function () { toast('안드로이드 앱에서만 동작합니다'); },
  getSessions: function () { return '[]'; },
  setReminders: function () {},
  notifPermission: function () { return 'granted'; },
  requestNotif: function () {},
  exportData: function (j) { console.log(j); toast('안드로이드 앱에서만 동작합니다'); },
  shareText: function (t) { console.log(t); toast('안드로이드 앱에서만 동작합니다'); },
  importData: function () { toast('안드로이드 앱에서만 동작합니다'); },
  launchTarget: function () { return ''; }
};

/* ---------- 날짜 도우미 ---------- */
function pad(n) { return (n < 10 ? '0' : '') + n; }
function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
// 새벽 4시 전까지는 "어제"로 친다 (늦게 자는 날 기록이 다음 날로 넘어가지 않게)
function today() { return fmt(new Date(Date.now() - 4 * 3600000)); }
function hm(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function dur(min) { return Math.floor(min / 60) + '시간 ' + pad(min % 60) + '분'; }
function label(s) {
  var d = parse(s);
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + '일월화수목금토'[d.getDay()] + ')';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------- 상태 ---------- */
function freshState() {
  return {
    version: 1,
    settings: {
      city: '천안', cityChosen: false, minorMin: 5,
      rem: { morning: { on: true, time: '08:00', wd: false }, evening: { on: true, time: '18:30', wd: true }, night: { on: true, time: '22:00', wd: false, auto: false } }
    },
    items: DEFAULT_ITEMS.map(function (x, i) { return { id: 'i' + i, cat: x[0], name: x[1], unit: x[2] }; }),
    nextId: DEFAULT_ITEMS.length,
    days: {}
  };
}
// 저장 파일·가져온 파일의 값을 화면에 넣기 전에 형태를 강제한다 (조작된 백업 파일로 스크립트가 끼어들지 못하게)
function num(v) { v = Number(v); return isFinite(v) ? v : null; }
function str(v, max) { return v == null ? '' : String(v).slice(0, max); }
function normalize(s) {
  var f = freshState();
  if (!s || typeof s !== 'object' || !s.days || typeof s.days !== 'object') return f;
  var st = s.settings && typeof s.settings === 'object' ? s.settings : {};
  var out = { version: 1, settings: f.settings, items: [], nextId: 0, days: {}, weatherAt: 0, weatherCity: '' };
  var known = CITIES.some(function (c) { return c[0] === st.city; });
  // 지역을 직접 고른 적이 없으면 기본 지역(천안)을 쓴다
  out.settings.cityChosen = !!st.cityChosen && known;
  out.settings.city = out.settings.cityChosen ? st.city : '천안';
  out.settings.minorMin = [2, 3, 5, 10, 15].indexOf(+st.minorMin) >= 0 ? +st.minorMin : 5;
  REMINDERS.forEach(function (r) {
    var c = st.rem && st.rem[r[0]];
    if (c && typeof c === 'object') out.settings.rem[r[0]] = { on: !!c.on, time: /^\d\d:\d\d$/.test(c.time) ? c.time : r[3], wd: c.wd == null ? r[4] : !!c.wd, auto: r[0] === 'night' && !!c.auto };
  });
  var seen = {};
  (Array.isArray(s.items) ? s.items : f.items).forEach(function (it) {
    if (!it || !/^i\d+$/.test(it.id) || seen[it.id]) return;
    seen[it.id] = 1;
    out.items.push({ id: it.id, cat: CATS.some(function (c) { return c[0] === it.cat; }) ? it.cat : 'etc', name: str(it.name, 30) || '이름 없음', unit: str(it.unit, 3) });
    out.nextId = Math.max(out.nextId, +it.id.slice(1) + 1);
  });
  Object.keys(s.days).forEach(function (k) {
    var x = s.days[k], d = { log: {} }, v;
    if (!/^\d{4}-\d\d-\d\d$/.test(k) || !x || typeof x !== 'object') return;
    v = Math.round(num(x.score)); if (v >= 1 && v <= 10) d.score = v;
    v = Math.round(num(x.stress)); if (v >= 1 && v <= 5) d.stress = v;
    ['memo', 'foodMemo', 'stressMemo'].forEach(function (m) { if (x[m]) d[m] = str(x[m], 500); });
    if (x.touched) d.touched = true;
    if (x.sleep && num(x.sleep.bed) && num(x.sleep.wake) && x.sleep.wake > x.sleep.bed) {
      d.sleep = { bed: num(x.sleep.bed), wake: num(x.sleep.wake), wakeups: Math.max(0, Math.round(num(x.sleep.wakeups) || 0)) };
      if (x.sleep.manual) d.sleep.manual = true;
      if (x.sleep.prov) d.sleep.prov = true;
    }
    if (x.weather && num(x.weather.tmax) != null && num(x.weather.tmin) != null) {
      d.weather = { tmax: num(x.weather.tmax), tmin: num(x.weather.tmin), rain: num(x.weather.rain), hum: num(x.weather.hum), city: str(x.weather.city, 10), final: !!x.weather.final };
    }
    if (x.log && typeof x.log === 'object') Object.keys(x.log).forEach(function (id) {
      var n = num(x.log[id]);
      if (/^i\d+$/.test(id) && n > 0) { d.log[id] = n; out.nextId = Math.max(out.nextId, +id.slice(1) + 1); } // 삭제된 항목의 번호도 다시 쓰지 않는다
    });
    out.days[k] = d;
  });
  out.nextId = Math.max(out.nextId, Math.round(num(s.nextId)) || 0);
  if (s.notifAsked) out.notifAsked = true;
  if (out.settings.city === s.weatherCity) { out.weatherAt = num(s.weatherAt) || 0; out.weatherCity = str(s.weatherCity, 10); }
  return out;
}
// 저장 파일이 깨졌으면 새 데이터로 덮어쓰기 전에 따로 보관하고, 하루 전 자동 백업에서 복구를 시도한다
function tryParse(raw) { try { var j = JSON.parse(raw); return j && j.days ? normalize(j) : null; } catch (e) { return null; } }
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
  if (!S) S = freshState();
})();
var ui = { tab: 'today', date: today(), editSleep: false, focus: '' };

var saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = null; N.saveData(JSON.stringify(S)); }
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); } // 글자 입력 중에는 잠깐 모았다가 저장
function flush() { if (saveTimer) save(); }
function day(d) {
  if (!S.days[d]) S.days[d] = { log: {} };
  if (!S.days[d].log) S.days[d].log = {};
  return S.days[d];
}
function peek(d) { return S.days[d] || { log: {} }; }

var toastTimer;
function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
}

/* ---------- 수면 자동 추정 ---------- */
function sleepWindow(d) {
  var start = parse(addDays(d, -1)); start.setHours(18);
  var end = parse(d); end.setHours(15);
  return [start.getTime(), Math.min(end.getTime(), Date.now())];
}
// d일 아침의 수면을 추정해 넣는다. 창(오후 3시)이 닫히기 전의 결과는 임시(prov)로 표시해 두고 나중에 다시 계산한다
function applySleep(d, sessions) {
  var w = sleepWindow(d), cur = peek(d).sleep;
  if (w[1] <= w[0]) return false;
  var closed = Date.now() >= parse(d).setHours(15);
  var r = estimateSleep(sessions, w[0], w[1], { minorMin: S.settings.minorMin, minWake: parse(d).setHours(2) });
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
  var t = today(), from = sleepWindow(addDays(t, -6))[0], sessions;
  try { sessions = JSON.parse(N.getSessions(String(from), String(Date.now()))); } catch (e) { return; }
  var changed = false;
  for (var i = 0; i <= 6; i++) {
    var d = addDays(t, -i), cur = peek(d).sleep;
    if (cur && (cur.manual || (i > 0 && !cur.prov))) continue; // 직접 입력했거나 이미 확정된 지난 날은 건드리지 않는다
    if (applySleep(d, sessions)) changed = true;
  }
  if (changed) save();
}

/* ---------- 날씨 (Open-Meteo, 키 필요 없음) ---------- */
function refreshWeather() {
  var c = CITIES.filter(function (x) { return x[0] === S.settings.city; })[0];
  if (!c) return;
  var t = today(), need = false;
  for (var i = 0; i <= 7; i++) { var w = peek(addDays(t, -i)).weather; if (!w || !w.final || w.city !== c[0]) need = true; }
  if (!need || (S.weatherAt && Date.now() - S.weatherAt < 3 * 3600000 && S.weatherCity === c[0])) return;
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + c[1] + '&longitude=' + c[2] +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean' +
    '&timezone=Asia%2FSeoul&past_days=14&forecast_days=1';
  fetch(url).then(function (r) { return r.json(); }).then(function (j) {
    var D = j.daily, realToday = fmt(new Date());
    D.time.forEach(function (d, i) {
      if (D.temperature_2m_max[i] == null || D.temperature_2m_min[i] == null) return;
      if (!S.days[d] && d < addDays(t, -7)) return;
      day(d).weather = {
        tmax: D.temperature_2m_max[i], tmin: D.temperature_2m_min[i],
        rain: D.precipitation_sum[i], hum: D.relative_humidity_2m_mean[i],
        city: c[0], final: d < realToday
      };
    });
    S.weatherAt = Date.now(); S.weatherCity = c[0];
    save(); render();
  }).catch(function () {});
}
function range(w) { return Math.round((w.tmax - w.tmin) * 10) / 10; }

/* ---------- 화면: 기록 ---------- */
function scaleButtons(act, n, cur) {
  var h = '<div class="scale s' + n + '">';
  for (var i = 1; i <= n; i++) h += '<button data-act="' + act + '" data-v="' + i + '"' + (cur === i ? ' class="on"' : '') + '>' + i + '</button>';
  return h + '</div>';
}
function sleepCard(d, dd) {
  var s = dd.sleep, h = '';
  if (ui.editSleep) {
    return '<div class="row"><div class="grow"><label class="f">잠든 시각</label><input type="time" id="bedIn" value="' + (s ? hm(s.bed) : '23:30') + '"></div>' +
      '<div class="grow"><label class="f">깬 시각</label><input type="time" id="wakeIn" value="' + (s ? hm(s.wake) : '07:00') + '"></div></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn primary small" data-act="sleepSave">저장</button>' +
      '<button class="btn small" data-act="sleepCancel">취소</button>' +
      (s && s.manual ? '<button class="btn small" data-act="sleepAuto">자동 추정으로 되돌리기</button>' : '') + '</div>';
  }
  if (s) {
    h += '<div class="sleepline"><div><span>잠든 시각</span><b>' + hm(s.bed) + '</b></div><div><span>깬 시각</span><b>' + hm(s.wake) + '</b></div>' +
      '<div><span>수면</span><b>' + dur(Math.round((s.wake - s.bed) / MIN)) + '</b></div></div>' +
      '<div class="row between"><span class="muted">' + (s.manual ? '직접 입력' : '폰 사용 기록으로 자동 추정' + (s.wakeups ? ' · 새벽에 잠깐 폰 만짐 ' + s.wakeups + '회' : '')) + '</span>' +
      '<button class="btn small" data-act="sleepEdit">수정</button></div>';
  } else {
    h += '<div class="row between"><span class="muted">' + (N.hasUsageAccess() ? '아직 수면 기록이 없어요' : '수면 시간 자동 기록이 꺼져 있어요') + '</span>' +
      '<button class="btn small" data-act="sleepEdit">직접 입력</button></div>';
  }
  return h;
}
function itemChip(it, v) {
  if (!it.unit) return '<button class="chip' + (v ? ' on' : '') + '" data-act="toggle" data-id="' + it.id + '">' + esc(it.name) + '</button>';
  return '<span class="chip num' + (v ? ' on' : '') + '">' + esc(it.name) +
    '<button data-act="dec" data-id="' + it.id + '" aria-label="줄이기">−</button><b>' + (v || 0) + esc(it.unit) + '</b>' +
    '<button data-act="inc" data-id="' + it.id + '" aria-label="늘리기">+</button></span>';
}
function viewToday() {
  var d = ui.date, dd = peek(d), t = today(), h = '';
  h += '<div class="datenav"><button class="btn icon" data-act="prev" aria-label="전날">‹</button>' +
    '<div class="d">' + label(d) + '<small>' + (d === t ? '오늘' : d === addDays(t, -1) ? '어제' : d) + '</small></div>' +
    '<button class="btn icon" data-act="next" aria-label="다음 날"' + (d >= t ? ' disabled' : '') + '>›</button></div>';

  if (!N.hasUsageAccess() && window.Native) {
    h += '<div class="card warn"><h2>수면 시간 자동 기록 켜기</h2><p class="sub">폰을 마지막으로 만진 시각과 아침에 처음 만진 시각으로 수면 시간을 자동으로 잡아요. 설정 화면에서 「컨디션 노트」의 사용 정보 접근을 허용해 주세요.</p>' +
      '<button class="btn primary" data-act="usage">허용하러 가기</button></div>';
  }

  if (window.Native && remindersOn() && N.notifPermission() !== 'granted') {
    h += '<div class="card warn"><h2>알림이 꺼져 있어요</h2><p class="sub">출근·퇴근·자기 전 알림을 받으려면 알림 권한을 허용해 주세요.</p><button class="btn primary" data-act="notif">알림 허용하기</button></div>';
  }

  h += '<div class="card" id="sec-morning"><h2>아침 컨디션</h2><p class="sub">자고 일어났을 때 상태 (전날 밤 수면)</p>' + sleepCard(d, dd) +
    scaleButtons('score', 10, dd.score) + '<div class="scalehint"><span>1 최악</span><span>10 최고</span></div>' +
    '<label class="f">메모</label><input type="text" data-field="memo" value="' + esc(dd.memo) + '" placeholder="예: 목이 칼칼함, 개운함"></div>';

  var w = dd.weather;
  h += '<div class="card"><div class="row between"><h2>날씨 · ' + esc(w && w.city ? w.city : S.settings.city) + '</h2>' +
    (w ? '<span class="sub">일교차 <b>' + range(w) + '°</b></span>' : '') + '</div>' +
    (w ? '<p class="sub">최저 ' + w.tmin + '° / 최고 ' + w.tmax + '°' + (w.hum != null ? ' · 습도 ' + w.hum + '%' : '') + (w.rain ? ' · 강수 ' + w.rain + 'mm' : '') + (w.final ? '' : ' (예보)') + '</p>'
      : '<p class="muted">날씨 정보를 아직 못 가져왔어요 (인터넷 연결 시 자동으로 채워집니다)</p>') + '</div>';

  h += '<div class="card" id="sec-night"><h2>이날 먹은 것 · 한 것</h2><p class="sub">다음 날 아침 컨디션과 연결해서 분석해요</p>';
  CATS.forEach(function (c) {
    var its = S.items.filter(function (it) { return it.cat === c[0]; });
    if (!its.length) return;
    h += '<h3>' + c[1] + '</h3><div class="chips">' + its.map(function (it) { return itemChip(it, dd.log[it.id]); }).join('') + '</div>';
  });
  h += '<label class="f">먹은 것 메모</label><textarea data-field="foodMemo" placeholder="예: 점심 김치찌개, 저녁 삼겹살">' + esc(dd.foodMemo) + '</textarea></div>';

  h += '<div class="card" id="sec-evening"><h2>퇴근길 스트레스</h2><p class="sub">오늘 일하면서 받은 스트레스</p>' +
    scaleButtons('stress', 5, dd.stress) + '<div class="scalehint"><span>1 거의 없음</span><span>5 매우 심함</span></div>' +
    '<label class="f">메모</label><input type="text" data-field="stressMemo" value="' + esc(dd.stressMemo) + '" placeholder="예: 마감, 회의 많았음"></div>';
  return h;
}

/* ---------- 화면: 지난 날 ---------- */
function daySummary(dd) {
  var parts = [];
  S.items.forEach(function (it) { var v = dd.log && dd.log[it.id]; if (v) parts.push(it.name + (it.unit ? ' ' + v + it.unit : '')); });
  if (dd.stress) parts.push('스트레스 ' + dd.stress);
  return parts.join(' · ');
}
function viewHistory() {
  var t = today(), keys = Object.keys(S.days).filter(function (k) { return k <= t; }).sort().reverse();
  keys = keys.filter(function (k) { var x = S.days[k]; return x.score || x.touched || x.sleep; });
  var h = '<h1>지난 날</h1>';
  if (!keys.length) return h + '<div class="card"><p class="sub">아직 기록이 없어요. 「기록」 탭에서 오늘 아침 컨디션부터 남겨 보세요.</p></div>';
  keys.forEach(function (k) {
    var x = S.days[k], s = x.sleep, w = x.weather;
    h += '<button class="card hist" data-act="open" data-d="' + k + '"><div class="row"><div class="score' + (x.score ? ' has' : '') + '">' + (x.score || '–') + '</div>' +
      '<div class="grow"><b>' + label(k) + '</b><div class="sub">' +
      (s ? '수면 ' + dur(Math.round((s.wake - s.bed) / MIN)) + ' (' + hm(s.bed) + '~' + hm(s.wake) + ')' : '수면 기록 없음') +
      (w ? ' · 일교차 ' + range(w) + '°' : '') + '</div><div class="tags">' + esc(daySummary(x)) + '</div></div></div></button>';
  });
  return h;
}

/* ---------- 분석 ---------- */
// 아침 점수가 있는 날 D와 그 전날(D-1)의 기록을 한 쌍으로 묶는다
function pairs() {
  return Object.keys(S.days).sort().filter(function (k) { return S.days[k].score; }).map(function (k) {
    return { date: k, score: S.days[k].score, cur: S.days[k], prev: S.days[addDays(k, -1)] || null };
  });
}
function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
function factorEffects(ps) {
  var out = [];
  S.items.forEach(function (it) {
    var yes = [], no = [];
    ps.forEach(function (p) {
      if (!p.prev || !p.prev.touched) return; // 전날 기록을 안 한 날은 "안 먹음"으로 치지 않는다
      (p.prev.log && p.prev.log[it.id] ? yes : no).push(p.score);
    });
    if (yes.length >= 2 && no.length >= 2) out.push({ name: it.name, cat: it.cat, yes: yes.length, no: no.length, diff: avg(yes) - avg(no), avgYes: avg(yes), avgNo: avg(no) });
  });
  return out.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
}
function buckets(ps, getter, defs) {
  return defs.map(function (b) {
    var xs = [];
    ps.forEach(function (p) { var v = getter(p); if (v != null && v >= b[1] && v < b[2]) xs.push(p.score); });
    return { name: b[0], n: xs.length, avg: avg(xs) };
  });
}
function bucketTable(title, rows) {
  if (!rows.some(function (r) { return r.n; })) return '';
  return '<div class="card"><h2>' + title + '</h2><table><tr><th>구간</th><th class="n">평균 컨디션</th><th class="n">일수</th></tr>' +
    rows.map(function (r) { return '<tr><td>' + r.name + '</td><td class="n">' + (r.n ? r.avg.toFixed(1) : '–') + '</td><td class="n">' + r.n + '</td></tr>'; }).join('') + '</table></div>';
}
// 점수 상위 1/3인 날과 하위 1/3인 날을 나란히 비교한다
function goodBad(ps) {
  if (ps.length < 6) return '<div class="card"><h2>좋은 날 vs 나쁜 날</h2><p class="muted">아침 점수가 6일 이상 쌓이면 표시됩니다.</p></div>';
  var sc = ps.map(function (p) { return p.score; }).sort(function (a, b) { return a - b; });
  var lo = sc[Math.floor((sc.length - 1) / 3)], hi = sc[Math.ceil((sc.length - 1) * 2 / 3)];
  if (hi <= lo) return '<div class="card"><h2>좋은 날 vs 나쁜 날</h2><p class="muted">아직 점수가 거의 비슷해서 나눌 수 없어요.</p></div>';
  var G = ps.filter(function (p) { return p.score >= hi; }), B = ps.filter(function (p) { return p.score <= lo; });
  function m(list, get, digits, unit) {
    var xs = []; list.forEach(function (p) { var v = get(p); if (v != null) xs.push(v); });
    return xs.length ? avg(xs).toFixed(digits) + unit : '–';
  }
  function clock(list) {
    var xs = []; list.forEach(function (p) { if (p.cur.sleep) { var b = new Date(p.cur.sleep.bed), x = b.getHours() * 60 + b.getMinutes(); xs.push(x < 900 ? x + 1440 : x); } });
    if (!xs.length) return '–';
    var a = Math.round(avg(xs)) % 1440; return pad(Math.floor(a / 60)) + ':' + pad(a % 60);
  }
  var rows = [
    ['일수', G.length + '일', B.length + '일'],
    ['수면 시간', m(G, slpH, 1, '시간'), m(B, slpH, 1, '시간')],
    ['잠든 시각', clock(G), clock(B)],
    ['새벽에 폰 만진 횟수', m(G, function (p) { return p.cur.sleep ? p.cur.sleep.wakeups : null; }, 1, '회'), m(B, function (p) { return p.cur.sleep ? p.cur.sleep.wakeups : null; }, 1, '회')],
    ['전날 스트레스', m(G, function (p) { return p.prev && p.prev.stress ? p.prev.stress : null; }, 1, ''), m(B, function (p) { return p.prev && p.prev.stress ? p.prev.stress : null; }, 1, '')],
    ['전날 일교차', m(G, function (p) { return p.prev && p.prev.weather ? range(p.prev.weather) : null; }, 1, '°'), m(B, function (p) { return p.prev && p.prev.weather ? range(p.prev.weather) : null; }, 1, '°')]
  ];
  // 전날 한 비율이 두 그룹 사이에 가장 크게 갈리는 항목 5개
  var its = [];
  S.items.forEach(function (it) {
    function rate(list) { var n = 0, y = 0; list.forEach(function (p) { if (p.prev && p.prev.touched) { n++; if (p.prev.log[it.id]) y++; } }); return n >= 2 ? y / n : null; }
    var g = rate(G), b = rate(B);
    if (g != null && b != null && g !== b) its.push({ name: it.name, g: g, b: b });
  });
  its.sort(function (x, y) { return Math.abs(y.g - y.b) - Math.abs(x.g - x.b); }).slice(0, 5).forEach(function (x) {
    rows.push(['전날 ' + esc(x.name), Math.round(x.g * 100) + '%', Math.round(x.b * 100) + '%']);
  });
  return '<div class="card"><h2>좋은 날 vs 나쁜 날</h2><p class="sub">점수가 높은 쪽 1/3(' + hi + '점 이상)과 낮은 쪽 1/3(' + lo + '점 이하)의 평균 비교</p>' +
    '<table><tr><th></th><th class="n">좋은 날</th><th class="n">나쁜 날</th></tr>' +
    rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="n">' + r[1] + '</td><td class="n">' + r[2] + '</td></tr>'; }).join('') + '</table></div>';
}
function slpH(p) { return p.cur.sleep ? (p.cur.sleep.wake - p.cur.sleep.bed) / 3600000 : null; }

// AI에게 넘길 텍스트: 부탁하는 말 + 하루에 한 줄짜리 표
function aiText() {
  var ps = pairs().slice(-120), lines = [];
  lines.push('아래는 내가 매일 기록한 컨디션 데이터야. 각 줄의 "아침점수"는 그날 자고 일어났을 때 컨디션(1~10, 높을수록 좋음)이고, "전날"로 시작하는 값은 그 전날 있었던 일이야.');
  lines.push('이 데이터를 분석해서 알려줘: (1) 컨디션이 좋은 날과 나쁜 날에 공통으로 보이는 패턴, (2) 영향이 커 보이는 요인을 큰 순서대로, 근거 수치와 함께, (3) 여러 요인이 겹칠 때의 효과(예: 술 + 늦게 잠), (4) 표본이 적어서 아직 믿기 어려운 부분, (5) 앞으로 2주 동안 해볼 만한 실험 2~3가지. 인과관계로 단정하지 말고, 날짜 수가 적은 결론은 그렇다고 말해줘.');
  lines.push('');
  lines.push('지역: ' + S.settings.city + ' / 기록 ' + ps.length + '일');
  lines.push('날짜 | 아침점수 | 잠든시각 | 깬시각 | 수면시간 | 새벽에 폰 만진 횟수 | 전날 스트레스(1~5) | 전날 최저~최고기온(일교차) | 전날 한 것·먹은 것 | 메모');
  ps.forEach(function (p) {
    var s = p.cur.sleep, pv = p.prev || {}, w = pv.weather, memo = [];
    if (p.cur.memo) memo.push('아침: ' + p.cur.memo);
    if (pv.foodMemo) memo.push('전날 식사: ' + pv.foodMemo);
    if (pv.stressMemo) memo.push('전날 스트레스: ' + pv.stressMemo);
    lines.push([p.date, p.score, s ? hm(s.bed) : '?', s ? hm(s.wake) : '?', s ? ((s.wake - s.bed) / 3600000).toFixed(1) + 'h' : '?', s ? s.wakeups : '?',
      pv.stress || '?', w ? w.tmin + '~' + w.tmax + '(' + range(w) + ')' : '?',
      pv.touched ? (daySummary({ log: pv.log }) || '없음') : '기록 안 함', memo.join(' / ').replace(/[\n|]/g, ' ')].join(' | '));
  });
  return lines.join('\n');
}
function trendChart() {
  var t = today(), n = 30, W = 340, H = 150, L = 22, R = 8, T = 10, B = 20, pts = [];
  for (var i = n - 1; i >= 0; i--) { var d = addDays(t, -i), sc = peek(d).score; pts.push({ d: d, v: sc || null, x: L + (W - L - R) * (n - 1 - i) / (n - 1) }); }
  function y(v) { return T + (H - T - B) * (10 - v) / 9; }
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="최근 30일 아침 컨디션 점수"><g class="axis">';
  [1, 4, 7, 10].forEach(function (v) {
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + '</text>';
  });
  [0, 10, 20, 29].forEach(function (i) { var p = pts[i], dt = parse(p.d); svg += '<text x="' + p.x + '" y="' + (H - 5) + '" text-anchor="' + (i === 0 ? 'start' : i === 29 ? 'end' : 'middle') + '">' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</text>'; });
  svg += '</g>';
  var path = '', open = false;
  pts.forEach(function (p) { if (p.v == null) { open = false; return; } path += (open ? 'L' : 'M') + p.x.toFixed(1) + ' ' + y(p.v).toFixed(1); open = true; });
  svg += '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  svg += '<line id="cross" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--axis)" stroke-width="1" visibility="hidden"/>';
  pts.forEach(function (p) { if (p.v != null) svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>'; });
  svg += '</svg>';
  ui.chartPts = pts.filter(function (p) { return p.v != null; });
  ui.chartW = W;
  return '<div class="chart" id="trend">' + svg + '<div class="tip" hidden></div></div>';
}
function viewStats() {
  var ps = pairs(), t = today(), h = '<h1>분석</h1>';
  var last7 = ps.filter(function (p) { return p.date > addDays(t, -7); }).map(function (p) { return p.score; });
  var sl = ps.filter(function (p) { return p.cur.sleep; }).map(function (p) { return (p.cur.sleep.wake - p.cur.sleep.bed) / MIN; });
  h += '<div class="tiles"><div class="tile"><span>기록한 아침</span><b>' + ps.length + '</b><small> 일</small></div>' +
    '<div class="tile"><span>최근 7일 평균</span><b>' + (last7.length ? avg(last7).toFixed(1) : '–') + '</b><small> /10</small></div>' +
    '<div class="tile"><span>평균 수면</span><b>' + (sl.length ? (avg(sl) / 60).toFixed(1) : '–') + '</b><small> 시간</small></div></div>';
  if (!ps.length) return h + '<div class="card"><p class="sub">아침 컨디션 점수를 기록하면 여기에 분석이 쌓여요. 2주 정도 모이면 경향이 보이기 시작합니다.</p></div>';

  h += '<div class="card"><h2>아침 컨디션 추이</h2><p class="sub">최근 30일 · 점을 누르면 값이 보여요</p>' + trendChart() + '</div>';

  var fx = factorEffects(ps);
  h += '<div class="card"><h2>전날 한 것에 따른 컨디션 차이</h2><p class="sub">한 날과 안 한 날의 다음 날 아침 평균 점수 차이</p>';
  if (!fx.length) h += '<p class="muted">아직 비교할 만큼 데이터가 없어요. 항목별로 한 날·안 한 날이 각각 2일 이상 쌓이면 표시됩니다.</p>';
  else {
    var max = Math.max.apply(null, fx.map(function (f) { return Math.abs(f.diff); }).concat([1]));
    h += '<div class="legend"><span><i style="background:var(--accent)"></i>한 날이 더 좋음</span><span><i style="background:var(--neg)"></i>한 날이 더 나쁨</span></div>';
    fx.forEach(function (f) {
      var wpc = Math.abs(f.diff) / max * 50;
      h += '<div class="factor" title="한 날 ' + f.avgYes.toFixed(1) + ' / 안 한 날 ' + f.avgNo.toFixed(1) + '"><div class="name">' + esc(f.name) + '<small>한 날 ' + f.yes + ' · 안 한 날 ' + f.no + (Math.min(f.yes, f.no) < 5 ? ' · 표본 적음' : '') + '</small></div>' +
        '<div class="bar"><i class="' + (f.diff >= 0 ? 'pos' : 'neg') + '" style="width:' + wpc.toFixed(1) + '%"></i></div>' +
        '<div class="val">' + (f.diff >= 0 ? '+' : '−') + Math.abs(f.diff).toFixed(1) + '</div></div>';
    });
    h += '<p class="muted" style="margin-top:8px">같이 일어난 일을 보여줄 뿐 원인을 증명하지는 않아요. 표본이 적을수록 우연일 가능성이 큽니다.</p>';
  }
  h += '</div>';

  h += goodBad(ps);
  h += '<div class="card"><h2>AI에게 분석 맡기기</h2><p class="sub">지금까지의 기록을 분석 요청 문장과 함께 글로 정리해서 Claude 같은 AI 앱으로 보냅니다. 메모 내용도 함께 들어가요.</p><button class="btn primary" data-act="ai">AI 앱으로 보내기</button></div>';
  h += bucketTable('수면 시간별', buckets(ps, function (p) { return p.cur.sleep ? (p.cur.sleep.wake - p.cur.sleep.bed) / 3600000 : null; },
    [['6시간 미만', 0, 6], ['6~7시간', 6, 7], ['7~8시간', 7, 8], ['8시간 이상', 8, 99]]));
  h += bucketTable('잠든 시각별', buckets(ps, function (p) {
    if (!p.cur.sleep) return null; var b = new Date(p.cur.sleep.bed), x = b.getHours() + b.getMinutes() / 60; return x < 15 ? x + 24 : x;
  }, [['밤 11시 전', 15, 23], ['11시~12시', 23, 24], ['12시~1시', 24, 25], ['새벽 1시 이후', 25, 40]]));
  h += bucketTable('전날 일교차별', buckets(ps, function (p) { return p.prev && p.prev.weather ? range(p.prev.weather) : null; },
    [['8° 미만', -99, 8], ['8~12°', 8, 12], ['12° 이상', 12, 99]]));
  h += bucketTable('전날 스트레스별', buckets(ps, function (p) { return p.prev && p.prev.stress ? p.prev.stress : null; },
    [['낮음 (1~2)', 1, 3], ['보통 (3)', 3, 4], ['높음 (4~5)', 4, 6]]));
  return h;
}
function bindChart() {
  var box = document.getElementById('trend');
  if (!box || !ui.chartPts.length) return;
  var svg = box.querySelector('svg'), tip = box.querySelector('.tip'), cross = svg.querySelector('#cross');
  function show(ev) {
    var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * ui.chartW, best = ui.chartPts[0];
    ui.chartPts.forEach(function (p) { if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; });
    cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x); cross.setAttribute('visibility', 'visible');
    tip.textContent = label(best.d) + ' · ' + best.v + '점';
    tip.hidden = false;
    var px = best.x / ui.chartW * r.width;
    tip.style.left = Math.max(60, Math.min(r.width - 60, px)) + 'px';
  }
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', function () { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}

/* ---------- 화면: 설정 ---------- */
function viewSettings() {
  var st = S.settings, h = '<h1>설정</h1>';
  h += '<div class="card"><h2>수면 자동 기록</h2><p class="sub">상태: <b>' + (N.hasUsageAccess() ? '켜짐' : '꺼짐') + '</b></p>' +
    (N.hasUsageAccess() ? '' : '<button class="btn primary" data-act="usage">사용 정보 접근 허용하기</button>') +
    '<label class="f">새벽에 폰을 이 시간(분)보다 짧게 만지고 다시 안 만지면 "잠결"로 보고 무시</label>' +
    '<select data-set="minorMin">' + [2, 3, 5, 10, 15].map(function (m) { return '<option value="' + m + '"' + (st.minorMin === m ? ' selected' : '') + '>' + m + '분</option>'; }).join('') + '</select></div>';

  h += '<div class="card"><h2>날씨 지역</h2><p class="sub">위치(GPS)는 쓰지 않아요. 고른 지역의 기온만 가져옵니다. 바꾸면 최근 2주 날씨를 새 지역 기준으로 다시 채워요.</p><select data-set="city">' + CITIES.map(function (c) { return '<option' + (c[0] === st.city ? ' selected' : '') + '>' + c[0] + '</option>'; }).join('') + '</select></div>';

  h += '<div class="card"><h2>알림</h2><p class="sub">정한 시각에 소리와 함께 울리고, 누르면 해당 입력 칸으로 바로 이동해요.</p>';
  if (N.notifPermission() !== 'granted') h += '<p class="sub">알림 권한이 꺼져 있어요.</p><button class="btn small" data-act="notif">알림 허용하기</button>';
  REMINDERS.forEach(function (r) {
    var c = st.rem[r[0]];
    var auto = r[0] === 'night' && c.auto, at = auto ? autoNightTime() : null;
    h += '<div class="itemrow"><label class="row grow"><input type="checkbox" data-rem="' + r[0] + '"' + (c.on ? ' checked' : '') + '> <span><b>' + r[1] + '</b><br><span class="muted">' + r[2] + '</span></span></label>' +
      '<input type="time" data-remtime="' + r[0] + '" value="' + (at || c.time) + '"' + (at ? ' disabled' : '') + ' style="width:120px"></div>' +
      '<div class="remopt"><label><input type="checkbox" data-remwd="' + r[0] + '"' + (c.wd ? ' checked' : '') + '> 평일에만</label>' +
      (r[0] === 'night' ? '<label><input type="checkbox" data-remauto="1"' + (c.auto ? ' checked' : '') + '> 평소 잠드는 시각 30분 전으로 자동 조정</label>' +
        (c.auto && !at ? '<span class="muted">수면 기록이 3일 이상 쌓이면 적용돼요. 그 전에는 위 시각에 울립니다.</span>' : '') : '') + '</div>';
  });
  h += '</div>';

  h += '<div class="card"><h2>기록 항목</h2><p class="sub">내가 먹는 영양제, 하는 운동 등을 추가·삭제하세요. 단위를 고르면 양까지 기록합니다.</p>';
  CATS.forEach(function (c) {
    h += '<h3>' + c[1] + '</h3>';
    S.items.filter(function (it) { return it.cat === c[0]; }).forEach(function (it) {
      h += '<div class="itemrow"><span>' + esc(it.name) + (it.unit ? ' <span class="muted">(' + esc(it.unit) + ')</span>' : '') + '</span><button class="btn small" data-act="delItem" data-id="' + it.id + '">삭제</button></div>';
    });
    h += '<div class="addrow"><input type="text" placeholder="새 항목 이름" id="new-' + c[0] + '"><select id="unit-' + c[0] + '"><option value="">체크만</option><option>분</option><option>잔</option><option>병</option><option>회</option><option>개</option></select>' +
      '<button class="btn small" data-act="addItem" data-cat="' + c[0] + '">추가</button></div>';
  });
  h += '</div>';

  h += '<div class="card"><h2>백업</h2><p class="sub">데이터는 이 폰 안에만 저장됩니다. 폰을 바꾸거나 앱을 지우기 전에 파일로 내보내 두세요.</p>' +
    '<div class="row"><button class="btn" data-act="export">파일로 내보내기</button><button class="btn" data-act="import">파일에서 가져오기</button></div></div>';
  return h;
}

/* ---------- 렌더 & 이벤트 ---------- */
function render() {
  var v = document.getElementById('view'), y = window.scrollY;
  v.innerHTML = { today: viewToday, history: viewHistory, stats: viewStats, settings: viewSettings }[ui.tab]();
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.dataset.tab === ui.tab); });
  if (ui.tab === 'stats') bindChart();
  if (ui.focus) {
    var el = document.getElementById('sec-' + ui.focus); ui.focus = '';
    if (el) { el.scrollIntoView(); return; }
  }
  window.scrollTo(0, y);
}
// 최근 7일 동안 실제로 잠든 시각의 평균에서 30분을 뺀 시각 (기록이 3일 미만이면 null)
function autoNightTime() {
  var t = today(), xs = [];
  for (var i = 0; i < 7; i++) {
    var s = peek(addDays(t, -i)).sleep;
    if (s) { var b = new Date(s.bed), m = b.getHours() * 60 + b.getMinutes(); xs.push(m < 900 ? m + 1440 : m); }
  }
  if (xs.length < 3) return null;
  var a = (Math.round((avg(xs) - 30) / 5) * 5 + 1440) % 1440;
  return pad(Math.floor(a / 60)) + ':' + pad(a % 60);
}
function remindersOn() { return REMINDERS.some(function (r) { return S.settings.rem[r[0]].on; }); }
function pushReminders() {
  var rem = JSON.parse(JSON.stringify(S.settings.rem)), at = rem.night.auto ? autoNightTime() : null;
  if (at) rem.night.time = at;
  N.setReminders(JSON.stringify(rem));
}
function setTab(tab) { ui.tab = tab; ui.editSleep = false; window.scrollTo(0, 0); render(); }

document.getElementById('tabs').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab === 'today') ui.date = today();
  setTab(b.dataset.tab);
});

document.getElementById('view').addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]'); if (!b) return;
  var a = b.dataset.act, d = ui.date, id = b.dataset.id, it, dd;
  if (a === 'prev') { ui.date = addDays(d, -1); ui.editSleep = false; }
  else if (a === 'next') { if (d < today()) ui.date = addDays(d, 1); ui.editSleep = false; }
  else if (a === 'open') { ui.date = b.dataset.d; ui.tab = 'today'; window.scrollTo(0, 0); }
  else if (a === 'usage') { N.openUsageAccess(); return; }
  else if (a === 'notif') { N.requestNotif(); return; }
  else if (a === 'score' || a === 'stress') {
    dd = day(d); var v = +b.dataset.v;
    if (dd[a] === v) delete dd[a]; else dd[a] = v;
    if (a === 'stress') dd.touched = true;
    save();
  }
  else if (a === 'toggle') { dd = day(d); if (dd.log[id]) delete dd.log[id]; else dd.log[id] = 1; dd.touched = true; save(); }
  else if (a === 'inc' || a === 'dec') {
    it = S.items.filter(function (x) { return x.id === id; })[0]; dd = day(d);
    var step = it && it.unit === '분' ? 10 : 1, nv = (dd.log[id] || 0) + (a === 'inc' ? step : -step);
    if (nv > 0) dd.log[id] = nv; else delete dd.log[id];
    dd.touched = true; save();
  }
  else if (a === 'sleepEdit') ui.editSleep = true;
  else if (a === 'sleepCancel') ui.editSleep = false;
  else if (a === 'sleepAuto') { delete day(d).sleep; ui.editSleep = false; save(); refreshSleepFor(d); }
  else if (a === 'sleepSave') {
    var bi = document.getElementById('bedIn').value, wi = document.getElementById('wakeIn').value;
    if (!bi || !wi) { toast('시각을 입력해 주세요'); return; }
    var bh = +bi.split(':')[0], wake = parse(d), bed = parse(bh >= 15 ? addDays(d, -1) : d);
    wake.setHours(+wi.split(':')[0], +wi.split(':')[1]); bed.setHours(bh, +bi.split(':')[1]);
    if (wake <= bed) { toast('깬 시각이 잠든 시각보다 빨라요'); return; }
    day(d).sleep = { bed: bed.getTime(), wake: wake.getTime(), wakeups: 0, manual: true };
    ui.editSleep = false; save();
  }
  else if (a === 'addItem') {
    var cat = b.dataset.cat, name = document.getElementById('new-' + cat).value.trim();
    if (!name) { toast('이름을 입력해 주세요'); return; }
    S.items.push({ id: 'i' + (S.nextId++), cat: cat, name: name, unit: document.getElementById('unit-' + cat).value });
    save();
  }
  else if (a === 'delItem') {
    it = S.items.filter(function (x) { return x.id === id; })[0];
    if (!confirm('「' + it.name + '」 항목을 삭제할까요? 지난 기록에서도 보이지 않게 됩니다.')) return;
    S.items = S.items.filter(function (x) { return x.id !== id; }); save();
  }
  else if (a === 'ai') { N.shareText(aiText()); return; }
  else if (a === 'export') { N.exportData(JSON.stringify(S, null, 1)); return; }
  else if (a === 'import') { N.importData(); return; }
  render();
});

document.getElementById('view').addEventListener('input', function (e) {
  var el = e.target;
  if (!el.dataset.field) return;
  var dd = day(ui.date); dd[el.dataset.field] = el.value; if (el.dataset.field !== 'memo') dd.touched = true;
  saveSoon();
});
document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });

document.getElementById('view').addEventListener('change', function (e) {
  var el = e.target;
  if (el.dataset.field) { var dd = day(ui.date); dd[el.dataset.field] = el.value; if (el.dataset.field !== 'memo') dd.touched = true; save(); }
  else if (el.dataset.set === 'city') { S.settings.city = el.value; S.settings.cityChosen = true; S.weatherAt = 0; save(); refreshWeather(); }
  else if (el.dataset.set === 'minorMin') { S.settings.minorMin = +el.value; save(); refreshSleep(); }
  else if (el.dataset.rem) {
    S.settings.rem[el.dataset.rem].on = el.checked; save(); pushReminders();
    if (el.checked && N.notifPermission() !== 'granted') N.requestNotif();
  }
  else if (el.dataset.remwd) { S.settings.rem[el.dataset.remwd].wd = el.checked; save(); pushReminders(); }
  else if (el.dataset.remauto) { S.settings.rem.night.auto = el.checked; save(); pushReminders(); render(); }
  else if (el.dataset.remtime) { if (el.value) { S.settings.rem[el.dataset.remtime].time = el.value; save(); pushReminders(); } }
});

function refreshSleepFor(d) {
  if (!N.hasUsageAccess()) return;
  var w = sleepWindow(d);
  try { if (applySleep(d, JSON.parse(N.getSessions(String(w[0]), String(w[1]))))) save(); } catch (e) {}
}

/* ---------- 네이티브에서 부르는 콜백 ---------- */
window.onImport = function (text) {
  try {
    var j = JSON.parse(text);
    if (!j || !j.days || !j.items) throw 0;
    if (!confirm('지금 데이터를 가져온 파일 내용으로 바꿀까요?')) return;
    S = normalize(j); save(); pushReminders(); render(); toast('가져왔어요');
  } catch (e) { toast('컨디션 노트 백업 파일이 아니에요'); }
};
window.onExported = function (ok) { toast(ok ? '내보냈어요' : '내보내지 못했어요'); };
window.onResume = function () {
  var target = N.launchTarget();
  if (target) { ui.tab = 'today'; ui.date = today(); ui.focus = target; }
  else if (ui.tab === 'today' && ui.date === ui.lastToday && ui.date !== today()) ui.date = today();
  ui.lastToday = today();
  flush();
  // 알림이 켜져 있는데 권한을 한 번도 묻지 않았으면 처음 한 번 묻는다
  if (window.Native && remindersOn() && !S.notifAsked && N.notifPermission() !== 'granted') { S.notifAsked = true; save(); N.requestNotif(); }
  refreshSleep(); pushReminders(); render(); refreshWeather();
};

/* ---------- 브라우저 미리보기용 예시 데이터 (?demo) ---------- */
if (!window.Native && /demo/.test(location.search)) {
  S = freshState();
  var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (var k = 40; k >= 0; k--) {
    var dk = addDays(today(), -k), x = day(dk), prev = S.days[addDays(dk, -1)];
    var bedH = 23 + rnd() * 2.2, slp = 5.5 + rnd() * 3, base = parse(dk).getTime();
    x.sleep = { bed: base + (bedH - 24) * 3600000, wake: base + (bedH - 24 + slp) * 3600000, wakeups: rnd() < .3 ? 1 : 0 };
    var tmin = 2 + rnd() * 8, rg = 5 + rnd() * 11;
    x.weather = { tmin: +tmin.toFixed(1), tmax: +(tmin + rg).toFixed(1), rain: 0, hum: 55, city: '서울', final: true };
    x.touched = true; x.stress = 1 + Math.floor(rnd() * 5);
    if (rnd() < .6) x.log.i2 = 1; if (rnd() < .5) x.log.i1 = 1; if (rnd() < .3) x.log.i9 = 1 + Math.floor(rnd() * 6);
    if (rnd() < .35) x.log.i5 = 40; if (rnd() < .3) x.log.i12 = 1; if (rnd() < .7) x.log.i17 = 1 + Math.floor(rnd() * 3);
    var sc = 5.5 + (slp - 7) * .8 + (prev ? (prev.log.i9 ? -1.8 : 0) + (prev.log.i2 ? .9 : 0) + (prev.log.i5 ? .7 : 0) + (prev.log.i12 ? -1 : 0) - (prev.stress - 3) * .4 - (range(prev.weather) > 12 ? .8 : 0) : 0) + (rnd() - .5) * 1.5;
    if (k !== 3) x.score = Math.max(1, Math.min(10, Math.round(sc)));
  }
}

window.onResume();
if (loadNote) toast(loadNote);
