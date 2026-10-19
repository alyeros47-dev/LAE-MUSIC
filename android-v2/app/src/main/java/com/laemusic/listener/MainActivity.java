package com.laemusic.listener;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class MainActivity extends Activity {
    private final int background = Color.rgb(10, 10, 28);
    private final int accent = Color.rgb(235, 47, 93);
    private LinearLayout content;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        showPage("Home");
    }

    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(Color.WHITE);
        view.setTextSize(size);
        view.setPadding(18, 20, 18, 20);
        if (bold) view.setTypeface(null, Typeface.BOLD);
        return view;
    }

    private void showPage(String page) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(background);
        TextView heading = text("LAE-MUSIC", 28, true);
        heading.setTextColor(accent);
        root.addView(heading);
        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        content.addView(text(page, 24, true));
        if (page.equals("Home")) {
            content.addView(text("Discover music", 21, true));
            content.addView(text("Gospel  •  Worship  •  Praise  •  Afrobeats  •  Reggae", 16, false));
            content.addView(text("Quick picks", 21, true));
            content.addView(text("Your LAE-MUSIC catalog will appear here when the API is connected.", 16, false));
        } else if (page.equals("Player")) {
            content.addView(text("Now playing", 22, true));
            content.addView(text("Choose a song from the LAE-MUSIC catalog", 16, false));
            content.addView(text("◀         ▶         ▶|", 24, false));
        } else if (page.equals("Search")) {
            content.addView(text("Music search will connect to the existing catalog API.", 16, false));
        } else {
            content.addView(text("Your saved songs and playlists will appear here.", 16, false));
        }
        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        for (String destination : new String[]{"Home", "Search", "Player", "Library"}) {
            Button button = new Button(this);
            button.setText(destination);
            button.setTextSize(11);
            button.setOnClickListener(v -> showPage(destination));
            nav.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
        }
        root.addView(nav);
        setContentView(root);
    }
}
