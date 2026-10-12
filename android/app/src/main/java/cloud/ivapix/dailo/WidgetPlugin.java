package cloud.ivapix.dailo;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Redesign R28: the app hands the "Danas" widget (and, since R45, the "Navike" widget) its snapshot after each change. */
@CapacitorPlugin(name = "DailoWidget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("Missing snapshot");
            return;
        }
        getContext().getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE).edit().putString(TodayWidget.KEY, snapshot).apply();
        TodayWidget.refreshAll(getContext());
        HabitsWidget.refreshAll(getContext());
        call.resolve();
    }
}
