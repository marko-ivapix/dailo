package cloud.ivapix.dailo;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Redesign R28: the "Danas" home-screen widget. It shows today's open tasks (late ones first) from the snapshot the
 * app saves after each change (WidgetPlugin), "+" for Quick Add and a tap that opens Danas. It only reads: tasks are
 * completed in the app. A snapshot from another day is not shown as today's plan.
 */
public class TodayWidget extends AppWidgetProvider {

    static final String PREFS = "dailo_widget";
    static final String KEY = "snapshot";
    private static final int[] ROWS = { R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3, R.id.widget_row_4, R.id.widget_row_5 };
    private static final int TEXT = 0xFFE9EBEF;
    private static final int LATE = 0xFFFF7A7A;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidget.class));
        if (ids.length > 0) manager.updateAppWidget(ids, build(context));
    }

    static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        views.setOnClickPendingIntent(R.id.widget_root, link(context, "dailo://today", 1));
        views.setOnClickPendingIntent(R.id.widget_add, link(context, "dailo://new-task", 2));
        JSONObject snapshot = read(context);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        boolean current = snapshot != null && today.equals(snapshot.optString("date"));
        views.setTextViewText(R.id.widget_title, snapshot != null ? snapshot.optString("title", context.getString(R.string.shortcut_today)) : context.getString(R.string.shortcut_today));
        String summary = current ? snapshot.optString("summary", "") : "";
        views.setTextViewText(R.id.widget_summary, summary);
        views.setViewVisibility(R.id.widget_summary, summary.isEmpty() ? View.GONE : View.VISIBLE);
        JSONArray items = current ? snapshot.optJSONArray("items") : null;
        int count = items == null ? 0 : Math.min(items.length(), ROWS.length);
        for (int i = 0; i < ROWS.length; i++) {
            JSONObject item = i < count ? items.optJSONObject(i) : null;
            if (item != null) {
                views.setTextViewText(ROWS[i], item.optString("text"));
                views.setTextColor(ROWS[i], item.optBoolean("overdue") ? LATE : TEXT);
                views.setViewVisibility(ROWS[i], View.VISIBLE);
            } else {
                views.setViewVisibility(ROWS[i], View.GONE);
            }
        }
        String note = snapshot == null ? context.getString(R.string.widget_open)
            : !current ? snapshot.optString("stale", context.getString(R.string.widget_open))
            : count == 0 ? snapshot.optString("empty", "")
            : snapshot.optString("more", "");
        views.setTextViewText(R.id.widget_note, note);
        views.setViewVisibility(R.id.widget_note, note.isEmpty() ? View.GONE : View.VISIBLE);
        return views;
    }

    private static JSONObject read(Context context) {
        String text = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
        if (text == null) return null;
        try {
            return new JSONObject(text);
        } catch (Exception ignored) {
            return null;
        }
    }

    // The widget's taps open Dailo with the same dailo:// links as the icon shortcuts (R24).
    private static PendingIntent link(Context context, String uri, int code) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
