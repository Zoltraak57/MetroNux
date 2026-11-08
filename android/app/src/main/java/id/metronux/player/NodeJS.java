package id.metronux.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import android.os.Build;
import android.system.Os;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Menjalankan runtime Node.js yang tertanam di dalam APK.
 * Proyek Node disalin ke penyimpanan internal sekali per pembaruan APK.
 */
public final class NodeJS {
  private static final String TAG = "MetronuxNode";
  private static final String PROJECT = "nodejs-project";
  private static final String PREFS = "metronux_node";
  private static final String KEY_ASSET_VERSION = "assetVersion";
  private static final AtomicBoolean started = new AtomicBoolean(false);

  static {
    System.loadLibrary("node");
    System.loadLibrary("metronux-node");
  }

  private NodeJS() {}

  private static native int startNodeWithArguments(String[] arguments, String nodePath, boolean redirect);

  private static native String getCurrentABIName();

  public static void start(final Context context) {
    if (!started.compareAndSet(false, true)) return;

    final Context app = context.getApplicationContext();
    Thread thread = new Thread(() -> {
      try {
        File root = new File(app.getFilesDir(), PROJECT);
        extractIfNeeded(app, root);

        File dataDir = new File(app.getFilesDir(), "data");
        if (!dataDir.exists() && !dataDir.mkdirs()) {
          throw new IOException("Tidak dapat membuat folder data");
        }

        Os.setenv("METRONUX_DATA_DIR", dataDir.getAbsolutePath(), true);
        Os.setenv("TMPDIR", app.getCacheDir().getAbsolutePath(), true);

        String nodePath = root.getAbsolutePath() + ":" + new File(root, "node_modules").getAbsolutePath();
        Os.setenv("NODE_PATH", nodePath, true);

        File script = new File(root, "main.js");
        Log.i(TAG, "Mulai Node " + getCurrentABIName() + " dari " + script.getAbsolutePath());

        int code = startNodeWithArguments(
            new String[]{"node", script.getAbsolutePath()},
            nodePath,
            true);
        Log.i(TAG, "Node berhenti dengan kode " + code);
      } catch (Throwable error) {
        Log.e(TAG, "Gagal menjalankan Node", error);
      }
    }, "metronux-node");
    thread.start();
  }

  private static void extractIfNeeded(Context context, File root) throws Exception {
    PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
    long version = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

    boolean ready = new File(root, "main.js").exists()
        && prefs.getLong(KEY_ASSET_VERSION, -1) == version;
    if (ready) return;

    deleteRecursive(root);
    if (!root.mkdirs() && !root.isDirectory()) {
      throw new IOException("Tidak dapat membuat folder proyek Node");
    }
    copyAssetTree(context.getAssets(), PROJECT, root);
    prefs.edit().putLong(KEY_ASSET_VERSION, version).apply();
    Log.i(TAG, "Aset Node disalin ke " + root.getAbsolutePath());
  }

  private static void copyAssetTree(AssetManager assets, String source, File target) throws IOException {
    String[] children = assets.list(source);
    if (children == null || children.length == 0) {
      copyAssetFile(assets, source, target);
      return;
    }
    if (!target.exists() && !target.mkdirs()) {
      throw new IOException("Tidak dapat membuat folder " + target);
    }
    for (String child : children) {
      copyAssetTree(assets, source + "/" + child, new File(target, child));
    }
  }

  private static void copyAssetFile(AssetManager assets, String source, File target) throws IOException {
    File parent = target.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) {
      throw new IOException("Tidak dapat membuat folder " + parent);
    }
    try (InputStream in = assets.open(source); OutputStream out = new FileOutputStream(target)) {
      byte[] buffer = new byte[64 * 1024];
      int read;
      while ((read = in.read(buffer)) != -1) {
        out.write(buffer, 0, read);
      }
    }
  }

  private static void deleteRecursive(File file) {
    if (!file.exists()) return;
    File[] children = file.listFiles();
    if (children != null) {
      for (File child : children) deleteRecursive(child);
    }
    //noinspection ResultOfMethodCallIgnored
    file.delete();
  }
}
