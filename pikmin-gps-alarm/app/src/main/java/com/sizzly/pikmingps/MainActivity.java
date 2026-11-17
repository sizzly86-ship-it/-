package com.sizzly.pikmingps;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
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

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;

    private TextView statusBig, statusDetail;
    private GradientDrawable statusBg;
    private Button toggle;
    private LinearLayout autoBox;
    private TextView accessLine;
    private Button accessBtn;
    private TextView detectLine;
    private LinearLayout pikminList;
    private Button batteryBtn;
    private Button fullScreenBtn;
    private String lastListSig = null;

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
        lastListSig = null;
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
        root.setPadding(pad, dp(32), pad, dp(40));
        root.setBackgroundColor(Color.parseColor("#F6FAF6"));

        root.addView(text("🌸 피크민 GPS 알리미", 24, true, "#1B5E20"));
        TextView sub = text("꽃 심으면서 건물에 들어가 GPS가 끊기면 시끄럽게 알려줘요.", 15, false, "#555555");
        sub.setPadding(0, dp(4), 0, dp(16));
        root.addView(sub);

        // 상태 카드
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        statusBg = new GradientDrawable();
        statusBg.setCornerRadius(dp(16));
        card.setBackground(statusBg);
        statusBig = text("", 24, true, "#FFFFFF");
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

        Button testBtn = new Button(this);
        testBtn.setAllCaps(false);
        testBtn.setText("🔔 알람 테스트 해보기");
        testBtn.setOnClickListener(v -> testAlarm());
        root.addView(testBtn);

        // 모드
        root.addView(section("언제 감시할까요?"));
        root.addView(choice(new String[]{"auto", "manual"},
                new String[]{"피크민 꽃 심을 때만 (추천)", "켜 둔 동안 항상"},
                GpsWatchService.KEY_MODE, "auto", true));
        root.addView(hint("'꽃 심을 때만'으로 하면 꽃 심기를 끄면 GPS도 같이 놔서 배터리를 거의 안 먹어요."));

        autoBox = new LinearLayout(this);
        autoBox.setOrientation(LinearLayout.VERTICAL);
        autoBox.setPadding(dp(14), dp(12), dp(14), dp(12));
        GradientDrawable boxBg = new GradientDrawable();
        boxBg.setColor(Color.WHITE);
        boxBg.setCornerRadius(dp(12));
        boxBg.setStroke(dp(1), Color.parseColor("#C8E6C9"));
        autoBox.setBackground(boxBg);
        accessLine = text("", 15, true, "#333333");
        autoBox.addView(accessLine);
        accessBtn = new Button(this);
        accessBtn.setAllCaps(false);
        accessBtn.setText("사용 기록 접근 허용하러 가기");
        accessBtn.setOnClickListener(v -> openUsageSettings());
        autoBox.addView(accessBtn);
        detectLine = text("", 15, true, "#333333");
        detectLine.setPadding(0, dp(8), 0, dp(4));
        autoBox.addView(detectLine);
        TextView listTitle = text("피크민 최근 기록:", 13, false, "#777777");
        autoBox.addView(listTitle);
        pikminList = new LinearLayout(this);
        pikminList.setOrientation(LinearLayout.VERTICAL);
        autoBox.addView(pikminList);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        blp.topMargin = dp(10);
        root.addView(autoBox, blp);

        // 알람 세기
        root.addView(section("알람 세기"));
        root.addView(choice(new String[]{"crazy", "repeat", "once"},
                new String[]{"🔥 끌 때까지 계속 울림", "2분마다 진동+소리", "한 번만"},
                GpsWatchService.KEY_STRENGTH, "crazy", true));
        root.addView(hint("'계속 울림'은 알람 끄기를 누르거나, 꽃 심기를 끄거나, GPS가 다시 잡힐 때까지 "
                + "알람 소리+진동이 쉬지 않고 울려요. 10분 넘게 방치하면 2분마다로 바뀌어요."));
        root.addView(sw("무음·진동 모드여도 알람 소리 내기", GpsWatchService.KEY_ALARM_STREAM, true));
        root.addView(hint("켜 두면 시계 알람처럼 '알람 음량'으로 울려요."));
        root.addView(sw("밖으로 나와 GPS가 다시 잡히면 알리기", GpsWatchService.KEY_BACK, true));

        root.addView(section("GPS가 몇 초 끊기면 울릴까요?"));
        root.addView(choice(new String[]{"15", "30", "60", "90"},
                new String[]{"15초", "30초", "60초", "90초"},
                GpsWatchService.KEY_DELAY, "30", false));
        root.addView(hint("짧으면 빨리 알지만, 큰 건물 옆·지하차도에서 잠깐 끊겨도 울릴 수 있어요."));

        root.addView(section("이 정도보다 부정확하면 끊긴 걸로 볼까요?"));
        root.addView(choice(new String[]{"30", "50", "100"},
                new String[]{"30m", "50m", "100m"},
                GpsWatchService.KEY_ACC, "50", false));
        root.addView(hint("실내에서 와이파이로 대충 잡히는 위치를 걸러내는 기준이에요. 보통 50m면 충분해요."));

        root.addView(section("꺼지지 않게 하기 (갤럭시 필수)"));
        batteryBtn = new Button(this);
        batteryBtn.setAllCaps(false);
        batteryBtn.setOnClickListener(v -> askBatteryExemption());
        root.addView(batteryBtn);
        fullScreenBtn = new Button(this);
        fullScreenBtn.setAllCaps(false);
        fullScreenBtn.setOnClickListener(v -> openFullScreenSettings());
        root.addView(fullScreenBtn);
        root.addView(hint("배터리 최적화를 해제해야 화면이 꺼져도 계속 감시해요. "
                + "'전체 화면 알림'을 허용해야 잠금화면 위로 빨간 알람 화면이 떠요."));

        ScrollView sv = new ScrollView(this);
        sv.addView(root);
        return sv;
    }

    private void render() {
        boolean running = GpsWatchService.running;
        boolean auto = !"manual".equals(prefs.getString(GpsWatchService.KEY_MODE, "auto"));
        boolean access = PikminDetector.hasAccess(this);
        toggle.setText(running ? "앱 끄기" : "앱 켜기");

        String big, detail, color;
        long now = SystemClock.elapsedRealtime();
        String info = "위성 " + GpsWatchService.satsUsed + "/" + GpsWatchService.satsVisible
                + "개 · 정확도 " + (GpsWatchService.lastAccuracy >= 0
                ? "±" + Math.round(GpsWatchService.lastAccuracy) + "m" : "-")
                + " · 마지막 수신 " + (GpsWatchService.lastFixAt > 0
                ? ((now - GpsWatchService.lastFixAt) / 1000) + "초 전" : "없음");

        if (!running) {
            big = "꺼져 있음";
            detail = auto ? "'앱 켜기'를 한 번 눌러 두면, 피크민에서 꽃 심기를 켤 때마다 알아서 감시해요."
                    : "피크민 켜고 나가기 전에 '앱 켜기'를 눌러 주세요.";
            color = "#9E9E9E";
        } else if (!GpsWatchService.watching) {
            if (auto && !access) {
                big = "사용 기록 접근 허용 필요";
                detail = "아래 '사용 기록 접근 허용하러 가기'를 눌러 주세요. 그래야 꽃 심는지 알 수 있어요.";
                color = "#E65100";
            } else {
                big = "꽃 심기 기다리는 중 💤";
                detail = "피크민에서 꽃 심기를 켜면 자동으로 감시를 시작해요. 지금은 GPS를 안 써요.";
                color = "#546E7A";
            }
        } else {
            switch (GpsWatchService.state) {
                case GOOD:
                    if (GpsWatchService.badSince > 0) {
                        big = "GPS 약해지는 중…";
                        color = "#F9A825";
                        detail = ((now - GpsWatchService.badSince) / 1000) + "초째 불안정\n" + info;
                    } else {
                        big = "꽃 심는 중 · GPS 잘 잡힘 ✓";
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

        // 자동 모드 설정 상자
        autoBox.setVisibility(auto ? View.VISIBLE : View.GONE);
        accessLine.setText(access ? "✅ 사용 기록 접근 허용됨" : "⚠️ 사용 기록 접근을 허용해 주세요");
        accessBtn.setVisibility(access ? View.GONE : View.VISIBLE);
        detectLine.setText(PikminDetector.planting ? "🌸 지금 꽃 심는 중으로 인식됨" : "꽃 심기 꺼짐으로 인식됨");
        renderPikminList();

        batteryBtn.setText(isBatteryExempt() ? "배터리 최적화 해제됨 ✓" : "배터리 최적화 해제하기");
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            fullScreenBtn.setText(nm.canUseFullScreenIntent()
                    ? "전체 화면 알림 허용됨 ✓" : "전체 화면 알림 허용하기");
        } else {
            fullScreenBtn.setVisibility(View.GONE);
        }
    }

    /** 피크민 최근 기록 (꽃 심기 인식이 잘 되는지 확인용) */
    private void renderPikminList() {
        if (!GpsWatchService.running && PikminDetector.hasAccess(this)) PikminDetector.poll(this);
        List<String> list = PikminDetector.recentLog();
        String sig = String.join("|", list);
        if (sig.equals(lastListSig)) return;
        lastListSig = sig;
        pikminList.removeAllViews();
        if (list.isEmpty()) {
            pikminList.addView(hint("(아직 없음) 피크민에서 꽃 심기를 켜고 홈 화면으로 나가면 "
                    + "'백그라운드 작업 시작'이 떠야 해요."));
            return;
        }
        for (String line : list) pikminList.addView(text(line, 13, false, "#444444"));
    }

    // ───────────────────────── 켜기/끄기 ─────────────────────────

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
                    .setPositiveButton("설정 열기", (d, w) -> openAppSettings())
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

        boolean auto = !"manual".equals(prefs.getString(GpsWatchService.KEY_MODE, "auto"));
        if (auto && !PikminDetector.hasAccess(this)) {
            new AlertDialog.Builder(this)
                    .setTitle("사용 기록 접근을 허용해 주세요")
                    .setMessage("피크민이 꽃을 심는 중인지 알려면, 안드로이드 '사용 기록'에서 "
                            + "피크민이 백그라운드로 돌고 있는지 봐야 해요.\n\n"
                            + "다음 화면에서 '피크민 GPS 알리미'를 찾아 켜 주세요.")
                    .setPositiveButton("허용하러 가기", (d, w) -> openUsageSettings())
                    .setNegativeButton("나중에", null)
                    .show();
        }
    }

    private void testAlarm() {
        boolean alarmStream = prefs.getBoolean(GpsWatchService.KEY_ALARM_STREAM, true);
        if ("crazy".equals(prefs.getString(GpsWatchService.KEY_STRENGTH, "crazy"))) {
            Ringer.startContinuous(this, alarmStream);
            handler.postDelayed(Ringer::stop, 15000); // 테스트는 15초면 자동으로 멈춤
            startActivity(new Intent(this, AlarmActivity.class).putExtra(AlarmActivity.EXTRA_TEST, true));
        } else {
            Ringer.burst(this, alarmStream);
        }
    }

    // ───────────────────────── 설정 화면 열기 ─────────────────────────

    private void openUsageSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        }
    }

    private void openFullScreenSettings() {
        if (Build.VERSION.SDK_INT < 34) return;
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            openAppSettings();
        }
    }

    private void openAppSettings() {
        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getPackageName())));
    }

    private boolean isBatteryExempt() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        return pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private void askBatteryExemption() {
        if (isBatteryExempt()) { openAppSettings(); return; }
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    // ───────────────────────── 작은 위젯 헬퍼 ─────────────────────────

    /** 라디오 버튼 묶음. asString=false면 숫자(int)로 저장 */
    private View choice(String[] values, String[] labels, String key, String def, boolean asString) {
        RadioGroup g = new RadioGroup(this);
        boolean vertical = labels[0].length() > 6;
        g.setOrientation(vertical ? RadioGroup.VERTICAL : RadioGroup.HORIZONTAL);
        String cur = asString ? prefs.getString(key, def)
                : String.valueOf(prefs.getInt(key, Integer.parseInt(def)));
        for (int k = 0; k < values.length; k++) {
            String v = values[k];
            RadioButton r = new RadioButton(this);
            r.setId(View.generateViewId());
            r.setText(labels[k]);
            r.setTextSize(17);
            r.setPadding(0, dp(2), dp(14), dp(2));
            g.addView(r);
            if (v.equals(cur)) r.setChecked(true);
            r.setOnCheckedChangeListener((btn, on) -> {
                if (!on) return;
                if (asString) prefs.edit().putString(key, v).apply();
                else prefs.edit().putInt(key, Integer.parseInt(v)).apply();
                if (GpsWatchService.KEY_MODE.equals(key)) GpsWatchService.refresh();
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
        s.setOnCheckedChangeListener((btn, on) -> prefs.edit().putBoolean(key, on).apply());
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
