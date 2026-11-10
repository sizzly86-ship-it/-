// 폰 사용 세션으로 수면 구간을 추정한다.
// sessions: [{s, e, u}]  s/e = 화면 켜짐/꺼짐 시각(ms), u = 잠금 해제 여부
// 반환: {bed, wake, wakeups, durMin} 또는 null
(function (root) {
  var MIN = 60000;

  function buildBlocks(sessions, winStart, winEnd, clusterGapMin) {
    var list = sessions
      .filter(function (x) { return x.u && x.e > winStart && x.s < winEnd; })
      .map(function (x) { return { s: Math.max(x.s, winStart), e: Math.min(x.e, winEnd) }; })
      .sort(function (a, b) { return a.s - b.s; });
    var blocks = [];
    list.forEach(function (x) {
      var last = blocks[blocks.length - 1];
      if (last && x.s - last.e <= clusterGapMin * MIN) {
        last.e = Math.max(last.e, x.e);
        last.active += x.e - x.s;
      } else {
        blocks.push({ s: x.s, e: x.e, active: x.e - x.s });
      }
    });
    return blocks;
  }

  function estimateSleep(sessions, winStart, winEnd, opt) {
    opt = opt || {};
    var clusterGapMin = opt.clusterGapMin || 10;
    var minorMin = opt.minorMin || 5;        // 이보다 짧게 만지면 "잠결"로 본다
    var isoBeforeMin = opt.isoBeforeMin || 90; // 그 전에 이만큼은 안 만졌어야 하고
    var isoAfterMin = opt.isoAfterMin || 45;   // 그 뒤로도 이만큼은 다시 안 만져야 한다
    var minSleepMin = opt.minSleepMin || 120;

    var blocks = buildBlocks(sessions, winStart, winEnd, clusterGapMin);
    var kept = [], ignored = [];
    blocks.forEach(function (b, i) {
      var prev = kept[kept.length - 1];
      var next = blocks[i + 1];
      var minor = b.active < minorMin * MIN;
      var asleepBefore = prev && b.s - prev.e >= isoBeforeMin * MIN;
      var asleepAfter = next && next.s - b.e >= isoAfterMin * MIN;
      if (minor && asleepBefore && asleepAfter) ignored.push(b);
      else kept.push(b);
    });

    var best = null;
    for (var i = 0; i + 1 < kept.length; i++) {
      var gap = kept[i + 1].s - kept[i].e;
      if (gap >= minSleepMin * MIN && (!best || gap > best.gap)) {
        best = { gap: gap, bed: kept[i].e, wake: kept[i + 1].s };
      }
    }
    if (!best) return null;
    var wakeups = ignored.filter(function (b) { return b.s > best.bed && b.e < best.wake; }).length;
    return { bed: best.bed, wake: best.wake, wakeups: wakeups, durMin: Math.round(best.gap / MIN) };
  }

  root.estimateSleep = estimateSleep;
  if (typeof module !== 'undefined') module.exports = { estimateSleep: estimateSleep };
})(typeof window !== 'undefined' ? window : globalThis);
