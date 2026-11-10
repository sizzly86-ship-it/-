package app.condition;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Process;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** 폰 사용 기록(화면 켜짐/꺼짐, 잠금 해제)을 "사용 세션" 목록으로 바꾼다. */
final class UsageReader {
    private static final int ACTIVITY_RESUMED = 1;
    private static final int SCREEN_INTERACTIVE = 15;
    private static final int SCREEN_NON_INTERACTIVE = 16;
    private static final int KEYGUARD_SHOWN = 17;
    private static final int KEYGUARD_HIDDEN = 18;
    private static final int DEVICE_SHUTDOWN = 26;

    private static final class Session {
        long start, end;
        boolean unlocked;
        int resumes;
    }

    static boolean hasAccess(Context c) {
        AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        @SuppressWarnings("deprecation")
        int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** from~to 사이에 걸친 세션을 JSON 배열로: [{s, e, u, r}] */
    static String sessions(Context c, long from, long to) throws Exception {
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        // 잠금 상태를 알아내려고 조금 앞에서부터 읽는다
        UsageEvents events = usm.queryEvents(from - 6 * 3600_000L, to);
        List<Session> out = new ArrayList<>();
        UsageEvents.Event e = new UsageEvents.Event();
        Session cur = null;
        boolean locked = true;
        boolean sawKeyguard = false;
        boolean sawScreen = false; // 화면 켜짐/꺼짐 이벤트를 한 번이라도 봤는지

        while (events != null && events.hasNextEvent()) {
            events.getNextEvent(e);
            long t = e.getTimeStamp();
            switch (e.getEventType()) {
                case SCREEN_INTERACTIVE:
                    sawScreen = true;
                    if (cur == null) {
                        cur = new Session();
                        cur.start = t;
                        cur.unlocked = !locked;
                    }
                    break;
                case KEYGUARD_HIDDEN:
                    sawKeyguard = true;
                    locked = false;
                    // 화면이 꺼진 채로 잠금만 풀리는 경우(스마트 잠금 등)에 가짜 세션이 열리지 않게 한다
                    if (cur == null && !sawScreen) {
                        cur = new Session();
                        cur.start = t;
                    }
                    if (cur != null) cur.unlocked = true;
                    break;
                case KEYGUARD_SHOWN:
                    sawKeyguard = true;
                    locked = true;
                    break;
                case ACTIVITY_RESUMED:
                    // 화면이 꺼진 동안 앱이 혼자 뜨는 경우는 세션으로 치지 않는다.
                    // 조회 시작 전부터 화면이 켜져 있던 경우에만 여기서 세션을 연다
                    if (cur == null && !sawScreen) {
                        cur = new Session();
                        cur.start = t;
                        cur.unlocked = !locked;
                    }
                    if (cur != null) cur.resumes++;
                    break;
                case SCREEN_NON_INTERACTIVE:
                case DEVICE_SHUTDOWN:
                    sawScreen = true;
                    if (cur != null) {
                        cur.end = t;
                        out.add(cur);
                        cur = null;
                    }
                    break;
                default:
                    break;
            }
        }
        if (cur != null) {
            cur.end = Math.min(System.currentTimeMillis(), to);
            out.add(cur);
        }

        JSONArray arr = new JSONArray();
        for (Session s : out) {
            if (s.end < from || s.end <= s.start) continue;
            JSONObject o = new JSONObject();
            o.put("s", s.start);
            o.put("e", s.end);
            // 실제 사용 = 잠금이 풀려 있었고 앱 화면이 하나라도 떴다 (알림으로 화면만 켜진 경우 제외).
            // 잠금 화면을 안 쓰는 폰은 잠금 이벤트가 없으므로 앱 화면이 떴는지만 본다
            o.put("u", (s.unlocked || !sawKeyguard) && s.resumes > 0);
            o.put("r", s.resumes);
            arr.put(o);
        }
        return arr.toString();
    }

    private UsageReader() {}
}
