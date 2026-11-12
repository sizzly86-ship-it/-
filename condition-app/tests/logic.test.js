// 실행: node tests/logic.test.js
const L = require('../app/src/main/assets/www/logic.js');
const assert = require('assert');
const day = (n) => L.addDays('2026-10-01', n);

// --- 날짜 ---
assert.equal(L.todayOf(new Date(2026, 10, 12, 3, 59).getTime()), '2026-11-11'); // 새벽 4시 전은 전날
assert.equal(L.todayOf(new Date(2026, 10, 12, 4, 0).getTime()), '2026-11-12');
assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
assert.equal(L.clock(L.bedMinutes(new Date(2026, 10, 12, 0, 30).getTime())), '00:30');
assert.ok(L.bedMinutes(new Date(2026, 10, 12, 0, 30).getTime()) > L.bedMinutes(new Date(2026, 10, 11, 23, 30).getTime()));

// --- 1.x 데이터 → 2.0 ---
const v1 = { version: 1, settings: { city: '서울', cityChosen: true, minorMin: 10, rem: { morning: { on: false, time: '07:10' } } },
  items: [{ id: 'i0', cat: 'supp', name: '비타민D', unit: '' }, { id: 'i30', cat: 'alcohol', name: '막걸리', unit: '잔' }], nextId: 31,
  days: { '2026-11-01': { score: 7, stress: 3, touched: true, log: { i0: 1, i30: 2, i99: 1 }, memo: 'm', sleep: { bed: 1000, wake: 9000, wakeups: 1 }, weather: { tmax: 15, tmin: 3, rain: 0, hum: 50, city: '서울', final: true } } } };
let s = L.normalize(JSON.parse(JSON.stringify(v1)));
assert.equal(s.version, 3);
assert.equal(s.settings.theme, 'a');
assert.equal(s.onboarded, true, '쓰던 사람은 첫 실행 안내를 건너뛴다');
assert.equal(s.whatsNew, true);
assert.equal(s.settings.city, '서울');
assert.equal(s.settings.minorMin, 10);
assert.deepEqual(s.settings.rem.morning, { on: false, time: '07:10', wd: false, auto: false });
assert.equal(s.items.filter((i) => i.cat === 'feel').length, 8, '아침 몸 상태 항목이 추가된다');
assert.ok(s.items.filter((i) => i.cat === 'feel').every((i) => +i.id.slice(1) >= 100), '삭제된 항목(i99)의 번호도 다시 쓰지 않는다');
assert.equal(s.days['2026-11-01'].score, 7);
assert.equal(s.days['2026-11-01'].weather.pm25, null);
// 두 번 정리해도 결과가 같다 (새 기능 안내 표시만 유지)
assert.deepEqual(L.normalize(JSON.parse(JSON.stringify(s))), s);
// 2.0 데이터는 새 디자인 안내만 한 번 띄운다
let s2 = L.freshState(); s2.version = 2; s2.onboarded = true; s2.settings.theme = 'b';
s2 = L.normalize(JSON.parse(JSON.stringify(s2)));
assert.equal(s2.whatsNew, true); assert.equal(s2.settings.theme, 'b'); assert.equal(s2.items.length, L.freshState().items.length);
assert.equal(L.normalize({ version: 3, days: {}, items: [], settings: { theme: 'zz' } }).settings.theme, 'a');
// 새 상태는 그대로 통과한다
const fresh = L.freshState();
assert.deepEqual(L.normalize(JSON.parse(JSON.stringify(fresh))), fresh);
assert.equal(fresh.onboarded, false);
// 조작된 값은 걸러진다
s = L.normalize({ days: { '2026-11-01': { score: '<img>', stress: 9, log: { 'i1"><x': 1, i1: 'abc', i2: 3 }, weather: { tmax: '<b>', tmin: 1 } }, 'bad<': {} },
  items: [{ id: 'i1"><img>', name: 'x', cat: 'supp' }, { id: 'i2', name: '<b>', cat: 'zz', unit: '<i>' }], settings: { city: '<x>' } });
assert.deepEqual(Object.keys(s.days), ['2026-11-01']);
assert.deepEqual(s.days['2026-11-01'], { log: { i2: 3 } });
assert.deepEqual(s.items.filter((i) => i.cat !== 'feel'), [{ id: 'i2', cat: 'etc', name: '<b>', unit: '' }]);
assert.equal(s.settings.city, '천안');

// --- 통계 ---
function build(n, fn) {
  const S = L.freshState();
  for (let i = 0; i < n; i++) { const d = { log: {}, touched: true }; fn(d, i); S.days[day(i)] = d; }
  return S;
}
// 술(i9) 마신 다음 날은 4점, 아니면 7점 (약간의 흔들림)
let S = build(40, (d, i) => { if (i % 3 === 0) d.log.i9 = 2; d.score = (i > 0 && (i - 1) % 3 === 0 ? 4 : 7) + (i % 2); d.stress = 1 + (i % 5); });
let ps = L.pairs(S);
assert.equal(ps.length, 40);
let fx = L.factorEffects(S, ps);
assert.equal(fx[0].name, '소주');
assert.ok(Math.abs(fx[0].diff + 3) < 0.3, '차이는 약 -3점');
assert.equal(fx[0].conf, 2);
assert.ok(Math.abs(fx[0].avgAmount - 2) < 1e-9);
assert.ok(L.insights(S, ps)[0].text.includes('소주') && L.insights(S, ps)[0].text.includes('낮았어요'));
// 기간 자르기
assert.equal(L.pairs(S, day(30)).length, 10);
// 표본이 적으면 불확실
assert.equal(L.confidence([7, 8], [4, 5]), 0);
assert.equal(L.confidence([7, 7, 8, 7, 8, 7], [4, 5, 4, 4, 5, 4]), 2);
assert.equal(L.confidence([5, 6, 5, 6, 5], [5, 6, 5, 6, 6]), 0);
// 전날 기록을 안 한 날은 "안 함"으로 치지 않는다
S = build(10, (d, i) => { d.score = 5; if (i < 5) delete d.touched; else if (i % 2) d.log.i0 = 1; });
fx = L.factorEffects(S, L.pairs(S));
assert.ok(fx.every((f) => f.yes + f.no <= 5));
// 좋은 날 / 나쁜 날
S = build(12, (d, i) => { d.score = i < 4 ? 3 : i < 8 ? 5 : 8; d.sleep = { bed: 0, wake: (i < 4 ? 5 : 8) * 3600000, wakeups: 0 }; });
let gb = L.goodBad(S, L.pairs(S));
assert.equal(gb.state, 'ok'); assert.equal(gb.hi, 8); assert.equal(gb.lo, 3);
assert.deepEqual(gb.rows[1], ['수면 시간', '8.0시간', '5.0시간']);
assert.equal(L.goodBad(S, L.pairs(S).slice(0, 5)).state, 'few');
S = build(12, (d) => { d.score = 5; });
assert.equal(L.goodBad(S, L.pairs(S)).state, 'flat');
// 가운데 점수에 몰려 있어도 위아래로 나눈다
S = build(12, (d, i) => { d.score = i < 2 ? 3 : i < 10 ? 5 : 7; });
gb = L.goodBad(S, L.pairs(S));
assert.equal(gb.state, 'ok'); assert.equal(gb.hi, 6); assert.equal(gb.lo, 4);
// 요일별
S = build(14, (d, i) => { d.score = L.parse(day(i)).getDay() === 0 ? 9 : 5; });
assert.equal(L.weekdayAvg(L.pairs(S))[0].avg, 9); assert.equal(L.weekdayAvg(L.pairs(S))[1].avg, 5);
// 연속 기록
S = build(5, (d) => { d.score = 6; });
assert.equal(L.streak(S, day(4)), 5);
assert.equal(L.streak(S, day(5)), 5, '오늘 아직 안 했어도 어제까지의 연속은 유지');
assert.equal(L.streak(S, day(6)), 0);

// --- 미세먼지 ---
assert.equal(L.pmGrade({ pm10: 20, pm25: 10 }), 0);
assert.equal(L.pmGrade({ pm10: 20, pm25: 40 }), 2);
assert.equal(L.pmGrade({ pm10: 160, pm25: 10 }), 3);
assert.equal(L.pmGrade({ pm10: null, pm25: null }), null);
assert.deepEqual(L.dailyAir({ time: ['2026-11-10T00:00', '2026-11-10T01:00', '2026-11-11T00:00'], pm10: [10, 20, null], pm2_5: [5, 6, 30] }),
  { '2026-11-10': { pm10: 15, pm25: 6 }, '2026-11-11': { pm10: null, pm25: 30 } });

// --- 알림 ---
S = L.freshState();
const T = '2026-11-12';
let p = L.reminderPayload(S, T);
assert.deepEqual(p.done, { date: T, morning: false, evening: false, night: false });
S.days[T] = { log: { i0: 1 }, score: 7, touched: true, logAt: new Date(2026, 10, 12, 8, 0).getTime() };
p = L.reminderPayload(S, T);
assert.equal(p.done.morning, true);
assert.equal(p.done.night, false, '아침에 영양제만 체크한 날은 자기 전 알림이 그대로 울린다');
S.days[T].logAt = new Date(2026, 10, 12, 21, 0).getTime();
assert.equal(L.reminderPayload(S, T).done.night, true);
// 자기 전 자동 조정: 평균 취침 00:30 → 00:00
S.settings.rem.night.auto = true;
assert.equal(L.reminderPayload(S, T).night.time, '22:00', '기록이 3일 미만이면 정해둔 시각');
for (let i = 0; i < 3; i++) S.days[L.addDays(T, -i)] = Object.assign(S.days[L.addDays(T, -i)] || { log: {} }, { sleep: { bed: new Date(2026, 10, 12 - i, 0, 30).getTime(), wake: new Date(2026, 10, 12 - i, 7, 0).getTime(), wakeups: 0 } });
assert.equal(L.autoNightTime(S, T), '00:00');
assert.equal(L.reminderPayload(S, T).night.time, '00:00');
assert.equal(S.settings.rem.night.time, '22:00', '저장된 설정은 바꾸지 않는다');

// --- 내보내기 ---
S = L.freshState();
S.days['2026-11-01'] = { log: { i9: 3, i0: 1 }, score: 4, memo: '머리 "띵", 함', touched: true, weather: { tmax: 15, tmin: 3, pm25: 20, pm10: 40 } };
const csv = L.csv(S).split('\r\n');
assert.ok(csv[0].charCodeAt(0) === 0xfeff);
assert.equal(csv.length, 2);
assert.ok(csv[1].startsWith('2026-11-01,4,'));
assert.ok(csv[1].includes('"머리 ""띵"", 함"'));
assert.equal(csv[0].split(',').length, 15 + S.items.length + 3);
S.days['2026-11-02'] = { log: {}, score: 6 };
const ai = L.aiText(S);
assert.ok(ai.includes('2026-11-02 | 6 |') && ai.includes('소주 3잔'));

console.log('logic tests ok');
