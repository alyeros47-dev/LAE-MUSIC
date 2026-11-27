package com.laemusic.listener

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureStore(context: Context) {
    private val prefs = context.getSharedPreferences("private_session", Context.MODE_PRIVATE)
    private val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    @Synchronized private fun key(): SecretKey = (ks.getKey("lae.session.v1", null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
        init(KeyGenParameterSpec.Builder("lae.session.v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
    @Synchronized fun put(name: String, value: String?) {
        if (value == null) { prefs.edit().remove(name).commit(); return }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()); updateAAD(name.toByteArray()) }
        prefs.edit().putString(name, Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)).commit()
    }
    @Synchronized fun get(name: String): String? = prefs.getString(name, null)?.let { encoded ->
        try { val bytes = Base64.decode(encoded, Base64.NO_WRAP); val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12))); updateAAD(name.toByteArray()) }; String(cipher.doFinal(bytes.copyOfRange(12, bytes.size))) }
        catch (_: Exception) { null }
    }
}
class SessionStore(val secure: SecureStore) : CookieJar {
    @Volatile var user: JSONObject? = secure.get("listener")?.let(::JSONObject); private set
    private val host = okhttp3.HttpUrl.Builder().scheme("https").host("lae-music.com").build()
    private var cookies = secure.get("cookies")?.let(::JSONArray)?.let { a -> (0 until a.length()).mapNotNull { Cookie.parse(host, a.getString(it)) } }.orEmpty()
    @Synchronized override fun saveFromResponse(url: HttpUrl, newCookies: List<Cookie>) {
        if (url.host != host.host) return
        cookies = (cookies.filterNot { old -> newCookies.any { it.name == old.name } } + newCookies).filter { it.expiresAt > System.currentTimeMillis() && it.matches(host) }
        secure.put("cookies", JSONArray(cookies.map { it.toString() }).toString())
    }
    @Synchronized override fun loadForRequest(url: HttpUrl) = if (url.host == host.host) cookies.filter { it.matches(url) && it.expiresAt > System.currentTimeMillis() } else emptyList()
    fun signedIn(user: JSONObject) { this.user = user; secure.put("listener", user.toString()) }
    fun clear() { user = null; cookies = emptyList(); secure.put("listener", null); secure.put("cookies", null) }
    val owner get() = user?.optString("id")?.takeIf { it.isNotBlank() }
}
