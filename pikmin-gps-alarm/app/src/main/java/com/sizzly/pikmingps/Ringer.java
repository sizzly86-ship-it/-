package com.sizzly.pikmingps;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/** 알람 소리(반복) + 진동(반복)을 울리고 멈춘다. 서비스와 '알람 테스트'가 같이 쓴다. */
final class Ringer {

    private static MediaPlayer player;
    private static Vibrator vibrator;
    private static volatile boolean ringing = false;

    private Ringer() { }

    static boolean isRinging() { return ringing; }

    /** 확인을 누를 때까지 계속 울림 */
    static synchronized void startContinuous(Context ctx, boolean alarmStream) {
        if (ringing) return;
        ringing = true;
        Context app = ctx.getApplicationContext();
        playSound(app, alarmStream, true);
        vibrate(app, new long[]{0, 900, 400}, 0, alarmStream);
    }

    /** 한 번 짧게 (진동 + 알림음 한 번) */
    static synchronized void burst(Context ctx, boolean alarmStream) {
        Context app = ctx.getApplicationContext();
        if (!ringing) playSound(app, alarmStream, false);
        vibrate(app, new long[]{0, 700, 250, 700, 250, 1000}, -1, alarmStream);
    }

    static synchronized void stop() {
        ringing = false;
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            player.release();
            player = null;
        }
        if (vibrator != null) vibrator.cancel();
    }

    private static void playSound(Context app, boolean alarmStream, boolean loop) {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            player.release();
            player = null;
        }
        Uri uri = RingtoneManager.getDefaultUri(
                loop ? RingtoneManager.TYPE_ALARM : RingtoneManager.TYPE_NOTIFICATION);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (uri == null) return;
        try {
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(attrs(alarmStream));
            mp.setDataSource(app, uri);
            mp.setLooping(loop);
            mp.prepare();
            mp.start();
            player = mp;
        } catch (Exception ignored) { }
    }

    @SuppressWarnings("deprecation")
    private static void vibrate(Context app, long[] pattern, int repeat, boolean alarmStream) {
        if (vibrator == null) {
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) app.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
            }
        }
        if (vibrator == null || !vibrator.hasVibrator()) return;
        // 알람 용도로 표시해야 화면 꺼짐/백그라운드에서도 진동이 막히지 않음
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, repeat), attrs(true));
    }

    private static AudioAttributes attrs(boolean alarmStream) {
        return new AudioAttributes.Builder()
                .setUsage(alarmStream ? AudioAttributes.USAGE_ALARM
                        : AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
    }
}
