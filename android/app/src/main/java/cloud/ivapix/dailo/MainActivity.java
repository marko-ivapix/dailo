package cloud.ivapix.dailo;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Redesign R24: text shared to Dailo from another app arrives as a dailo://share?text=…&subject=… link, which
    // the App plugin hands to the web code like the icon shortcuts' dailo:// links (appUrlOpen, kept until the
    // app listens, so a cold start is delivered too).
    @Override
    public void onCreate(Bundle savedInstanceState) {
        asAppLink(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        asAppLink(intent);
        super.onNewIntent(intent);
    }

    static void asAppLink(Intent intent) {
        if (intent == null) return;
        // Reopening Dailo from Recents repeats the intent that first started it: share or open nothing again.
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
            Uri data = intent.getData();
            if (Intent.ACTION_SEND.equals(intent.getAction()) || (data != null && "dailo".equals(data.getScheme()))) {
                intent.setAction(Intent.ACTION_MAIN);
                intent.setData(null);
            }
            return;
        }
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return;
        Uri.Builder link = new Uri.Builder().scheme("dailo").authority("share").appendQueryParameter("text", text);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject != null && !subject.trim().isEmpty()) link.appendQueryParameter("subject", subject);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(link.build());
    }
}
