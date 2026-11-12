package app.condition;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.Calendar;

/** 하루 세 번(아침 점수, 퇴근길 스트레스, 자기 전 기록) 알림을 예약하고 띄운다. */
public class ReminderReceiver extends BroadcastReceiver {
    static final String ACTION = "app.condition.REMIND";
    static final String ACTION_SNOOZE = "app.condition.SNOOZE";
    private static final long SNOOZE_MS = 30 * 60_000L;
    static final String PREFS = "reminders";
    static final String CHANNEL = "remind_alert";
    private static final String OLD_CHANNEL = "remind";
    static final String[] IDS = {"morning", "evening", "night"};
    private static final String[] TITLES = {"출근길 · 아침 컨디션은 어때요?", "퇴근길 · 오늘 스트레스 기록", "자기 전 · 오늘 하루 기록"};
    private static final String[] TEXTS = {
            "자고 일어난 지금 상태를 점수로 남겨 주세요.",
            "오늘 일하면서 받은 스트레스를 남겨 주세요.",
            "오늘 먹은 것, 운동, 영양제를 체크해 주세요."};

    @Override
    public void onReceive(Context c, Intent intent) {
        if (ACTION.equals(intent.getAction())) {
            String id = intent.getStringExtra("id");
            int idx = indexOf(id);
            boolean snoozed = intent.getBooleanExtra("snoozed", false);
            if (idx >= 0) {
                int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK);
                boolean weekend = dow == Calendar.SATURDAY || dow == Calendar.SUNDAY;
                // 주말 제외 설정이거나 오늘 이미 기록했으면 울리지 않는다 ("30분 뒤 다시"로 미룬 것은 요일과 무관하게 울린다)
                if (!alreadyDone(c, id) && (snoozed || !(weekend && weekdaysOnly(c, id)))) show(c, idx);
            }
        } else if (ACTION_SNOOZE.equals(intent.getAction())) {
            int idx = indexOf(intent.getStringExtra("id"));
            if (idx >= 0) snooze(c, idx);
            return;
        }
        scheduleAll(c); // 부팅·앱 업데이트 후에도, 알림을 띄운 뒤에도 다음 것을 다시 예약한다
    }

    /** 화면 쪽에서 넘겨 둔 "오늘 이미 기록함" 표시를 확인한다. 날짜는 화면과 같이 새벽 4시에 넘어간다. */
    private static boolean alreadyDone(Context c, String id) {
        try {
            JSONObject all = new JSONObject(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("json", "{}"));
            JSONObject done = all.optJSONObject("done");
            if (done == null) return false;
            String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                    .format(new java.util.Date(System.currentTimeMillis() - 4 * 3600_000L));
            return today.equals(done.optString("date")) && done.optBoolean(id);
        } catch (Exception ex) {
            return false;
        }
    }

    private static PendingIntent alarmIntent(Context c, int idx, boolean snoozed) {
        Intent in = new Intent(c, ReminderReceiver.class).setAction(ACTION).putExtra("id", IDS[idx]).putExtra("snoozed", snoozed);
        return PendingIntent.getBroadcast(c, (snoozed ? 10 : 0) + idx, in,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void setAlarm(Context c, long at, PendingIntent pi) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        // 정확한 시각 알람을 쓸 수 있으면 제시간에, 아니면 조금 늦을 수 있는 방식으로
        if (android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static void snooze(Context c, int idx) {
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(idx);
        setAlarm(c, System.currentTimeMillis() + SNOOZE_MS, alarmIntent(c, idx, true));
    }

    private static boolean weekdaysOnly(Context c, String id) {
        try {
            JSONObject all = new JSONObject(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("json", "{}"));
            JSONObject r = all.optJSONObject(id);
            return r != null && r.optBoolean("wd");
        } catch (Exception ex) {
            return false;
        }
    }

    static int indexOf(String id) {
        for (int i = 0; i < IDS.length; i++) if (IDS[i].equals(id)) return i;
        return -1;
    }

    static void save(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("json", json).apply();
        scheduleAll(c);
    }

    static void scheduleAll(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        JSONObject all;
        try {
            all = new JSONObject(p.getString("json", "{}"));
        } catch (Exception ex) {
            return;
        }
        for (int i = 0; i < IDS.length; i++) {
            PendingIntent pi = alarmIntent(c, i, false);
            am.cancel(pi);
            JSONObject r = all.optJSONObject(IDS[i]);
            if (r == null || !r.optBoolean("on")) continue;
            String[] hm = r.optString("time", "").split(":");
            if (hm.length != 2) continue;
            try {
                Calendar cal = Calendar.getInstance();
                cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0]));
                cal.set(Calendar.MINUTE, Integer.parseInt(hm[1]));
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                if (cal.getTimeInMillis() <= System.currentTimeMillis() + 30_000) cal.add(Calendar.DAY_OF_YEAR, 1);
                setAlarm(c, cal.getTimeInMillis(), pi);
            } catch (NumberFormatException ignored) {
            }
        }
    }

    private static void show(Context c, int idx) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.deleteNotificationChannel(OLD_CHANNEL);
        // 중요도 높음: 소리가 나고 화면 위에 잠깐 떠오른다
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "기록 알림", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(c, MainActivity.class).putExtra("target", IDS[idx])
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 100 + idx, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent snoozePi = PendingIntent.getBroadcast(c, 200 + idx,
                new Intent(c, ReminderReceiver.class).setAction(ACTION_SNOOZE).putExtra("id", IDS[idx]),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(TITLES[idx])
                .setContentText(TEXTS[idx])
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, "30분 뒤 다시", snoozePi).build())
                .build();
        try {
            nm.notify(idx, n);
        } catch (SecurityException ignored) {
            // 알림 권한이 없으면 조용히 넘어간다
        }
    }
}
