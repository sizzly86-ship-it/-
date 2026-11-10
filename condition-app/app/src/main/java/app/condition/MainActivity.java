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
    private String pendingExport;
    private volatile String launchTarget = "";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        readTarget(getIntent());
        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setTextZoom(100);
        web.setWebChromeClient(new WebChromeClient()); // confirm() 대화상자용
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Native");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
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

    private void js(String code) {
        web.post(() -> web.evaluateJavascript(code, null));
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
                return "";
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
            tmp.renameTo(dataFile());
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
                if (shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
                        || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                }
            });
        }

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
