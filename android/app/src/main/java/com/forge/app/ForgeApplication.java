package com.forge.app;

import android.app.Application;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

// Custom Application class so the crash handler installs as early as possible —
// before MainActivity, before Capacitor's bridge, before Firebase's own
// auto-initialization (which runs as a ContentProvider prior to any Activity).
// This catches crashes that happen too early for MainActivity.onCreate to see.
public class ForgeApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        installCrashHandler();
    }

    private void installCrashHandler() {
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                StringWriter sw = new StringWriter();
                throwable.printStackTrace(new PrintWriter(sw));
                String timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
                File crashFile = new File(getFilesDir(), "last_crash.txt");
                FileWriter writer = new FileWriter(crashFile, false);
                writer.write("Forge crashed at " + timestamp + "\n\n" + sw.toString());
                writer.close();
            } catch (Exception loggingError) {
                // Don't let a logging failure mask the original crash.
            } finally {
                if (defaultHandler != null) {
                    defaultHandler.uncaughtException(thread, throwable);
                } else {
                    System.exit(1);
                }
            }
        });
    }
}
