package com.laemusic.listener

import android.content.Context
import androidx.test.core.app.ActivityScenario
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.BufferedSource
import okio.ForwardingSource
import okio.buffer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/** Exercises the actual WorkManager and native signature/media pipeline. */
object DownloadFixture {
    fun prepare(context:Context) = runBlocking {
        val owner="7777777";val song=Song("9999999","Offline test song","Test artist","9999998","Gospel")
        val serverKey=KeyPairGenerator.getInstance("EC").apply {initialize(256)}.generateKeyPair();val pub=serverKey.public as ECPublicKey
        fun coordinate(n:java.math.BigInteger):String {val a=n.toByteArray();val start=(a.size-32).coerceAtLeast(0);return OfflineProtocol.encode(ByteArray(32).also {a.copyInto(it,32-(a.size-start),start)})}
        val jwk=JSONObject().put("kty","EC").put("crv","P-256").put("x",coordinate(pub.w.affineX)).put("y",coordinate(pub.w.affineY))
        val audio=NativeListeningTest.wav(30);val mediaCalls=AtomicInteger(0);var deviceKey:JSONObject?=null;var device="";val nonces=mutableSetOf<String>();val tickets=mutableSetOf<String>()
        val client=OkHttpClient.Builder().addInterceptor {chain->
            val req=chain.request();val path=req.url.encodedPath
            val data=req.body?.let {b->val buffer=okio.Buffer();b.writeTo(buffer);JSONObject(buffer.readUtf8())} ?: JSONObject()
            fun reply(body:JSONObject)=Response.Builder().request(req).protocol(Protocol.HTTP_1_1).code(200).message("isolated fixture").header("Set-Cookie","listener_session=download-fixture; Path=/; Secure; HttpOnly").body(body.toString().toResponseBody("application/json".toMediaType())).build()
            if(path=="/api/listener/login")return@addInterceptor reply(JSONObject().put("user",JSONObject().put("id",owner).put("display_name","Offline test").put("email","offline@test.invalid")))
            when(path){
                "/api/platform/premium/status"->reply(JSONObject().put("active",true))
                "/api/platform/library"->reply(JSONObject().put("likes",JSONArray()).put("history",JSONArray()).put("playlists",JSONArray()))
                "/api/platform/discover"->reply(JSONObject().put("tracks",JSONArray()).put("genres",JSONArray()).put("artists",JSONArray()))
                "/api/platform/offline/register"->{device=data.getString("device_id");deviceKey=data.getJSONObject("public_jwk");reply(JSONObject().put("device_id",device))}
                "/api/platform/offline/challenge"->{val nonce=UUID.randomUUID().toString();synchronized(nonces){nonces.add(nonce)};reply(JSONObject().put("nonce",nonce).put("server_ms",System.currentTimeMillis()))}
                "/api/platform/offline/grant"->{
                    val nonce=data.getString("nonce");require(synchronized(nonces){nonces.remove(nonce)})
                    val message=JSONObject().put("v",1).put("device_id",device).put("nonce",nonce).put("action","grant").put("payload",data.getJSONObject("payload"))
                    assertTrue(Signature.getInstance("SHA256withECDSA").run {initVerify(OfflineProtocol.publicKey(deviceKey!!));update(OfflineProtocol.canonical(message).toByteArray());verify(OfflineProtocol.rawToDer(OfflineProtocol.decode(data.getString("signature"))))})
                    val now=System.currentTimeMillis();val p=JSONObject().put("v",1).put("listener_id",owner).put("device_id",device).put("track_id",song.id).put("grant_id",UUID.randomUUID().toString()).put("issued_ms",now).put("until_ms",now+86400000).put("audio_bytes",audio.size).put("asset_hash","synthetic-test-asset").put("kid","android-fixture-signer")
                    val encoded=OfflineProtocol.encode(OfflineProtocol.canonical(p).toByteArray());val signature=Signature.getInstance("SHA256withECDSA").apply {initSign(serverKey.private);update(encoded.toByteArray())}.sign();val ticket=UUID.randomUUID().toString();synchronized(tickets){tickets.add(ticket)}
                    reply(JSONObject().put("token",JSONObject().put("kid","android-fixture-signer").put("payload",encoded).put("signature",OfflineProtocol.encode(OfflineProtocol.derToRaw(signature)))).put("public_key",jwk).put("media_ticket",ticket).put("server_ms",now))
                }
                "/api/platform/offline/media"->{require(synchronized(tickets){tickets.remove(data.getString("media_ticket"))});mediaCalls.incrementAndGet();val original=audio.toResponseBody("application/octet-stream".toMediaType());val source=object:ForwardingSource(original.source()) {override fun read(sink:okio.Buffer,byteCount:Long):Long {Thread.sleep(15);return super.read(sink,minOf(byteCount,2048))}}.buffer();val body=object:ResponseBody(){override fun contentType()="application/octet-stream".toMediaType();override fun contentLength()=audio.size.toLong();override fun source():BufferedSource=source};Response.Builder().request(req).protocol(Protocol.HTTP_1_1).code(200).message("isolated audio").body(body).build()}
                else->reply(JSONObject())
            }
        }.build()
        val graph=AppGraph(context,client);graph.session.clear();(context.applicationContext as LaeApplication).graph=graph
        graph.secure.put("offline-highwater",null)
        graph.api.login("offline@test.invalid","SyntheticDownloadPassword123")
        val scenario=ActivityScenario.launch(MainActivity::class.java)
        try {
            graph.offline.db.remove(owner,song.id);graph.offline.file(owner,song.id).delete()
            graph.offline.enqueue(song)
            withTimeout(60000){while(graph.offline.db.rows(owner).none {it.song.id==song.id && it.status=="downloading" && it.progress>0})delay(100)}
            graph.offline.pause(owner,song);assertEquals("paused",graph.offline.db.rows(owner).first {it.song.id==song.id}.status)
            graph.offline.enqueue(song)
            withTimeout(90000){while(graph.offline.db.rows(owner).none {it.song.id==song.id && it.status=="ready"})delay(200)}
            val row=graph.offline.db.rows(owner).first {it.song.id==song.id};val p=graph.offline.verify(owner,row.licence!!)
            assertTrue(mediaCalls.get()>=2);assertTrue(java.io.File(row.file).exists());assertFalse(java.io.File(row.file).readBytes().contentEquals(audio))
            ProtectedAudio.Reader(java.io.File(row.file),graph.offline.mediaKey(owner),graph.offline.binding(owner,song,p)).use {r->assertEquals(audio.size.toLong(),r.size);val header=ByteArray(44);r.read(0,header,0,44);assertEquals("RIFF",String(header.copyOfRange(0,4)))}
        } finally {scenario.close();context.stopService(android.content.Intent(context,MusicPlaybackService::class.java))}
    }
}
