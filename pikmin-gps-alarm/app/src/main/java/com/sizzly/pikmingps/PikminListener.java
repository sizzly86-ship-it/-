package com.sizzly.pikmingps;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * 피크민 블룸이 띄우는 알림을 보고 "꽃 심는 중"인지 알아낸다.
 * (피크민은 꽃 심기를 켜고 백그라운드로 가면 '꽃 심는 중' 알림을 띄움)
 */
public class PikminListener extends NotificationListenerService {

    static final String PIKMIN_PKG = "com.nianticlabs.pikmin";
    static final String KEY_CHANNEL = "plantChannel";

    /** 화면 표시용 피크민 알림 한 개 */
    static final class Info {
        final String title, text, channel;
        final boolean planting;
        Info(String title, String text, String channel, boolean planting) {
            this.title = title; this.text = text; this.channel = channel; this.planting = planting;
        }
    }

    static volatile boolean connected = false;
    static volatile boolean planting = false;
    static volatile List<Info> current = Collections.emptyList();

    private static PikminListener instance;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override public void onListenerConnected() {
        instance = this;
        connected = true;
        rescan();
    }

    @Override public void onListenerDisconnected() {
        connected = false;
        instance = null;
    }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        if (PIKMIN_PKG.equals(sbn.getPackageName())) main.post(this::rescan);
    }

    @Override public void onNotificationRemoved(StatusBarNotification sbn) {
        if (PIKMIN_PKG.equals(sbn.getPackageName())) main.post(this::rescan);
    }

    /** 설정(인식 기준)이 바뀌었을 때 화면에서 호출 */
    static void requestRescan() {
        PikminListener l = instance;
        if (l != null) l.main.post(l::rescan);
    }

    private void rescan() {
        StatusBarNotification[] all;
        try {
            all = getActiveNotifications();
        } catch (Exception e) {
            return;
        }
        SharedPreferences p = getSharedPreferences(GpsWatchService.PREFS, MODE_PRIVATE);
        String learned = p.getString(KEY_CHANNEL, null);

        List<Info> list = new ArrayList<>();
        boolean any = false;
        if (all != null) {
            for (StatusBarNotification sbn : all) {
                if (!PIKMIN_PKG.equals(sbn.getPackageName())) continue;
                Notification n = sbn.getNotification();
                Bundle ex = n.extras;
                String title = str(ex.getCharSequence(Notification.EXTRA_TITLE));
                String text = str(ex.getCharSequence(Notification.EXTRA_BIG_TEXT));
                if (text.isEmpty()) text = str(ex.getCharSequence(Notification.EXTRA_TEXT));
                String ch = n.getChannelId() == null ? "" : n.getChannelId();
                boolean isPlant = isPlanting(title, text, ch, learned);
                any |= isPlant;
                list.add(new Info(title, text, ch, isPlant));
            }
        }
        current = list;
        if (any != planting) {
            planting = any;
            GpsWatchService.onPlantingChanged(this);
        }
    }

    static boolean isPlanting(String title, String text, String channel, String learned) {
        String s = (title + " " + text).toLowerCase(Locale.ROOT);
        // "꽃 심기 완료" 같은 끝났다는 알림은 제외
        if (s.contains("완료") || s.contains("끝났") || s.contains("complet")
                || s.contains("finish") || s.contains("完了")) return false;
        if (learned != null && !learned.isEmpty()) return learned.equals(channel);
        return (s.contains("꽃") && s.contains("심"))
                || s.contains("plant")
                || s.contains("植");
    }

    private static String str(CharSequence c) {
        return c == null ? "" : c.toString();
    }

    static boolean hasAccess(Context ctx) {
        String flat = android.provider.Settings.Secure.getString(
                ctx.getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(ctx.getPackageName());
    }
}
