package com.sizzly.pikmingps;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** 잠금화면 위로 뜨는 빨간 전체화면 알람 */
public class AlarmActivity extends Activity {

    static final String EXTRA_OPEN_PIKMIN = "openPikmin";
    static final String EXTRA_TEST = "test";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean test;
    private boolean leaving = false;

    private final Runnable watch = new Runnable() {
        @Override public void run() {
            if (leaving) return;
            // GPS가 다시 잡혔거나 꽃 심기를 껐으면 알아서 닫힘
            boolean active = test ? Ringer.isRinging() : GpsWatchService.alertActive();
            if (!active) { finish(); return; }
            handler.postDelayed(this, 500);
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setShowWhenLocked(true);
        setTurnScreenOn(true);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (handleIntent(getIntent())) return;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#C62828"));
        int pad = dp(28);
        root.setPadding(pad, pad, pad, pad);

        TextView icon = new TextView(this);
        icon.setText("🚨");
        icon.setTextSize(72);
        icon.setGravity(Gravity.CENTER);
        root.addView(icon);

        TextView title = new TextView(this);
        title.setText(test ? "알람 테스트" : "GPS 끊김!");
        title.setTextSize(40);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView msg = new TextView(this);
        msg.setText(test ? "실제로는 이렇게 울려요." : "건물 안이에요.\n피크민 꽃 심기를 꺼 주세요!");
        msg.setTextSize(22);
        msg.setTextColor(Color.WHITE);
        msg.setGravity(Gravity.CENTER);
        msg.setPadding(0, dp(12), 0, dp(40));
        root.addView(msg);

        Button pikmin = bigButton("피크민 열어서 꽃 심기 끄기", "#FFFFFF", "#C62828");
        pikmin.setOnClickListener(v -> { stopAlarm(); openPikminAndFinish(); });
        root.addView(pikmin, lp());

        Button off = bigButton("알람만 끄기", "#8E0000", "#FFFFFF");
        off.setOnClickListener(v -> { stopAlarm(); finish(); });
        LinearLayout.LayoutParams olp = lp();
        olp.topMargin = dp(14);
        root.addView(off, olp);

        setContentView(root);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    /** 알림의 '피크민 열기' 버튼으로 들어온 경우 바로 처리하고 true */
    private boolean handleIntent(Intent i) {
        test = i.getBooleanExtra(EXTRA_TEST, false);
        if (i.getBooleanExtra(EXTRA_OPEN_PIKMIN, false)) {
            stopAlarm();
            openPikminAndFinish();
            return true;
        }
        return false;
    }

    @Override protected void onResume() {
        super.onResume();
        handler.postDelayed(watch, 500);
    }

    @Override protected void onPause() {
        super.onPause();
        handler.removeCallbacks(watch);
    }

    private void stopAlarm() {
        if (test) Ringer.stop();
        else GpsWatchService.acknowledge(this);
    }

    private void openPikminAndFinish() {
        leaving = true;
        handler.removeCallbacks(watch);
        Intent launch = getPackageManager().getLaunchIntentForPackage(PikminListener.PIKMIN_PKG);
        if (launch == null) { finish(); return; }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (km != null && km.isKeyguardLocked()) {
            // 잠금 풀고 나서 피크민 열기
            km.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                @Override public void onDismissSucceeded() { startActivity(launch); finish(); }
                @Override public void onDismissCancelled() { finish(); }
                @Override public void onDismissError() { finish(); }
            });
        } else {
            startActivity(launch);
            finish();
        }
    }

    private Button bigButton(String text, String bg, String fg) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(20);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(Color.parseColor(fg));
        GradientDrawable d = new GradientDrawable();
        d.setColor(Color.parseColor(bg));
        d.setCornerRadius(dp(16));
        b.setBackground(d);
        return b;
    }

    private LinearLayout.LayoutParams lp() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(68));
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
