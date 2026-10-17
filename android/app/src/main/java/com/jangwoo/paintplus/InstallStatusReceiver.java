package com.jangwoo.paintplus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** 시스템 설치기의 진행 상황: 확인 창이 필요하면 띄우고, 실패는 앱에 알린다. */
public class InstallStatusReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            AppUpdaterPlugin.reportInstall(true, null);
        } else {
            String m;
            switch (status) {
                case PackageInstaller.STATUS_FAILURE_ABORTED:
                    m = "설치를 취소했습니다.";
                    break;
                case PackageInstaller.STATUS_FAILURE_CONFLICT:
                case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                    m = "설치된 앱과 서명이 달라 덮어 설치할 수 없습니다.";
                    break;
                case PackageInstaller.STATUS_FAILURE_STORAGE:
                    m = "저장 공간이 부족합니다.";
                    break;
                default:
                    m = "설치하지 못했습니다.";
            }
            AppUpdaterPlugin.reportInstall(false, m);
        }
    }
}
