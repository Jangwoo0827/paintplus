package com.jangwoo.paintplus;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;

/**
 * 앱 안에서 GitHub 릴리스의 새 APK 를 받아 설치한다 (SuperDialer 와 같은 방식).
 * 안전장치: 이 저장소의 릴리스 주소만 허용, 같은 패키지 · 더 높은 버전 · 같은 서명 인증서일 때만 설치.
 * 설치 확인 창은 안드로이드가 띄우며, 이 앱이 설치한 뒤에는 12 이상에서 확인 없이 갱신될 수 있다.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    static final String ALLOWED_PREFIX = "https://github.com/Jangwoo0827/paintplus/releases/download/";
    static final String ACTION_STATUS = "com.jangwoo.paintplus.INSTALL_STATUS";
    static AppUpdaterPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    private File apkFile(String version) {
        File dir = new File(getContext().getCacheDir(), "updates");
        dir.mkdirs();
        return new File(dir, "PaintPlus-" + version.replaceAll("[^0-9A-Za-z.]", "") + ".apk");
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void isUnmetered(PluginCall call) {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        boolean ok = false;
        Network n = cm.getActiveNetwork();
        if (n != null) {
            NetworkCapabilities c = cm.getNetworkCapabilities(n);
            ok = c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
        }
        JSObject r = new JSObject();
        r.put("unmetered", ok);
        call.resolve(r);
    }

    /** 이미 받아 둔 설치 파일이 있는지 */
    @PluginMethod
    public void hasDownload(PluginCall call) {
        String v = call.getString("version", "");
        JSObject r = new JSObject();
        r.put("exists", apkFile(v).exists());
        call.resolve(r);
    }

    /** url 을 받아 검사한다. progress 이벤트(percent 0..100, 모르면 -1). 문제가 있으면 reject. */
    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url", "");
        final String version = call.getString("version", "");
        if (!url.startsWith(ALLOWED_PREFIX)) {
            call.reject("허용되지 않는 다운로드 주소입니다.");
            return;
        }
        new Thread(() -> {
            File target = apkFile(version);
            File part = new File(target.getPath() + ".part");
            try {
                if (!target.exists()) {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    try {
                        c.setInstanceFollowRedirects(true);
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(30000);
                        c.setRequestProperty("User-Agent", "PaintPlus");
                        if (c.getResponseCode() != 200) throw new IOException("받지 못했습니다 (" + c.getResponseCode() + ").");
                        long total = c.getContentLengthLong();
                        long done = 0;
                        int last = -2;
                        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                            byte[] buf = new byte[64 * 1024];
                            int n;
                            while ((n = in.read(buf)) >= 0) {
                                out.write(buf, 0, n);
                                done += n;
                                int p = total > 0 ? (int) (done * 100 / total) : -1;
                                if (p != last) {
                                    last = p;
                                    JSObject e = new JSObject();
                                    e.put("percent", p);
                                    notifyListeners("progress", e);
                                }
                            }
                        }
                        if (total > 0 && done != total) throw new IOException("다운로드가 끊겼습니다.");
                        if (!part.renameTo(target)) throw new IOException("파일을 저장하지 못했습니다.");
                    } finally {
                        c.disconnect();
                        if (part.exists()) part.delete();
                    }
                }
                String problem = verify(target);
                if (problem != null) {
                    target.delete();
                    call.reject(problem);
                    return;
                }
                call.resolve();
            } catch (Exception e) {
                target.delete();
                call.reject(e.getMessage() == null ? "업데이트를 받지 못했습니다." : e.getMessage());
            }
        }).start();
    }

    private static String sha(byte[] b) throws Exception {
        StringBuilder s = new StringBuilder();
        for (byte x : MessageDigest.getInstance("SHA-256").digest(b)) s.append(String.format("%02x", x));
        return s.toString();
    }

    private Set<String> signers(PackageInfo pi) throws Exception {
        Set<String> out = new HashSet<>();
        if (Build.VERSION.SDK_INT >= 28) {
            if (pi.signingInfo != null) for (Signature s : pi.signingInfo.getApkContentsSigners()) out.add(sha(s.toByteArray()));
        } else if (pi.signatures != null) {
            for (Signature s : pi.signatures) out.add(sha(s.toByteArray()));
        }
        return out;
    }

    /** 문제가 없으면 null, 있으면 사유 */
    private String verify(File f) {
        try {
            PackageManager pm = getContext().getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo arc = pm.getPackageArchiveInfo(f.getPath(), flags);
            if (arc == null) return "받은 파일을 읽을 수 없습니다.";
            if (!getContext().getPackageName().equals(arc.packageName)) return "그림판+ 설치 파일이 아닙니다.";
            PackageInfo cur = pm.getPackageInfo(getContext().getPackageName(), flags);
            long a = Build.VERSION.SDK_INT >= 28 ? arc.getLongVersionCode() : arc.versionCode;
            long b = Build.VERSION.SDK_INT >= 28 ? cur.getLongVersionCode() : cur.versionCode;
            if (a <= b) return "이미 같거나 더 새로운 버전이 설치되어 있습니다.";
            Set<String> s1 = signers(arc);
            Set<String> s2 = signers(cur);
            if (s1.isEmpty() || !s1.equals(s2)) {
                return "설치된 앱과 서명이 달라 덮어 설치할 수 없습니다. (adb 로 깐 디버그 빌드라면 앱을 지우고 릴리스 APK 를 설치해야 합니다)";
            }
            return null;
        } catch (Exception e) {
            return "설치 파일을 검사하지 못했습니다.";
        }
    }

    /** 받아 둔 APK 를 시스템 설치기에 넘긴다. 결과는 installResult 이벤트로 온다. */
    @PluginMethod
    public void install(PluginCall call) {
        String version = call.getString("version", "");
        File f = apkFile(version);
        if (!f.exists()) {
            call.reject("설치 파일이 없습니다.");
            return;
        }
        if (!getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("NOT_ALLOWED");
            return;
        }
        try {
            PackageInstaller pi = getContext().getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(getContext().getPackageName());
            if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            int id = pi.createSession(params);
            try (PackageInstaller.Session s = pi.openSession(id)) {
                try (InputStream in = new FileInputStream(f); OutputStream out = s.openWrite("PaintPlus.apk", 0, f.length())) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
                    s.fsync(out);
                }
                Intent intent = new Intent(ACTION_STATUS).setPackage(getContext().getPackageName());
                PendingIntent pending = PendingIntent.getBroadcast(getContext(), id, intent, PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                s.commit(pending.getIntentSender());
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "설치하지 못했습니다." : e.getMessage());
        }
    }

    /** 오래된 설치 파일 정리 */
    @PluginMethod
    public void cleanUp(PluginCall call) {
        String keep = call.getString("keepVersion");
        File dir = new File(getContext().getCacheDir(), "updates");
        File[] fs = dir.listFiles();
        if (fs != null) {
            for (File f : fs) if (keep == null || !f.getName().equals(apkFile(keep).getName())) f.delete();
        }
        call.resolve();
    }

    static void reportInstall(boolean ok, String message) {
        if (instance == null) return;
        JSObject e = new JSObject();
        e.put("ok", ok);
        e.put("message", message == null ? "" : message);
        instance.notifyListeners("installResult", e);
    }
}
