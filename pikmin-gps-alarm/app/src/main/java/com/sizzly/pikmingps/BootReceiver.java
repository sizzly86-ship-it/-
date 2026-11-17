package com.sizzly.pikmingps;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;

/**
 * 재부팅하거나 앱을 업데이트한 뒤, 켜 두었던 상태면 다시 켠다.
 * 위치가 '항상 허용'이면 자동으로, 아니면 '눌러서 켜기' 알림을 띄운다.
 * (안드로이드 규칙상, 화면 없이 위치 서비스를 시작하려면 '항상 허용'이 필요)
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String CH_RESTART = "restart";
    private static final int ID_RESTART = 4;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        boolean enabled = ctx.getSharedPreferences(GpsWatchService.PREFS, Context.MODE_PRIVATE)
                .getBoolean(GpsWatchService.KEY_ENABLED, false);
        if (!enabled) return;

        if (hasBackgroundLocation(ctx)) {
            try {
                ctx.startForegroundService(new Intent(ctx, GpsWatchService.class)
                        .setAction(GpsWatchService.ACTION_START));
                return;
            } catch (Exception ignored) { }
        }
        askToRestart(ctx);
    }

    static boolean hasBackgroundLocation(Context ctx) {
        return ctx.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    /** 자동으로 못 켰을 때: 한 번 누르면 켜지는 알림 */
    static void askToRestart(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CH_RESTART,
                "재부팅 후 다시 켜기", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open = PendingIntent.getActivity(ctx, 5,
                new Intent(ctx, MainActivity.class)
                        .putExtra(MainActivity.EXTRA_AUTOSTART, true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(ctx, CH_RESTART)
                .setSmallIcon(R.drawable.ic_flower)
                .setContentTitle("피크민 GPS 알리미가 꺼져 있어요")
                .setContentText("눌러서 다시 켜기 (위치를 '항상 허용'하면 자동으로 켜져요)")
                .setContentIntent(open)
                .setAutoCancel(true)
                .build();
        nm.notify(ID_RESTART, n);
    }

    static void clearRestartNotice(Context ctx) {
        ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(ID_RESTART);
    }
}
