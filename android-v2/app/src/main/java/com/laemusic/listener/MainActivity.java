package com.laemusic.listener;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://lae-music.onrender.com";
    private final int background = Color.rgb(10, 10, 27);
    private final int accent = Color.rgb(235, 47, 93);
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayList<Track> tracks = new ArrayList<>();
    private final Set<Long> liked = new HashSet<>();
    private LinearLayout content;
    private TextView miniTitle, status;
    private Button miniPlay;
    private MediaPlayer player;
    private Track current;
    private String page = "Home";
    private int requestVersion = 0, playbackVersion = 0;
    private boolean preparing = false;
    private boolean repeat = false, shuffle = false;
    private SeekBar seek;
    private TextView elapsed;
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (player != null && seek != null) {
                try {
                    int duration = player.getDuration();
                    if (duration > 0) {
                        seek.setMax(duration / 1000);
                        seek.setProgress(player.getCurrentPosition() / 1000);
                        if (elapsed != null) elapsed.setText(time(player.getCurrentPosition()) + " / " + time(duration));
                    }
                } catch (IllegalStateException ignored) {}
            }
            main.postDelayed(this, 1000);
        }
    };
    private static class Track {
        final long id;
        final String title, artist;
        Track(long id, String title, String artist) {
            this.id = id; this.title = title; this.artist = artist;
        }
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        SharedPreferences prefs = getSharedPreferences("library", MODE_PRIVATE);
        for (String id : prefs.getStringSet("liked", new HashSet<>())) {
            try { liked.add(Long.parseLong(id)); } catch (NumberFormatException ignored) {}
        }
        showPage("Home");
        loadSongs("");
        main.post(ticker);
    }
    private int dp(int n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }
    private GradientDrawable shape(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color); d.setCornerRadius(dp(radius)); return d;
    }
    private TextView cover(String label, int size) {
        TextView v = text(label.isEmpty() ? "♫" : label.substring(0, 1).toUpperCase(), size / 3, true);
        v.setGravity(Gravity.CENTER);
        v.setTextColor(Color.WHITE);
        v.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
            new int[]{Color.rgb(106, 42, 104), Color.rgb(42, 39, 99), Color.rgb(22, 78, 89)}));
        return v;
    }
    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(Color.WHITE);
        view.setTextSize(size);
        view.setPadding(dp(12), dp(10), dp(12), dp(10));
        if (bold) view.setTypeface(null, Typeface.BOLD);
        return view;
    }
    private Button action(String title, Runnable callback) {
        Button b = new Button(this);
        b.setText(title);
        b.setAllCaps(false);
        b.setOnClickListener(v -> callback.run());
        return b;
    }
    private void showPage(String destination) {
        page = destination;
        seek = null; elapsed = null;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(background);
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        TextView brand = text("LAE  MUSIC", 23, true);
        brand.setTextColor(accent);
        brand.setPadding(dp(20), dp(20), dp(16), dp(10));
        root.addView(brand);
        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(12), 0, dp(12), dp(12));
        scroll.setFillViewport(true);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        if ("Home".equals(page)) renderHome();
        else if ("Search".equals(page)) renderSearch();
        else if ("Player".equals(page)) renderPlayer();
        else renderLibrary();
        LinearLayout mini = new LinearLayout(this);
        mini.setGravity(Gravity.CENTER_VERTICAL);
        mini.setPadding(dp(10), dp(4), dp(10), dp(4));
        mini.setBackground(shape(Color.rgb(35, 32, 52), 14));
        miniTitle = text(current == null ? "Choose a song" : current.title + " · " + current.artist, 13, true);
        miniTitle.setOnClickListener(v -> showPage("Player"));
        mini.addView(miniTitle, new LinearLayout.LayoutParams(0, -2, 1));
        miniPlay = action(isPlaying() ? "Ⅱ" : "▶", this::togglePlayback);
        mini.addView(miniPlay);
        LinearLayout.LayoutParams miniParams = new LinearLayout.LayoutParams(-1, -2);
        miniParams.setMargins(dp(10), dp(4), dp(10), dp(4));
        root.addView(mini, miniParams);
        LinearLayout nav = new LinearLayout(this);
        for (String tab : new String[]{"Home", "Search", "Player", "Library"}) {
            Button button = action(tab, () -> showPage(tab));
            button.setTextSize(11);
            button.setTextColor(tab.equals(page) ? accent : Color.WHITE);
            button.setBackgroundColor(background);
            nav.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
        }
        root.addView(nav);
        setContentView(root);
    }
    private void renderHome() {
        content.addView(text("Your music. Your mood.", 24, true));
        TextView sub = text("Discover fresh sounds and your favorite artists", 13, false);
        sub.setTextColor(Color.LTGRAY); content.addView(sub);
        HorizontalScrollView horizontal = new HorizontalScrollView(this);
        LinearLayout genres = new LinearLayout(this);
        for (String genre : new String[]{"All", "Gospel", "Worship", "Praise", "Afrobeats", "Reggae"}) {
            Button chip = action(genre, () -> loadSongs("All".equals(genre) ? "" : genre));
            chip.setTextColor(Color.WHITE);
            chip.setBackground(shape(Color.rgb(46, 41, 64), 22));
            LinearLayout.LayoutParams chipParams = new LinearLayout.LayoutParams(-2, dp(46));
            chipParams.setMargins(dp(3), dp(6), dp(6), dp(10));
            genres.addView(chip, chipParams);
        }
        horizontal.addView(genres);
        content.addView(horizontal);
        content.addView(text("Made for your listening", 21, true));
        status = text("Loading music catalog…", 13, false);
        content.addView(status);
        renderTracks(false);
    }
    private void renderSearch() {
        content.addView(text("Search music", 24, true));
        EditText query = new EditText(this);
        query.setSingleLine(true);
        query.setTextColor(Color.WHITE);
        query.setHintTextColor(Color.LTGRAY);
        query.setHint("Song, artist or genre");
        content.addView(query);
        content.addView(action("Search catalog", () -> loadSongs(query.getText().toString())));
        status = text("Search the LAE-MUSIC catalog", 13, false);
        content.addView(status);
        renderTracks(false);
    }
    private void renderLibrary() {
        content.addView(text("Your library", 24, true));
        content.addView(text("Liked songs are saved on this device.", 14, false));
        renderTracks(true);
    }
    private void renderTracks(boolean favoritesOnly) {
        int count = 0;
        for (Track track : tracks) {
            if (favoritesOnly && !liked.contains(track.id)) continue;
            count++;
            LinearLayout row = new LinearLayout(this);
            row.setGravity(Gravity.CENTER_VERTICAL);
            TextView artwork = cover(track.title, 54);
            LinearLayout.LayoutParams artParams = new LinearLayout.LayoutParams(dp(54), dp(54));
            artParams.setMargins(dp(3), dp(5), dp(10), dp(5));
            row.addView(artwork, artParams);
            LinearLayout labels = new LinearLayout(this);
            labels.setOrientation(LinearLayout.VERTICAL);
            TextView label = text(track.title, 15, true);
            label.setSingleLine(true); label.setEllipsize(android.text.TextUtils.TruncateAt.END);
            label.setPadding(0, dp(5), 0, 0);
            TextView artist = text(track.artist, 12, false);
            artist.setTextColor(Color.LTGRAY); artist.setPadding(0, 0, 0, dp(4));
            labels.addView(label); labels.addView(artist);
            label.setOnClickListener(v -> playTrack(track));
            row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
            artwork.setOnClickListener(v -> playTrack(track));
            Button heart = action(liked.contains(track.id) ? "♥" : "♡", () -> toggleFavorite(track));
            heart.setTextColor(liked.contains(track.id) ? accent : Color.WHITE);
            heart.setBackgroundColor(Color.TRANSPARENT);
            row.addView(heart, new LinearLayout.LayoutParams(dp(54), dp(52)));
            row.setBackground(shape(Color.rgb(24, 23, 42), 12));
            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2);
            rowParams.setMargins(0, dp(3), 0, dp(5));
            content.addView(row, rowParams);
        }
        if (count == 0) content.addView(text(favoritesOnly ? "No liked songs yet" : "No songs loaded", 15, false));
    }
    private void renderPlayer() {
        content.addView(text("NOW PLAYING", 16, true));
        TextView artwork = cover(current == null ? "" : current.title, 90);
        LinearLayout.LayoutParams largeCover = new LinearLayout.LayoutParams(-1, dp(290));
        largeCover.setMargins(dp(8), dp(14), dp(8), dp(22));
        content.addView(artwork, largeCover);
        content.addView(text(current == null ? "Select a song from Home" : current.title, 26, true));
        content.addView(text(current == null ? "" : current.artist, 17, false));
        seek = new SeekBar(this);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int value, boolean fromUser) {
                if (fromUser && player != null) try { player.seekTo(value * 1000); } catch (IllegalStateException ignored) {}
            }
            @Override public void onStartTrackingTouch(SeekBar bar) {}
            @Override public void onStopTrackingTouch(SeekBar bar) {}
        });
        content.addView(seek);
        elapsed = text("0:00 / 0:00", 13, false);
        content.addView(elapsed);
        LinearLayout controls = new LinearLayout(this);
        for (String control : new String[]{"⤨", "◀", "▶ / Ⅱ", "▶|", "↻"}) {
            controls.addView(action(control, () -> {
                switch (control) {
                    case "⤨": shuffle = !shuffle; break;
                    case "◀": skip(-1); break;
                    case "▶ / Ⅱ": togglePlayback(); break;
                    case "▶|": skip(1); break;
                    case "↻": repeat = !repeat; break;
                }
            }), new LinearLayout.LayoutParams(0, -2, 1));
        }
        content.addView(controls);
        content.addView(action("♡ Save / Unsave", () -> { if (current != null) toggleFavorite(current); }));
        content.addView(action("Like, comment, follow or support artist", () -> {
            if (current != null) openWeb("/listen?play=" + current.id);
        }));
    }
    private String getJson(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(15000);
        connection.setRequestProperty("Accept", "application/json");
        try {
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300)
                throw new Exception("Server returned " + connection.getResponseCode());
            java.io.InputStream stream = connection.getInputStream();
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] bytes = new byte[4096]; int n;
            while ((n = stream.read(bytes)) != -1) output.write(bytes, 0, n);
            stream.close();
            return output.toString("UTF-8");
        } finally { connection.disconnect(); }
    }
    private void loadSongs(String query) {
        final int version = ++requestVersion;
        if (status != null) status.setText("Loading catalog…");
        io.execute(() -> {
            try {
                JSONArray results = new JSONObject(getJson("/api/music/tracks?limit=50&q=" + URLEncoder.encode(query, "UTF-8"))).getJSONArray("tracks");
                ArrayList<Track> found = new ArrayList<>();
                for (int i = 0; i < results.length(); i++) {
                    JSONObject song = results.getJSONObject(i);
                    found.add(new Track(song.getLong("id"), song.optString("title", "Untitled"), song.optString("artist", "Unknown artist")));
                }
                main.post(() -> {
                    if (isFinishing() || isDestroyed() || version != requestVersion) return;
                    tracks.clear(); tracks.addAll(found);
                    showPage(page);
                    if (status != null) status.setText(found.size() + " songs found");
                });
            } catch (Exception error) {
                main.post(() -> {
                    if (!isFinishing() && !isDestroyed() && version == requestVersion && status != null)
                        status.setText("Catalog unavailable: " + error.getMessage());
                });
            }
        });
    }
    private int lastPlaybackErrorVersion = -1;
    private void playTrack(Track track) {
        current = track;
        final int version = ++playbackVersion;
        releasePlayer();
        preparing = true;
        showPage("Player");
        io.execute(() -> {
            try {
                String url = new JSONObject(getJson("/api/music/tracks/" + track.id + "/stream")).getString("url");
                main.post(() -> {
                    if (isFinishing() || isDestroyed() || version != playbackVersion) return;
                    try {
                        player = new MediaPlayer();
                        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                        player.setDataSource(url);
                        player.setOnPreparedListener(p -> {
                            if (version != playbackVersion) return;
                            preparing = false;
                            p.start();
                            updateMini();
                        });
                        player.setOnCompletionListener(p -> {
                            if (version != playbackVersion) return;
                            if (repeat) { p.seekTo(0); p.start(); } else skip(1);
                        });
                        player.setOnErrorListener((p, what, extra) -> {
                            if (version != playbackVersion || isFinishing() || isDestroyed()) return true;
                            preparing = false;
                            if (lastPlaybackErrorVersion != version) {
                                lastPlaybackErrorVersion = version;
                                android.widget.Toast.makeText(this, "Track temporarily unavailable. Choose another song.", android.widget.Toast.LENGTH_LONG).show();
                            }
                            main.post(() -> { if (version == playbackVersion) { releasePlayer(); updateMini(); } });
                            return true;
                        });
                        player.prepareAsync();
                    } catch (Exception e) { preparing = false; showError(e.getMessage()); }
                });
            } catch (Exception e) {
                main.post(() -> { if (version == playbackVersion && !isFinishing()) { preparing = false; showError(e.getMessage()); } });
            }
        });
    }
    private void showError(String message) {
        android.widget.Toast.makeText(this, "Playback unavailable. Please try again.", android.widget.Toast.LENGTH_LONG).show();
    }
    private boolean isPlaying() {
        try { return player != null && player.isPlaying(); } catch (IllegalStateException e) { return false; }
    }
    private void togglePlayback() {
        if (player == null || preparing) return;
        try { if (player.isPlaying()) player.pause(); else player.start(); updateMini(); }
        catch (IllegalStateException ignored) {}
    }
    private void updateMini() {
        if (miniTitle != null && current != null) miniTitle.setText(current.title + " · " + current.artist);
        if (miniPlay != null) miniPlay.setText(isPlaying() ? "Ⅱ" : "▶");
    }
    private void skip(int direction) {
        if (tracks.isEmpty()) return;
        int index = -1;
        for (int i = 0; i < tracks.size(); i++) if (current != null && tracks.get(i).id == current.id) { index = i; break; }
        int next = shuffle ? (int)(Math.random() * tracks.size()) : (index + direction + tracks.size()) % tracks.size();
        playTrack(tracks.get(next));
    }
    private void toggleFavorite(Track track) {
        if (!liked.add(track.id)) liked.remove(track.id);
        Set<String> values = new HashSet<>();
        for (Long id : liked) values.add(String.valueOf(id));
        getSharedPreferences("library", MODE_PRIVATE).edit().putStringSet("liked", values).apply();
        showPage(page);
    }
    private void openWeb(String path) { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(ORIGIN + path))); }
    private static String time(int ms) {
        int s = Math.max(0, ms / 1000);
        return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }
    private void releasePlayer() {
        if (player != null) {
            MediaPlayer old = player;
            player = null;
            try { old.setOnErrorListener(null); old.setOnCompletionListener(null); old.setOnPreparedListener(null); old.release(); }
            catch (IllegalStateException ignored) {}
        }
    }
    @Override public void onDestroy() {
        ++playbackVersion; ++requestVersion;
        main.removeCallbacks(ticker);
        releasePlayer();
        io.shutdownNow();
        super.onDestroy();
    }
}
