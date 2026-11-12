'use strict';
/* 컨디션 노트 — 화면 그리기. 상태(S, ui)를 읽어 HTML 문자열을 만든다. 상태 변경은 app.js가 한다. */

var ICONS = {
  today: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  history: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  settings: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  spark: '<path d="M12 3l2.2 6.800L21 12l-6.8 2.200L12 21l-2.2-6.800L3 12l6.8-2.200z"/>',
  chev: '<path d="M9 6l6 6-6 6"/>'
};
function ic(name, cls) {
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
}
// 달력 칸 색: 점수 1(연함) → 10(진함), 한 가지 색의 밝기만 바꾼다
var RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#1c5cab', '#104281'];
function rampStyle(score) { return 'background:' + RAMP[score - 1] + ';color:' + (score >= 7 ? '#fff' : '#0b0b0b'); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function label(s) {
  var d = L.parse(s);
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + '일월화수목금토'[d.getDay()] + '요일';
}
function shortLabel(s) { var d = L.parse(s); return (d.getMonth() + 1) + '/' + d.getDate() + ' (' + '일월화수목금토'[d.getDay()] + ')'; }
function sleepMin(s) { return Math.round((s.wake - s.bed) / 60000); }
function signed(v) { var s = Math.abs(v).toFixed(1); return s === '0.0' ? '0.0' : (v > 0 ? '+' : '−') + s; }
function doneBadge(on) { return on ? '<span class="done">' + ic('check') + '완료</span>' : ''; }

/* ================= 기록(오늘) ================= */
function scorePicker(cur) {
  var h = '<div class="score10" role="group" aria-label="아침 컨디션 점수">';
  for (var i = 1; i <= 10; i++) h += '<button data-act="score" data-v="' + i + '"' + (cur === i ? ' class="on" aria-pressed="true"' : '') + '>' + i + '</button>';
  return h + '</div><div class="scalehint">' + (cur ? '<b>' + cur + '점 · ' + L.SCORE_WORDS[cur] + '</b>' : '<span>1 최악</span><span>10 최고</span>') + '</div>';
}
function stressPicker(cur) {
  var words = ['', '거의 없음', '조금', '보통', '심함', '매우 심함'], h = '<div class="score5" role="group" aria-label="스트레스">';
  for (var i = 1; i <= 5; i++) h += '<button data-act="stress" data-v="' + i + '"' + (cur === i ? ' class="on" aria-pressed="true"' : '') + '><b>' + i + '</b><small>' + words[i] + '</small></button>';
  return h + '</div>';
}
function sleepBlock(dd) {
  var s = dd.sleep;
  if (ui.editSleep) {
    return '<div class="sleepedit"><div class="row"><div class="grow"><label class="f" for="bedIn">잠든 시각</label><input type="time" id="bedIn" value="' + (s ? L.hm(s.bed) : '23:30') + '"></div>' +
      '<div class="grow"><label class="f" for="wakeIn">깬 시각</label><input type="time" id="wakeIn" value="' + (s ? L.hm(s.wake) : '07:00') + '"></div></div>' +
      '<div class="row wrap"><button class="btn primary small" data-act="sleepSave">저장</button><button class="btn small" data-act="sleepCancel">취소</button>' +
      (s && s.manual && N.hasUsageAccess() ? '<button class="btn small" data-act="sleepAuto">자동 추정으로 되돌리기</button>' : '') + '</div></div>';
  }
  if (!s) {
    return '<div class="sleepbox empty"><span class="muted">' + (N.hasUsageAccess() ? '아직 수면 기록이 없어요' : '수면 시간이 기록되지 않았어요') + '</span><button class="btn small" data-act="sleepEdit">직접 입력</button></div>';
  }
  return '<div class="sleepbox"><div class="sleepnums"><div><span>잠든 시각</span><b>' + L.hm(s.bed) + '</b></div><div><span>깬 시각</span><b>' + L.hm(s.wake) + '</b></div><div><span>수면</span><b>' + L.dur(sleepMin(s)) + '</b></div></div>' +
    '<div class="row between"><span class="muted">' + ic('moon') + (s.manual ? '직접 입력' : '자동 추정' + (s.wakeups ? ' · 새벽에 잠깐 폰 만짐 ' + s.wakeups + '회' : '')) + '</span><button class="btn small ghost" data-act="sleepEdit">수정</button></div></div>';
}
function itemChip(it, v) {
  if (!it.unit) return '<button class="chip' + (v ? ' on' : '') + '" data-act="toggle" data-id="' + it.id + '" aria-pressed="' + (v ? 'true' : 'false') + '">' + esc(it.name) + '</button>';
  return '<span class="chip num' + (v ? ' on' : '') + '"><span class="nm">' + esc(it.name) + '</span>' +
    '<button data-act="dec" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 줄이기">−</button><b>' + (v || 0) + esc(it.unit) + '</b>' +
    '<button data-act="inc" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' 늘리기">+</button></span>';
}
// 그 분류에서 지금 쓰는 항목 + (숨겼지만) 이 날짜에 값이 있는 항목
function itemsFor(cat, dd) {
  return S.items.filter(function (it) { return it.cat === cat && (!it.off || dd.log[it.id]); });
}
function envCard(dd) {
  var w = dd.weather;
  if (!w) return '<section class="card"><div class="card-h"><h2>날씨 · ' + esc(S.settings.city) + '</h2></div><p class="muted">아직 날씨 정보를 못 가져왔어요. 인터넷에 연결되면 자동으로 채워집니다.</p></section>';
  var g = L.pmGrade(w), cells = '<div><span>일교차</span><b>' + L.range(w) + '°</b><small>' + w.tmin + '° ~ ' + w.tmax + '°</small></div>';
  cells += '<div><span>미세먼지</span>' + (g == null ? '<b>–</b><small>정보 없음</small>' : '<b class="pm pm' + g + '">' + L.PM_WORDS[g] + '</b><small>초미세 ' + (w.pm25 == null ? '–' : w.pm25) + ' · 미세 ' + (w.pm10 == null ? '–' : w.pm10) + '</small>') + '</div>';
  cells += '<div><span>습도</span><b>' + (w.hum == null ? '–' : w.hum + '%') + '</b><small>' + (w.rain ? '강수 ' + w.rain + 'mm' : '비 없음') + '</small></div>';
  cells += '<div><span>기압</span><b>' + (w.pres == null ? '–' : Math.round(w.pres)) + '</b><small>hPa</small></div>';
  return '<section class="card"><div class="card-h"><h2>날씨 · ' + esc(w.city || S.settings.city) + '</h2>' + (w.final ? '' : '<span class="tag">예보</span>') + '</div><div class="env">' + cells + '</div></section>';
}
function viewToday() {
  var d = ui.date, dd = peek(d), t = today(), y = peek(L.addDays(d, -1)), done = L.doneState(S, d), st = L.streak(S, t), h = '';
  var rel = d === t ? '오늘' : d === L.addDays(t, -1) ? '어제' : d;
  h += '<header class="top"><button class="nav" data-act="prev" aria-label="전날">' + ic('left') + '</button>' +
    '<div class="ttl"><h1>' + label(d) + '</h1><p>' + rel + (d === t && st >= 2 ? ' · 연속 ' + st + '일째 기록 중' : '') + '</p></div>' +
    '<button class="nav" data-act="next" aria-label="다음 날"' + (d >= t ? ' disabled' : '') + '>' + ic('right') + '</button></header>';
  if (d !== t) h += '<button class="backtoday" data-act="goToday">오늘로 돌아가기</button>';

  h += '<div class="steps">' + [['morning', '아침'], ['evening', '퇴근'], ['night', '자기 전']].map(function (x) {
    return '<button data-act="jump" data-to="' + x[0] + '" class="' + (done[x[0]] ? 'on' : '') + '">' + (done[x[0]] ? ic('check') : '<i></i>') + x[1] + '</button>';
  }).join('') + '</div>';

  if (window.Native && !N.hasUsageAccess()) {
    h += '<section class="card warn"><h2>수면 시간 자동 기록 켜기</h2><p class="sub">폰을 마지막으로 만진 시각과 아침에 처음 만진 시각으로 수면 시간을 자동으로 잡아요.</p>' +
      '<div class="row wrap"><button class="btn primary" data-act="usage">허용하러 가기</button><button class="btn ghost" data-act="sheet" data-sheet="restricted">「액세스가 거부됨」이 뜰 때</button></div></section>';
  }
  if (window.Native && remindersOn() && N.notifPermission() !== 'granted') {
    h += '<section class="card warn"><h2>알림이 꺼져 있어요</h2><p class="sub">출근·퇴근·자기 전 알림을 받으려면 알림 권한을 허용해 주세요.</p><button class="btn primary" data-act="notif">알림 허용하기</button></section>';
  }

  // 아침
  h += '<section class="card" id="sec-morning"><div class="card-h"><h2>아침 컨디션</h2>' + doneBadge(done.morning) + '</div>' + sleepBlock(dd) +
    '<p class="q">자고 일어났을 때 컨디션은 몇 점인가요?</p>' + scorePicker(dd.score);
  var feel = itemsFor('feel', dd);
  if (feel.length) h += '<h3>몸 상태 <span class="muted">해당하는 것 모두</span></h3><div class="chips">' + feel.map(function (it) { return itemChip(it, dd.log[it.id]); }).join('') + '</div>';
  h += '<label class="f" for="memo">메모</label><input type="text" id="memo" data-field="memo" maxlength="500" value="' + esc(dd.memo) + '" placeholder="예: 새벽에 한 번 깸, 목이 칼칼함"></section>';

  h += envCard(dd);

  // 하루 기록
  h += '<section class="card" id="sec-night"><div class="card-h"><h2>먹은 것 · 한 것</h2>' + doneBadge(done.night) + '</div><p class="sub">다음 날 아침 컨디션과 연결해서 분석해요.</p>';
  L.FACTOR_CATS.forEach(function (c) {
    var its = itemsFor(c, dd);
    if (!its.length) return;
    var name = L.CATS.filter(function (x) { return x[0] === c; })[0][1];
    var mine = its.some(function (it) { return dd.log[it.id]; }), yest = its.some(function (it) { return !it.off && y.log[it.id]; });
    h += '<div class="cat-h"><h3>' + name + '</h3>' + (!mine && yest ? '<button class="link" data-act="copyY" data-cat="' + c + '">어제와 같게</button>' : '') + '</div>' +
      '<div class="chips">' + its.map(function (it) { return itemChip(it, dd.log[it.id]); }).join('') + '</div>';
  });
  h += '<label class="f" for="foodMemo">먹은 것 메모</label><textarea id="foodMemo" data-field="foodMemo" maxlength="500" placeholder="예: 점심 김치찌개, 저녁 삼겹살">' + esc(dd.foodMemo) + '</textarea>' +
    '<div class="row between wrap">' + (done.night ? '<span></span>' : '<button class="link" data-act="nothing">오늘은 기록할 게 없어요</button>') +
    '<button class="link" data-act="tab" data-to="settings">항목 추가·수정</button></div></section>';

  // 스트레스
  h += '<section class="card" id="sec-evening"><div class="card-h"><h2>퇴근길 스트레스</h2>' + doneBadge(done.evening) + '</div><p class="q">오늘 일하면서 받은 스트레스는?</p>' + stressPicker(dd.stress) +
    '<label class="f" for="stressMemo">메모</label><input type="text" id="stressMemo" data-field="stressMemo" maxlength="500" value="' + esc(dd.stressMemo) + '" placeholder="예: 마감, 회의 많았음"></section>';
  return h;
}

/* ================= 지난 기록(달력) ================= */
function viewHistory() {
  var t = today(), m = ui.month || t.slice(0, 7), first = L.parse(m + '-01'), y = first.getFullYear(), mo = first.getMonth();
  var n = new Date(y, mo + 1, 0).getDate(), lead = first.getDay(), h = '';
  h += '<header class="top"><button class="nav" data-act="mprev" aria-label="이전 달">' + ic('left') + '</button><div class="ttl"><h1>' + y + '년 ' + (mo + 1) + '월</h1></div>' +
    '<button class="nav" data-act="mnext" aria-label="다음 달"' + (m >= t.slice(0, 7) ? ' disabled' : '') + '>' + ic('right') + '</button></header>';

  var cells = '', scores = [], sleeps = [], rows = [];
  for (var i = 0; i < lead; i++) cells += '<span></span>';
  for (var day = 1; day <= n; day++) {
    var k = m + '-' + L.pad(day), x = S.days[k], has = x && (x.score || x.touched || x.sleep);
    if (x && x.score) scores.push(x.score);
    if (x && x.sleep) sleeps.push(sleepMin(x.sleep));
    if (has && k <= t) rows.push(k);
    cells += '<button data-act="open" data-d="' + k + '"' + (k > t ? ' disabled' : '') + ' class="' + (k === t ? 'today' : '') + (has && !x.score ? ' dot' : '') + '"' +
      (x && x.score ? ' style="' + rampStyle(x.score) + '" aria-label="' + day + '일 ' + x.score + '점"' : ' aria-label="' + day + '일"') + '><small>' + day + '</small>' + (x && x.score ? '<b>' + x.score + '</b>' : '') + '</button>';
  }
  h += '<section class="card"><div class="cal head">' + '일월화수목금토'.split('').map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div><div class="cal">' + cells + '</div>' +
    '<div class="callegend"><span>낮음</span>' + [1, 3, 5, 7, 9].map(function (s) { return '<i style="background:' + RAMP[s] + '"></i>'; }).join('') + '<span>높음</span></div></section>';

  h += '<div class="tiles"><div class="tile"><span>평균 컨디션</span><b>' + (scores.length ? L.mean(scores).toFixed(1) : '–') + '</b></div>' +
    '<div class="tile"><span>기록한 아침</span><b>' + scores.length + '</b><small> 일</small></div>' +
    '<div class="tile"><span>평균 수면</span><b>' + (sleeps.length ? (L.mean(sleeps) / 60).toFixed(1) : '–') + '</b><small> 시간</small></div></div>';

  if (!rows.length) return h + '<section class="card"><p class="sub">이 달에는 기록이 없어요.</p></section>';
  rows.reverse().forEach(function (k) {
    var x = S.days[k], s = x.sleep, w = x.weather, tags = L.logText(S, x, L.CATS.map(function (c) { return c[0]; }));
    if (x.stress) tags += (tags ? ' · ' : '') + '스트레스 ' + x.stress;
    h += '<button class="card hist" data-act="open" data-d="' + k + '"><div class="row"><div class="score"' + (x.score ? ' style="' + rampStyle(x.score) + '"' : '') + '>' + (x.score || '–') + '</div>' +
      '<div class="grow"><b>' + shortLabel(k) + '</b><div class="sub">' + (s ? '수면 ' + L.dur(sleepMin(s)) : '수면 기록 없음') +
      (w ? ' · 일교차 ' + L.range(w) + '°' : '') + '</div>' + (tags ? '<div class="tags">' + esc(tags) + '</div>' : '') + '</div>' + ic('chev', 'dim') + '</div></button>';
  });
  return h;
}

/* ================= 분석 ================= */
function confTag(c) { return '<span class="conf c' + c + '">' + ['아직 불확실', '가능성 있음', '뚜렷함'][c] + '</span>'; }
function trendChart(from, to) {
  var days = Math.round((L.parse(to) - L.parse(from)) / 86400000) + 1, W = 340, H = 150, Lp = 22, R = 8, T = 10, B = 20, pts = [];
  for (var i = 0; i < days; i++) { var d = L.addDays(from, i), sc = peek(d).score; pts.push({ d: d, v: sc || null, x: Lp + (W - Lp - R) * (days === 1 ? 0.5 : i / (days - 1)) }); }
  function y(v) { return T + (H - T - B) * (10 - v) / 9; }
  var dense = days > 45, svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="아침 컨디션 점수 추이"><g class="axis">';
  [1, 4, 7, 10].forEach(function (v) {
    svg += '<line x1="' + Lp + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (Lp - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + '</text>';
  });
  [0, Math.round((days - 1) / 3), Math.round((days - 1) * 2 / 3), days - 1].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i) {
    var p = pts[i], dt = L.parse(p.d);
    svg += '<text x="' + p.x.toFixed(1) + '" y="' + (H - 5) + '" text-anchor="' + (i === 0 ? 'start' : i === days - 1 ? 'end' : 'middle') + '">' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</text>';
  });
  svg += '</g>';
  var path = '', open = false;
  if (dense) {
    // 기간이 길면 하루하루는 옅은 점으로, 흐름은 7일 이동 평균선으로
    pts.forEach(function (p, i) {
      var xs = []; for (var j = Math.max(0, i - 6); j <= i; j++) if (pts[j].v != null) xs.push(pts[j].v);
      if (xs.length < 3) { open = false; return; }
      path += (open ? 'L' : 'M') + p.x.toFixed(1) + ' ' + y(L.mean(xs)).toFixed(1); open = true;
    });
    pts.forEach(function (p) { if (p.v != null) svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="2" fill="var(--accent)" opacity=".35"/>'; });
  } else {
    pts.forEach(function (p) { if (p.v == null) { open = false; return; } path += (open ? 'L' : 'M') + p.x.toFixed(1) + ' ' + y(p.v).toFixed(1); open = true; });
  }
  svg += '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  svg += '<line id="cross" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--axis)" stroke-width="1" visibility="hidden"/>';
  if (!dense) pts.forEach(function (p) { if (p.v != null) svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>'; });
  svg += '</svg>';
  ui.chartPts = pts.filter(function (p) { return p.v != null; });
  ui.chartW = W;
  return '<div class="chart" id="trend">' + svg + '<div class="tip" hidden></div></div>' + (dense ? '<p class="muted">선은 7일 이동 평균, 점은 하루하루의 점수예요.</p>' : '');
}
function weekdayChart(ps) {
  var wd = L.weekdayAvg(ps), order = [1, 2, 3, 4, 5, 6, 0], W = 340, H = 120, T = 18, B = 20, bw = 26, gap = (W - 7 * bw) / 7;
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="요일별 평균 컨디션"><line x1="0" x2="' + W + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--axis)" stroke-width="1"/>';
  order.forEach(function (d, i) {
    var x = gap / 2 + i * (bw + gap), v = wd[d];
    svg += '<text class="axl" x="' + (x + bw / 2) + '" y="' + (H - 5) + '" text-anchor="middle">' + '일월화수목금토'[d] + '</text>';
    if (!v.n) return;
    var bh = (H - T - B) * v.avg / 10, top = H - B - bh;
    svg += '<path d="M' + x + ' ' + (H - B) + 'V' + (top + 4) + 'q0 -4 4 -4h' + (bw - 8) + 'q4 0 4 4V' + (H - B) + 'z" fill="var(--accent)"><title>' + '일월화수목금토'[d] + '요일 평균 ' + v.avg.toFixed(1) + '점 (' + v.n + '일)</title></path>' +
      '<text class="val" x="' + (x + bw / 2) + '" y="' + (top - 5) + '" text-anchor="middle">' + v.avg.toFixed(1) + '</text>';
  });
  return '<div class="chart">' + svg + '</svg></div>';
}
function bucketTable(b) {
  if (!b.rows.some(function (r) { return r.n; })) return '';
  return '<section class="card"><h2>' + b.title + '</h2><table><tr><th>구간</th><th class="n">평균 컨디션</th><th class="n">일수</th></tr>' +
    b.rows.map(function (r) { return '<tr><td>' + r.name + '</td><td class="n">' + (r.n ? r.avg.toFixed(1) : '–') + '</td><td class="n">' + r.n + '</td></tr>'; }).join('') + '</table></section>';
}
function viewStats() {
  var t = today(), per = ui.period, all = L.pairs(S), h = '<header class="top plain"><div class="ttl"><h1>분석</h1></div></header>';
  h += '<div class="seg" role="group" aria-label="기간">' + [[30, '30일'], [90, '90일'], [0, '전체']].map(function (x) {
    return '<button data-act="period" data-v="' + x[0] + '"' + (per === x[0] ? ' class="on" aria-pressed="true"' : '') + '>' + x[1] + '</button>';
  }).join('') + '</div>';
  if (!all.length) return h + '<section class="card empty-state">' + ic('stats') + '<h2>아직 분석할 기록이 없어요</h2><p class="sub">아침 컨디션 점수를 기록하면 여기에 분석이 쌓여요. 2주 정도 모이면 경향이 보이기 시작합니다.</p></section>';

  var from = per ? L.addDays(t, -(per - 1)) : all[0].date, ps = per ? L.pairs(S, from) : all;
  var span = Math.round((L.parse(t) - L.parse(from)) / 86400000) + 1;
  var prev = per ? all.filter(function (p) { return p.date < from && p.date >= L.addDays(from, -per); }) : [];
  var avgNow = L.mean(ps.map(function (p) { return p.score; })), avgPrev = L.mean(prev.map(function (p) { return p.score; }));
  var sl = ps.map(L.sleepHours).filter(function (v) { return v != null; });
  var delta = avgNow != null && avgPrev != null && prev.length >= 3 ? avgNow - avgPrev : null;
  h += '<div class="tiles"><div class="tile"><span>평균 컨디션</span><b>' + (avgNow == null ? '–' : avgNow.toFixed(1)) + '</b>' +
    (delta == null ? '<small> /10</small>' : '<small class="delta">이전 ' + per + '일보다 ' + signed(delta) + '</small>') + '</div>' +
    '<div class="tile"><span>평균 수면</span><b>' + (sl.length ? L.mean(sl).toFixed(1) : '–') + '</b><small> 시간</small></div>' +
    '<div class="tile"><span>기록한 아침</span><b>' + ps.length + '</b><small> / ' + span + '일</small></div></div>';
  if (!ps.length) return h + '<section class="card"><p class="sub">이 기간에는 아침 점수 기록이 없어요. 기간을 넓혀 보세요.</p></section>';

  var ins = L.insights(S, ps);
  h += '<section class="card"><div class="card-h"><h2>눈에 띄는 패턴</h2></div>';
  if (!ins.length) h += '<p class="muted">아직 뚜렷한 패턴이 없어요. 기록이 쌓이면 여기에 한 줄 요약이 나타납니다.</p>';
  else h += '<ul class="insights">' + ins.map(function (x) { return '<li class="' + (x.diff > 0 ? 'up' : 'down') + '"><p>' + esc(x.text) + '</p><div>' + confTag(x.conf) + '<span class="muted">' + esc(x.note) + '</span></div></li>'; }).join('') + '</ul>' +
    '<p class="muted">같이 일어난 일을 보여줄 뿐 원인을 증명하지는 않아요.</p>';
  h += '</section>';

  var chartFrom = per ? from : (span > 180 ? L.addDays(t, -179) : from);
  h += '<section class="card"><h2>아침 컨디션 추이</h2><p class="sub">' + (per ? '최근 ' + per + '일' : (span > 180 ? '최근 180일' : '전체 기간')) + ' · 그래프를 누르면 값이 보여요</p>' + trendChart(chartFrom, t) + '</section>';

  if (ps.length >= 7) h += '<section class="card"><h2>요일별 평균</h2><p class="sub">그 요일 아침의 평균 컨디션</p>' + weekdayChart(ps) + '</section>';

  var fx = L.factorEffects(S, ps);
  h += '<section class="card"><h2>전날 한 것에 따른 차이</h2><p class="sub">한 날과 안 한 날의 다음 날 아침 평균 점수 차이 · 눌러서 자세히</p>';
  if (!fx.length) h += '<p class="muted">아직 비교할 만큼 데이터가 없어요. 항목별로 한 날·안 한 날이 각각 2일 이상 쌓이면 표시됩니다.</p>';
  else {
    var max = Math.max.apply(null, fx.map(function (f) { return Math.abs(f.diff); }).concat([1]));
    h += '<div class="legend"><span><i style="background:var(--accent)"></i>한 날이 더 좋음</span><span><i style="background:var(--neg)"></i>한 날이 더 나쁨</span></div>';
    fx.forEach(function (f) {
      h += '<button class="factor" data-act="sheet" data-sheet="factor" data-id="' + f.id + '"><div class="name">' + esc(f.name) + '<small>' + ['아직 불확실', '가능성 있음', '뚜렷함'][f.conf] + ' · ' + f.yes + '일 / ' + f.no + '일</small></div>' +
        '<div class="bar"><i class="' + (f.diff >= 0 ? 'pos' : 'neg') + '" style="width:' + (Math.abs(f.diff) / max * 50).toFixed(1) + '%"></i></div>' +
        '<div class="val">' + signed(f.diff) + '</div></button>';
    });
  }
  h += '</section>';

  var gb = L.goodBad(S, ps);
  h += '<section class="card"><h2>좋은 날 vs 나쁜 날</h2>';
  if (gb.state === 'few') h += '<p class="muted">아침 점수가 6일 이상 쌓이면 표시됩니다.</p>';
  else if (gb.state === 'flat') h += '<p class="muted">아직 점수가 거의 비슷해서 나눌 수 없어요.</p>';
  else h += '<p class="sub">점수가 높은 날(' + gb.hi + '점 이상)과 낮은 날(' + gb.lo + '점 이하)의 평균</p><table><tr><th></th><th class="n">좋은 날</th><th class="n">나쁜 날</th></tr>' +
    gb.rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + r[1] + '</td><td class="n">' + r[2] + '</td></tr>'; }).join('') + '</table>';
  h += '</section>';

  L.bucketSet(ps).forEach(function (b) { h += bucketTable(b); });

  var fs = L.feelStats(S, ps);
  if (fs.length) h += '<section class="card"><h2>아침 몸 상태</h2><p class="sub">그 상태였던 날 수와 그날의 평균 점수</p><table><tr><th>상태</th><th class="n">평균 컨디션</th><th class="n">일수</th></tr>' +
    fs.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="n">' + r.avg.toFixed(1) + '</td><td class="n">' + r.n + '</td></tr>'; }).join('') + '</table></section>';

  h += '<section class="card ai">' + ic('spark') + '<h2>AI에게 더 깊은 분석 맡기기</h2><p class="sub">기록 전체를 분석 요청 문장과 함께 글로 정리해 Claude 같은 AI 앱으로 보냅니다. 메모 내용도 함께 들어가요.</p><button class="btn primary" data-act="ai">AI 앱으로 보내기</button></section>';
  return h;
}

/* ================= 설정 ================= */
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
function viewSettings() {
  var st = S.settings, access = N.hasUsageAccess(), h = '<header class="top plain"><div class="ttl"><h1>설정</h1></div></header>';
  h += '<section class="card"><div class="card-h"><h2>' + ic('moon') + '수면 자동 기록</h2><span class="tag ' + (access ? 'ok' : '') + '">' + (access ? '켜짐' : '꺼짐') + '</span></div>' +
    (access ? '' : '<div class="row wrap"><button class="btn primary" data-act="usage">사용 정보 접근 허용하기</button><button class="btn ghost" data-act="sheet" data-sheet="restricted">「액세스가 거부됨」이 뜰 때</button></div>') +
    '<label class="f" for="minor">새벽에 폰을 이보다 짧게 만지고 다시 안 만지면 "잠결"로 보고 무시</label>' +
    '<select id="minor" data-set="minorMin">' + [2, 3, 5, 10, 15].map(function (m) { return '<option value="' + m + '"' + (st.minorMin === m ? ' selected' : '') + '>' + m + '분</option>'; }).join('') + '</select></section>';

  h += '<section class="card"><div class="card-h"><h2>' + ic('bell') + '알림</h2></div><p class="sub">정한 시각에 울리고, 그날 이미 기록했으면 건너뜁니다.</p>';
  if (window.Native && N.notifPermission() !== 'granted') h += '<div class="inline-warn">알림 권한이 꺼져 있어요. <button class="link" data-act="notif">허용하기</button></div>';
  h += reminderRows() + '</section>';

  h += '<section class="card"><div class="card-h"><h2>' + ic('pin') + '날씨 지역</h2></div><p class="sub">위치(GPS)는 쓰지 않아요. 고른 지역의 기온·미세먼지만 가져옵니다.</p>' + citySelect() + '</section>';

  h += '<section class="card"><div class="card-h"><h2>' + ic('list') + '기록 항목</h2></div><p class="sub">항목을 눌러 이름·단위·순서를 바꾸거나 숨길 수 있어요.</p>';
  L.CATS.forEach(function (c) {
    h += '<div class="cat-h"><h3>' + c[1] + '</h3><button class="link" data-act="sheet" data-sheet="newItem" data-cat="' + c[0] + '">+ 추가</button></div><div class="itemlist">';
    S.items.filter(function (it) { return it.cat === c[0]; }).forEach(function (it) {
      h += '<button class="itemrow' + (it.off ? ' off' : '') + '" data-act="sheet" data-sheet="item" data-id="' + it.id + '"><span>' + esc(it.name) + (it.unit ? ' <small>' + esc(it.unit) + '</small>' : '') + '</span>' +
        (it.off ? '<small class="muted">숨김</small>' : '') + ic('chev', 'dim') + '</button>';
    });
    h += '</div>';
  });
  h += '</section>';

  h += '<section class="card"><div class="card-h"><h2>데이터</h2></div><p class="sub">기록은 이 폰 안에만 저장됩니다. 폰을 바꾸거나 앱을 지우기 전에 백업 파일로 내보내 두세요.</p>' +
    '<div class="menu"><button data-act="export">백업 파일로 내보내기' + ic('chev', 'dim') + '</button><button data-act="csv">엑셀용 CSV로 내보내기' + ic('chev', 'dim') + '</button>' +
    '<button data-act="import">백업 파일에서 가져오기' + ic('chev', 'dim') + '</button><button class="danger" data-act="wipe">모든 기록 지우기' + ic('chev', 'dim') + '</button></div></section>';

  h += '<section class="card"><div class="card-h"><h2>정보</h2></div><div class="menu"><button data-act="sheet" data-sheet="privacy">개인정보는 어떻게 다뤄지나요' + ic('chev', 'dim') + '</button>' +
    '<button data-act="sheet" data-sheet="whatsnew">2.0에서 달라진 점' + ic('chev', 'dim') + '</button></div>' +
    '<p class="muted about">컨디션 노트 ' + esc(N.appVersion ? N.appVersion() : '미리보기') + '<br>날씨·대기질 데이터: Open-Meteo.com (CC BY 4.0)</p></section>';
  return h;
}

/* ================= 첫 실행 안내 ================= */
var OB_STEPS = 5;
function viewOnboarding() {
  var i = ui.ob, access = N.hasUsageAccess(), body = '', next = '다음';
  if (i === 0) {
    body = '<div class="hero">' + ic('moon') + '</div><h1>컨디션 노트</h1><p class="lead">아침마다 컨디션 점수를 남기면, 전날 먹은 것·한 것·잠·날씨와 연결해서 무엇이 내 컨디션을 좌우하는지 찾아드려요.</p>' +
      '<ul class="feat"><li>' + ic('check') + '<span><b>잠은 자동으로</b> 폰을 마지막으로 만진 시각과 아침에 처음 만진 시각으로 기록</span></li>' +
      '<li>' + ic('check') + '<span><b>하루 세 번, 몇 초면 끝</b> 출근·퇴근·자기 전에 알림으로 알려드려요</span></li>' +
      '<li>' + ic('check') + '<span><b>기록은 내 폰 안에만</b> 서버로 보내지 않아요</span></li></ul>';
    next = '시작하기';
  } else if (i === 1) {
    body = '<div class="hero">' + ic('moon') + '</div><h1>수면 시간 자동 기록</h1><p class="lead">잠든 시각과 깬 시각을 직접 적지 않아도 되도록 폰 사용 기록을 읽어요. 새벽에 잠결에 잠깐 만진 건 구분해서 무시합니다.</p>' +
      '<div class="obbox"><div class="row between"><b>사용 정보 접근</b><span class="tag ' + (access ? 'ok' : '') + '">' + (access ? '허용됨' : '꺼짐') + '</span></div>' +
      (access ? '' : '<button class="btn primary block" data-act="usage">허용하러 가기</button>' +
        '<details><summary>「앱의 액세스가 거부됨」이 뜨나요?</summary>' + restrictedHelp() + '</details>') + '</div>' +
      '<p class="muted">화면이 켜지고 꺼진 시각만 읽으며, 어떤 앱을 썼는지는 저장하지 않아요.</p>';
    next = access ? '다음' : '나중에 하기';
  } else if (i === 2) {
    var granted = N.notifPermission() === 'granted';
    body = '<div class="hero">' + ic('bell') + '</div><h1>알림 시간</h1><p class="lead">기록할 때를 알려드려요. 시각은 내 생활에 맞게 바꾸세요. 그날 이미 기록했으면 울리지 않습니다.</p>' +
      '<div class="obbox">' + reminderRows() + '</div>' +
      (window.Native && !granted ? '<button class="btn primary block" data-act="notif">알림 허용하기</button>' : '');
  } else if (i === 3) {
    body = '<div class="hero">' + ic('pin') + '</div><h1>날씨 지역</h1><p class="lead">일교차와 미세먼지를 컨디션과 함께 보려고 날씨를 가져와요. 위치 권한은 쓰지 않으니 지역을 직접 골라 주세요.</p><div class="obbox">' + citySelect() + '</div>';
  } else {
    body = '<div class="hero">' + ic('list') + '</div><h1>기록할 항목</h1><p class="lead">안 쓰는 건 눌러서 빼세요. 내가 먹는 영양제 같은 새 항목은 설정에서 언제든 추가할 수 있어요.</p>';
    L.FACTOR_CATS.forEach(function (c) {
      var name = L.CATS.filter(function (x) { return x[0] === c; })[0][1];
      body += '<h3>' + name + '</h3><div class="chips">' + S.items.filter(function (it) { return it.cat === c; }).map(function (it) {
        return '<button class="chip' + (it.off ? '' : ' on') + '" data-act="obItem" data-id="' + it.id + '" aria-pressed="' + (it.off ? 'false' : 'true') + '">' + esc(it.name) + '</button>';
      }).join('') + '</div>';
    });
    next = '완료';
  }
  var dots = ''; for (var k = 0; k < OB_STEPS; k++) dots += '<i' + (k === i ? ' class="on"' : '') + '></i>';
  return '<div class="ob"><div class="ob-body">' + body + '</div><div class="ob-foot"><div class="dots">' + dots + '</div>' +
    '<div class="row">' + (i > 0 ? '<button class="btn" data-act="obPrev">이전</button>' : '') + '<button class="btn primary grow" data-act="obNext">' + next + '</button></div></div></div>';
}
function restrictedHelp() {
  return '<ol class="steps-ol"><li>뜬 창을 <b>닫기</b></li><li>폰 <b>설정 → 애플리케이션 → 컨디션 노트</b></li><li>오른쪽 위 <b>⋮</b> → <b>제한된 설정 허용</b></li><li>이 앱으로 돌아와 <b>허용하러 가기</b>를 다시 누르기</li></ol>' +
    '<p class="muted">스토어 밖에서 설치한 앱은 안드로이드가 이 권한을 기본으로 막아둬요. 한 번만 풀면 됩니다.</p>';
}

/* ================= 아래에서 올라오는 창 ================= */
function sheetHtml() {
  var sh = ui.sheet, h = '', it;
  if (!sh) return '';
  if (sh.type === 'confirm') {
    h = '<h2>' + esc(sh.title) + '</h2><p class="sub">' + esc(sh.body) + '</p><div class="row"><button class="btn grow" data-act="sheetClose">취소</button>' +
      '<button class="btn grow ' + (sh.danger ? 'dangerbtn' : 'primary') + '" data-act="sheetOk">' + esc(sh.ok) + '</button></div>';
  } else if (sh.type === 'item' || sh.type === 'newItem') {
    it = sh.type === 'item' ? S.items.filter(function (x) { return x.id === sh.id; })[0] : { name: '', unit: '', cat: sh.cat };
    if (!it) return '';
    var catName = L.CATS.filter(function (x) { return x[0] === it.cat; })[0][1];
    h = '<h2>' + (sh.type === 'item' ? '항목 수정' : catName + ' 항목 추가') + '</h2>' +
      '<label class="f" for="itName">이름</label><input type="text" id="itName" maxlength="30" value="' + esc(it.name) + '" placeholder="예: 아연, 필라테스">';
    if (it.cat !== 'feel') h += '<label class="f" for="itUnit">기록 방식</label><select id="itUnit">' + L.UNITS.map(function (u) { return '<option value="' + u + '"' + (u === it.unit ? ' selected' : '') + '>' + (u ? '양까지 기록 (' + u + ')' : '했는지만 체크') + '</option>'; }).join('') + '</select>';
    if (sh.type === 'item') {
      h += '<div class="row wrap tools"><button class="btn small" data-act="itemUp">위로</button><button class="btn small" data-act="itemDown">아래로</button>' +
        '<button class="btn small" data-act="itemOff">' + (it.off ? '다시 쓰기' : '숨기기') + '</button><button class="btn small dangertext" data-act="itemDel">삭제</button></div>' +
        '<p class="muted">숨기면 입력 화면에서만 사라지고 지난 기록과 분석에는 남아요. 삭제하면 지난 기록에서도 보이지 않습니다.</p>';
    }
    h += '<div class="row"><button class="btn grow" data-act="sheetClose">취소</button><button class="btn primary grow" data-act="itemSave">저장</button></div>';
  } else if (sh.type === 'factor') {
    var f = L.factorEffects(S, statPairs()).filter(function (x) { return x.id === sh.id; })[0];
    if (!f) return '';
    h = '<h2>' + esc(f.name) + '</h2><p class="sub">전날 기록한 날과 안 한 날의 다음 날 아침 컨디션</p>' +
      '<div class="cmp"><div><span>기록한 날</span><b>' + f.avgYes.toFixed(1) + '</b><small>' + f.yes + '일</small></div><div><span>안 한 날</span><b>' + f.avgNo.toFixed(1) + '</b><small>' + f.no + '일</small></div>' +
      '<div><span>차이</span><b>' + signed(f.diff) + '</b><small>점</small></div></div>' +
      '<p>' + confTag(f.conf) + '</p><p class="sub">' + ['두 묶음의 차이가 우연일 가능성이 아직 커요. 날짜가 더 쌓여야 알 수 있습니다.', '차이가 보이기 시작했지만 표본이 더 필요해요.', '날짜 수와 차이 크기로 볼 때 우연일 가능성이 낮아요.'][f.conf] +
      (f.avgAmount != null ? ' 기록한 날의 평균 양은 ' + f.avgAmount.toFixed(1) + f.unit + '이에요.' : '') + '</p>' +
      '<p class="muted">같이 일어난 일을 보여줄 뿐이에요. 예를 들어 술 마신 날은 늦게 자는 경우가 많아서, 술과 늦은 취침 중 무엇 때문인지는 이 숫자만으로 알 수 없습니다.</p>' +
      '<button class="btn block" data-act="sheetClose">닫기</button>';
  } else if (sh.type === 'restricted') {
    h = '<h2>「앱의 액세스가 거부됨」이 뜰 때</h2>' + restrictedHelp() + '<button class="btn block" data-act="sheetClose">닫기</button>';
  } else if (sh.type === 'privacy') {
    h = '<h2>개인정보는 어떻게 다뤄지나요</h2><ul class="plainlist"><li><b>기록은 이 폰 안에만 저장돼요.</b> 계정도 서버도 없습니다.</li>' +
      '<li><b>밖으로 나가는 건 날씨 요청뿐이에요.</b> 고른 지역의 좌표로 Open-Meteo에 기온과 대기질을 물어봅니다. 내 위치나 기록은 보내지 않아요.</li>' +
      '<li><b>폰 사용 기록은 화면이 켜지고 꺼진 시각만 읽어요.</b> 어떤 앱을 썼는지는 저장하지 않습니다.</li>' +
      '<li><b>「AI 앱으로 보내기」는 직접 누를 때만</b> 기록과 메모를 글로 만들어, 고른 앱에 넘깁니다.</li>' +
      '<li>폰의 구글 백업이 켜져 있으면 앱 데이터가 내 구글 계정에 백업될 수 있어요.</li>' +
      '<li>미세먼지 값은 측정소 실측이 아니라 대기 모델 추정치라서 에어코리아 수치와 다를 수 있어요.</li></ul><button class="btn block" data-act="sheetClose">닫기</button>';
  } else if (sh.type === 'whatsnew') {
    h = '<h2>2.0에서 달라진 점</h2><ul class="plainlist"><li><b>아침 몸 상태</b> 두통·피곤함 같은 상태를 점수와 함께 기록</li><li><b>미세먼지·기압</b> 날씨에 추가</li>' +
      '<li><b>달력</b> 한 달 컨디션을 색으로 한눈에</li><li><b>눈에 띄는 패턴</b> 분석 결과를 한 줄 요약과 신뢰도로</li><li><b>어제와 같게</b> 매일 먹는 영양제를 한 번에 체크</li>' +
      '<li><b>똑똑한 알림</b> 이미 기록했으면 울리지 않고, 30분 뒤 다시 알림 가능</li><li><b>항목 관리</b> 이름·순서 변경, 숨기기, CSV 내보내기</li></ul>' +
      '<button class="btn primary block" data-act="sheetClose">확인</button>';
  }
  return '<div class="sheet-back" data-act="sheetClose"></div><div class="sheet-body" role="dialog" aria-modal="true">' + h + '</div>';
}
