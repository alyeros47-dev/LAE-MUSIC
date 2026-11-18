package com.laemusic.listener

import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.json.JSONArray
import org.json.JSONObject

data class Song(val id: String, val title: String, val artist: String, val artistId: String, val genre: String = "", val description: String = "", val plays: Long = 0) {
    val artwork get() = "${BuildConfig.API_ORIGIN}/api/music/tracks/$id/cover-image"
    val shareUrl get() = "${BuildConfig.API_ORIGIN}/discover?track=$id"
    fun item(offline: Boolean = false, owner: String = "") = MediaItem.Builder().setMediaId(id)
        .setUri(if (offline) "lae-offline://$owner/$id" else "${BuildConfig.API_ORIGIN}/api/music/tracks/$id/audio")
        .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setArtist(artist).setArtworkUri(Uri.parse(artwork)).setExtras(android.os.Bundle().apply { putString("artistId", artistId); putString("genre",genre); putString("description",description); putBoolean("offline", offline) }).build()).build()
    fun json() = JSONObject().put("id", id).put("title", title).put("artist", artist).put("artist_id", artistId).put("genre", genre).put("description", description).put("plays", plays)
    companion object { fun from(x: JSONObject) = Song(x.get("id").toString(), x.optString("title"), x.optString("artist"), x.optString("artist_id"), x.optString("genre"), x.optString("description"), x.optLong("plays")) }
}
fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
fun JSONObject.songs(key: String = "tracks") = optJSONArray(key)?.objects()?.map(Song::from).orEmpty()
data class Engagement(val likes: Int = 0, val comments: Int = 0, val liked: Boolean = false, val following: Boolean = false)
data class DiscoveryPage(val songs: List<Song>, val cursor: String?, val genres: List<String>, val artists: List<JSONObject>)
