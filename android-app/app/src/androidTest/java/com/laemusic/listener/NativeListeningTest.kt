package com.laemusic.listener

import android.Manifest
import android.content.ComponentName
import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.test.uiautomator.UiDevice
import coil.Coil
import coil.ImageLoader
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Synthetic catalogue/audio only; the interceptor forbids production network access. */
class NativeListeningTest {
    @get:Rule val compose=createEmptyComposeRule()
    @get:Rule val notifications=GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext
    private var scenario:ActivityScenario<MainActivity>?=null
    private val likes=AtomicInteger(2);private var liked=false;private var following=false;private val posts=mutableListOf<String>()
    private fun fixture(seconds:Int=120):AppGraph {
        val tracks=JSONArray((1..4).map {Song(it.toString(),"Test song $it","Test artist","90","Gospel praise","Synthetic Android test catalogue").json()})
        val client=OkHttpClient.Builder().addInterceptor {chain->
            val request=chain.request();val path=request.url.encodedPath
            if(request.method=="POST")synchronized(posts){posts.add(path)}
            if(path.endsWith("/audio"))return@addInterceptor Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("test audio").body(wav(seconds).toResponseBody("audio/wav".toMediaType())).build()
            if(path.endsWith("cover-image") || path=="/api/artist/photo") {
                val bitmap=android.graphics.Bitmap.createBitmap(360,640,android.graphics.Bitmap.Config.ARGB_8888)
                android.graphics.Canvas(bitmap).apply {drawColor(android.graphics.Color.rgb(80,38,130));val paint=android.graphics.Paint().apply {color=android.graphics.Color.rgb(218,197,255);textSize=38f};drawText("LAE-MUSIC",48f,285f,paint);paint.textSize=20f;drawText("Android test artwork",48f,330f,paint)}
                val bytes=java.io.ByteArrayOutputStream().also {bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}.toByteArray();bitmap.recycle()
                return@addInterceptor Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("test artwork").body(bytes.toResponseBody("image/png".toMediaType())).build()
            }
            val body=when(path){
                "/api/platform/session"->JSONObject()
                "/api/platform/discover"->JSONObject().put("tracks",tracks).put("genres",JSONArray().put(JSONObject().put("genre","Gospel praise"))).put("artists",JSONArray()).put("next_cursor",JSONObject.NULL)
                "/api/platform/editorial"->JSONObject().put("featured_artists",JSONArray())
                "/api/listener/login"->JSONObject().put("user",JSONObject().put("id","7").put("display_name","Test listener").put("email","listener@test.invalid"))
                "/api/platform/premium/status"->JSONObject().put("active",false)
                "/api/platform/library"->JSONObject().put("likes",tracks).put("history",JSONArray()).put("playlists",JSONArray())
                "/api/platform/premium/playback"->JSONObject().put("eligible",false)
                "/api/listener/song-engagement"->JSONObject().put("likes",likes.get()).put("comments",1).put("liked",liked)
                "/api/music/artist-follow"->JSONObject().put("following",following)
                "/api/listener/song-like"->{liked=JSONObject(request.body!!.let { b->val buffer=okio.Buffer();b.writeTo(buffer);buffer.readUtf8() }).getBoolean("liked");likes.set(if(liked)3 else 2);JSONObject().put("ok",true)}
                "/api/listener/favorites"->{following=true;JSONObject().put("ok",true)}
                "/api/listener/comments"->if(request.method=="GET")JSONObject().put("comments",JSONArray().put(JSONObject().put("id","1").put("author","Test listener").put("body","A test comment"))) else JSONObject().put("message","Comment published")
                else->JSONObject().put("ok",true)
            }
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("fixture").addHeader("Set-Cookie",if(path=="/api/listener/login")"listener_session=isolated-test-cookie; Path=/; Secure; HttpOnly" else "fixture=present; Path=/; Secure").body(body.toString().toResponseBody("application/json".toMediaType())).build()
        }.build()
        val graph=AppGraph(context,client);graph.session.clear();graph.secure.put("queue",null);graph.secure.put("queue-feed",null);graph.secure.put("feed-page",null);UiDevice.getInstance(instrumentation).wakeUp();UiDevice.getInstance(instrumentation).pressMenu();(context.applicationContext as LaeApplication).graph=graph
        Coil.setImageLoader(ImageLoader.Builder(context).okHttpClient(client).build())
        return graph
    }
    @After fun cleanup(){scenario?.close();context.stopService(android.content.Intent(context,MusicPlaybackService::class.java));instrumentation.waitForIdleSync()}
    @Test fun fiveDestinationsVerticalFeedAndRealSocialRequests() {
        fixture();scenario=ActivityScenario.launch(MainActivity::class.java)
        compose.waitUntil(30000){compose.onAllNodesWithText("Test song 1").fetchSemanticsNodes().isNotEmpty()}
        // Discover is both a top feed tab and a bottom destination.
        for(label in listOf("Home","Discover","My Music","Downloads","Profile"))compose.onAllNodesWithText(label).onLast().assertExists()
        compose.onNodeWithContentDescription("Like song").performClick()
        compose.onNode(hasSetTextAction() and hasText("Email address")).performTextInput("listener@test.invalid")
        compose.onNode(hasSetTextAction() and hasText("Password")).performTextInput("SyntheticPassword123")
        compose.onNodeWithText("Sign in",useUnmergedTree=true).performClick()
        compose.waitUntil(15000){context.graph.session.owner=="7"}
        compose.onNodeWithContentDescription("Like song").performClick();compose.waitUntil(15000){synchronized(posts){posts.contains("/api/listener/song-like")}}
        compose.onNodeWithContentDescription("Follow artist").performClick();compose.waitUntil(15000){synchronized(posts){posts.contains("/api/listener/favorites")}}
        compose.onNodeWithContentDescription("Open comments").performClick();compose.waitUntil(10000){compose.onAllNodesWithText("A test comment").fetchSemanticsNodes().isNotEmpty()};UiDevice.getInstance(instrumentation).pressBack()
        compose.onRoot().performTouchInput {swipeUp()};compose.waitUntil(15000){compose.onAllNodesWithText("Test song 2").fetchSemanticsNodes().isNotEmpty()}
        val screenshot=File(context.getExternalFilesDir(null),"discover.png");UiDevice.getInstance(instrumentation).takeScreenshot(screenshot)
        assertFalse(synchronized(posts){posts.any {it.contains("checkout") || it.contains("sonic")}})
    }
    @Test fun screenLockedPlaybackContinuesAcrossSeveralTracks() {
        fixture(6);scenario=ActivityScenario.launch(MainActivity::class.java)
        val future=MediaController.Builder(context,SessionToken(context,ComponentName(context,MusicPlaybackService::class.java))).buildAsync()
        val player=future.get(30,TimeUnit.SECONDS);val transitions=AtomicInteger(0)
        instrumentation.runOnMainSync {
            player.addListener(object:Player.Listener {override fun onMediaItemTransition(item:androidx.media3.common.MediaItem?,reason:Int){transitions.incrementAndGet()}})
            player.setMediaItems((1..4).map {Song(it.toString(),"Test song $it","Test artist","90").item()});player.repeatMode=Player.REPEAT_MODE_ALL;player.prepare();player.play()
        }
        Thread.sleep(2000);UiDevice.getInstance(instrumentation).pressHome();UiDevice.getInstance(instrumentation).sleep();Thread.sleep(65000)
        instrumentation.runOnMainSync {assertTrue("The service must cross at least eight track boundaries with the screen locked",transitions.get()>=8);assertTrue(player.isPlaying);player.stop();player.release()}
        UiDevice.getInstance(instrumentation).wakeUp();UiDevice.getInstance(instrumentation).pressMenu();assertFalse(synchronized(posts){posts.any {it.endsWith("/play") || it.endsWith("/heartbeat")}})
    }
    companion object {
        fun wav(seconds:Int=3):ByteArray {val samples=8000*seconds;val pcm=ByteArray(samples*2);val b=ByteBuffer.allocate(44+pcm.size).order(ByteOrder.LITTLE_ENDIAN);b.put("RIFF".toByteArray()).putInt(36+pcm.size).put("WAVEfmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(8000).putInt(16000).putShort(2).putShort(16).put("data".toByteArray()).putInt(pcm.size).put(pcm);return b.array()}
    }
}
