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
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * GPS 수신 상태를 계속 지켜보다가, 잘 잡히던 GPS가 일정 시간 이상 끊기면
 * (= 건물/집에 들어감) 진동과 알림으로 알려준다.
 */
public class GpsWatchService extends Service {

    public static final String ACTION_START = "start";
    public static final String ACTION_STOP = "stop";
    public static final String ACTION_ACK = "ack";

    static final String PREFS = "settings";
    static final String KEY_DELAY = "delaySec";
    static final String KEY_ACC = "accLimit";
    static final String KEY_REPEAT = "repeat";
    static final String KEY_BACK = "notifyBack";

    private static final String CH_STATUS = "status";
    private static final String CH_ALERT = "gps_lost_v1";
    private static final String CH_BACK = "gps_back";
    private static final int ID_STATUS = 1;
    private static final int ID_ALERT = 2;
    private static final int ID_BACK = 3;

    /** 한 번 끊김 알림 후 다시 울리는 간격 */
    private static final long REPEAT_MS = 2 * 60 * 1000L;
    /** 이 시간 안에 위치가 들어와야 "수신 중"으로 본다 */
    private static final long FIX_FRESH_MS = 4000L;

    // 화면(MainActivity)에서 읽는 현재 상태
    public enum State { WAITING, GOOD, LOST }
    static volatile boolean running = false;
    static volatile State state = State.WAITING;
    static volatile long lastFixAt = 0;      // elapsedRealtime
    static volatile float lastAccuracy = -1;
    static volatile int satsUsed = 0;
    static volatile int satsVisible = 0;
    static volatile long badSince = 0;
    static volatile int alertCount = 0;

    private LocationManager lm;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastAlertAt = 0;
    private boolean acknowledged = false;

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
        @Override public void onStopped() {
            satsUsed = 0;
        }
    };

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            evaluate();
            handler.postDelayed(this, 1000);
        }
    };

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
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_ACK.equals(action)) {
            acknowledged = true;
            nm().cancel(ID_ALERT);
            return START_STICKY;
        }

        // 시작
        Notification n = buildStatusNotification("GPS 확인 중…");
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(ID_STATUS, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(ID_STATUS, n);
        }
        if (!running) {
            running = true;
            state = State.WAITING;
            lastFixAt = 0;
            badSince = 0;
            alertCount = 0;
            acknowledged = false;
            try {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f,
                        locationListener, Looper.getMainLooper());
                lm.registerGnssStatusCallback(gnssCallback, handler);
            } catch (SecurityException e) {
                stopSelf();
                return START_NOT_STICKY;
            }
            // 화면이 꺼져 있어도 1초 검사가 멈추지 않게
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pikmingps:watch");
            wakeLock.acquire(12 * 60 * 60 * 1000L);
            handler.post(tick);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacks(tick);
        try {
            lm.removeUpdates(locationListener);
            lm.unregisterGnssStatusCallback(gnssCallback);
        } catch (Exception ignored) { }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        nm().cancel(ID_ALERT);
        state = State.WAITING;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ───────────────────────── 판정 ─────────────────────────

    private void evaluate() {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        long delayMs = p.getInt(KEY_DELAY, 30) * 1000L;
        int accLimit = p.getInt(KEY_ACC, 50);
        boolean repeat = p.getBoolean(KEY_REPEAT, true);
        boolean notifyBack = p.getBoolean(KEY_BACK, true);

        long now = SystemClock.elapsedRealtime();
        boolean fresh = lastFixAt > 0 && now - lastFixAt < FIX_FRESH_MS;
        boolean good = fresh && lastAccuracy >= 0 && lastAccuracy <= accLimit;

        if (good) {
            badSince = 0;
            if (state == State.LOST) {
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
            // 한 번이라도 잘 잡혔던 뒤에만 울린다 (실내에서 켜자마자 울리는 것 방지)
            if (state == State.GOOD && now - badSince >= delayMs) {
                state = State.LOST;
                nm().cancel(ID_BACK);
                fireAlert();
            } else if (state == State.LOST && repeat && !acknowledged
                    && now - lastAlertAt >= REPEAT_MS) {
                fireAlert();
            }
        }
        updateStatusNotification(now);
    }

    // ───────────────────────── 알림 ─────────────────────────

    private void fireAlert() {
        lastAlertAt = SystemClock.elapsedRealtime();
        alertCount++;

        PendingIntent ack = PendingIntent.getService(this, 2,
                new Intent(this, GpsWatchService.class).setAction(ACTION_ACK),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        String text = alertCount > 1
                ? "아직 GPS가 안 잡혀요. 꽃 심기를 꺼 주세요! (" + alertCount + "번째 알림)"
                : "건물 안에 들어온 것 같아요. 피크민 꽃 심기를 꺼 주세요!";

        Notification n = new Notification.Builder(this, CH_ALERT)
                .setSmallIcon(R.drawable.ic_flower)
                .setContentTitle("🌸 GPS 끊김 — 꽃 심기 끄세요")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_ALARM)
                .setContentIntent(openAppIntent())
                .addAction(new Notification.Action.Builder(null, "확인 (그만 울리기)", ack).build())
                .setAutoCancel(true)
                .build();
        nm().notify(ID_ALERT, n);
        vibrate(new long[]{0, 600, 250, 600, 250, 900});
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
        vibrate(new long[]{0, 200});
    }

    private void vibrate(long[] pattern) {
        Vibrator v;
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            v = vm.getDefaultVibrator();
        } else {
            v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (v != null && v.hasVibrator()) {
            v.vibrate(VibrationEffect.createWaveform(pattern, -1));
        }
    }

    private void updateStatusNotification(long now) {
        String text;
        switch (state) {
            case GOOD:
                text = badSince > 0
                        ? "GPS 약해짐… " + ((now - badSince) / 1000) + "초째"
                        : "GPS 잘 잡힘 (위성 " + satsUsed + "개, ±" + Math.round(lastAccuracy) + "m)";
                break;
            case LOST:
                text = "GPS 끊김 — 실내로 판단됨";
                break;
            default:
                text = "GPS 기다리는 중 (밖에서 한 번 잡히면 감시 시작)";
        }
        nm().notify(ID_STATUS, buildStatusNotification(text));
    }

    private Notification buildStatusNotification(String text) {
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, GpsWatchService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CH_STATUS)
                .setSmallIcon(R.drawable.ic_flower)
                .setContentTitle("피크민 GPS 알리미 작동 중")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openAppIntent())
                .addAction(new Notification.Action.Builder(null, "감시 끄기", stop).build())
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

        NotificationChannel status = new NotificationChannel(CH_STATUS,
                "감시 상태 (상시 표시)", NotificationManager.IMPORTANCE_LOW);
        status.setShowBadge(false);
        m.createNotificationChannel(status);

        NotificationChannel alert = new NotificationChannel(CH_ALERT,
                "GPS 끊김 경고", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("건물에 들어가 GPS가 끊기면 울립니다");
        alert.enableVibration(false); // 진동은 직접 울림 (무음/진동 모드에서도 확실히)
        alert.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
        m.createNotificationChannel(alert);

        NotificationChannel back = new NotificationChannel(CH_BACK,
                "GPS 다시 잡힘", NotificationManager.IMPORTANCE_DEFAULT);
        back.enableVibration(false);
        m.createNotificationChannel(back);
    }

    private NotificationManager nm() {
        return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    }
}
