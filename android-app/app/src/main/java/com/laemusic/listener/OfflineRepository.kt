package com.laemusic.listener

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.UUID
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class OfflineRepository(private val context:Context, val api:LaeApi, private val secure:SecureStore) {
    val db=OfflineDatabase(context)
    private val ks=KeyStore.getInstance("AndroidKeyStore").apply {load(null)}
    private val root=File(context.noBackupFilesDir,"protected_music").apply {mkdirs()}
    private fun alias(owner:String)="lae.offline.$owner"
    @Synchronized fun device(owner:String):String = secure.get("device:$owner") ?: UUID.randomUUID().toString().also { secure.put("device:$owner",it) }
    @Synchronized private fun signing(owner:String):java.security.PrivateKey {
        val name=alias(owner)+".proof"
        if(!ks.containsAlias(name)) KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore").apply {initialize(KeyGenParameterSpec.Builder(name,KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY).setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256).build());generateKeyPair()}
        return ks.getKey(name,null) as java.security.PrivateKey
    }
    @Synchronized fun mediaKey(owner:String):SecretKey {
        val name=alias(owner)+".audio"
        return ks.getKey(name,null) as? SecretKey ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {init(KeyGenParameterSpec.Builder(name,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(false).build())}.generateKey()
    }
    suspend fun register(owner:String) {
        require(api.session.owner==owner) {"Sign in to this listening account"};signing(owner)
        val key=ks.getCertificate(alias(owner)+".proof").publicKey as ECPublicKey
        fun coord(v:java.math.BigInteger)=OfflineProtocol.encode(v.toByteArray().let { bytes -> ByteArray(32).also { a -> val start=(bytes.size-32).coerceAtLeast(0);bytes.copyInto(a,32-(bytes.size-start),start) } })
        val jwk=JSONObject().put("kty","EC").put("crv","P-256").put("x",coord(key.w.affineX)).put("y",coord(key.w.affineY))
        try { api.json("/api/platform/offline/register",JSONObject().put("device_id",device(owner)).put("public_jwk",jwk).put("label","LAE-MUSIC Android · ${android.os.Build.MODEL.take(40)}"),"android-register-${device(owner)}") } catch(e:ApiException) { if(e.status in listOf(403,404))deny(owner);throw e }
    }
    private fun anchor(server:Long) { secure.put("offline-clock",JSONObject().put("server",server).put("wall",System.currentTimeMillis()).put("elapsed",SystemClock.elapsedRealtime()).put("boot",Settings.Global.getInt(context.contentResolver,Settings.Global.BOOT_COUNT,-1)).toString()) }
    fun clock():Long {
        val a=secure.get("offline-clock")?.let(::JSONObject) ?: error("Reconnect to check your listening licence")
        val boot=Settings.Global.getInt(context.contentResolver,Settings.Global.BOOT_COUNT,-1)
        val wall=System.currentTimeMillis();require(wall>=a.getLong("wall")-60000) {"Reconnect after changing the device clock"}
        val time=if(a.getInt("boot")==boot) a.getLong("server")+SystemClock.elapsedRealtime()-a.getLong("elapsed") else a.getLong("server")+wall-a.getLong("wall")
        val high=secure.get("offline-highwater")?.toLongOrNull() ?: 0;require(time>=high-60000) {"Reconnect to refresh your offline licence"}
        secure.put("offline-highwater",maxOf(time,high).toString());return time
    }
    suspend fun proof(owner:String,action:String,payload:JSONObject):JSONObject {
        require(api.session.owner==owner)
        val c=api.json("/api/platform/offline/challenge",JSONObject().put("device_id",device(owner)).put("action",action));anchor(c.getLong("server_ms"))
        val message=JSONObject().put("v",1).put("device_id",device(owner)).put("nonce",c.getString("nonce")).put("action",action).put("payload",payload)
        val signature=Signature.getInstance("SHA256withECDSA").apply {initSign(signing(owner));update(OfflineProtocol.canonical(message).toByteArray())}.sign()
        return JSONObject().put("device_id",device(owner)).put("nonce",c.getString("nonce")).put("payload",payload).put("signature",OfflineProtocol.encode(OfflineProtocol.derToRaw(signature)))
    }
    fun allowed(owner:String)=secure.get("offline-denied:$owner")!="true"
    fun deny(owner:String){secure.put("offline-denied:$owner","true")}
    fun verify(owner:String,licence:JSONObject):JSONObject {
        require(allowed(owner)) {"Reconnect to renew Premium access. Your saved songs have not been deleted."}
        return validateToken(owner,licence)
    }
    private fun validateToken(owner:String,licence:JSONObject):JSONObject {
        require(api.session.owner==owner) {"Sign in to the account that saved this song"}
        val token=licence.getJSONObject("token");val key=secure.get("offline-key:"+token.getString("kid"))?.let(::JSONObject) ?: error("Reconnect to verify the offline signing key")
        val valid=Signature.getInstance("SHA256withECDSA").run {initVerify(OfflineProtocol.publicKey(key));update(token.getString("payload").toByteArray());verify(OfflineProtocol.rawToDer(OfflineProtocol.decode(token.getString("signature"))))};require(valid) {"The offline licence could not be verified"}
        val p=JSONObject(String(OfflineProtocol.decode(token.getString("payload"))))
        require(p.getString("kid")==token.getString("kid") && p.getString("listener_id")==owner && p.getString("device_id")==device(owner)) {"This song belongs to another account or device"}
        require(clock() in p.getLong("issued_ms") until p.getLong("until_ms")) {"Reconnect to refresh Premium access. Your saved song is still stored."}
        return p
    }
    suspend fun grant(owner:String,song:Song,includeMedia:Boolean):JSONObject {
        try {val r=api.json("/api/platform/offline/grant",proof(owner,"grant",JSONObject().put("track_id",song.id).put("include_media",includeMedia)),LaeApi.key());anchor(r.getLong("server_ms"));secure.put("offline-key:"+r.getJSONObject("token").getString("kid"),r.getJSONObject("public_key").toString());validateToken(owner,r);secure.put("offline-denied:$owner",null);return r}catch(e:ApiException){if(e.status==403 || e.status==404 && e.message.orEmpty().contains("device",ignoreCase=true))deny(owner);if(e.status==404 && !e.message.orEmpty().contains("device",ignoreCase=true))db.unavailable(owner,song.id);throw e}
    }
    fun file(owner:String,track:String,part:Boolean=false)=File(root,"$owner-$track.lae"+(if(part)".part" else ""))
    fun binding(owner:String,song:Song,p:JSONObject)="$owner:${song.id}:${p.getString("asset_hash")}"
    suspend fun enqueue(song:Song) = withContext(Dispatchers.IO) {
        val owner=api.session.owner ?: error("Sign in to save songs")
        val premium=api.json("/api/platform/premium/status");if(!premium.optBoolean("active"))deny(owner);require(premium.optBoolean("active")) {"Premium listening is required to save songs"}
        val rows=db.rows(owner);require(rows.none {it.song.id==song.id && it.status in listOf("ready","queued","downloading")}) {"This song is already saved or being downloaded"};require(rows.count { it.song.id!=song.id }<100) {"Your offline library is full"}
        require(rows.sumOf { if(it.file.isNotEmpty())File(it.file).length() else 0L }<262144000) {"Free some offline storage before saving more music"}
        val request=OneTimeWorkRequestBuilder<OfflineDownloadWorker>().setInputData(workDataOf("owner" to owner,"song" to song.json().toString())).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresStorageNotLow(true).build()).addTag("account:$owner").build()
        db.save(owner,song,"queued",work=request.id.toString())
        WorkManager.getInstance(context).enqueueUniqueWork("download:$owner:${song.id}",ExistingWorkPolicy.REPLACE,request)
    }
    suspend fun refresh() = withContext(Dispatchers.IO) {
        val owner=api.session.owner ?: return@withContext
        val ready=db.rows(owner).filter { it.status=="ready" }
        if(ready.isEmpty())return@withContext
        register(owner)
        for(row in ready) { val r=grant(owner,row.song,false);val p=verify(owner,r);val old=JSONObject(String(OfflineProtocol.decode(row.licence!!.getJSONObject("token").getString("payload"))));require(p.getString("asset_hash")==old.getString("asset_hash")) {"This song was updated. Save it again."};db.renew(owner,row.song.id,r) }
        sync(owner)
    }
    suspend fun sync(owner:String) {val events=db.events(device(owner));if(events.isEmpty())return;api.json("/api/platform/offline/sync",proof(owner,"sync",JSONObject().put("events",JSONArray(events))),LaeApi.key());db.acknowledge(device(owner),events.last().getLong("sequence"))}
    @Synchronized fun complete(owner:String,song:Song,work:String,part:File,licence:JSONObject) {
        require(api.session.owner==owner && db.rows(owner).any {it.song.id==song.id && it.work==work && it.status=="downloading"}) {"Download was paused or removed"}
        require(part.renameTo(file(owner,song.id))) {"Could not save to device storage"}
        db.progress(owner,song.id,work,"ready",100,licence=licence,file=file(owner,song.id).absolutePath)
    }
    @Synchronized fun pause(owner:String,song:Song) {WorkManager.getInstance(context).cancelUniqueWork("download:$owner:${song.id}");db.save(owner,song,"paused")}
    @Synchronized fun delete(owner:String,song:Song) {WorkManager.getInstance(context).cancelUniqueWork("download:$owner:${song.id}");file(owner,song.id).delete();file(owner,song.id,true).delete();db.remove(owner,song.id)}
}
