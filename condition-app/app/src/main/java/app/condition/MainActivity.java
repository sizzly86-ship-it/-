package app.condition;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** 화면은 assets/www 의 웹 페이지가 그리고, 이 액티비티는 폰 기능을 연결해 준다. */
public class MainActivity extends Activity {
    private static final int REQ_EXPORT = 1;
    private static final int REQ_IMPORT = 2;
    private static final int REQ_NOTIF = 3;

    private WebView web;
    private boolean pageReady;
    private volatile String pendingExport;
    private final java.util.ArrayList<String> pendingJs = new java.util.ArrayList<>();
    private volatile String launchTarget = "";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        readTarget(getIntent());
        // 지난번에 쓰던 테마 색으로 먼저 칠해서, 화면이 뜨기 전에 다른 색이 번쩍이지 않게 한다
        String[] chrome = getPreferences(MODE_PRIVATE).getString("chrome", "#f2f4f6|#ffffff|1").split("\\|");
        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        // 폰의 글자 크기 설정을 따르되, 화면이 깨지지 않게 130%까지만
        ws.setTextZoom(Math.round(100 * Math.min(1.3f, Math.max(0.85f, getResources().getConfiguration().fontScale))));
        web.setWebChromeClient(new WebChromeClient()); // confirm() 대화상자용
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                return true; // 앱 화면 밖의 어떤 주소로도 이동하지 않는다
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                // 파일 선택 화면에 다녀오는 사이 화면이 다시 만들어졌으면, 그동안 밀린 결과를 지금 전달한다
                for (String code : pendingJs) view.evaluateJavascript(code, null);
                pendingJs.clear();
            }
        });
        web.addJavascriptInterface(new Bridge(), "Native");
        setContentView(web);
        if (chrome.length == 3) applyChrome(chrome[0], chrome[1], "1".equals(chrome[2]));
        web.loadUrl("file:///android_asset/www/index.html");
    }

    /** 뒤로 가기: 화면 안에서 닫을 것(열린 창, 다른 탭)이 있으면 그것부터 닫고, 없으면 앱을 내린다. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (!pageReady) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("!!(window.onBack && window.onBack())", handled -> {
            if (!"true".equals(handled)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        readTarget(intent);
    }

    private void readTarget(Intent intent) {
        String t = intent == null ? null : intent.getStringExtra("target");
        if (t != null) launchTarget = t;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pageReady) js("window.onResume && window.onResume()");
    }

    /** 상태바·내비게이션 바·창 배경을 테마 색에 맞춘다. */
    @SuppressWarnings("deprecation")
    private void applyChrome(String bg, String nav, boolean light) {
        try {
            int b = android.graphics.Color.parseColor(bg), n = android.graphics.Color.parseColor(nav);
            android.view.Window w = getWindow();
            android.view.View decor = w.getDecorView();
            w.setStatusBarColor(b);
            w.setNavigationBarColor(n);
            decor.setBackgroundColor(b);
            web.setBackgroundColor(b);
            int mask = android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            int flags = decor.getSystemUiVisibility();
            decor.setSystemUiVisibility(light ? (flags | mask) : (flags & ~mask));
        } catch (IllegalArgumentException ignored) {
            // 색 값이 잘못됐으면 그대로 둔다
        }
    }

    private void js(String code) {
        web.post(() -> {
            if (pageReady) web.evaluateJavascript(code, null);
            else pendingJs.add(code);
        });
    }

    private static void copy(File from, File to) throws Exception {
        try (InputStream is = new FileInputStream(from); FileOutputStream os = new FileOutputStream(to)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
            os.getFD().sync();
        }
    }

    private File dataFile() {
        return new File(getFilesDir(), "data.json");
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);
        Uri uri = data == null ? null : data.getData();
        if (req == REQ_EXPORT) {
            boolean ok = false;
            if (result == RESULT_OK && uri != null && pendingExport != null) {
                try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                    os.write(pendingExport.getBytes(StandardCharsets.UTF_8));
                    ok = true;
                } catch (Exception ignored) {
                }
            }
            pendingExport = null;
            if (result == RESULT_OK) js("window.onExported(" + ok + ")");
        } else if (req == REQ_IMPORT && result == RESULT_OK && uri != null) {
            try (InputStream is = getContentResolver().openInputStream(uri)) {
                js("window.onImport(" + JSONObject.quote(readAll(is)) + ")");
            } catch (Exception ex) {
                js("window.onImport('')");
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        if (pageReady) js("window.onResume && window.onResume()");
    }

    private static String readAll(InputStream is) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toString("UTF-8");
    }

    /** 웹 페이지에서 window.Native.xxx() 로 부르는 함수들. */
    private final class Bridge {
        @JavascriptInterface
        public String loadData() {
            File f = dataFile();
            if (!f.exists()) return "";
            try (InputStream is = new FileInputStream(f)) {
                return readAll(is);
            } catch (Exception ex) {
                return "ERR"; // 빈 값으로 돌려주면 새 데이터로 덮어써 버리므로 "읽기 실패"임을 알린다
            }
        }

        /** 하루에 한 번 자동으로 떠 두는 사본. */
        @JavascriptInterface
        public String loadBackup() {
            try (InputStream is = new FileInputStream(new File(getFilesDir(), "data.bak.json"))) {
                return readAll(is);
            } catch (Exception ex) {
                return "";
            }
        }

        /** 읽을 수 없는 저장 파일을 지우지 않고 따로 보관한다. */
        @JavascriptInterface
        public void quarantine() {
            try {
                copy(dataFile(), new File(getFilesDir(), "data.broken.json"));
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public synchronized void saveData(String json) {
            // 임시 파일에 쓰고 바꿔치기해서, 쓰는 도중 앱이 죽어도 기존 데이터가 깨지지 않게 한다
            File tmp = new File(getFilesDir(), "data.json.tmp");
            try (FileOutputStream os = new FileOutputStream(tmp)) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
                os.getFD().sync();
            } catch (Exception ex) {
                return;
            }
            File main = dataFile(), bak = new File(getFilesDir(), "data.bak.json");
            try {
                if (main.length() > 0 && System.currentTimeMillis() - bak.lastModified() > 24 * 3600_000L) copy(main, bak);
            } catch (Exception ignored) {
            }
            tmp.renameTo(main);
        }

        @JavascriptInterface
        public boolean hasUsageAccess() {
            return UsageReader.hasAccess(MainActivity.this);
        }

        @JavascriptInterface
        public void openUsageAccess() {
            try {
                startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception ex) {
                startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
            }
        }

        @JavascriptInterface
        public String getSessions(String from, String to) {
            try {
                return UsageReader.sessions(MainActivity.this, Long.parseLong(from), Long.parseLong(to));
            } catch (Exception ex) {
                return "[]";
            }
        }

        @JavascriptInterface
        public void setReminders(String json) {
            ReminderReceiver.save(MainActivity.this, json);
        }

        @JavascriptInterface
        public String notifPermission() {
            if (Build.VERSION.SDK_INT < 33) return "granted";
            return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                    ? "granted" : "denied";
        }

        @JavascriptInterface
        public void requestNotif() {
            if (Build.VERSION.SDK_INT < 33) return;
            runOnUiThread(() -> {
                String perm = Manifest.permission.POST_NOTIFICATIONS;
                if (checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) return;
                android.content.SharedPreferences p = getPreferences(MODE_PRIVATE);
                if (p.getBoolean("notifAsked", false) && !shouldShowRequestPermissionRationale(perm)) {
                    // 이미 거절해서 시스템이 더는 묻지 않는 상태: 앱 알림 설정 화면을 직접 연다
                    startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
                } else {
                    p.edit().putBoolean("notifAsked", true).apply();
                    requestPermissions(new String[]{perm}, REQ_NOTIF);
                }
            });
        }

        @JavascriptInterface
        public void exportFile(String name, String mime, String text) {
            pendingExport = text;
            Intent in = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mime)
                    .putExtra(Intent.EXTRA_TITLE, name);
            runOnUiThread(() -> startActivityForResult(in, REQ_EXPORT));
        }

        @JavascriptInterface
        public void setChrome(String bg, String nav, boolean light) {
            if (bg == null || nav == null || !bg.matches("#[0-9a-fA-F]{6}") || !nav.matches("#[0-9a-fA-F]{6}")) return;
            getPreferences(MODE_PRIVATE).edit().putString("chrome", bg + "|" + nav + "|" + (light ? "1" : "0")).apply();
            runOnUiThread(() -> applyChrome(bg, nav, light));
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception ex) {
                return "";
            }
        }

        /** 버튼을 눌렀을 때의 짧은 진동 느낌. */
        @JavascriptInterface
        public void haptic() {
            runOnUiThread(() -> web.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP));
        }

        /** 1.x 화면 코드와의 호환용. */
        @JavascriptInterface
        public void exportData(String json) {
            pendingExport = json;
            String name = "condition-" + new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date()) + ".json";
            Intent in = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json")
                    .putExtra(Intent.EXTRA_TITLE, name);
            runOnUiThread(() -> startActivityForResult(in, REQ_EXPORT));
        }

        @JavascriptInterface
        public void shareText(String text) {
            Intent in = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(in, "분석을 맡길 AI 앱 선택")));
        }

        @JavascriptInterface
        public void importData() {
            Intent in = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*");
            runOnUiThread(() -> startActivityForResult(in, REQ_IMPORT));
        }

        @JavascriptInterface
        public String launchTarget() {
            String t = launchTarget;
            launchTarget = "";
            return t;
        }
    }
}
