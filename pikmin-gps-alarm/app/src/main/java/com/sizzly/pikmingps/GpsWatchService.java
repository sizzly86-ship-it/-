package com.sizzly.pikmingps;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.GnssStatus;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * 피크민이 꽃을 심는 동안(자동 모드) 또는 켜 둔 동안(수동 모드) GPS를 지켜보다가,
 * 잘 잡히던 GPS가 일정 시간 이상 끊기면(= 건물/집에 들어감) 알람을 울린다.
 * 꽃 심기를 안 할 때는 GPS를 아예 쓰지 않아서 배터리를 거의 안 먹는다.
 */
public class GpsWatchService extends Service {

    public static final String ACTION_START = "start";
    public static final String ACTION_STOP = "stop";
    public static final String ACTION_ACK = "ack";

    static final String PREFS = "settings";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_MODE = "mode";            // "auto" | "manual"
    static final String KEY_DELAY = "delaySec";
    static final String KEY_ACC = "accLimit";
    static final String KEY_STRENGTH = "strength";    // "crazy" | "repeat" | "once"
    static final String KEY_ALARM_STREAM = "alarmStream";
    static final String KEY_BACK = "notifyBack";

    private static final String CH_STATUS = "status";
    private static final String CH_ALERT = "gps_lost_v2";
    private static final String CH_BACK = "gps_back";
    private static final int ID_STATUS = 1;
    private static final int ID_ALERT = 2;
    private static final int ID_BACK = 3;

    /** '2분마다' 모드 / 계속 울림이 너무 길어졌을 때 다시 울리는 간격 */
    private static final long REPEAT_MS = 2 * 60 * 1000L;
    /** 계속 울림 최대 시간 (폰을 어디 두고 잊었을 때 대비). 이후엔 2분마다로 바뀜 */
    private static final long MAX_CONTINUOUS_MS = 10 * 60 * 1000L;
    /** 이 시간 안에 위치가 들어와야 "수신 중"으로 본다 */
    private static final long FIX_FRESH_MS = 4000L;

    public enum State { IDLE, WAITING, GOOD, LOST }

    // 화면에서 읽는 현재 상태
    static volatile boolean running = false;
    static volatile boolean watching = false;
    static volatile State state = State.IDLE;
    static volatile long lastFixAt = 0;
    static volatile float lastAccuracy = -1;
    static volatile int satsUsed = 0;
    static volatile int satsVisible = 0;
    static volatile long badSince = 0;
    static volatile boolean acknowledged = false;

    private static GpsWatchService instance;

    private LocationManager lm;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastAlertAt = 0;
    private long ringStartedAt = 0;
    private int alertCount = 0;
    private String lastStatusText = "";

    private final LocationListener locationListener = new LocationListener() {
        @Override public void onLocationChanged(Location loc) {
            lastFixAt = SystemClock.elapsedRealtime();
            lastAccuracy = loc.hasAccuracy() ? loc.getAccuracy() : -1;
        }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
        @Override public void onStatusChanged(String p, int s, Bundle b) { }
    };

    private final GnssStatus.Callback gnssCallback = new GnssStatus.Callback() {
        @Override public void onSatelliteStatusChanged(GnssStatus status) {
            int used = 0;
            int n = status.getSatelliteCount();
            for (int i = 0; i < n; i++) if (status.usedInFix(i)) used++;
            satsUsed = used;
            satsVisible = n;
        }
        @Override public void onStopped() { satsUsed = 0; }
    };

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!watching) return;
            evaluate();
            handler.postDelayed(this, 1000);
        }
    };

    // ───────────────────────── 외부에서 부르는 것들 ─────────────────────────

    /** 피크민 꽃 심기 알림이 생기거나 없어졌을 때 (PikminListener가 호출) */
    static void onPlantingChanged(Context ctx) {
        GpsWatchService s = instance;
        if (s != null) {
            s.updateWatching();
            return;
        }
        // 서비스가 죽어 있었는데 꽃 심기가 시작되면 다시 살린다
        SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
        if (PikminListener.planting && p.getBoolean(KEY_ENABLED, false)) {
            try {
                ctx.startForegroundService(new Intent(ctx, GpsWatchService.class)
                        .setAction(ACTION_START));
            } catch (Exception ignored) { }
        }
    }

    /** 모드 같은 설정이 바뀌었을 때 화면에서 호출 */
    static void refresh() {
        GpsWatchService s = instance;
        if (s != null) s.updateWatching();
    }

    /** 알람 끄기 (알람 화면/알림 버튼) */
    static void acknowledge(Context ctx) {
        acknowledged = true;
        Ringer.stop();
        ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(ID_ALERT);
    }

    /** 지금 알람 화면을 띄워 둘 상황인지 */
    static boolean alertActive() {
        return watching && state == State.LOST && !acknowledged;
    }

    // ───────────────────────── 서비스 수명 ─────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (ACTION_STOP.equals(action)) {
            prefs().edit().putBoolean(KEY_ENABLED, false).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_ACK.equals(action)) {
            acknowledge(this);
            if (!running) stopSelf();
            return START_STICKY;
        }

        Notification n = buildStatusNotification("준비 중…");
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(ID_STATUS, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(ID_STATUS, n);
        }
        running = true;
        instance = this;
        prefs().edit().putBoolean(KEY_ENABLED, true).apply();
        updateWatching();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopGps();
        running = false;
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ───────────────────────── GPS 켜고 끄기 ─────────────────────────

    private boolean shouldWatch() {
        boolean manual = "manual".equals(prefs().getString(KEY_MODE, "auto"));
        return manual || PikminListener.planting;
    }

    private void updateWatching() {
        boolean want = shouldWatch();
        if (want && !watching) startGps();
        else if (!want && watching) stopGps();
        updateStatusNotification(SystemClock.elapsedRealtime());
    }

    private void startGps() {
        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f,
                    locationListener, Looper.getMainLooper());
            lm.registerGnssStatusCallback(gnssCallback, handler);
        } catch (SecurityException e) {
            return;
        }
        watching = true;
        state = State.WAITING;
        lastFixAt = 0;
        lastAccuracy = -1;
        badSince = 0;
        acknowledged = false;
        alertCount = 0;
        // 화면이 꺼져 있어도 1초 검사가 멈추지 않게 (감시 중일 때만)
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pikmingps:watch");
        wakeLock.acquire(6 * 60 * 60 * 1000L);
        handler.removeCallbacks(tick);
        handler.post(tick);
    }

    private void stopGps() {
        handler.removeCallbacks(tick);
        try {
            lm.removeUpdates(locationListener);
            lm.unregisterGnssStatusCallback(gnssCallback);
        } catch (Exception ignored) { }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        watching = false;
        state = State.IDLE;
        badSince = 0;
        satsUsed = 0;
        Ringer.stop();
        nm().cancel(ID_ALERT);
    }

    // ───────────────────────── 판정 ─────────────────────────

    private void evaluate() {
        SharedPreferences p = prefs();
        long delayMs = p.getInt(KEY_DELAY, 30) * 1000L;
        int accLimit = p.getInt(KEY_ACC, 50);
        String strength = p.getString(KEY_STRENGTH, "crazy");
        boolean notifyBack = p.getBoolean(KEY_BACK, true);

        long now = SystemClock.elapsedRealtime();
        boolean fresh = lastFixAt > 0 && now - lastFixAt < FIX_FRESH_MS;
        boolean good = fresh && lastAccuracy >= 0 && lastAccuracy <= accLimit;

        if (good) {
            badSince = 0;
            if (state == State.LOST) {
                Ringer.stop();
                nm().cancel(ID_ALERT);
                if (notifyBack) showBackNotification();
            }
            if (state != State.GOOD) {
                state = State.GOOD;
                acknowledged = false;
                alertCount = 0;
            }
        } else {
            if (badSince == 0) badSince = now;
            // 한 번이라도 잘 잡혔던 뒤에만 울린다 (실내에서 시작하자마자 울리는 것 방지)
            if (state == State.GOOD && now - badSince >= delayMs) {
                state = State.LOST;
                acknowledged = false;
                nm().cancel(ID_BACK);
                fireAlert(strength);
            } else if (state == State.LOST && !acknowledged) {
                if (Ringer.isRinging()) {
                    if (now - ringStartedAt > MAX_CONTINUOUS_MS) Ringer.stop();
                } else if (!"once".equals(strength) && now - lastAlertAt >= REPEAT_MS) {
                    fireAlert("repeat");
                }
            }
        }
        updateStatusNotification(now);
    }

    // ───────────────────────── 알림/알람 ─────────────────────────

    private void fireAlert(String strength) {
        long now = SystemClock.elapsedRealtime();
        lastAlertAt = now;
        alertCount++;
        boolean alarmStream = prefs().getBoolean(KEY_ALARM_STREAM, true);

        if ("crazy".equals(strength) && alertCount == 1) {
            ringStartedAt = now;
            Ringer.startContinuous(this, alarmStream);
        } else {
            Ringer.burst(this, alarmStream);
        }

        String text = alertCount > 1
                ? "아직 GPS가 안 잡혀요. 피크민 꽃 심기를 꺼 주세요! (" + alertCount + "번째)"
                : "건물 안에 들어온 것 같아요. 피크민 꽃 심기를 꺼 주세요!";

        PendingIntent ack = PendingIntent.getService(this, 2,
                new Intent(this, GpsWatchService.class).setAction(ACTION_ACK),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent full = PendingIntent.getActivity(this, 3,
                new Intent(this, AlarmActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent openPikmin = PendingIntent.getActivity(this, 4,
                new Intent(this, AlarmActivity.class)
                        .putExtra(AlarmActivity.EXTRA_OPEN_PIKMIN, true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification n = new Notification.Builder(this, CH_ALERT)
                .setSmallIcon(R.drawable.ic_flower)
                .setContentTitle("🚨 GPS 끊김 — 꽃 심기 끄세요!")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_ALARM)
                .setOngoing(true)
                .setContentIntent(full)
                .setFullScreenIntent(full, true)
                .setDeleteIntent(ack)
                .addAction(new Notification.Action.Builder(null, "알람 끄기", ack).build())
                .addAction(new Notification.Action.Builder(null, "피크민 열기", openPikmin).build())
                .build();
        nm().notify(ID_ALERT, n);
    }

    private void showBackNotification() {
        Notification n = new Notification.Builder(this, CH_BACK)
                .setSmallIcon(R.drawable.ic_flower)
                .setContentTitle("🌱 GPS 다시 잡힘")
                .setContentText("밖으로 나왔어요. 꽃 심기 다시 켜도 돼요.")
                .setContentIntent(openAppIntent())
                .setAutoCancel(true)
                .build();
        nm().notify(ID_BACK, n);
    }

    private void updateStatusNotification(long now) {
        boolean manual = "manual".equals(prefs().getString(KEY_MODE, "auto"));
        String text;
        switch (state) {
            case GOOD:
                text = badSince > 0
                        ? "GPS 약해짐… " + ((now - badSince) / 1000) + "초째"
                        : "꽃 심는 중 · GPS 잘 잡힘";
                break;
            case LOST:
                text = "GPS 끊김 — 꽃 심기 끄세요!";
                break;
            case WAITING:
                text = "GPS 기다리는 중 (밖에서 잡히면 감시 시작)";
                break;
            default:
                text = manual ? "준비 중…" : "피크민 꽃 심기 기다리는 중 (GPS 안 씀)";
        }
        if (text.equals(lastStatusText)) return;
        lastStatusText = text;
        nm().notify(ID_STATUS, buildStatusNotification(text));
    }

    private Notification buildStatusNotification(String text) {
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, GpsWatchService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CH_STATUS)
                .setSmallIcon(R.drawable.ic_flower)
                .setContentTitle("피크민 GPS 알리미")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openAppIntent())
                .addAction(new Notification.Action.Builder(null, "앱 끄기", stop).build())
                .build();
    }

    private PendingIntent openAppIntent() {
        Intent i = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void createChannels() {
        NotificationManager m = nm();
        m.deleteNotificationChannel("gps_lost_v1"); // 예전 버전 채널 정리

        NotificationChannel status = new NotificationChannel(CH_STATUS,
                "감시 상태 (상시 표시)", NotificationManager.IMPORTANCE_LOW);
        status.setShowBadge(false);
        m.createNotificationChannel(status);

        NotificationChannel alert = new NotificationChannel(CH_ALERT,
                "GPS 끊김 알람", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("건물에 들어가 GPS가 끊기면 울립니다");
        alert.setSound(null, null);        // 소리·진동은 앱이 직접 (반복해서) 울림
        alert.enableVibration(false);
        alert.setBypassDnd(true);
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        m.createNotificationChannel(alert);

        NotificationChannel back = new NotificationChannel(CH_BACK,
                "GPS 다시 잡힘", NotificationManager.IMPORTANCE_DEFAULT);
        m.createNotificationChannel(back);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private NotificationManager nm() {
        return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    }
}
