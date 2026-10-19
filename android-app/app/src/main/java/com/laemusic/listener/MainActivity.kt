package com.laemusic.listener

import android.app.Activity
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
import android.graphics.Color
import android.view.ViewGroup
import android.widget.*
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Android native catalogue + streaming player.
 * Phase 2: online playback only. Does not download music or count payable streams.
 */
class MainActivity : Activity() {
    private val origin = "https://lae-music.onrender.com"
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var player: ExoPlayer? = null
    private var playbackToken = 0
    private lateinit var songs: LinearLayout
    private lateinit var status: TextView
    private lateinit var nowPlaying: TextView
    private lateinit var search: EditText
    private lateinit var playPause: Button
    private var activeId: Long? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(18, 22, 18, 12)
            setBackgroundColor(Color.rgb(20, 15, 34))
        }
        fun label(text: String, size: Float): TextView = TextView(this).apply {
            this.text = text
            textSize = size
            setTextColor(Color.WHITE)
            setPadding(5, 9, 5, 9)
        }
        root.addView(label("LAE-MUSIC", 26f))
        root.addView(label("Discover and stream music", 15f))
        search = EditText(this).apply {
            hint = "Search songs, artists or genres"
            setSingleLine(true)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.LTGRAY)
        }
        root.addView(search)
        val searchButton = Button(this).apply { text = "Search music" }
        root.addView(searchButton)
        status = label("Loading songs…", 13f)
        root.addView(status)
        val scroll = ScrollView(this)
        songs = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        scroll.addView(songs)
        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        nowPlaying = label("Select a song to listen", 15f)
        root.addView(nowPlaying)
        playPause = Button(this).apply {
            text = "Pause / Resume"
            isEnabled = false
            setOnClickListener {
                val p = player ?: return@setOnClickListener
                if (p.isPlaying) p.pause() else {
                    if (p.playbackState == Player.STATE_ENDED) p.seekTo(0)
                    p.play()
                }
                text = if (p.isPlaying) "Pause" else "Resume"
            }
        }
        root.addView(playPause)
        val website = Button(this).apply {
            text = "Open full LAE-MUSIC website"
            setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("$origin/music"))) }
        }
        root.addView(website)
        setContentView(root)
        searchButton.setOnClickListener { loadSongs(search.text.toString()) }
        loadSongs("")
    }

    private fun getJson(path: String): JSONObject {
        val conn = (URL("$origin$path").openConnection() as HttpURLConnection)
        try {
            conn.connectTimeout = 12000
            conn.readTimeout = 15000
            conn.setRequestProperty("Accept", "application/json")
            if (conn.responseCode !in 200..299) throw Exception("Server returned ${conn.responseCode}")
            return conn.inputStream.bufferedReader().use { JSONObject(it.readText()) }
        } finally { conn.disconnect() }
    }

    private fun loadSongs(query: String) {
        status.text = "Loading songs…"
        executor.execute {
            try {
                val encoded = java.net.URLEncoder.encode(query.trim(), "UTF-8")
                val tracks = getJson("/api/music/tracks?limit=50&q=$encoded").getJSONArray("tracks")
                main.post {
                    if (isFinishing || isDestroyed) return@post
                    songs.removeAllViews()
                    status.text = "${tracks.length()} songs found"
                    for (i in 0 until tracks.length()) {
                        val t = tracks.getJSONObject(i)
                        val id = t.getLong("id")
                        val title = t.optString("title", "Untitled")
                        val artist = t.optString("artist", "Unknown artist")
                        val button = Button(this).apply {
                            text = "$title — $artist"
                            isAllCaps = false
                            setOnClickListener { playSong(id, title, artist) }
                        }
                        songs.addView(button)
                    }
                }
            } catch (e: Exception) {
                main.post { if (!isFinishing) status.text = "Could not load music: ${e.message}" }
            }
        }
    }

    private fun playSong(id: Long, title: String, artist: String) {
        playbackToken++
        val token = playbackToken
        player?.release()
        player = null
        activeId = id
        playPause.isEnabled = false
        nowPlaying.text = "Loading: $title — $artist"
        executor.execute {
            try {
                val url = getJson("/api/music/tracks/$id/stream").getString("url")
                main.post {
                    if (token != playbackToken || isFinishing || isDestroyed) return@post
                    try {
                        val p = ExoPlayer.Builder(this).build()
                        player = p
                        p.addListener(object : Player.Listener {
                            override fun onPlaybackStateChanged(state: Int) {
                                if (token != playbackToken) return
                                when (state) {
                                    Player.STATE_READY -> {
                                        nowPlaying.text = "Playing: $title — $artist"
                                        playPause.isEnabled = true
                                        playPause.text = if (p.isPlaying) "Pause" else "Resume"
                                    }
                                    Player.STATE_ENDED -> {
                                        nowPlaying.text = "Finished: $title — $artist"
                                        playPause.text = "Replay"
                                    }
                                    Player.STATE_BUFFERING -> nowPlaying.text = "Buffering: $title"
                                }
                            }
                            override fun onIsPlayingChanged(isPlaying: Boolean) {
                                if (token == playbackToken && playPause.isEnabled)
                                    playPause.text = if (isPlaying) "Pause" else "Resume"
                            }
                            override fun onPlayerError(error: PlaybackException) {
                                if (token == playbackToken) {
                                    nowPlaying.text = "Playback failed. Check connection and try again."
                                    playPause.isEnabled = false
                                }
                            }
                        })
                        p.setMediaItem(MediaItem.fromUri(url))
                        p.prepare()
                        p.play()
                    } catch (e: Exception) {
                        nowPlaying.text = "Unable to play: ${e.message}"
                    }
                }
            } catch (e: Exception) {
                main.post {
                    if (token == playbackToken && !isFinishing) nowPlaying.text = "Stream unavailable: ${e.message}"
                }
            }
        }
    }

    override fun onStop() {
        super.onStop()
        // Stage 3 will move playback to a MediaSessionService for background listening.
        player?.pause()
    }

    override fun onDestroy() {
        playbackToken++
        player?.release()
        player = null
        executor.shutdownNow()
        super.onDestroy()
    }
}
