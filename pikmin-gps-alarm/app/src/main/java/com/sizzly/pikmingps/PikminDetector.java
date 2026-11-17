package com.sizzly.pikmingps;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Build;
import android.os.Process;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 안드로이드 '사용 기록'으로 피크민 블룸이 꽃을 심는 중인지 알아낸다.
 * 피크민은 꽃 심기를 켜고 백그라운드로 가면 '백그라운드 작업(포그라운드 서비스)'을
 * 돌리는데(그래서 '꽃 심는 중' 알림이 뜸), 그 시작/종료가 사용 기록에 남는다.
 * (알림 읽기 권한은 Play 프로텍트가 막아서 이 방법을 씀)
 */
final class PikminDetector {

    static final String PIKMIN_PKG = "com.nianticlabs.pikmin";

    static volatile boolean planting = false;
    static volatile boolean onScreen = false;

    private static final Set<String> runningServices = new HashSet<>();
    private static final LinkedList<String> log = new LinkedList<>();
    private static final LinkedHashSet<String> seen = new LinkedHashSet<>();
    private static long lastEnd = 0;

    private PikminDetector() { }

    /** 사용 기록을 새로 읽는다. 꽃 심기 상태가 바뀌었으면 true */
    static synchronized boolean poll(Context ctx) {
        if (!hasAccess(ctx)) {
            boolean changed = planting;
            planting = false;
            return changed;
        }
        UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
        long now = System.currentTimeMillis();
        // 처음엔 12시간 전부터 훑어서 현재 상태를 복원, 이후엔 조금씩 겹쳐서 읽음
        long from = lastEnd == 0 ? now - 12 * 60 * 60 * 1000L : lastEnd - 10_000L;
        lastEnd = now;

        UsageEvents events;
        try {
            events = usm.queryEvents(from, now);
        } catch (Exception e) {
            return false;
        }
        if (events == null) return false;

        SimpleDateFormat fmt = new SimpleDateFormat("HH:mm:ss", Locale.KOREA);
        UsageEvents.Event ev = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(ev);
            if (!PIKMIN_PKG.equals(ev.getPackageName())) continue;
            int type = ev.getEventType();
            String cls = ev.getClassName() == null ? "" : ev.getClassName();
            String key = ev.getTimeStamp() + "/" + type + "/" + cls;
            if (!seen.add(key)) continue;
            if (seen.size() > 300) {
                Iterator<String> it = seen.iterator();
                it.next();
                it.remove();
            }
            String what;
            if (type == UsageEvents.Event.FOREGROUND_SERVICE_START) {
                runningServices.add(cls);
                what = "백그라운드 작업 시작 (" + shortName(cls) + ")";
            } else if (type == UsageEvents.Event.FOREGROUND_SERVICE_STOP) {
                runningServices.remove(cls);
                what = "백그라운드 작업 끝 (" + shortName(cls) + ")";
            } else if (type == UsageEvents.Event.ACTIVITY_RESUMED) {
                onScreen = true;
                what = "화면에 열림";
            } else if (type == UsageEvents.Event.ACTIVITY_PAUSED
                    || type == UsageEvents.Event.ACTIVITY_STOPPED) {
                if (!onScreen) continue;
                onScreen = false;
                what = "화면에서 내려감";
            } else {
                continue;
            }
            log.addFirst(fmt.format(ev.getTimeStamp()) + "  " + what);
            while (log.size() > 8) log.removeLast();
        }

        boolean now_planting = !runningServices.isEmpty();
        boolean changed = now_planting != planting;
        planting = now_planting;
        return changed;
    }

    static synchronized List<String> recentLog() {
        return new ArrayList<>(log);
    }

    static boolean hasAccess(Context ctx) {
        AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        int mode;
        if (Build.VERSION.SDK_INT >= 29) {
            mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(), ctx.getPackageName());
        } else {
            mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(), ctx.getPackageName());
        }
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private static String shortName(String cls) {
        int i = cls.lastIndexOf('.');
        return i >= 0 ? cls.substring(i + 1) : cls;
    }
}
