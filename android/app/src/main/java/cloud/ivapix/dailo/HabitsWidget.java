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
 * Redesign R45: the "Navike" home-screen widget. It shows today's planned habits (open ones first) from the "habits"
 * part of the snapshot the app saves after each change (WidgetPlugin). A tap on an open habit checks it in through
 * dailo://habit-done (the app shows Undo, a numeric habit opens its value); any other tap opens Navike.
 */
public class HabitsWidget extends AppWidgetProvider {

    private static final int[] ROWS = { R.id.habits_row_1, R.id.habits_row_2, R.id.habits_row_3, R.id.habits_row_4, R.id.habits_row_5 };
    private static final int OPEN = 0xFFE9EBEF;
    private static final int DONE = 0xFF6FD3B4;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, HabitsWidget.class));
        if (ids.length > 0) manager.updateAppWidget(ids, build(context));
    }

    static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_habits);
        views.setOnClickPendingIntent(R.id.habits_root, link(context, "dailo://habits", 90));
        JSONObject snapshot = read(context);
        JSONObject habits = snapshot == null ? null : snapshot.optJSONObject("habits");
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        boolean current = habits != null && today.equals(snapshot.optString("date"));
        views.setTextViewText(R.id.habits_title, habits != null ? habits.optString("title", context.getString(R.string.widget_habits_title)) : context.getString(R.string.widget_habits_title));
        String summary = current ? habits.optString("summary", "") : "";
        views.setTextViewText(R.id.habits_summary, summary);
        views.setViewVisibility(R.id.habits_summary, summary.isEmpty() ? View.GONE : View.VISIBLE);
        JSONArray items = current ? habits.optJSONArray("items") : null;
        int count = items == null ? 0 : Math.min(items.length(), ROWS.length);
        for (int i = 0; i < ROWS.length; i++) {
            JSONObject item = i < count ? items.optJSONObject(i) : null;
            if (item != null) {
                boolean done = item.optBoolean("done");
                views.setTextViewText(ROWS[i], item.optString("text"));
                views.setTextColor(ROWS[i], done ? DONE : OPEN);
                views.setViewVisibility(ROWS[i], View.VISIBLE);
                views.setOnClickPendingIntent(ROWS[i], done ? link(context, "dailo://habits", 110 + i) : link(context, "dailo://habit-done?id=" + Uri.encode(item.optString("id")), 100 + i));
            } else {
                views.setViewVisibility(ROWS[i], View.GONE);
            }
        }
        String note = habits == null ? context.getString(R.string.widget_open)
            : !current ? habits.optString("stale", context.getString(R.string.widget_open))
            : count == 0 ? habits.optString("empty", "")
            : habits.optString("more", "");
        views.setTextViewText(R.id.habits_note, note);
        views.setViewVisibility(R.id.habits_note, note.isEmpty() ? View.GONE : View.VISIBLE);
        return views;
    }

    private static JSONObject read(Context context) {
        String text = context.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE).getString(TodayWidget.KEY, null);
        if (text == null) return null;
        try {
            return new JSONObject(text);
        } catch (Exception ignored) {
            return null;
        }
    }

    // The same dailo:// links the icon shortcuts and the "Danas" widget use (R24, R28).
    private static PendingIntent link(Context context, String uri, int code) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
