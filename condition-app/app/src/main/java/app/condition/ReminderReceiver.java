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
            if (idx >= 0) {
                int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK);
                boolean weekend = dow == Calendar.SATURDAY || dow == Calendar.SUNDAY;
                if (!(weekend && weekdaysOnly(c, id))) show(c, idx);
            }
        }
        scheduleAll(c); // 부팅·앱 업데이트 후에도, 알림을 띄운 뒤에도 다음 것을 다시 예약한다
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
            Intent in = new Intent(c, ReminderReceiver.class).setAction(ACTION).putExtra("id", IDS[i]);
            PendingIntent pi = PendingIntent.getBroadcast(c, i, in,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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
                // 정확한 시각 알람을 쓸 수 있으면 제시간에, 아니면 조금 늦을 수 있는 방식으로
                if (android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
                }
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
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(TITLES[idx])
                .setContentText(TEXTS[idx])
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        try {
            nm.notify(idx, n);
        } catch (SecurityException ignored) {
            // 알림 권한이 없으면 조용히 넘어간다
        }
    }
}
