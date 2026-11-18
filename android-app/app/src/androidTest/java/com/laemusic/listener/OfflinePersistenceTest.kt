package com.laemusic.listener

import androidx.test.platform.app.InstrumentationRegistry
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
        val g=context.graph;val owner="7777777";assertEquals(owner,g.session.owner)
        val row=g.offline.db.rows(owner).first {it.song.id=="9999999"};val p=g.offline.verify(owner,row.licence!!)
        ProtectedAudio.Reader(java.io.File(row.file),g.offline.mediaKey(owner),g.offline.binding(owner,row.song,p)).use {r->val bytes=ByteArray(44);assertEquals(44,r.read(0,bytes,0,44));assertEquals("RIFF",String(bytes.copyOfRange(0,4)))}
        assertEquals("ready",row.status)
        g.session.clear();assertThrows(IllegalArgumentException::class.java){g.offline.verify(owner,row.licence)}
    }
}
