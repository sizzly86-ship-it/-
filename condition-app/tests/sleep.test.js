const {estimateSleep}=require('../app/src/main/assets/www/sleep.js');
const assert=require('assert');
const T=(d,h,m=0)=>new Date(2026,10,d,h,m).getTime();
const ses=(d,h,m,durMin,u=true)=>({s:T(d,h,m),e:T(d,h,m)+durMin*60000,u});
const hm=t=>new Date(t).toTimeString().slice(0,5);
const W=[T(9,18),T(10,15)];
// 1) 평범한 밤 + 새벽 3시 잠결 1분 + 4시 30초
let r=estimateSleep([ses(9,22,0,60),ses(9,23,20,15),ses(10,3,0,1),ses(10,4,0,.5),ses(10,7,10,1),ses(10,7,20,20)],...W);
assert.equal(hm(r.bed),'23:35');assert.equal(hm(r.wake),'07:10');assert.equal(r.wakeups,2);
// 2) 새벽에 20분 제대로 폰 함 -> 수면이 끊긴 것으로 보고 긴 쪽 선택
r=estimateSleep([ses(9,23,0,30),ses(10,2,0,20),ses(10,8,0,10)],...W);
assert.equal(hm(r.bed),'02:20');assert.equal(hm(r.wake),'08:00');
// 3) 잠금 해제 안 한 화면 켜짐(알림)은 무시
r=estimateSleep([ses(9,23,0,30),ses(10,3,0,1,false),ses(10,7,0,10)],...W);
assert.equal(hm(r.bed),'23:30');assert.equal(r.wakeups,0);
// 4) 아침 알람 끄고(30초) 20분 뒤 본격 사용 -> 알람 끈 시각이 기상
r=estimateSleep([ses(9,23,0,30),ses(10,6,30,.5),ses(10,6,50,30)],...W);
assert.equal(hm(r.wake),'06:30');
// 5) 데이터 없음
assert.equal(estimateSleep([],...W),null);
// 6) 일어나서 앱만 잠깐 연 경우(마지막 블록은 무시되지 않음)
r=estimateSleep([ses(9,23,50,10),ses(10,7,0,1)],...W);
assert.equal(hm(r.wake),'07:00');
console.log('sleep tests ok');
// 7) 저녁에 폰을 안 본 공백(19:00~21:30)은 밤잠이 아니다: 새벽 2시 이후에 끝나는 공백만 인정
r=estimateSleep([ses(9,18,30,30),ses(9,21,30,120)],T(9,18),T(10,4,30),{minWake:T(10,2)});
assert.equal(r,null);
r=estimateSleep([ses(9,18,30,30),ses(9,21,30,120),ses(10,6,0,10)],...W,{minWake:T(10,2)});
assert.equal(hm(r.bed),'23:30');assert.equal(hm(r.wake),'06:00');
console.log('minWake tests ok');
