'use strict';
/* 컨디션 노트 — 화면과 무관한 순수 로직 (데이터 정리, 통계, 내보내기). node에서 그대로 테스트한다. */
(function (root) {
  var MIN = 60000, HOUR = 3600000;

  var CATS = [['supp', '영양제'], ['exercise', '운동'], ['alcohol', '술'], ['food', '음식'], ['etc', '그 밖에'], ['feel', '아침 몸 상태']];
  // 전날 한 일로서 다음 날 아침 컨디션과 비교하는 분류 ('feel'은 아침 결과라서 제외)
  var FACTOR_CATS = ['supp', 'exercise', 'alcohol', 'food', 'etc'];
  var CITIES = [
    ['서울', 37.5665, 126.978], ['인천', 37.4563, 126.7052], ['수원', 37.2636, 127.0286], ['성남', 37.42, 127.1265],
    ['고양', 37.6584, 126.832], ['용인', 37.2411, 127.1776], ['평택', 36.9921, 127.1129], ['춘천', 37.8813, 127.7298],
    ['강릉', 37.7519, 128.8761], ['원주', 37.3422, 127.9202], ['천안', 36.8151, 127.1139], ['아산', 36.7898, 127.0018],
    ['대전', 36.3504, 127.3845], ['세종', 36.48, 127.289], ['청주', 36.6424, 127.489], ['전주', 35.8242, 127.148],
    ['광주', 35.1595, 126.8526], ['목포', 34.8118, 126.3922], ['여수', 34.7604, 127.6622], ['대구', 35.8714, 128.6014],
    ['포항', 36.019, 129.3435], ['안동', 36.5684, 128.7294], ['부산', 35.1796, 129.0756], ['울산', 35.5384, 129.3114],
    ['창원', 35.228, 128.6811], ['진주', 35.18, 128.1076], ['제주', 33.4996, 126.5312], ['서귀포', 33.2541, 126.56]
  ];
  var DEFAULT_ITEMS = [
    ['supp', '종합비타민', ''], ['supp', '비타민D', ''], ['supp', '마그네슘', ''], ['supp', '오메가3', ''], ['supp', '유산균', ''],
    ['exercise', '웨이트', '분'], ['exercise', '유산소', '분'], ['exercise', '걷기', '분'], ['exercise', '스트레칭', ''],
    ['alcohol', '소주', '잔'], ['alcohol', '맥주', '잔'], ['alcohol', '와인', '잔'],
    ['food', '야식', ''], ['food', '과식', ''], ['food', '매운 음식', ''], ['food', '밀가루', ''], ['food', '기름진 음식', ''],
    ['food', '커피', '잔'], ['food', '오후 늦은 카페인', ''],
    ['etc', '낮잠', ''], ['etc', '야근', ''], ['etc', '반신욕', '']
  ];
  var DEFAULT_FEEL = ['개운함', '피곤함', '두통', '목 칼칼함', '몸이 무거움', '속 불편', '붓기', '코막힘'];
  var REMINDERS = [
    // [id, 이름, 설명, 기본 시각, 기본으로 평일만 울릴지]
    ['morning', '출근할 때', '아침 컨디션 점수', '08:00', false],
    ['evening', '퇴근할 때', '오늘 받은 스트레스', '18:30', true],
    ['night', '자기 전', '먹은 것 · 운동 · 영양제', '22:00', false]
  ];
  var SCORE_WORDS = ['', '최악', '매우 나쁨', '나쁨', '조금 나쁨', '보통', '괜찮음', '좋은 편', '좋음', '매우 좋음', '최고'];
  var UNITS = ['', '분', '잔', '병', '회', '개'];

  /* ---------- 날짜 ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
  // 새벽 4시 전까지는 "어제"로 친다 (늦게 자는 날 기록이 다음 날로 넘어가지 않게)
  function todayOf(now) { return fmt(new Date(now - 4 * HOUR)); }
  function hm(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dur(min) { return Math.floor(min / 60) + '시간 ' + pad(min % 60) + '분'; }
  // 자정을 넘긴 취침 시각도 순서대로 비교할 수 있게 "전날 0시부터 몇 분"으로 바꾼다 (01:00 → 1500)
  function bedMinutes(ts) { var b = new Date(ts), m = b.getHours() * 60 + b.getMinutes(); return m < 900 ? m + 1440 : m; }
  function clock(min) { var a = ((Math.round(min) % 1440) + 1440) % 1440; return pad(Math.floor(a / 60)) + ':' + pad(a % 60); }

  /* ---------- 상태 ---------- */
  function freshState() {
    var items = DEFAULT_ITEMS.map(function (x, i) { return { id: 'i' + i, cat: x[0], name: x[1], unit: x[2] }; });
    DEFAULT_FEEL.forEach(function (n) { items.push({ id: 'i' + items.length, cat: 'feel', name: n, unit: '' }); });
    return {
      version: 2, onboarded: false,
      settings: {
        city: '천안', cityChosen: false, minorMin: 5,
        rem: { morning: { on: true, time: '08:00', wd: false, auto: false }, evening: { on: true, time: '18:30', wd: true, auto: false }, night: { on: true, time: '22:00', wd: false, auto: false } }
      },
      items: items, nextId: items.length, days: {}, weatherAt: 0, weatherCity: ''
    };
  }
  function num(v) { if (v == null || v === '') return null; v = Number(v); return isFinite(v) ? v : null; }
  function str(v, max) { return v == null ? '' : String(v).slice(0, max); }

  // 저장 파일·가져온 파일의 값을 화면에 넣기 전에 형태를 강제하고(조작된 파일 방어), 옛 버전 데이터를 새 형식으로 올린다
  function normalize(s) {
    var f = freshState();
    if (!s || typeof s !== 'object' || !s.days || typeof s.days !== 'object') return f;
    var st = s.settings && typeof s.settings === 'object' ? s.settings : {};
    var old = !(num(s.version) >= 2);
    var out = { version: 2, onboarded: !!s.onboarded, settings: f.settings, items: [], nextId: 0, days: {}, weatherAt: 0, weatherCity: '' };
    var known = CITIES.some(function (c) { return c[0] === st.city; });
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
      var o = { id: it.id, cat: CATS.some(function (c) { return c[0] === it.cat; }) ? it.cat : 'etc', name: str(it.name, 30) || '이름 없음', unit: UNITS.indexOf(it.unit) >= 0 ? it.unit : '' };
      if (it.off) o.off = true;
      out.items.push(o);
      out.nextId = Math.max(out.nextId, +it.id.slice(1) + 1);
    });
    Object.keys(s.days).forEach(function (k) {
      var x = s.days[k], d = { log: {} }, v;
      if (!/^\d{4}-\d\d-\d\d$/.test(k) || !x || typeof x !== 'object') return;
      v = Math.round(num(x.score)); if (v >= 1 && v <= 10) d.score = v;
      v = Math.round(num(x.stress)); if (v >= 1 && v <= 5) d.stress = v;
      ['memo', 'foodMemo', 'stressMemo'].forEach(function (m) { if (x[m]) d[m] = str(x[m], 500); });
      if (x.touched) d.touched = true;
      if (num(x.logAt)) d.logAt = num(x.logAt);
      if (x.sleep && num(x.sleep.bed) && num(x.sleep.wake) && num(x.sleep.wake) > num(x.sleep.bed)) {
        d.sleep = { bed: num(x.sleep.bed), wake: num(x.sleep.wake), wakeups: Math.max(0, Math.round(num(x.sleep.wakeups) || 0)) };
        if (x.sleep.manual) d.sleep.manual = true;
        if (x.sleep.prov) d.sleep.prov = true;
      }
      var w = x.weather;
      if (w && num(w.tmax) != null && num(w.tmin) != null) {
        d.weather = { tmax: num(w.tmax), tmin: num(w.tmin), rain: num(w.rain), hum: num(w.hum), pres: num(w.pres), pm10: num(w.pm10), pm25: num(w.pm25), city: str(w.city, 10), final: !!w.final };
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
    if (old) {
      // 1.x → 2.0: 아침 몸 상태 항목을 추가하고, 이미 쓰던 사람은 첫 실행 안내 대신 새 기능 안내를 보여준다
      if (!out.items.some(function (it) { return it.cat === 'feel'; })) {
        DEFAULT_FEEL.forEach(function (n) { out.items.push({ id: 'i' + (out.nextId++), cat: 'feel', name: n, unit: '' }); });
      }
      out.onboarded = true;
      out.whatsNew = true;
      out.weatherAt = 0; // 미세먼지·기압을 채우려고 날씨를 한 번 다시 받는다
    } else if (s.whatsNew) out.whatsNew = true;
    return out;
  }

  /* ---------- 통계 도우미 ---------- */
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function variance(a) { if (a.length < 2) return 0; var m = mean(a); return a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1); }
  // 두 묶음의 평균 차이가 얼마나 믿을 만한지: 0 = 아직 불확실, 1 = 가능성 있음, 2 = 뚜렷함 (Welch t 통계량 + 표본 수)
  function confidence(a, b) {
    var n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    var diff = Math.abs(mean(a) - mean(b)), se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
    var t = se > 0 ? diff / se : (diff > 0 ? 99 : 0);
    if (n >= 5 && t >= 2.6) return 2;
    if (n >= 3 && t >= 1.7) return 1;
    return 0;
  }

  // 아침 점수가 있는 날 D와 그 전날(D-1)의 기록을 한 쌍으로 묶는다. from이 있으면 그 날짜부터만
  function pairs(S, from) {
    return Object.keys(S.days).sort().filter(function (k) { return S.days[k].score && (!from || k >= from); }).map(function (k) {
      return { date: k, score: S.days[k].score, cur: S.days[k], prev: S.days[addDays(k, -1)] || null };
    });
  }
  function sleepHours(p) { return p.cur.sleep ? (p.cur.sleep.wake - p.cur.sleep.bed) / HOUR : null; }
  function range(w) { return Math.round((w.tmax - w.tmin) * 10) / 10; }
  // 미세먼지 등급 (환경부 24시간 기준, PM10·PM2.5 중 나쁜 쪽): 0 좋음 · 1 보통 · 2 나쁨 · 3 매우 나쁨
  var PM_WORDS = ['좋음', '보통', '나쁨', '매우 나쁨'];
  function pmGrade(w) {
    if (!w || (w.pm10 == null && w.pm25 == null)) return null;
    var a = w.pm10 == null ? 0 : w.pm10 <= 30 ? 0 : w.pm10 <= 80 ? 1 : w.pm10 <= 150 ? 2 : 3;
    var b = w.pm25 == null ? 0 : w.pm25 <= 15 ? 0 : w.pm25 <= 35 ? 1 : w.pm25 <= 75 ? 2 : 3;
    return Math.max(a, b);
  }

  function factorItems(S) { return S.items.filter(function (it) { return FACTOR_CATS.indexOf(it.cat) >= 0; }); }
  function factorEffects(S, ps) {
    var out = [];
    factorItems(S).forEach(function (it) {
      var yes = [], no = [], amounts = [];
      ps.forEach(function (p) {
        if (!p.prev || !p.prev.touched) return; // 전날 기록을 안 한 날은 "안 함"으로 치지 않는다
        var v = p.prev.log && p.prev.log[it.id];
        if (v) { yes.push(p.score); amounts.push(v); } else no.push(p.score);
      });
      if (yes.length >= 2 && no.length >= 2) {
        out.push({ id: it.id, name: it.name, cat: it.cat, unit: it.unit, yes: yes.length, no: no.length, avgYes: mean(yes), avgNo: mean(no), diff: mean(yes) - mean(no), conf: confidence(yes, no), avgAmount: it.unit ? mean(amounts) : null });
      }
    });
    return out.sort(function (a, b) { return b.conf - a.conf || Math.abs(b.diff) - Math.abs(a.diff); });
  }
  function buckets(ps, getter, defs) {
    return defs.map(function (b) {
      var xs = [];
      ps.forEach(function (p) { var v = getter(p); if (v != null && v >= b[1] && v < b[2]) xs.push(p.score); });
      return { name: b[0], n: xs.length, avg: mean(xs), scores: xs };
    });
  }
  var BUCKETS = {
    sleep: { title: '수면 시간별', get: sleepHours, defs: [['6시간 미만', 0, 6], ['6~7시간', 6, 7], ['7~8시간', 7, 8], ['8시간 이상', 8, 99]] },
    bed: { title: '잠든 시각별', get: function (p) { return p.cur.sleep ? bedMinutes(p.cur.sleep.bed) / 60 : null; }, defs: [['밤 11시 전', 15, 23], ['11시~12시', 23, 24], ['12시~1시', 24, 25], ['새벽 1시 이후', 25, 40]] },
    range: { title: '전날 일교차별', get: function (p) { return p.prev && p.prev.weather ? range(p.prev.weather) : null; }, defs: [['8° 미만', -99, 8], ['8~12°', 8, 12], ['12° 이상', 12, 99]] },
    pm: { title: '전날 미세먼지별', get: function (p) { return p.prev ? pmGrade(p.prev.weather) : null; }, defs: [['좋음', 0, 1], ['보통', 1, 2], ['나쁨 이상', 2, 9]] },
    stress: { title: '전날 스트레스별', get: function (p) { return p.prev && p.prev.stress ? p.prev.stress : null; }, defs: [['낮음 (1~2)', 1, 3], ['보통 (3)', 3, 4], ['높음 (4~5)', 4, 6]] }
  };
  function bucketSet(ps) {
    return Object.keys(BUCKETS).map(function (k) { return { key: k, title: BUCKETS[k].title, rows: buckets(ps, BUCKETS[k].get, BUCKETS[k].defs) }; });
  }
  function weekdayAvg(ps) {
    var by = [[], [], [], [], [], [], []];
    ps.forEach(function (p) { by[parse(p.date).getDay()].push(p.score); });
    return by.map(function (xs) { return { n: xs.length, avg: mean(xs) }; });
  }

  // 점수 상위 1/3인 날과 하위 1/3인 날의 평균을 나란히 놓는다
  function goodBad(S, ps) {
    if (ps.length < 6) return { state: 'few' };
    var sc = ps.map(function (p) { return p.score; }).sort(function (a, b) { return a - b; });
    var lo = sc[Math.floor((sc.length - 1) / 3)], hi = sc[Math.ceil((sc.length - 1) * 2 / 3)];
    if (hi <= lo) { hi = lo + 1; lo = lo - 1; } // 가운데 점수에 몰려 있으면 그 점수보다 높은 날 / 낮은 날로 나눈다
    var G = ps.filter(function (p) { return p.score >= hi; }), B = ps.filter(function (p) { return p.score <= lo; });
    if (G.length < 2 || B.length < 2) return { state: 'flat' };
    function m(list, get, digits, unit) {
      var xs = []; list.forEach(function (p) { var v = get(p); if (v != null) xs.push(v); });
      return xs.length ? mean(xs).toFixed(digits) + unit : '–';
    }
    function bed(list) { var xs = []; list.forEach(function (p) { if (p.cur.sleep) xs.push(bedMinutes(p.cur.sleep.bed)); }); return xs.length ? clock(mean(xs)) : '–'; }
    var gets = {
      wake: function (p) { return p.cur.sleep ? p.cur.sleep.wakeups : null; },
      stress: function (p) { return p.prev && p.prev.stress ? p.prev.stress : null; },
      range: function (p) { return p.prev && p.prev.weather ? range(p.prev.weather) : null; },
      pm: function (p) { return p.prev && p.prev.weather && p.prev.weather.pm25 != null ? p.prev.weather.pm25 : null; }
    };
    var rows = [
      ['일수', G.length + '일', B.length + '일'],
      ['수면 시간', m(G, sleepHours, 1, '시간'), m(B, sleepHours, 1, '시간')],
      ['잠든 시각', bed(G), bed(B)],
      ['새벽에 폰 만진 횟수', m(G, gets.wake, 1, '회'), m(B, gets.wake, 1, '회')],
      ['전날 스트레스', m(G, gets.stress, 1, ''), m(B, gets.stress, 1, '')],
      ['전날 일교차', m(G, gets.range, 1, '°'), m(B, gets.range, 1, '°')],
      ['전날 초미세먼지', m(G, gets.pm, 0, ''), m(B, gets.pm, 0, '')]
    ].filter(function (r) { return r[1] !== '–' || r[2] !== '–'; });
    // 전날 한 비율이 두 그룹 사이에 가장 크게 갈리는 항목 5개
    var its = [];
    factorItems(S).forEach(function (it) {
      function rate(list) { var n = 0, y = 0; list.forEach(function (p) { if (p.prev && p.prev.touched) { n++; if (p.prev.log[it.id]) y++; } }); return n >= 2 ? y / n : null; }
      var g = rate(G), b = rate(B);
      if (g != null && b != null && g !== b) its.push({ name: it.name, g: g, b: b });
    });
    its.sort(function (x, y) { return Math.abs(y.g - y.b) - Math.abs(x.g - x.b); }).slice(0, 5).forEach(function (x) {
      rows.push(['전날 ' + x.name, Math.round(x.g * 100) + '%', Math.round(x.b * 100) + '%']);
    });
    return { state: 'ok', hi: hi, lo: lo, rows: rows };
  }

  // 사람이 읽는 한 줄 요약들. 믿을 만한 것(conf ≥ 1)만, 뚜렷한 순서로
  function insights(S, ps) {
    var out = [];
    factorEffects(S, ps).forEach(function (f) {
      if (f.conf < 1 || Math.abs(f.diff) < 0.3) return;
      out.push({ conf: f.conf, diff: f.diff, text: '「' + f.name + '」 기록한 다음 날 아침은 평균 ' + Math.abs(f.diff).toFixed(1) + '점 ' + (f.diff > 0 ? '높았어요' : '낮았어요'), note: '기록한 날 ' + f.yes + '일 · 안 한 날 ' + f.no + '일' });
    });
    function cmp(a, b, textFn) {
      if (a.n < 3 || b.n < 3) return;
      var c = confidence(a.scores, b.scores), d = a.avg - b.avg;
      if (c < 1 || Math.abs(d) < 0.3) return;
      out.push({ conf: c, diff: d, text: textFn(Math.abs(d).toFixed(1), d > 0), note: a.name + ' ' + a.n + '일 · ' + b.name + ' ' + b.n + '일' });
    }
    function merge(name, rows) { var xs = []; rows.forEach(function (r) { xs = xs.concat(r.scores); }); return { name: name, n: xs.length, avg: mean(xs), scores: xs }; }
    var bs = {}; bucketSet(ps).forEach(function (b) { bs[b.key] = b.rows; });
    cmp(merge('7시간 이상', [bs.sleep[2], bs.sleep[3]]), bs.sleep[0], function (d, up) { return '7시간 이상 잔 날은 6시간 미만으로 잔 날보다 평균 ' + d + '점 ' + (up ? '높았어요' : '낮았어요'); });
    cmp(merge('12시 전', [bs.bed[0], bs.bed[1]]), bs.bed[3], function (d, up) { return '자정 전에 잠든 날은 새벽 1시 넘어 잠든 날보다 평균 ' + d + '점 ' + (up ? '높았어요' : '낮았어요'); });
    cmp(bs.stress[2], bs.stress[0], function (d, up) { return '전날 스트레스가 높았던 날은 낮았던 날보다 평균 ' + d + '점 ' + (up ? '높았어요' : '낮았어요'); });
    cmp(bs.range[2], bs.range[0], function (d, up) { return '전날 일교차가 12° 이상이면 8° 미만일 때보다 평균 ' + d + '점 ' + (up ? '높았어요' : '낮았어요'); });
    cmp(bs.pm[2], bs.pm[0], function (d, up) { return '전날 미세먼지가 나쁨 이상이면 좋음일 때보다 평균 ' + d + '점 ' + (up ? '높았어요' : '낮았어요'); });
    return out.sort(function (a, b) { return b.conf - a.conf || Math.abs(b.diff) - Math.abs(a.diff); }).slice(0, 5);
  }

  // 아침 몸 상태(증상)별: 그 상태였던 날 수와 그날의 평균 점수
  function feelStats(S, ps) {
    return S.items.filter(function (it) { return it.cat === 'feel'; }).map(function (it) {
      var xs = []; ps.forEach(function (p) { if (p.cur.log && p.cur.log[it.id]) xs.push(p.score); });
      return { name: it.name, n: xs.length, avg: mean(xs) };
    }).filter(function (x) { return x.n; }).sort(function (a, b) { return b.n - a.n; });
  }

  // 오늘(또는 어제)까지 아침 점수를 연속으로 기록한 일수
  function streak(S, today) {
    var d = S.days[today] && S.days[today].score ? today : addDays(today, -1), n = 0;
    while (S.days[d] && S.days[d].score) { n++; d = addDays(d, -1); }
    return n;
  }

  // 최근 7일 동안 실제로 잠든 시각의 평균에서 30분을 뺀 시각 (기록이 3일 미만이면 null)
  function autoNightTime(S, today) {
    var xs = [];
    for (var i = 0; i < 7; i++) { var d = S.days[addDays(today, -i)]; if (d && d.sleep) xs.push(bedMinutes(d.sleep.bed)); }
    if (xs.length < 3) return null;
    return clock(Math.round((mean(xs) - 30) / 5) * 5);
  }
  // 알림으로 보낼 설정: 자동 조정된 자기 전 시각과, 오늘 이미 기록해서 건너뛸 알림
  function reminderPayload(S, today) {
    var rem = JSON.parse(JSON.stringify(S.settings.rem)), at = rem.night.auto ? autoNightTime(S, today) : null;
    if (at) rem.night.time = at;
    var d = S.days[today] || {}, t = rem.night.time.split(':'), night = parse(today);
    night.setHours(+t[0], +t[1]);
    if (+t[0] < 4) night.setDate(night.getDate() + 1); // 자정 넘은 알림 시각은 다음 날 새벽이다
    // 자기 전 기록은 알림 3시간 전 이후에 손댔을 때만 "했다"로 친다 (아침에 영양제만 체크한 날은 저녁에 다시 알려야 하므로)
    rem.done = { date: today, morning: !!d.score, evening: !!d.stress, night: !!(d.logAt && d.logAt >= night.getTime() - 3 * HOUR) };
    return rem;
  }
  function doneState(S, date) {
    var d = S.days[date] || {};
    return { morning: !!d.score, evening: !!d.stress, night: !!d.logAt || !!d.foodMemo };
  }

  /* ---------- 내보내기 ---------- */
  function logText(S, d, cats) {
    var parts = [];
    S.items.forEach(function (it) { var v = d.log && d.log[it.id]; if (v && cats.indexOf(it.cat) >= 0) parts.push(it.name + (it.unit ? ' ' + v + it.unit : '')); });
    return parts.join(' · ');
  }
  function csv(S) {
    function q(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var its = S.items, head = ['날짜', '아침점수', '잠든시각', '깬시각', '수면(분)', '새벽에 폰 만진 횟수', '스트레스', '최저기온', '최고기온', '일교차', '습도', '강수', '기압', 'PM10', 'PM2.5']
      .concat(its.map(function (it) { return it.name + (it.unit ? '(' + it.unit + ')' : ''); })).concat(['아침 메모', '먹은 것 메모', '스트레스 메모']);
    var lines = [head.map(q).join(',')];
    Object.keys(S.days).sort().forEach(function (k) {
      var d = S.days[k], s = d.sleep, w = d.weather || {};
      var row = [k, d.score, s ? hm(s.bed) : '', s ? hm(s.wake) : '', s ? Math.round((s.wake - s.bed) / MIN) : '', s ? s.wakeups : '', d.stress,
        w.tmin, w.tmax, d.weather ? range(w) : '', w.hum, w.rain, w.pres, w.pm10, w.pm25]
        .concat(its.map(function (it) { return d.log[it.id] || ''; })).concat([d.memo, d.foodMemo, d.stressMemo]);
      lines.push(row.map(q).join(','));
    });
    return '\ufeff' + lines.join('\r\n'); // 엑셀에서 한글이 깨지지 않게 BOM을 붙인다
  }
  // AI에게 넘길 텍스트: 부탁하는 말 + 하루에 한 줄짜리 표
  function aiText(S) {
    var ps = pairs(S).slice(-120), lines = [];
    lines.push('아래는 내가 매일 기록한 컨디션 데이터야. 각 줄의 "아침점수"는 그날 자고 일어났을 때 컨디션(1~10, 높을수록 좋음)이고, "전날"로 시작하는 값은 그 전날 있었던 일이야.');
    lines.push('이 데이터를 분석해서 알려줘: (1) 컨디션이 좋은 날과 나쁜 날에 공통으로 보이는 패턴, (2) 영향이 커 보이는 요인을 큰 순서대로, 근거 수치와 함께, (3) 여러 요인이 겹칠 때의 효과(예: 술 + 늦게 잠), (4) 표본이 적어서 아직 믿기 어려운 부분, (5) 앞으로 2주 동안 해볼 만한 실험 2~3가지. 인과관계로 단정하지 말고, 날짜 수가 적은 결론은 그렇다고 말해줘.');
    lines.push('');
    lines.push('지역: ' + S.settings.city + ' / 기록 ' + ps.length + '일');
    lines.push('날짜 | 아침점수 | 아침 몸 상태 | 잠든시각 | 깬시각 | 수면시간 | 새벽에 폰 만진 횟수 | 전날 스트레스(1~5) | 전날 최저~최고기온(일교차) | 전날 초미세먼지(PM2.5) | 전날 한 것·먹은 것 | 메모');
    ps.forEach(function (p) {
      var s = p.cur.sleep, pv = p.prev || {}, w = pv.weather, memo = [];
      if (p.cur.memo) memo.push('아침: ' + p.cur.memo);
      if (pv.foodMemo) memo.push('전날 식사: ' + pv.foodMemo);
      if (pv.stressMemo) memo.push('전날 스트레스: ' + pv.stressMemo);
      lines.push([p.date, p.score, logText(S, p.cur, ['feel']) || '-', s ? hm(s.bed) : '?', s ? hm(s.wake) : '?', s ? ((s.wake - s.bed) / HOUR).toFixed(1) + 'h' : '?', s ? s.wakeups : '?',
        pv.stress || '?', w ? w.tmin + '~' + w.tmax + '(' + range(w) + ')' : '?', w && w.pm25 != null ? w.pm25 : '?',
        pv.touched ? (logText(S, pv, FACTOR_CATS) || '없음') : '기록 안 함', memo.join(' / ').replace(/[\n|]/g, ' ')].join(' | '));
    });
    return lines.join('\n');
  }

  // 시간별 미세먼지 값을 날짜별 평균으로 묶는다: {'2026-11-10': {pm10, pm25}}
  function dailyAir(hourly) {
    var acc = {};
    (hourly.time || []).forEach(function (t, i) {
      var d = t.slice(0, 10), a = acc[d] || (acc[d] = { p10: [], p25: [] });
      if (hourly.pm10 && hourly.pm10[i] != null) a.p10.push(hourly.pm10[i]);
      if (hourly.pm2_5 && hourly.pm2_5[i] != null) a.p25.push(hourly.pm2_5[i]);
    });
    var out = {};
    Object.keys(acc).forEach(function (d) {
      out[d] = { pm10: acc[d].p10.length ? Math.round(mean(acc[d].p10)) : null, pm25: acc[d].p25.length ? Math.round(mean(acc[d].p25)) : null };
    });
    return out;
  }

  var L = {
    CATS: CATS, FACTOR_CATS: FACTOR_CATS, CITIES: CITIES, REMINDERS: REMINDERS, SCORE_WORDS: SCORE_WORDS, UNITS: UNITS, PM_WORDS: PM_WORDS,
    pad: pad, fmt: fmt, parse: parse, addDays: addDays, todayOf: todayOf, hm: hm, dur: dur, bedMinutes: bedMinutes, clock: clock,
    freshState: freshState, normalize: normalize, mean: mean, confidence: confidence, pairs: pairs, sleepHours: sleepHours, range: range, pmGrade: pmGrade,
    factorEffects: factorEffects, bucketSet: bucketSet, weekdayAvg: weekdayAvg, goodBad: goodBad, insights: insights, feelStats: feelStats, streak: streak,
    autoNightTime: autoNightTime, reminderPayload: reminderPayload, doneState: doneState, logText: logText, csv: csv, aiText: aiText, dailyAir: dailyAir
  };
  root.L = L;
  if (typeof module !== 'undefined') module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
