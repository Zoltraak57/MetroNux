package id.metronux.player;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.media.session.MediaSession;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
  private static final String TAG = "Metronux";
  private static final int APP_PORT_FILE_TIMEOUT_MS = 90000;

  private WebView webView;
  private MediaSession mediaSession;
  private boolean pageLoaded = false;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    webView = new WebView(this);
    webView.setBackgroundColor(Color.parseColor("#131218"));
    webView.setLayoutParams(new android.widget.FrameLayout.LayoutParams(
        android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
        android.widget.FrameLayout.LayoutParams.MATCH_PARENT));
    setContentView(webView);

    configureWebView();
    configureMediaSession();
    NodeJS.start(this);
    waitForBackend();
  }

  private void configureWebView() {
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    settings.setLoadWithOverviewMode(false);
    settings.setUseWideViewPort(true);
    settings.setTextZoom(100);

    webView.addJavascriptInterface(new NativeBridge(), "MetronuxNative");

    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onConsoleMessage(ConsoleMessage message) {
        Log.d(TAG, message.message() + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
        return true;
      }
    });

    webView.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String scheme = uri.getScheme();
        if ("http".equals(scheme) || "https".equals(scheme)) {
          String host = uri.getHost();
          if ("127.0.0.1".equals(host) || "localhost".equals(host)) return false;
          openExternal(uri.toString());
          return true;
        }
        return true;
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        pageLoaded = true;
        emitSystemTheme();
      }
    });
  }

  private void configureMediaSession() {
    mediaSession = new MediaSession(this, "Metronux");
    mediaSession.setFlags(
        MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
    mediaSession.setCallback(new MediaSession.Callback() {
      @Override
      public void onPlay() {
        emit("media:command", "play");
      }

      @Override
      public void onPause() {
        emit("media:command", "pause");
      }

      @Override
      public void onSkipToNext() {
        emit("media:command", "next");
      }

      @Override
      public void onSkipToPrevious() {
        emit("media:command", "previous");
      }

      @Override
      public void onStop() {
        emit("media:command", "stop");
      }
    });
    mediaSession.setActive(true);
  }

  private void waitForBackend() {
    Thread thread = new Thread(() -> {
      File file = new File(getFilesDir(), "data/ports.json");
      long deadline = System.currentTimeMillis() + APP_PORT_FILE_TIMEOUT_MS;
      while (System.currentTimeMillis() < deadline) {
        if (file.exists()) {
          try {
            JSONObject info = new JSONObject(readFile(file));
            final int port = info.getInt("app");
            if (isBackendReady(port)) {
              runOnUiThread(() -> loadApp(port));
              return;
            }
          } catch (Exception ignored) {
            // Berkas mungkin masih ditulis; coba lagi.
          }
        }
        try {
          Thread.sleep(250);
        } catch (InterruptedException err) {
          Thread.currentThread().interrupt();
          break;
        }
      }
      runOnUiThread(this::showStartupError);
    }, "metronux-wait");
    thread.start();
  }

  private static boolean isBackendReady(int port) {
    HttpURLConnection connection = null;
    try {
      URL url = new URL("http://127.0.0.1:" + port + "/health");
      connection = (HttpURLConnection) url.openConnection();
      connection.setConnectTimeout(1000);
      connection.setReadTimeout(1000);
      connection.setRequestMethod("GET");
      return connection.getResponseCode() == 200;
    } catch (Exception err) {
      return false;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private void loadApp(int port) {
    if (isFinishing() || isDestroyed()) return;
    webView.loadUrl("http://127.0.0.1:" + port + "/");
  }

  private void showStartupError() {
    if (isFinishing() || isDestroyed()) return;
    String html = "<!doctype html><html lang=\"id\"><head><meta charset=\"utf-8\">"
        + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        + "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
        + "background:#131218;color:#e7e0ec;font-family:sans-serif;text-align:center;padding:24px}"
        + "h1{font-size:1.4rem;margin:0 0 8px}p{color:#cac4d0;line-height:1.5}</style></head><body>"
        + "<div><h1>Metronux gagal dimulai</h1>"
        + "<p>Layanan musik tidak merespons. Tutup aplikasi lalu buka kembali.</p></div></body></html>";
    webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
  }

  private void emit(String channel, String payload) {
    if (!pageLoaded || webView == null) return;
    String js = "window.__mntxEmit && window.__mntxEmit("
        + JSONObject.quote(channel) + "," + JSONObject.quote(payload) + ")";
    webView.post(() -> {
      if (webView != null) webView.evaluateJavascript(js, null);
    });
  }

  private void emitSystemTheme() {
    if (!pageLoaded || webView == null) return;
    boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
        == Configuration.UI_MODE_NIGHT_YES;
    String js = "window.__mntxEmit && window.__mntxEmit('system:theme',{dark:" + dark + "})";
    webView.post(() -> {
      if (webView != null) webView.evaluateJavascript(js, null);
    });
  }

  private void applyUiTheme(boolean dark, String surface) {
    int color;
    try {
      color = Color.parseColor(surface);
    } catch (Exception err) {
      color = Color.parseColor(dark ? "#131218" : "#FDF7FF");
    }
    getWindow().setStatusBarColor(color);
    getWindow().setNavigationBarColor(color);

    View decor = getWindow().getDecorView();
    int flags = decor.getSystemUiVisibility();
    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    }
    decor.setSystemUiVisibility(flags);
  }

  private static String readFile(File file) throws Exception {
    StringBuilder builder = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
      String line;
      while ((line = reader.readLine()) != null) builder.append(line);
    }
    return builder.toString();
  }

  private void openExternal(String url) {
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    } catch (ActivityNotFoundException err) {
      Log.w(TAG, "Tidak ada aplikasi untuk membuka " + url);
    }
  }

  private final class NativeBridge {
    @JavascriptInterface
    public void openExternal(String url) {
      if (url == null) return;
      if (!url.startsWith("http://") && !url.startsWith("https://")) return;
      runOnUiThread(() -> MainActivity.this.openExternal(url));
    }

    @JavascriptInterface
    public boolean isSystemDark() {
      return (MainActivity.this.getResources().getConfiguration().uiMode
          & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    @JavascriptInterface
    public String getSystemAccent() {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        try {
          int color = MainActivity.this.getColor(android.R.color.system_accent1_500);
          return String.format("#%06X", color & 0xFFFFFF);
        } catch (Exception ignored) {
          // Pakai warna bawaan jika aksen sistem tidak tersedia.
        }
      }
      return "#6750A4";
    }

    @JavascriptInterface
    public void setUiTheme(boolean dark, String surface) {
      runOnUiThread(() -> MainActivity.this.applyUiTheme(dark, surface));
    }
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    emitSystemTheme();
  }

  @Override
  public void onBackPressed() {
    if (webView == null) {
      super.onBackPressed();
      return;
    }
    webView.evaluateJavascript(
        "(function(){var h=location.hash||'';if(h&&h!=='#/home'){history.back();return 'handled';}return 'exit';})()",
        value -> {
          if (value == null || value.contains("exit")) {
            finish();
          }
        });
  }

  @Override
  protected void onDestroy() {
    if (mediaSession != null) {
      mediaSession.setActive(false);
      mediaSession.release();
      mediaSession = null;
    }
    if (webView != null) {
      webView.setVisibility(View.GONE);
      webView.destroy();
      webView = null;
    }
    super.onDestroy();
  }
}
