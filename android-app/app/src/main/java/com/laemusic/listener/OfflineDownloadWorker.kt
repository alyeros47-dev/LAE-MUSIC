package com.laemusic.listener

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import androidx.work.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.io.IOException

class OfflineDownloadWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params) {
    override suspend fun doWork():Result = withContext(Dispatchers.IO) {
        val owner=inputData.getString("owner") ?: return@withContext Result.failure()
        val song=inputData.getString("song")?.let { Song.from(JSONObject(it)) } ?: return@withContext Result.failure()
        val graph=applicationContext.graph;val repo=graph.offline;val work=id.toString();val part=java.io.File(repo.file(owner,song.id).parentFile,"$owner-${song.id}.$work.part")
        if(graph.session.owner!=owner || repo.db.rows(owner).none {it.song.id==song.id && it.work==work})return@withContext Result.failure()
        try {
            setForeground(notification(song.title,0))
            repo.db.progress(owner,song.id,work,"downloading",0)
            repo.register(owner);val licence=repo.grant(owner,song,true);val p=repo.verify(owner,licence)
            val body=JSONObject().put("grant_id",p.getString("grant_id")).put("media_ticket",licence.getString("media_ticket"))
            val req=Request.Builder().url(BuildConfig.API_ORIGIN+"/api/platform/offline/media").header("Origin",BuildConfig.API_ORIGIN).post(body.toString().toRequestBody("application/json".toMediaType())).build()
            val expected=p.getLong("audio_bytes");var last=-1
            graph.api.client.newCall(req).execute().use { r ->
                if(!r.isSuccessful)throw ApiException(r.code,"Download was not authorized. Reconnect and retry.")
                val stream=r.body?.byteStream() ?: throw IOException("The song could not be downloaded")
                val size=ProtectedAudio.write(stream,part,repo.mediaKey(owner),repo.binding(owner,song,p),20971520,{isStopped || graph.session.owner!=owner}) { bytes ->
                    require((part.parentFile?.listFiles()?.sumOf {it.length()} ?: 0L)<=262144000) {"Your offline storage is full. Delete a saved song and retry."}
                    val progress=(bytes*100/expected.coerceAtLeast(1)).toInt().coerceIn(0,99)
                    if(progress>=last+3) {last=progress;repo.db.progress(owner,song.id,work,"downloading",progress);setProgressAsync(workDataOf("percent" to progress))}
                }
                require(size==expected) {"The download was incomplete. Please retry."}
            }
            if(isStopped || graph.session.owner!=owner || repo.db.rows(owner).none {it.song.id==song.id && it.work==work})throw CancellationException()
            repo.complete(owner,song,work,part,licence)
            Result.success()
        } catch(e:CancellationException) {repo.db.progress(owner,song.id,work,"paused",0);throw e}
        catch(e:Exception) {repo.db.progress(owner,song.id,work,"failed",0,e.message?.take(160) ?: "Could not save this song. Retry when connected.");Result.failure()}
        finally {part.delete()}
    }
    private fun notification(title:String,progress:Int):ForegroundInfo {
        val manager=applicationContext.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("downloads","Saved music",NotificationManager.IMPORTANCE_LOW))
        val n=NotificationCompat.Builder(applicationContext,"downloads").setSmallIcon(R.drawable.ic_music).setContentTitle("Saving music").setContentText(title).setProgress(100,progress,progress==0).setOngoing(true).build()
        return if(android.os.Build.VERSION.SDK_INT>=29)ForegroundInfo(id.hashCode(),n,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else ForegroundInfo(id.hashCode(),n)
    }
}
