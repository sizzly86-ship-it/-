package com.sizzly.pikmingps;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final int REQ_PERMS = 10;
    private static final int[] DELAYS = {15, 30, 60, 90};
    private static final int[] ACCS = {30, 50, 100};

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;

    private TextView statusBig;
    private TextView statusDetail;
    private GradientDrawable statusBg;
    private Button toggle;
    private Button batteryBtn;

    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            render();
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences(GpsWatchService.PREFS, MODE_PRIVATE);
        setContentView(buildUi());
    }

    @Override protected void onResume() {
        super.onResume();
        handler.post(refresh);
    }

    @Override protected void onPause() {
        super.onPause();
        handler.removeCallbacks(refresh);
    }

    // ───────────────────────── 화면 구성 ─────────────────────────

    private View buildUi() {
        int pad = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, dp(32), pad, pad);
        root.setBackgroundColor(Color.parseColor("#F6FAF6"));

        TextView title = text("🌸 피크민 GPS 알리미", 24, true, "#1B5E20");
        root.addView(title);
        TextView sub = text("꽃 심으면서 건물에 들어가 GPS가 끊기면 알려줘요.", 15, false, "#555555");
        sub.setPadding(0, dp(4), 0, dp(16));
        root.addView(sub);

        // 상태 카드
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        statusBg = new GradientDrawable();
        statusBg.setCornerRadius(dp(16));
        card.setBackground(statusBg);
        statusBig = text("", 26, true, "#FFFFFF");
        statusDetail = text("", 15, false, "#FFFFFF");
        statusDetail.setPadding(0, dp(6), 0, 0);
        card.addView(statusBig);
        card.addView(statusDetail);
        root.addView(card);

        toggle = new Button(this);
        toggle.setTextSize(20);
        toggle.setAllCaps(false);
        toggle.setOnClickListener(v -> onToggle());
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        tlp.topMargin = dp(16);
        root.addView(toggle, tlp);

        // 설정
        root.addView(section("GPS가 몇 초 끊기면 알릴까요?"));
        root.addView(choice(DELAYS, "초", GpsWatchService.KEY_DELAY, 30));
        root.addView(hint("짧으면 빨리 알지만, 큰 건물 옆·지하차도에서 잠깐 끊겨도 울릴 수 있어요."));

        root.addView(section("이 정도보다 부정확하면 끊긴 걸로 볼까요?"));
        root.addView(choice(ACCS, "m", GpsWatchService.KEY_ACC, 50));
        root.addView(hint("실내에서 와이파이로 대충 잡히는 위치를 걸러내는 기준이에요. 보통 50m면 충분해요."));

        root.addView(section("알림 옵션"));
        root.addView(sw("꽃 심기 끌 때까지 2분마다 다시 알리기", GpsWatchService.KEY_REPEAT, true));
        root.addView(sw("밖으로 나와 GPS가 다시 잡히면 알리기", GpsWatchService.KEY_BACK, true));

        root.addView(section("꺼지지 않게 하기 (갤럭시 필수)"));
        batteryBtn = new Button(this);
        batteryBtn.setAllCaps(false);
        batteryBtn.setOnClickListener(v -> askBatteryExemption());
        root.addView(batteryBtn);
        root.addView(hint("갤럭시는 배터리 절약 때문에 백그라운드 앱을 멈출 수 있어요. "
                + "'제한 없음'으로 해 두면 화면이 꺼져도 계속 감시해요."));

        ScrollView sv = new ScrollView(this);
        sv.addView(root);
        return sv;
    }

    private void render() {
        boolean running = GpsWatchService.running;
        toggle.setText(running ? "감시 끄기" : "감시 시작");

        String big, detail;
        String color;
        long now = SystemClock.elapsedRealtime();
        if (!running) {
            big = "꺼져 있음";
            detail = "피크민 켜고 밖에 나가기 전에 '감시 시작'을 눌러 주세요.";
            color = "#9E9E9E";
        } else {
            String acc = GpsWatchService.lastAccuracy >= 0
                    ? "±" + Math.round(GpsWatchService.lastAccuracy) + "m" : "-";
            String age = GpsWatchService.lastFixAt > 0
                    ? ((now - GpsWatchService.lastFixAt) / 1000) + "초 전" : "없음";
            String info = "위성 " + GpsWatchService.satsUsed + "/" + GpsWatchService.satsVisible
                    + "개 · 정확도 " + acc + " · 마지막 수신 " + age;
            switch (GpsWatchService.state) {
                case GOOD:
                    if (GpsWatchService.badSince > 0) {
                        big = "GPS 약해지는 중…";
                        color = "#F9A825";
                        detail = ((now - GpsWatchService.badSince) / 1000) + "초째 불안정\n" + info;
                    } else {
                        big = "GPS 잘 잡힘 ✓";
                        color = "#2E7D32";
                        detail = info;
                    }
                    break;
                case LOST:
                    big = "GPS 끊김! 꽃 심기 OFF";
                    color = "#C62828";
                    detail = info;
                    break;
                default:
                    big = "GPS 기다리는 중";
                    color = "#1565C0";
                    detail = "밖에서 GPS가 한 번 잡히면 감시가 시작돼요.\n" + info;
            }
        }
        statusBg.setColor(Color.parseColor(color));
        statusBig.setText(big);
        statusDetail.setText(detail);

        batteryBtn.setText(isBatteryExempt()
                ? "배터리 최적화 해제됨 ✓" : "배터리 최적화 해제하기");
    }

    // ───────────────────────── 시작/중지 ─────────────────────────

    private void onToggle() {
        if (GpsWatchService.running) {
            startService(new Intent(this, GpsWatchService.class)
                    .setAction(GpsWatchService.ACTION_STOP));
            return;
        }
        List<String> need = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.ACCESS_FINE_LOCATION);
            need.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!need.isEmpty()) {
            requestPermissions(need.toArray(new String[0]), REQ_PERMS);
            return;
        }
        startWatching();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code != REQ_PERMS) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            new AlertDialog.Builder(this)
                    .setTitle("위치 권한이 필요해요")
                    .setMessage("GPS 상태를 보려면 '정확한 위치' 권한이 필요해요. 설정에서 허용해 주세요.")
                    .setPositiveButton("설정 열기", (d, w) -> startActivity(
                            new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    Uri.parse("package:" + getPackageName()))))
                    .setNegativeButton("취소", null)
                    .show();
            return;
        }
        startWatching();
    }

    private void startWatching() {
        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            new AlertDialog.Builder(this)
                    .setTitle("위치(GPS)가 꺼져 있어요")
                    .setMessage("빠른 설정에서 '위치'를 켜 주세요.")
                    .setPositiveButton("위치 설정 열기", (d, w) ->
                            startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)))
                    .setNegativeButton("취소", null)
                    .show();
            return;
        }
        startForegroundService(new Intent(this, GpsWatchService.class)
                .setAction(GpsWatchService.ACTION_START));
    }

    private boolean isBatteryExempt() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        return pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private void askBatteryExemption() {
        Intent i;
        if (isBatteryExempt()) {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName()));
        } else {
            i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName()));
        }
        try {
            startActivity(i);
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    // ───────────────────────── 작은 위젯 헬퍼 ─────────────────────────

    private View choice(int[] values, String unit, String key, int def) {
        RadioGroup g = new RadioGroup(this);
        g.setOrientation(RadioGroup.HORIZONTAL);
        int cur = prefs.getInt(key, def);
        for (int v : values) {
            RadioButton r = new RadioButton(this);
            r.setId(View.generateViewId());
            r.setText(v + unit);
            r.setTextSize(17);
            r.setPadding(0, 0, dp(14), 0);
            g.addView(r);
            if (v == cur) r.setChecked(true);
            r.setOnCheckedChangeListener((btn, on) -> {
                if (on) prefs.edit().putInt(key, v).apply();
            });
        }
        return g;
    }

    private View sw(String label, String key, boolean def) {
        Switch s = new Switch(this);
        s.setText(label);
        s.setTextSize(16);
        s.setChecked(prefs.getBoolean(key, def));
        s.setPadding(0, dp(8), 0, dp(8));
        s.setOnCheckedChangeListener((CompoundButton btn, boolean on) ->
                prefs.edit().putBoolean(key, on).apply());
        return s;
    }

    private TextView section(String s) {
        TextView t = text(s, 17, true, "#1B5E20");
        t.setPadding(0, dp(24), 0, dp(6));
        return t;
    }

    private TextView hint(String s) {
        TextView t = text(s, 13, false, "#777777");
        t.setPadding(0, dp(2), 0, 0);
        return t;
    }

    private TextView text(String s, int sp, boolean bold, String color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(Color.parseColor(color));
        t.setGravity(Gravity.START);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
