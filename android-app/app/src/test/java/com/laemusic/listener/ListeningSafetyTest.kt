package com.laemusic.listener

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.nio.file.Files
import java.security.KeyPairGenerator
import java.security.Signature
import javax.crypto.KeyGenerator

class ListeningSafetyTest {
    @Test fun preloadPauseBufferAndSeekingDoNotInventListening() {
        val m=ListeningMeter();m.tick(1000,0,false);m.tick(16000,0,false);assertEquals(0,m.listenedMs)
        m.tick(17000,120000,true);assertEquals(0,m.listenedMs)
        m.tick(18000,121000,true);assertEquals(1000,m.listenedMs)
        m.tick(60000,122000,true);assertEquals(1000,m.listenedMs)
        m.tick(61000,123000,false);assertEquals(1000,m.listenedMs)
    }
    @Test fun genuinePlaybackAccumulatesWithoutCreditingTheEntireSongOnStart() {
        val m=ListeningMeter();m.tick(0,0,true);for(i in 1..30)m.tick(i*1000L,i*1000L,true);assertEquals(30000,m.listenedMs)
    }
    @Test fun encryptedAudioSupportsSeekingAndRejectsAnotherAccountOrTamperedBlocks() {
        val key=KeyGenerator.getInstance("AES").apply {init(256)}.generateKey();val bytes=ByteArray(ProtectedAudio.BLOCK*3+91){(it%251).toByte()};val file=Files.createTempFile("lae-encrypted-test",".lae").toFile()
        try {
            assertEquals(bytes.size.toLong(),ProtectedAudio.write(bytes.inputStream(),file,key,"7:9:asset",20971520,{false}){})
            ProtectedAudio.Reader(file,key,"7:9:asset").use {r->for(position in listOf(0L,100L,65535L,65536L,131090L)){val a=ByteArray(9);val n=r.read(position,a,0,a.size);assertArrayEquals(bytes.copyOfRange(position.toInt(),position.toInt()+n),a.copyOf(n))}}
            assertFalse(file.readBytes().contentEquals(bytes))
            assertThrows(Exception::class.java){ProtectedAudio.Reader(file,key,"8:9:asset").use {it.read(0,ByteArray(20),0,20)}}
            java.io.RandomAccessFile(file,"rw").use {it.seek(25);val old=it.read();it.seek(25);it.write(old xor 1)}
            assertThrows(Exception::class.java){ProtectedAudio.Reader(file,key,"7:9:asset").use {it.read(0,ByteArray(20),0,20)}}
        } finally {file.delete()}
    }
    @Test fun truncatedAndOversizedDownloadsAreNeverAccepted() {
        val key=KeyGenerator.getInstance("AES").generateKey();val file=Files.createTempFile("lae-size-test",".lae").toFile()
        try {assertThrows(IllegalArgumentException::class.java){ProtectedAudio.write(ByteArray(100).inputStream(),file,key,"binding",20,{false}){}};assertThrows(Exception::class.java){ProtectedAudio.Reader(file,key,"binding")}}finally {file.delete()}
    }
    @Test fun deviceSignaturesMatchTheExistingBrowserP256Protocol() {
        val pair=KeyPairGenerator.getInstance("EC").apply {initialize(256)}.generateKeyPair();val value=JSONObject().put("z",1).put("a",JSONObject().put("v",true).put("name","A song"))
        assertEquals("{\"a\":{\"name\":\"A song\",\"v\":true},\"z\":1}",OfflineProtocol.canonical(value))
        val signature=Signature.getInstance("SHA256withECDSA").apply {initSign(pair.private);update(OfflineProtocol.canonical(value).toByteArray())}.sign();val raw=OfflineProtocol.derToRaw(signature)
        assertEquals(64,raw.size);assertTrue(Signature.getInstance("SHA256withECDSA").run {initVerify(pair.public);update(OfflineProtocol.canonical(value).toByteArray());verify(OfflineProtocol.rawToDer(raw))})
    }
    @Test fun previewCannotInitiateAPlayPurchase(){assertFalse(BuildConfig.PLAY_PURCHASES_ENABLED)}
}
