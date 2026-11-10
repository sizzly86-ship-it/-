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

        while (events != null && events.hasNextEvent()) {
            events.getNextEvent(e);
            long t = e.getTimeStamp();
            switch (e.getEventType()) {
                case SCREEN_INTERACTIVE:
                    if (cur == null) {
                        cur = new Session();
                        cur.start = t;
                        cur.unlocked = !locked;
                    }
                    break;
                case KEYGUARD_HIDDEN:
                    sawKeyguard = true;
                    locked = false;
                    if (cur == null) {
                        cur = new Session();
                        cur.start = t;
                    }
                    cur.unlocked = true;
                    break;
                case KEYGUARD_SHOWN:
                    sawKeyguard = true;
                    locked = true;
                    break;
                case ACTIVITY_RESUMED:
                    if (cur == null) {
                        cur = new Session();
                        cur.start = t;
                        cur.unlocked = !locked;
                    }
                    cur.resumes++;
                    break;
                case SCREEN_NON_INTERACTIVE:
                case DEVICE_SHUTDOWN:
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
            // 잠금 화면을 안 쓰는 폰은 잠금 이벤트가 없으므로 앱을 실제로 띄웠는지로 대신 판단한다
            o.put("u", sawKeyguard ? s.unlocked : s.resumes > 0);
            o.put("r", s.resumes);
            arr.put(o);
        }
        return arr.toString();
    }

    private UsageReader() {}
}
