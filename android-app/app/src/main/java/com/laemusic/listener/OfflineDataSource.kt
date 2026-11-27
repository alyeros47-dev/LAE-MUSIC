package com.laemusic.listener

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSpec
import java.io.File
import java.io.IOException

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class OfflineDataSource(private val repo:OfflineRepository,private val api:LaeApi):BaseDataSource(false) {
    private var reader:ProtectedAudio.Reader?=null;private var uri:Uri?=null;private var position=0L;private var remaining=0L;private var checked=0L
    override fun open(spec:DataSpec):Long {
        try {
            transferInitializing(spec)
            val owner=api.session.owner ?: error("Sign in to your listening account")
            require(spec.uri.host==owner)
            val row=repo.db.rows(owner).find {it.song.id==spec.uri.lastPathSegment && it.status=="ready"} ?: error("This song is not saved on this device")
            val p=repo.verify(owner,row.licence ?: error("Reconnect to refresh this song"))
            reader=ProtectedAudio.Reader(File(row.file),repo.mediaKey(owner),repo.binding(owner,row.song,p));position=spec.position
            require(position<=reader!!.size)
            remaining=if(spec.length==C.LENGTH_UNSET.toLong())reader!!.size-position else minOf(spec.length,reader!!.size-position)
            uri=spec.uri;transferStarted(spec);return remaining
        } catch(e:Exception) {reader?.close();reader=null;throw IOException(e.message,e)}
    }
    override fun read(buffer:ByteArray,offset:Int,length:Int):Int {
        if(length==0)return 0
        if(remaining==0L)return C.RESULT_END_OF_INPUT
        // Recheck the signed lease during playback, not just when opening a file.
        val owner=api.session.owner ?: throw IOException("Sign in to your listening account")
        if(android.os.SystemClock.elapsedRealtime()-checked>1000) {
            val row=repo.db.rows(owner).find {it.song.id==uri?.lastPathSegment} ?: throw IOException("Saved song removed")
            try {repo.verify(owner,row.licence!!)}catch(e:Exception){throw IOException(e.message,e)}
            checked=android.os.SystemClock.elapsedRealtime()
        }
        val n=reader!!.read(position,buffer,offset,minOf(length.toLong(),remaining).toInt());if(n>0){position+=n;remaining-=n;bytesTransferred(n)};return n
    }
    override fun getUri():Uri?=uri
    override fun close(){if(reader!=null){reader?.close();reader=null;transferEnded()};uri=null}
}
