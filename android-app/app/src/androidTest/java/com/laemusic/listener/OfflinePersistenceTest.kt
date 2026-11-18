package com.laemusic.listener

import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.core.app.ActivityScenario
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import android.content.ComponentName
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import android.os.SystemClock
import android.provider.Settings
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPublicKey

/** Run prepare, reboot the emulator, then run verifyAfterReboot. No network. */
class OfflinePersistenceTest {
    private val context get()=InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun prepare() { DownloadFixture.prepare(context) }
    @Test fun verifyAfterReboot() {
        val g=AppGraph(context,OkHttpClient.Builder().addInterceptor {throw java.io.IOException("Network disabled for the reboot test")}.build())
        (context.applicationContext as LaeApplication).graph=g
        coil.Coil.setImageLoader(coil.ImageLoader.Builder(context).okHttpClient(g.api.client).build())
        val owner="7777777";assertEquals(owner,g.session.owner)
        val row=g.offline.db.rows(owner).first {it.song.id=="9999999"};val p=g.offline.verify(owner,row.licence!!)
        ProtectedAudio.Reader(java.io.File(row.file),g.offline.mediaKey(owner),g.offline.binding(owner,row.song,p)).use {r->val bytes=ByteArray(44);assertEquals(44,r.read(0,bytes,0,44));assertEquals("RIFF",String(bytes.copyOfRange(0,4)))}
        assertEquals("ready",row.status)
        // Decode/play the protected file through the real service after reboot,
        // with all network requests rejected by the test transport.
        val scenario=ActivityScenario.launch(MainActivity::class.java)
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val future=MediaController.Builder(context,SessionToken(context,ComponentName(context,MusicPlaybackService::class.java))).buildAsync()
        val player=future.get(30,TimeUnit.SECONDS)
        try {
            instrumentation.runOnMainSync {player.setMediaItem(row.song.item(true,owner));player.prepare();player.play()}
            Thread.sleep(6000)
            instrumentation.runOnMainSync {assertTrue("Protected audio must play without the network after reboot",player.isPlaying);assertTrue(player.currentPosition>2000)}
        } finally {instrumentation.runOnMainSync {player.stop();player.release()};scenario.close();context.stopService(android.content.Intent(context,MusicPlaybackService::class.java))}
        g.offline.deny(owner);assertThrows(IllegalArgumentException::class.java){g.offline.verify(owner,row.licence)};assertTrue(java.io.File(row.file).exists());g.secure.put("offline-denied:$owner",null)
        g.session.clear();assertThrows(IllegalArgumentException::class.java){g.offline.verify(owner,row.licence)}
    }
}
