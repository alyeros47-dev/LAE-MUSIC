package com.laemusic.listener

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String) : Exception(message)
class LaeApi(val session: SessionStore, transport:OkHttpClient?=null) {
    val client = (transport ?: OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(40, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()).newBuilder().cookieJar(session).build()
    suspend fun json(path: String, data: JSONObject? = null, key: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(path.startsWith("/api/"))
        val request = Request.Builder().url(BuildConfig.API_ORIGIN + path).header("Accept", "application/json").header("Origin", BuildConfig.API_ORIGIN).header("User-Agent", "LAE-MUSIC-Android/${BuildConfig.VERSION_NAME}")
        if (data != null) request.post(data.toString().toRequestBody("application/json".toMediaType()))
        if (key != null) request.header("Idempotency-Key", key)
        client.newCall(request.build()).execute().use { r ->
            val text = r.body?.string().orEmpty(); val value = runCatching { JSONObject(text) }.getOrNull()
            if (!r.isSuccessful) throw ApiException(r.code, value?.optString("error")?.take(240) ?: "Unable to connect. Please try again.")
            value ?: throw ApiException(502, "The server returned an unreadable response.")
        }
    }
    suspend fun discover(query: String = "", genre: String = "", sort: String = "new", cursor: String? = null): DiscoveryPage {
        val x = json("/api/platform/discover?limit=30&q=${enc(query)}&genre=${enc(genre)}&sort=$sort" + (cursor?.let { "&cursor=${enc(it)}" } ?: ""))
        return DiscoveryPage(x.songs(), x.optString("next_cursor").takeIf { it.isNotBlank() && it != "null" }, x.optJSONArray("genres")?.objects()?.map { it.getString("genre") }.orEmpty(), x.optJSONArray("artists")?.objects().orEmpty())
    }
    suspend fun login(email: String, password: String, connectArtist:Boolean=false) {
        val credentials=JSONObject().put("email",email.trim()).put("password",password)
        if(connectArtist) {
            json("/api/login",credentials)
            json("/api/platform/account/roles?role=artist",JSONObject().put("confirm",true).put("currentPassword",password))
            session.signedIn(json("/api/listener/me").getJSONObject("user"))
        } else session.signedIn(json("/api/listener/login",credentials).getJSONObject("user"))
    }
    suspend fun engagement(song: Song): Engagement {
        val x = json("/api/listener/song-engagement?trackId=${song.id}"); val f = json("/api/music/artist-follow?artistId=${song.artistId}")
        return Engagement(x.optInt("likes"), x.optInt("comments"), x.optBoolean("liked"), f.optBoolean("following"))
    }
    companion object { fun enc(s: String): String = URLEncoder.encode(s, "UTF-8"); fun key() = UUID.randomUUID().toString() }
}
