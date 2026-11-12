'use strict';
/* 컨디션 노트 — 화면 그리기. 상태(S, ui)를 읽어 HTML 문자열을 만든다. 상태 변경은 app.js가 한다. */

var ICONS = {
  home: '<path d="M4 11l8-7 8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  set: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  pill: '<path d="M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
  brief: '<rect x="3.5" y="8" width="17" height="11.5" rx="2.5"/><path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2M3.5 13h17"/>',
  spark: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
  temp: '<path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  brush: '<path d="M4 20c2.5 0 4-1.5 4-4l8.5-8.5a2.1 2.1 0 0 1 3 3L11 19c-2.500 0-4.500 1-7 1z"/><path d="M14.500 9.500l3 3"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
function ic(name, cls) {
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name].replace(/(\d)\.(\d)00/g, '$1.$2') + '</svg>';
}
var THEMES = [['a', '클린'], ['b', '나이트'], ['c', '웜']];
// 달력 칸 색: 테마마다 한 가지 색의 밝기만 바꾼다 (점수 1 → 10). 두 번째 값은 글자를 흰색으로 바꾸기 시작하는 점수
var RAMPS = {
  a: [['#e8f3ff', '#d3e8ff', '#bcdcff', '#a2cdff', '#84bbff', '#64a8ff', '#4593fc', '#3182f6', '#1b64da', '#1957c2'], 7, '#191f28', '#ffffff'],
  b: [['#1d2140', '#252a52', '#2e3566', '#39417c', '#454f94', '#5360ad', '#6473c8', '#7888e6', '#8f9dff', '#b9c2ff'], 8, '#f1f3ff', '#0d1020'],
  c: [['#e9f2ee', '#d9e9e2', '#c6ddd3', '#b0cfc2', '#96bfae', '#79ab98', '#5a9480', '#427f6b', '#2e6b5a', '#1f5245'], 7, '#27231e', '#ffffff']
};
function themeNow() { return document.documentElement.dataset.theme || 'a'; }
function rampStyle(score) { var r = RAMPS[themeNow()]; return 'background:' + r[0][score - 1] + ';color:' + (score >= r[1] ? r[3] : r[2]); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function label(s) { var d = L.parse(s); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + '일월화수목금토'[d.getDay()] + '요일'; }
function shortLabel(s) { var d = L.parse(s); return (d.getMonth() + 1) + '/' + d.getDate() + ' (' + '일월화수목금토'[d.getDay()] + ')'; }
function sleepMin(s) { return Math.round((s.wake - s.bed) / 60000); }
function durShort(min) { return Math.floor(min / 60) + '시간 ' + (min % 60) + '분'; }
function signed(v) { var s = Math.abs(v).toFixed(1); return s === '0.0' ? '0.0' : (v > 0 ? '+' : '−') + s; }
var STRESS_WORDS = ['', '거의 없음', '조금', '보통', '심함', '매우 심함'];
function catName(c) { return L.CATS.filter(function (x) { return x[0] === c; })[0][1]; }
// 그 분류에서 지금 쓰는 항목 + (숨겼지만) 이 날짜에 값이 있는 항목
function itemsFor(cat, dd) { return S.items.filter(function (it) { return it.cat === cat && (!it.off || dd.log[it.id]); }); }
function logged(dd, cats) { return S.items.filter(function (it) { return cats.indexOf(it.cat) >= 0 && dd.log[it.id]; }); }

/* ================= 홈 ================= */
function ring(score) {
  var r = 40, c = 2 * Math.PI * r;
  return '<div class="ringwrap"><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--ring-track)" stroke-width="10"/>' +
    (score ? '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--ring)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (c * score / 10).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 50 50)"/>' : '') +
    '</svg>' + ic('moon') + '</div>';
}
function greeting(d, t) {
  if (d !== t) return d === L.addDays(t, -1) ? '어제의 기록' : '지난 기록';
  var h = new Date().getHours();
  return h < 4 || h >= 22 ? '오늘도 수고했어요' : h < 11 ? '좋은 아침이에요' : h < 17 ? '좋은 오후예요' : '오늘 하루 어땠나요';
}
function heroCard(d, dd, t) {
  var s = dd.sleep, y = peek(L.addDays(d, -1)), h = '<button class="hero" data-act="sheet" data-sheet="morning"><div class="hero-top">';
  if (dd.score) {
    var diff = y.score ? dd.score - y.score : null;
    h += '<div><p class="cap">' + (d === t ? '오늘 ' : '') + '아침 컨디션</p><p class="big"><b>' + dd.score + '</b><span>/10</span></p><p class="word">' + L.SCORE_WORDS[dd.score] +
      (diff == null ? '' : ' · ' + (diff === 0 ? '전날과 같음' : '전날보다 ' + (diff > 0 ? '+' : '−') + Math.abs(diff))) + '</p></div>';
  } else {
    h += '<div><p class="cap">' + (d === t ? '오늘 ' : '') + '아침 컨디션</p><p class="ask">자고 일어난 컨디션은<br>어땠나요?</p><span class="herobtn">점수 남기기</span></div>';
  }
  h += ring(dd.score) + '</div>';
  if (s) {
    h += '<div class="sleep"><div class="sleep-l"><span>' + L.hm(s.bed) + '</span><div class="bar"><i></i></div><span>' + L.hm(s.wake) + '</span></div><p>' + durShort(sleepMin(s)) + ' 수면 · ' +
      (s.manual ? '직접 입력' : '자동 기록') + (s.wakeups ? ' · 새벽에 폰 ' + s.wakeups + '회' : '') + '</p></div>';
  } else {
    h += '<div class="sleep"><p class="nosleep">' + (N.hasUsageAccess() || !window.Native ? '수면 기록이 아직 없어요' : '수면 자동 기록이 꺼져 있어요') + '</p></div>';
  }
  return h + '</button>';
}
function recordRows(d, dd, t, done) {
  var feel = logged(dd, ['feel']).map(function (it) { return it.name; }), log = logged(dd, L.FACTOR_CATS), rem = S.settings.rem;
  var logSum = log.slice(0, 2).map(function (it) { return it.name + (it.unit ? ' ' + dd.log[it.id] + it.unit : ''); }).join(', ') + (log.length > 2 ? ' 외 ' + (log.length - 2) + '개' : '');
  var rows = [
    ['morning', 'moon', 't1', '아침 컨디션', dd.score ? dd.score + '점' + (feel.length ? ' · ' + feel.slice(0, 2).join(', ') : '') : '자고 일어난 컨디션을 점수로', done.morning],
    ['log', 'pill', 't2', '먹은 것 · 한 것', logSum || (done.night ? '기록할 게 없는 날' : '영양제, 운동, 술, 음식'), done.night],
    ['stress', 'brief', 't3', '퇴근길 스트레스', dd.stress ? dd.stress + ' · ' + STRESS_WORDS[dd.stress] : (d === t && rem.evening.on ? rem.evening.time + '에 알려드릴게요' : '일하면서 받은 스트레스'), done.evening]
  ];
  return '<section class="list">' + rows.map(function (r) {
    return '<button class="rowi" data-act="sheet" data-sheet="' + r[0] + '"><div class="tile ' + r[2] + '">' + ic(r[1]) + '</div><div class="tx"><b>' + r[3] + '</b><span>' + esc(r[4]) + '</span></div>' +
      (r[5] ? '<div class="ck" aria-label="완료">' + ic('check') + '</div>' : '<div class="go">기록</div>') + '</button>';
  }).join('') + '</section>';
}
function envCards(dd) {
  var w = dd.weather;
  if (!w) return '<section class="card pad"><p class="muted">날씨 정보를 아직 못 가져왔어요. 인터넷에 연결되면 자동으로 채워집니다.</p></section>';
  var g = L.pmGrade(w);
  return '<section class="two"><div class="mini"><div class="mi">' + ic('temp') + '</div><p>일교차</p><b>' + L.range(w) + '°</b><span>' + w.tmin + '° ~ ' + w.tmax + '°' + (w.final ? '' : ' · 예보') + '</span></div>' +
    '<div class="mini"><div class="mi">' + ic('wind') + '</div><p>미세먼지</p>' + (g == null ? '<b>–</b><span>정보 없음</span>' : '<b class="pm pm' + g + '">' + L.PM_WORDS[g] + '</b><span>초미세 ' + (w.pm25 == null ? '–' : w.pm25) + ' · 미세 ' + (w.pm10 == null ? '–' : w.pm10) + '</span>') + '</div></section>';
}
function weekStrip(t) {
  var h = '<section class="card week">';
  for (var i = 6; i >= 0; i--) {
    var d = L.addDays(t, -i), sc = peek(d).score;
    h += '<button data-act="open" data-d="' + d + '" class="' + (d === ui.date ? 'on' : '') + '" aria-label="' + label(d) + (sc ? ' ' + sc + '점' : ' 기록 없음') + '"><b>' + (sc || '·') + '</b><i style="height:' + (sc ? 8 + sc * 6 : 6) + 'px"' + (sc ? '' : ' class="none"') + '></i><span>' + '일월화수목금토'[L.parse(d).getDay()] + '</span></button>';
  }
  return h + '</section>';
}
function viewHome() {
  var d = ui.date, dd = peek(d), t = today(), done = L.doneState(S, d), st = L.streak(S, t), y = L.addDays(t, -1), yd = peek(y), h = '';
  h += '<header class="hd"><div><p class="date"><button class="dnav" data-act="prev" aria-label="전날">' + ic('left') + '</button>' + label(d) +
    '<button class="dnav" data-act="next" aria-label="다음 날"' + (d >= t ? ' disabled' : '') + '>' + ic('chev') + '</button></p><h1>' + greeting(d, t) + '</h1></div>' +
    (d === t && st >= 2 ? '<span class="streak">' + st + '일 연속</span>' : d !== t ? '<button class="streak" data-act="goToday">오늘로</button>' : '') + '</header>';

  if (window.Native && !N.hasUsageAccess()) {
    h += '<section class="notice"><b>수면 시간 자동 기록 켜기</b><p>폰을 마지막으로 만진 시각과 아침에 처음 만진 시각으로 수면을 자동으로 잡아요.</p>' +
      '<div class="row wrap"><button class="btn primary small" data-act="usage">허용하러 가기</button><button class="btn text small" data-act="sheet" data-sheet="restricted">「액세스가 거부됨」이 뜰 때</button></div></section>';
  }
  if (window.Native && remindersOn() && N.notifPermission() !== 'granted') {
    h += '<section class="notice"><b>알림이 꺼져 있어요</b><p>출근·퇴근·자기 전 알림을 받으려면 알림 권한을 허용해 주세요.</p><button class="btn primary small" data-act="notif">알림 허용하기</button></section>';
  }

  h += heroCard(d, dd, t);
  var n = (done.morning ? 1 : 0) + (done.night ? 1 : 0) + (done.evening ? 1 : 0);
  h += '<h2 class="sec">' + (d === t ? '오늘의 기록' : '이날의 기록') + ' <small>' + n + '/3</small></h2>' + recordRows(d, dd, t, done);

  // 어제 저녁 기록을 빠뜨렸으면 오늘 아침에 채울 수 있게 알려준다 (오늘 아침 점수와 짝이 되는 기록이라서)
  var hasHistory = Object.keys(S.days).some(function (k) { return k < y && (S.days[k].score || S.days[k].touched); });
  if (d === t && hasHistory && !yd.touched && !yd.logAt && !yd.foodMemo) {
    h += '<button class="nudge" data-act="openY">' + ic('pill') + '<span><b>어제 먹은 것 · 한 것이 비어 있어요</b>오늘 아침 컨디션과 연결되는 기록이에요</span>' + ic('chev', 'dim') + '</button>';
  }

  h += envCards(dd);
  h += '<h2 class="sec">최근 7일</h2>' + weekStrip(t);

  var ins = d === t ? L.insights(S, L.pairs(S, L.addDays(t, -89)))[0] : null;
  if (ins) h += '<button class="ins ' + (ins.diff > 0 ? 'pos' : 'neg') + '" data-act="tab" data-to="stats"><div class="tile">' + ic('spark') + '</div><div class="tx"><b>' + esc(ins.text) + '</b><span>분석에서 더 보기</span></div>' + ic('chev', 'dim') + '</button>';
  return h;
}

/* ================= 달력 ================= */
function viewHistory() {
  var t = today(), m = ui.month || t.slice(0, 7), first = L.parse(m + '-01'), y = first.getFullYear(), mo = first.getMonth();
  var n = new Date(y, mo + 1, 0).getDate(), lead = first.getDay(), h = '';
  h += '<header class="hd"><div><h1>' + y + '년 ' + (mo + 1) + '월</h1></div><div class="monthnav"><button class="round" data-act="mprev" aria-label="이전 달">' + ic('left') + '</button>' +
    '<button class="round" data-act="mnext" aria-label="다음 달"' + (m >= t.slice(0, 7) ? ' disabled' : '') + '>' + ic('chev') + '</button></div></header>';

  var cells = '', scores = [], sleeps = [], rows = [];
  for (var i = 0; i < lead; i++) cells += '<span></span>';
  for (var day = 1; day <= n; day++) {
    var k = m + '-' + L.pad(day), x = S.days[k], has = x && (x.score || x.touched || x.sleep || x.stress);
    if (x && x.score) scores.push(x.score);
    if (x && x.sleep) sleeps.push(sleepMin(x.sleep));
    if (has && k <= t) rows.push(k);
    cells += '<button data-act="open" data-d="' + k + '"' + (k > t ? ' disabled' : '') + ' class="' + (k === t ? 'today' : '') + (has && !x.score ? ' dot' : '') + '"' +
      (x && x.score ? ' style="' + rampStyle(x.score) + '" aria-label="' + day + '일 ' + x.score + '점"' : ' aria-label="' + day + '일"') + '><small>' + day + '</small>' + (x && x.score ? '<b>' + x.score + '</b>' : '') + '</button>';
  }
  var ramp = RAMPS[themeNow()][0];
  h += '<section class="card pad"><div class="cal head">' + '일월화수목금토'.split('').map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div><div class="cal">' + cells + '</div>' +
    '<div class="callegend"><span>낮음</span>' + [0, 2, 4, 6, 8].map(function (s) { return '<i style="background:' + ramp[s] + '"></i>'; }).join('') + '<span>높음</span></div>' +
    '<div class="kpis"><div><span>평균 컨디션</span><b>' + (scores.length ? L.mean(scores).toFixed(1) : '–') + '</b></div><div><span>기록한 아침</span><b>' + scores.length + '<small>일</small></b></div>' +
    '<div><span>평균 수면</span><b>' + (sleeps.length ? (L.mean(sleeps) / 60).toFixed(1) : '–') + '<small>시간</small></b></div></div></section>';

  if (!rows.length) return h + '<section class="card pad empty"><p class="muted">이 달에는 기록이 없어요.</p></section>';
  h += '<h2 class="sec">이 달의 기록</h2><section class="list">';
  rows.reverse().forEach(function (k) {
    var x = S.days[k], s = x.sleep, tags = L.logText(S, x, L.CATS.map(function (c) { return c[0]; }));
    if (x.stress) tags += (tags ? ' · ' : '') + '스트레스 ' + x.stress;
    h += '<button class="rowi" data-act="open" data-d="' + k + '"><div class="tile score"' + (x.score ? ' style="' + rampStyle(x.score) + '"' : '') + '>' + (x.score || '–') + '</div>' +
      '<div class="tx"><b>' + shortLabel(k) + (s ? '<em>' + durShort(sleepMin(s)) + '</em>' : '') + '</b><span>' + esc(tags || '기록한 항목 없음') + '</span></div>' + ic('chev', 'dim') + '</button>';
  });
  return h + '</section>';
}

/* ================= 분석 ================= */
function confTag(c) { return '<em class="conf c' + c + '">' + ['아직 불확실', '가능성 있음', '뚜렷함'][c] + '</em>'; }
// 점들을 부드럽게 잇는 곡선
function smoothPath(pts) {
  var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, k = 0.18;
    d += ' C' + (p1[0] + (p2[0] - p0[0]) * k).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) * k).toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) * k).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) * k).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  return d;
}
function trendChart(from, to) {
  var days = Math.round((L.parse(to) - L.parse(from)) / 86400000) + 1, W = 330, H = 130, Lp = 4, R = 8, T = 10, B = 6, pts = [];
  function y(v) { return T + (H - T - B) * (10 - v) / 9; }
  for (var i = 0; i < days; i++) { var d = L.addDays(from, i), sc = peek(d).score; pts.push({ d: d, v: sc || null, x: Lp + (W - Lp - R) * (days === 1 ? 0.5 : i / (days - 1)) }); }
  var dense = days > 45, runs = [], cur = [], gap = 0;
  pts.forEach(function (p, i) {
    var v = p.v;
    if (dense) { var xs = []; for (var j = Math.max(0, i - 6); j <= i; j++) if (pts[j].v != null) xs.push(pts[j].v); v = xs.length >= 3 ? L.mean(xs) : null; } // 기간이 길면 7일 이동 평균
    // 하루 이틀 빠진 날은 선을 이어서 그리고, 사흘 이상 비면 끊는다
    if (v == null) { if (++gap === 3 && cur.length) { runs.push(cur); cur = []; } } else { gap = 0; cur.push([p.x, y(v)]); }
  });
  if (cur.length) runs.push(cur);
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="아침 컨디션 점수 추이"><defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".26"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>';
  [1, 5.5, 10].forEach(function (v) { svg += '<line x1="0" x2="' + W + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>'; });
  runs.forEach(function (r) {
    if (r.length < 2) return;
    var p = smoothPath(r);
    svg += '<path d="' + p + ' L' + r[r.length - 1][0].toFixed(1) + ' ' + H + ' L' + r[0][0].toFixed(1) + ' ' + H + 'Z" fill="url(#tg)"/><path d="' + p + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
  });
  svg += '<line id="cross" y1="' + T + '" y2="' + H + '" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>';
  var have = pts.filter(function (p) { return p.v != null; });
  if (dense) have.forEach(function (p) { svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="1.8" fill="var(--accent)" opacity=".35"/>'; });
  else if (have.length <= 31) have.forEach(function (p, i) { if (i === have.length - 1 || runs.every(function (r) { return r.length < 2; })) svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="5" fill="var(--accent)" stroke="var(--card)" stroke-width="3"/>'; });
  svg += '<circle id="dot" r="5" fill="var(--accent)" stroke="var(--card)" stroke-width="3" visibility="hidden"/></svg>';
  ui.chartPts = have.map(function (p) { return { d: p.d, v: p.v, x: p.x, y: y(p.v) }; });
  ui.chartW = W;
  function tick(i) { var dt = L.parse(pts[i].d); return (dt.getMonth() + 1) + '/' + dt.getDate(); }
  return '<div class="chart" id="trend">' + svg + '<div class="tip" hidden></div></div><div class="axis"><span>' + tick(0) + '</span><span>' + tick(Math.round((days - 1) / 2)) + '</span><span>' + (to === today() ? '오늘' : tick(days - 1)) + '</span></div>' +
    (dense ? '<p class="muted note">선은 7일 이동 평균, 점은 하루하루의 점수예요.</p>' : '');
}
function weekdayChart(ps) {
  var wd = L.weekdayAvg(ps), order = [1, 2, 3, 4, 5, 6, 0], best = -1, h = '<div class="wd">';
  order.forEach(function (d) { if (wd[d].n && (best < 0 || wd[d].avg > wd[best].avg)) best = d; });
  order.forEach(function (d) {
    var v = wd[d];
    h += '<div class="' + (d === best ? 'on' : '') + '" title="' + (v.n ? v.n + '일' : '기록 없음') + '"><b>' + (v.n ? v.avg.toFixed(1) : '') + '</b><i style="height:' + (v.n ? Math.round(v.avg * 8) : 4) + 'px"></i><span>' + '일월화수목금토'[d] + '</span></div>';
  });
  return h + '</div>';
}
// 구간별 평균: 기준(수면 시간, 일교차 …)을 하나 골라 가로 막대로 본다
var BUCKET_NAMES = { sleep: '수면 시간', bed: '잠든 시각', range: '일교차', pm: '미세먼지', stress: '스트레스' };
function bucketCard(ps) {
  var sets = L.bucketSet(ps).filter(function (b) { return b.rows.some(function (r) { return r.n; }); });
  if (!sets.length) return '';
  var cur = sets.filter(function (b) { return b.key === ui.bucket; })[0] || sets[0];
  var h = '<h2 class="sec">구간별로 보기</h2><section class="card pad"><div class="chips tabs2" role="group" aria-label="기준">' + sets.map(function (b) {
    return '<button class="chip' + (b === cur ? ' on' : '') + '" data-act="bucket" data-v="' + b.key + '" aria-pressed="' + (b === cur) + '">' + BUCKET_NAMES[b.key] + '</button>';
  }).join('') + '</div><p class="muted">' + (cur.key === 'sleep' || cur.key === 'bed' ? '그날 밤 ' : '전날 ') + BUCKET_NAMES[cur.key] + '에 따른 아침 평균 컨디션</p><div class="bk">';
  cur.rows.forEach(function (r) {
    h += '<div><span>' + r.name + '</span><div class="b"><i style="width:' + (r.n ? (r.avg * 10).toFixed(0) : 0) + '%"></i></div><b>' + (r.n ? r.avg.toFixed(1) : '–') + '</b><small>' + r.n + '일</small></div>';
  });
  return h + '</div></section>';
}
function viewStats() {
  var t = today(), per = ui.period, all = L.pairs(S), h = '<header class="hd"><div><h1>분석</h1></div></header>';
  h += '<div class="seg" role="group" aria-label="기간">' + [[30, '30일'], [90, '90일'], [0, '전체']].map(function (x) {
    return '<button data-act="period" data-v="' + x[0] + '"' + (per === x[0] ? ' class="on" aria-pressed="true"' : '') + '>' + x[1] + '</button>';
  }).join('') + '</div>';
  if (!all.length) return h + '<section class="card pad empty"><div class="tile t1">' + ic('chart') + '</div><h3>아직 분석할 기록이 없어요</h3><p class="muted">아침 컨디션 점수를 기록하면 여기에 분석이 쌓여요. 2주 정도 모이면 경향이 보이기 시작합니다.</p></section>';

  var from = per ? L.addDays(t, -(per - 1)) : all[0].date, ps = per ? L.pairs(S, from) : all;
  var span = Math.round((L.parse(t) - L.parse(from)) / 86400000) + 1;
  if (!ps.length) return h + '<section class="card pad empty"><p class="muted">이 기간에는 아침 점수 기록이 없어요. 기간을 넓혀 보세요.</p></section>';
  var prev = per ? all.filter(function (p) { return p.date < from && p.date >= L.addDays(from, -per); }) : [];
  var avgNow = L.mean(ps.map(function (p) { return p.score; })), avgPrev = L.mean(prev.map(function (p) { return p.score; }));
  var sl = ps.map(L.sleepHours).filter(function (v) { return v != null; });
  var delta = avgPrev != null && prev.length >= 3 ? avgNow - avgPrev : null, wd = L.weekdayAvg(ps), best = -1;
  wd.forEach(function (v, i) { if (v.n >= 2 && (best < 0 || v.avg > wd[best].avg)) best = i; });
  var chartFrom = per ? from : (span > 180 ? L.addDays(t, -179) : from);

  h += '<section class="card sum"><p class="cap">평균 컨디션</p><div class="sumrow"><p class="big"><b>' + avgNow.toFixed(1) + '</b></p>' +
    (delta == null || Math.abs(delta) < 0.05 ? '' : '<span class="delta ' + (delta > 0 ? '' : 'dn') + '">' + ic(delta > 0 ? 'up' : 'down') + Math.abs(delta).toFixed(1) + ' 이전 ' + per + '일보다</span>') + '</div>' +
    trendChart(chartFrom, t) +
    '<div class="kpis"><div><span>평균 수면</span><b>' + (sl.length ? L.mean(sl).toFixed(1) : '–') + '<small>시간</small></b></div><div><span>기록한 아침</span><b>' + ps.length + '<small>/' + span + '일</small></b></div>' +
    '<div><span>가장 좋은 요일</span><b>' + (best < 0 ? '–' : '일월화수목금토'[best] + '<small>요일</small>') + '</b></div></div></section>';

  var ins = L.insights(S, ps);
  h += '<h2 class="sec">눈에 띄는 패턴</h2>';
  if (!ins.length) h += '<section class="card pad"><p class="muted">아직 뚜렷한 패턴이 없어요. 기록이 쌓이면 여기에 한 줄 요약이 나타납니다.</p></section>';
  else h += ins.map(function (x) {
    return '<section class="ins ' + (x.diff > 0 ? 'pos' : 'neg') + '"><div class="tile">' + ic(x.diff > 0 ? 'up' : 'down') + '</div><div class="tx"><b>' + esc(x.text) + '</b><span>' + confTag(x.conf) + esc(x.note) + '</span></div></section>';
  }).join('') + '<p class="muted note">같이 일어난 일을 보여줄 뿐 원인을 증명하지는 않아요.</p>';

  var fx = L.factorEffects(S, ps);
  h += '<h2 class="sec">전날 한 것에 따른 차이</h2><section class="card fx">';
  if (!fx.length) h += '<p class="muted pad0">아직 비교할 만큼 데이터가 없어요. 항목별로 한 날·안 한 날이 각각 2일 이상 쌓이면 표시됩니다.</p>';
  else {
    var max = Math.max.apply(null, fx.map(function (f) { return Math.abs(f.diff); }).concat([1]));
    h += '<div class="legend"><span><i class="lp"></i>한 날이 더 좋음</span><span><i class="ln"></i>한 날이 더 나쁨</span></div>';
    fx.forEach(function (f) {
      h += '<button class="f" data-act="sheet" data-sheet="factor" data-id="' + f.id + '"><span>' + esc(f.name) + '<small>' + ['아직 불확실', '가능성 있음', '뚜렷함'][f.conf] + '</small></span>' +
        '<div class="b"><i class="' + (f.diff >= 0 ? 'p' : 'n') + '" style="width:' + (Math.abs(f.diff) / max * 46).toFixed(1) + '%"></i></div><b>' + signed(f.diff) + '</b></button>';
    });
  }
  h += '</section>';

  if (ps.length >= 7) h += '<h2 class="sec">요일별 평균</h2><section class="card pad">' + weekdayChart(ps) + '</section>';

  var gb = L.goodBad(S, ps);
  h += '<h2 class="sec">좋은 날 vs 나쁜 날</h2><section class="card pad">';
  if (gb.state === 'few') h += '<p class="muted">아침 점수가 6일 이상 쌓이면 표시됩니다.</p>';
  else if (gb.state === 'flat') h += '<p class="muted">아직 점수가 거의 비슷해서 나눌 수 없어요.</p>';
  else h += '<p class="muted">점수가 높은 날(' + gb.hi + '점 이상)과 낮은 날(' + gb.lo + '점 이하)의 평균</p><table><tr><th></th><th class="n">좋은 날</th><th class="n">나쁜 날</th></tr>' +
    gb.rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + r[1] + '</td><td class="n">' + r[2] + '</td></tr>'; }).join('') + '</table>';
  h += '</section>';

  h += bucketCard(ps);

  var fs = L.feelStats(S, ps);
  if (fs.length) h += '<section class="card pad"><h3 class="ct">아침 몸 상태</h3><table><tr><th>상태</th><th class="n">그날 평균</th><th class="n">일수</th></tr>' +
    fs.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="n">' + r.avg.toFixed(1) + '</td><td class="n">' + r.n + '</td></tr>'; }).join('') + '</table></section>';

  h += '<section class="card pad ai"><div class="tile t1">' + ic('spark') + '</div><h3>AI에게 더 깊은 분석 맡기기</h3><p class="muted">기록 전체를 분석 요청 문장과 함께 글로 정리해 Claude 같은 AI 앱으로 보냅니다. 메모 내용도 함께 들어가요.</p><button class="btn primary" data-act="ai">AI 앱으로 보내기</button></section>';
  return h;
}

/* ================= 설정 ================= */
function themePicker() {
  var cur = S.settings.theme || 'a';
  return '<div class="themes">' + THEMES.map(function (t) {
    return '<button data-act="theme" data-v="' + t[0] + '" class="' + (cur === t[0] ? 'on' : '') + '" aria-pressed="' + (cur === t[0]) + '"><i class="sw sw-' + t[0] + '"><u></u><s></s><s></s></i><span>' + t[1] + '</span></button>';
  }).join('') + '</div>';
}
function reminderRows() {
  var st = S.settings, h = '';
  L.REMINDERS.forEach(function (r) {
    var c = st.rem[r[0]], at = r[0] === 'night' && c.auto ? L.autoNightTime(S, today()) : null;
    h += '<div class="rem"><label class="switch"><input type="checkbox" data-rem="' + r[0] + '"' + (c.on ? ' checked' : '') + '><i></i><span><b>' + r[1] + '</b><small>' + r[2] + '</small></span></label>' +
      '<input type="time" aria-label="' + r[1] + ' 알림 시각" data-remtime="' + r[0] + '" value="' + (at || c.time) + '"' + (at ? ' disabled' : '') + '></div>' +
      '<div class="remopt"><label><input type="checkbox" data-remwd="' + r[0] + '"' + (c.wd ? ' checked' : '') + '> 평일에만</label>' +
      (r[0] === 'night' ? '<label><input type="checkbox" data-remauto="1"' + (c.auto ? ' checked' : '') + '> 평소 잠드는 시각 30분 전으로 자동 조정</label>' +
        (c.auto && !at ? '<span class="muted">수면 기록이 3일 이상 쌓이면 적용돼요. 그 전에는 위 시각에 울립니다.</span>' : '') : '') + '</div>';
  });
  return h;
}
function citySelect() {
  return '<select data-set="city" aria-label="날씨 지역">' + L.CITIES.map(function (c) { return '<option' + (c[0] === S.settings.city ? ' selected' : '') + '>' + c[0] + '</option>'; }).join('') + '</select>';
}
function setHead(icon, tile, title, right) { return '<div class="set-h"><div class="tile ' + tile + '">' + ic(icon) + '</div><b>' + title + '</b>' + (right || '') + '</div>'; }
function viewSettings() {
  var st = S.settings, access = N.hasUsageAccess(), h = '<header class="hd"><div><h1>설정</h1></div></header>';
  h += '<section class="card pad">' + setHead('brush', 't1', '테마') + themePicker() +
    '<label class="switch line"><input type="checkbox" data-set="autoNight"' + (st.autoNight ? ' checked' : '') + '><i></i><span><b>폰이 다크 모드면 나이트로</b><small>밝은 테마를 골라도 밤에는 어두운 화면으로</small></span></label></section>';

  h += '<section class="card pad">' + setHead('moon', 't1', '수면 자동 기록', '<em class="tag ' + (access ? 'ok' : '') + '">' + (access ? '켜짐' : '꺼짐') + '</em>') +
    (access ? '' : '<div class="row wrap gapb"><button class="btn primary small" data-act="usage">사용 정보 접근 허용하기</button><button class="btn text small" data-act="sheet" data-sheet="restricted">「액세스가 거부됨」이 뜰 때</button></div>') +
    '<label class="f" for="minor">새벽에 폰을 이보다 짧게 만지고 다시 안 만지면 "잠결"로 보고 무시</label>' +
    '<select id="minor" data-set="minorMin">' + [2, 3, 5, 10, 15].map(function (m) { return '<option value="' + m + '"' + (st.minorMin === m ? ' selected' : '') + '>' + m + '분</option>'; }).join('') + '</select></section>';

  h += '<section class="card pad">' + setHead('bell', 't3', '알림') + '<p class="muted">정한 시각에 울리고, 그날 이미 기록했으면 건너뜁니다.</p>';
  if (window.Native && N.notifPermission() !== 'granted') h += '<div class="inline-warn">알림 권한이 꺼져 있어요. <button class="link" data-act="notif">허용하기</button></div>';
  h += reminderRows() + '</section>';

  h += '<section class="card pad">' + setHead('pin', 't2', '날씨 지역') + '<p class="muted">위치(GPS)는 쓰지 않아요. 고른 지역의 기온·미세먼지만 가져옵니다.</p>' + citySelect() + '</section>';

  h += '<section class="card pad">' + setHead('list', 't2', '기록 항목') + '<p class="muted">항목을 눌러 이름·단위·순서를 바꾸거나 숨길 수 있어요.</p>';
  L.CATS.forEach(function (c) {
    h += '<div class="cat-h"><h3>' + c[1] + '</h3><button class="link" data-act="sheet" data-sheet="newItem" data-cat="' + c[0] + '">+ 추가</button></div><div class="itemlist">';
    S.items.filter(function (it) { return it.cat === c[0]; }).forEach(function (it) {
      h += '<button class="itemrow' + (it.off ? ' off' : '') + '" data-act="sheet" data-sheet="item" data-id="' + it.id + '"><span>' + esc(it.name) + (it.unit ? ' <small>' + esc(it.unit) + '</small>' : '') + '</span>' +
        (it.off ? '<small class="muted">숨김</small>' : '') + ic('chev', 'dim') + '</button>';
    });
    h += '</div>';
  });
  h += '</section>';

  h += '<section class="card pad">' + setHead('box', 't1', '데이터') + '<p class="muted">기록은 이 폰 안에만 저장됩니다. 폰을 바꾸거나 앱을 지우기 전에 백업 파일로 내보내 두세요.</p>' +
    '<div class="menu"><button data-act="export">백업 파일로 내보내기' + ic('chev', 'dim') + '</button><button data-act="csv">엑셀용 CSV로 내보내기' + ic('chev', 'dim') + '</button>' +
    '<button data-act="import">백업 파일에서 가져오기' + ic('chev', 'dim') + '</button><button class="danger" data-act="wipe">모든 기록 지우기' + ic('chev', 'dim') + '</button></div></section>';

  h += '<section class="card pad">' + setHead('info', 't2', '정보') + '<div class="menu"><button data-act="sheet" data-sheet="privacy">개인정보는 어떻게 다뤄지나요' + ic('chev', 'dim') + '</button>' +
    '<button data-act="sheet" data-sheet="whatsnew">새로 바뀐 점' + ic('chev', 'dim') + '</button></div>' +
    '<p class="muted about">컨디션 노트 ' + esc(N.appVersion ? N.appVersion() : '미리보기') + '<br>날씨·대기질 데이터: Open-Meteo.com (CC BY 4.0)<br>글꼴: Pretendard (SIL Open Font License 1.1)</p></section>';
  return h;
}

/* ================= 첫 실행 안내 ================= */
var OB_STEPS = 6;
function viewOnboarding() {
  var i = ui.ob, access = N.hasUsageAccess(), body = '', next = '다음';
  if (i === 0) {
    body = '<div class="obhero">' + ic('moon') + '</div><h1>컨디션 노트</h1><p class="lead">아침마다 컨디션 점수를 남기면, 전날 먹은 것·한 것·잠·날씨와 연결해서 무엇이 내 컨디션을 좌우하는지 찾아드려요.</p>' +
      '<ul class="feat"><li><div class="tile t1">' + ic('moon') + '</div><span><b>잠은 자동으로</b>폰을 마지막으로 만진 시각과 아침에 처음 만진 시각으로 기록해요</span></li>' +
      '<li><div class="tile t3">' + ic('bell') + '</div><span><b>하루 세 번, 몇 초면 끝</b>출근·퇴근·자기 전에 알림으로 알려드려요</span></li>' +
      '<li><div class="tile t2">' + ic('box') + '</div><span><b>기록은 내 폰 안에만</b>서버로 보내지 않아요</span></li></ul>';
    next = '시작하기';
  } else if (i === 1) {
    body = '<div class="obhero">' + ic('moon') + '</div><h1>수면 시간<br>자동 기록</h1><p class="lead">잠든 시각과 깬 시각을 직접 적지 않아도 되도록 폰 사용 기록을 읽어요. 새벽에 잠결에 잠깐 만진 건 구분해서 무시합니다.</p>' +
      '<div class="obbox"><div class="row between"><b>사용 정보 접근</b><em class="tag ' + (access ? 'ok' : '') + '">' + (access ? '허용됨' : '꺼짐') + '</em></div>' +
      (access ? '' : '<button class="btn primary block" data-act="usage">허용하러 가기</button><details><summary>「앱의 액세스가 거부됨」이 뜨나요?</summary>' + restrictedHelp() + '</details>') + '</div>' +
      '<p class="muted">화면이 켜지고 꺼진 시각만 읽으며, 어떤 앱을 썼는지는 저장하지 않아요.</p>';
    next = access ? '다음' : '나중에 하기';
  } else if (i === 2) {
    body = '<div class="obhero">' + ic('bell') + '</div><h1>알림 시간</h1><p class="lead">기록할 때를 알려드려요. 시각은 내 생활에 맞게 바꾸세요. 그날 이미 기록했으면 울리지 않습니다.</p>' +
      '<div class="obbox">' + reminderRows() + '</div>' + (window.Native && N.notifPermission() !== 'granted' ? '<button class="btn primary block" data-act="notif">알림 허용하기</button>' : '');
  } else if (i === 3) {
    body = '<div class="obhero">' + ic('pin') + '</div><h1>날씨 지역</h1><p class="lead">일교차와 미세먼지를 컨디션과 함께 보려고 날씨를 가져와요. 위치 권한은 쓰지 않으니 지역을 직접 골라 주세요.</p><div class="obbox">' + citySelect() + '</div>';
  } else if (i === 4) {
    body = '<div class="obhero">' + ic('brush') + '</div><h1>테마</h1><p class="lead">마음에 드는 분위기를 골라 주세요. 설정에서 언제든 바꿀 수 있어요.</p><div class="obbox">' + themePicker() + '</div>';
  } else {
    body = '<div class="obhero">' + ic('list') + '</div><h1>기록할 항목</h1><p class="lead">안 쓰는 건 눌러서 빼세요. 내가 먹는 영양제 같은 새 항목은 설정에서 언제든 추가할 수 있어요.</p>';
    L.FACTOR_CATS.forEach(function (c) {
      body += '<p class="lab">' + catName(c) + '</p><div class="chips">' + S.items.filter(function (it) { return it.cat === c; }).map(function (it) {
        return '<button class="chip' + (it.off ? '' : ' on') + '" data-act="obItem" data-id="' + it.id + '" aria-pressed="' + (it.off ? 'false' : 'true') + '">' + esc(it.name) + '</button>';
      }).join('') + '</div>';
    });
    next = '완료';
  }
  var dots = ''; for (var k = 0; k < OB_STEPS; k++) dots += '<i' + (k === i ? ' class="on"' : '') + '></i>';
  return '<div class="ob"><div class="ob-body">' + body + '</div><div class="ob-foot"><div class="dots">' + dots + '</div>' +
    '<div class="row">' + (i > 0 ? '<button class="btn" data-act="obPrev">이전</button>' : '') + '<button class="cta grow" data-act="obNext">' + next + '</button></div></div></div>';
}
function restrictedHelp() {
  return '<ol class="steps-ol"><li>뜬 창을 <b>닫기</b></li><li>폰 <b>설정 → 애플리케이션 → 컨디션 노트</b></li><li>오른쪽 위 <b>⋮</b> → <b>제한된 설정 허용</b></li><li>이 앱으로 돌아와 <b>허용하러 가기</b>를 다시 누르기</li></ol>' +
    '<p class="muted">스토어 밖에서 설치한 앱은 안드로이드가 이 권한을 기본으로 막아둬요. 한 번만 풀면 됩니다.</p>';
}

/* ================= 아래에서 올라오는 창 ================= */
function itemChip(it, v) {
  if (!it.unit) return '<button class="chip' + (v ? ' on' : '') + '" data-act="toggle" data-id="' + it.id + '" aria-pressed="' + (v ? 'true' : 'false') + '">' + esc(it.name) + '</button>';
  if (!v) return '<button class="chip" data-act="inc" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 추가">' + esc(it.name) + '</button>';
  return '<span class="chip num on"><span class="nm">' + esc(it.name) + '</span>' +
    '<button data-act="dec" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 줄이기">−</button><b>' + (v || 0) + esc(it.unit) + '</b>' +
    '<button data-act="inc" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 늘리기">+</button></span>';
}
function sleepRow(dd) {
  var s = dd.sleep;
  if (ui.editSleep) {
    return '<div class="sleepedit"><div class="row"><div class="grow"><label class="f" for="bedIn">잠든 시각</label><input type="time" id="bedIn" value="' + (s ? L.hm(s.bed) : '23:30') + '"></div>' +
      '<div class="grow"><label class="f" for="wakeIn">깬 시각</label><input type="time" id="wakeIn" value="' + (s ? L.hm(s.wake) : '07:00') + '"></div></div>' +
      '<div class="row wrap"><button class="btn primary small" data-act="sleepSave">저장</button><button class="btn small" data-act="sleepCancel">취소</button>' +
      (s && s.manual && N.hasUsageAccess() ? '<button class="btn text small" data-act="sleepAuto">자동 추정으로 되돌리기</button>' : '') + '</div></div>';
  }
  return '<button class="sleeprow" data-act="sleepEdit">' + ic('moon') + (s ? '<div><b>' + L.hm(s.bed) + ' – ' + L.hm(s.wake) + '</b><span>' + durShort(sleepMin(s)) + ' · ' + (s.manual ? '직접 입력' : '자동 기록') + '</span></div><em>수정</em>'
    : '<div><b>수면 기록 없음</b><span>잠든 시각과 깬 시각을 직접 넣을 수 있어요</span></div><em>입력</em>') + '</button>';
}
function sheetMorning() {
  var d = ui.date, dd = peek(d), sc = dd.score, feel = itemsFor('feel', dd);
  var h = '<h2>' + (d === today() ? '오늘 아침 컨디션은 어때요?' : shortLabel(d) + ' 아침 컨디션') + '</h2><p class="sub">자고 일어났을 때 기준으로 골라 주세요</p>' +
    '<div class="pick"><p class="big"><b>' + (sc || '–') + '</b></p><p class="word">' + (sc ? L.SCORE_WORDS[sc] : '아래에서 점수를 눌러 주세요') + '</p></div><div class="scale s10" role="group" aria-label="아침 컨디션 점수">';
  for (var n = 1; n <= 10; n++) h += '<button data-act="score" data-v="' + n + '" class="' + (sc === n ? 'on' : sc && n < sc ? 'fill' : '') + '" aria-label="' + n + '점" aria-pressed="' + (sc === n) + '"><i style="height:' + (14 + n * 4) + 'px"></i><span>' + n + '</span></button>';
  h += '</div>';
  if (feel.length) h += '<p class="lab">몸 상태 <small>해당하는 것 모두</small></p><div class="chips">' + feel.map(function (it) { return itemChip(it, dd.log[it.id]); }).join('') + '</div>';
  h += '<p class="lab">수면</p>' + sleepRow(dd) +
    '<label class="lab" for="memo">메모</label><input type="text" id="memo" data-field="memo" maxlength="500" value="' + esc(dd.memo) + '" placeholder="예: 새벽에 한 번 깸, 목이 칼칼함">';
  return h + '<button class="cta" data-act="sheetClose">완료</button>';
}
function sheetStress() {
  var d = ui.date, dd = peek(d), sc = dd.stress;
  var h = '<h2>' + (d === today() ? '오늘 스트레스는 어느 정도였나요?' : shortLabel(d) + ' 스트레스') + '</h2><p class="sub">일하면서 받은 스트레스를 골라 주세요</p>' +
    '<div class="pick"><p class="big"><b>' + (sc || '–') + '</b></p><p class="word">' + (sc ? STRESS_WORDS[sc] : '아래에서 눌러 주세요') + '</p></div><div class="scale s5" role="group" aria-label="스트레스">';
  for (var n = 1; n <= 5; n++) h += '<button data-act="stress" data-v="' + n + '" class="' + (sc === n ? 'on' : sc && n < sc ? 'fill' : '') + '" aria-label="' + n + ' ' + STRESS_WORDS[n] + '" aria-pressed="' + (sc === n) + '"><i style="height:' + (16 + n * 9) + 'px"></i><span>' + STRESS_WORDS[n] + '</span></button>';
  h += '</div><label class="lab" for="stressMemo">메모</label><input type="text" id="stressMemo" data-field="stressMemo" maxlength="500" value="' + esc(dd.stressMemo) + '" placeholder="예: 마감, 회의 많았음">';
  return h + '<button class="cta" data-act="sheetClose">완료</button>';
}
function sheetLog() {
  var d = ui.date, dd = peek(d), y = peek(L.addDays(d, -1)), done = L.doneState(S, d);
  var h = '<h2>' + (d === today() ? '오늘 먹은 것 · 한 것' : shortLabel(d) + ' 먹은 것 · 한 것') + '</h2><p class="sub">다음 날 아침 컨디션과 연결해서 분석해요</p>';
  L.FACTOR_CATS.forEach(function (c) {
    var its = itemsFor(c, dd);
    if (!its.length) return;
    var mine = its.some(function (it) { return dd.log[it.id]; }), yest = its.some(function (it) { return !it.off && y.log[it.id]; });
    h += '<div class="cat-h"><p class="lab">' + catName(c) + '</p>' + (!mine && yest ? '<button class="link" data-act="copyY" data-cat="' + c + '">전날과 같게</button>' : '') + '</div>' +
      '<div class="chips">' + its.map(function (it) { return itemChip(it, dd.log[it.id]); }).join('') + '</div>';
  });
  h += '<label class="lab" for="foodMemo">먹은 것 메모</label><textarea id="foodMemo" data-field="foodMemo" maxlength="500" placeholder="예: 점심 김치찌개, 저녁 삼겹살">' + esc(dd.foodMemo) + '</textarea>' +
    '<div class="row between wrap">' + (done.night ? '<span></span>' : '<button class="link" data-act="nothing">기록할 게 없는 날이에요</button>') + '<button class="link" data-act="editItems">항목 추가·수정</button></div>';
  return h + '<button class="cta" data-act="sheetClose">완료</button>';
}
var EDIT_SHEETS = { morning: sheetMorning, stress: sheetStress, log: sheetLog };
function sheetHtml() {
  var sh = ui.sheet, h = '', it;
  if (!sh) return '';
  if (EDIT_SHEETS[sh.type]) h = EDIT_SHEETS[sh.type]();
  else if (sh.type === 'confirm') {
    h = '<h2>' + esc(sh.title) + '</h2><p class="sub">' + esc(sh.body) + '</p><div class="row end"><button class="btn grow" data-act="sheetClose">취소</button>' +
      '<button class="btn grow ' + (sh.danger ? 'dangerbtn' : 'primary') + '" data-act="sheetOk">' + esc(sh.ok) + '</button></div>';
  } else if (sh.type === 'item' || sh.type === 'newItem') {
    it = sh.type === 'item' ? S.items.filter(function (x) { return x.id === sh.id; })[0] : { name: '', unit: '', cat: sh.cat };
    if (!it) return '';
    h = '<h2>' + (sh.type === 'item' ? '항목 수정' : catName(it.cat) + ' 항목 추가') + '</h2>' +
      '<label class="lab" for="itName">이름</label><input type="text" id="itName" maxlength="30" value="' + esc(it.name) + '" placeholder="예: 아연, 필라테스">';
    if (it.cat !== 'feel') h += '<label class="lab" for="itUnit">기록 방식</label><select id="itUnit">' + L.UNITS.map(function (u) { return '<option value="' + u + '"' + (u === it.unit ? ' selected' : '') + '>' + (u ? '양까지 기록 (' + u + ')' : '했는지만 체크') + '</option>'; }).join('') + '</select>';
    if (sh.type === 'item') {
      h += '<div class="row wrap tools"><button class="btn small" data-act="itemUp">위로</button><button class="btn small" data-act="itemDown">아래로</button>' +
        '<button class="btn small" data-act="itemOff">' + (it.off ? '다시 쓰기' : '숨기기') + '</button><button class="btn small dangertext" data-act="itemDel">삭제</button></div>' +
        '<p class="muted">숨기면 입력 화면에서만 사라지고 지난 기록과 분석에는 남아요. 삭제하면 지난 기록에서도 보이지 않습니다.</p>';
    }
    h += '<div class="row end"><button class="btn grow" data-act="sheetClose">취소</button><button class="btn primary grow" data-act="itemSave">저장</button></div>';
  } else if (sh.type === 'factor') {
    var f = L.factorEffects(S, statPairs()).filter(function (x) { return x.id === sh.id; })[0];
    if (!f) return '';
    h = '<h2>' + esc(f.name) + '</h2><p class="sub">전날 기록한 날과 안 한 날의 다음 날 아침 컨디션</p>' +
      '<div class="cmp"><div><span>기록한 날</span><b>' + f.avgYes.toFixed(1) + '</b><small>' + f.yes + '일</small></div><div><span>안 한 날</span><b>' + f.avgNo.toFixed(1) + '</b><small>' + f.no + '일</small></div>' +
      '<div><span>차이</span><b>' + signed(f.diff) + '</b><small>점</small></div></div>' +
      '<p>' + confTag(f.conf) + '</p><p class="sub">' + ['두 묶음의 차이가 우연일 가능성이 아직 커요. 날짜가 더 쌓여야 알 수 있습니다.', '차이가 보이기 시작했지만 표본이 더 필요해요.', '날짜 수와 차이 크기로 볼 때 우연일 가능성이 낮아요.'][f.conf] +
      (f.avgAmount != null ? ' 기록한 날의 평균 양은 ' + f.avgAmount.toFixed(1) + f.unit + '이에요.' : '') + '</p>' +
      '<p class="muted">같이 일어난 일을 보여줄 뿐이에요. 예를 들어 술 마신 날은 늦게 자는 경우가 많아서, 술과 늦은 취침 중 무엇 때문인지는 이 숫자만으로 알 수 없습니다.</p>' +
      '<button class="cta" data-act="sheetClose">닫기</button>';
  } else if (sh.type === 'restricted') {
    h = '<h2>「앱의 액세스가 거부됨」이 뜰 때</h2>' + restrictedHelp() + '<button class="cta" data-act="sheetClose">닫기</button>';
  } else if (sh.type === 'privacy') {
    h = '<h2>개인정보는 어떻게 다뤄지나요</h2><ul class="plainlist"><li><b>기록은 이 폰 안에만 저장돼요.</b> 계정도 서버도 없습니다.</li>' +
      '<li><b>밖으로 나가는 건 날씨 요청뿐이에요.</b> 고른 지역의 좌표로 Open-Meteo에 기온과 대기질을 물어봅니다. 내 위치나 기록은 보내지 않아요.</li>' +
      '<li><b>폰 사용 기록은 화면이 켜지고 꺼진 시각만 읽어요.</b> 어떤 앱을 썼는지는 저장하지 않습니다.</li>' +
      '<li><b>「AI 앱으로 보내기」는 직접 누를 때만</b> 기록과 메모를 글로 만들어, 고른 앱에 넘깁니다.</li>' +
      '<li>폰의 구글 백업이 켜져 있으면 앱 데이터가 내 구글 계정에 백업될 수 있어요.</li>' +
      '<li>미세먼지 값은 측정소 실측이 아니라 대기 모델 추정치라서 에어코리아 수치와 다를 수 있어요.</li></ul><button class="cta" data-act="sheetClose">닫기</button>';
  } else if (sh.type === 'whatsnew') {
    h = '<h2>새로 바뀐 점</h2><ul class="plainlist"><li><b>새 디자인과 테마 3종</b> 클린·나이트·웜 중에 설정에서 고를 수 있어요</li>' +
      '<li><b>홈이 요약 화면으로</b> 오늘 컨디션과 할 기록이 한눈에 보이고, 입력은 한 가지씩 아래 창에서</li>' +
      '<li><b>아침 몸 상태</b> 두통·피곤함 같은 상태를 점수와 함께 기록</li><li><b>미세먼지</b> 일교차와 함께 표시</li>' +
      '<li><b>달력</b> 한 달 컨디션을 색으로 한눈에</li><li><b>눈에 띄는 패턴</b> 분석 결과를 한 줄 요약과 신뢰도로</li>' +
      '<li><b>똑똑한 알림</b> 이미 기록했으면 울리지 않고, 30분 뒤 다시 알림 가능</li></ul><button class="cta" data-act="sheetClose">확인</button>';
  }
  return '<div class="sheet-back" data-act="sheetClose"></div><div class="sheet-body" role="dialog" aria-modal="true"><div class="grab"></div>' + h + '</div>';
}
