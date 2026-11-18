package com.laemusic.listener

import android.app.PendingIntent
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.media3.common.*
import androidx.media3.datasource.*
import androidx.media3.datasource.cache.*
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Exactly one native player owns its whole queue, independently of the screen. */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class MusicPlaybackService:MediaSessionService() {
    private lateinit var player:ExoPlayer
    private var session:MediaSession?=null
    private var cache:SimpleCache?=null
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private val handler=Handler(Looper.getMainLooper())
    private val telemetry=Mutex()
    private val artworkExecutor=java.util.concurrent.Executors.newSingleThreadExecutor()
    private var generation=0L
    private var meter=ListeningMeter()
    private var playbackId:String?=null
    private var ineligibleOwner:String?=null
    private var sequence=0
    private var pendingBeat:JSONObject?=null
    private var reported=false
    private var started=0L
    private var seconds=0
    private var retries=0
    private var loadingMore=false
    private var offlineGrant:JSONObject?=null
    private val tick=object:Runnable {override fun run(){
        if(::player.isInitialized) {
            val playing=player.isPlaying
            if(playing && isOffline() && offlineGrant!=null && !runCatching {graph.session.owner?.let {graph.offline.allowed(it)}==true && graph.offline.clock()<offlineGrant!!.getLong("until_ms")}.getOrDefault(false)) {
                player.stop();player.prepare() // Reopening reports the licence error and discards prefetched audio.
            }
            meter.tick(SystemClock.elapsedRealtime(),player.currentPosition,playing)
            if(playing && meter.listenedMs>=30000 && !reported) {reported=true;reportQualified()}
            if(++seconds%10==0) {if(playing && !isOffline()){startAccounting();heartbeat()};persist()}
        }
        handler.postDelayed(this,1000)
    }}
    private fun isOffline()=player.currentMediaItem?.localConfiguration?.uri?.scheme=="lae-offline"
    override fun onCreate() {
        super.onCreate()
        val graph=graph
        cache=SimpleCache(File(cacheDir,"stream_buffer"),LeastRecentlyUsedCacheEvictor(50L*1024*1024),androidx.media3.database.StandaloneDatabaseProvider(this))
        val online=CacheDataSource.Factory().setCache(cache!!).setUpstreamDataSourceFactory(OkHttpDataSource.Factory(graph.api.client)).setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        val factory=DataSource.Factory { RoutingSource(online.createDataSource(),OfflineDataSource(graph.offline,graph.api)) }
        player=ExoPlayer.Builder(this).setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(this,factory))).setLoadControl(DefaultLoadControl.Builder().setBufferDurationsMs(15000,50000,1500,3000).build()).build().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true)
            setHandleAudioBecomingNoisy(true);setWakeMode(C.WAKE_MODE_NETWORK);repeatMode=if(graph.secure.get("continuous")=="false")Player.REPEAT_MODE_OFF else Player.REPEAT_MODE_ALL
        }
        player.addListener(object:Player.Listener {
            override fun onMediaItemTransition(item:MediaItem?,reason:Int) {
                generation++;meter=ListeningMeter();playbackId=null;ineligibleOwner=null;sequence=0;pendingBeat=null;reported=false;offlineGrant=null;retries=0
                started=runCatching {graph.offline.clock()}.getOrDefault(System.currentTimeMillis())
                player.setWakeMode(if(isOffline())C.WAKE_MODE_LOCAL else C.WAKE_MODE_NETWORK)
                if(isOffline()) {val owner=graph.session.owner;offlineGrant=owner?.let {graph.offline.db.rows(it).find {r->r.song.id==item?.mediaId}?.licence}?.let {runCatching {graph.offline.verify(owner!!,it)}.getOrNull()}}
                persist();if(player.isPlaying)startAccounting();prefetch();extendQueue()
            }
            override fun onIsPlayingChanged(isPlaying:Boolean) {if(isPlaying)startAccounting()}
            override fun onPlayerError(error:PlaybackException) {
                if(!isOffline() && retries<3) {val attempt=++retries;val g=generation;handler.postDelayed({if(g==generation && player.playWhenReady){player.prepare();player.play()}},attempt*2500L)}
            }
        })
        val callback=object:MediaSession.Callback {
            override fun onConnect(session:MediaSession,controller:MediaSession.ControllerInfo):MediaSession.ConnectionResult {
                return if(controller.packageName==packageName || controller.isTrusted) super.onConnect(session,controller) else MediaSession.ConnectionResult.reject()
            }
        }
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        session=MediaSession.Builder(this,player).setSessionActivity(open).setBitmapLoader(androidx.media3.datasource.DataSourceBitmapLoader(com.google.common.util.concurrent.MoreExecutors.listeningDecorator(artworkExecutor),OkHttpDataSource.Factory(graph.api.client))).setCallback(callback).build()
        restore();handler.post(tick)
    }
    private fun startAccounting() {
        if(isOffline() || graph.session.owner==null || graph.session.owner==ineligibleOwner || playbackId!=null)return
        val current=generation;val song=player.currentMediaItem?.mediaId ?: return
        scope.launch {telemetry.withLock {
            if(current!=generation || playbackId!=null)return@withLock
            val result=runCatching {graph.api.json("/api/platform/premium/playback",JSONObject().put("track_id",song))}.getOrNull()
            if(current==generation && result!=null) {if(result.optBoolean("eligible")){playbackId=result.getString("id");sequence=0}else ineligibleOwner=graph.session.owner}
        }}
    }
    private fun heartbeat() {
        val g=generation;val position=player.currentPosition/1000.0
        scope.launch {telemetry.withLock {
            if(g!=generation)return@withLock
            val id=playbackId ?: return@withLock
            val beat=pendingBeat ?: JSONObject().put("id",id).put("sequence",sequence+1).put("position",position)
            pendingBeat=beat
            val response=runCatching {graph.api.json("/api/platform/premium/heartbeat",beat)}.getOrNull()
            if(g==generation && response!=null){sequence=response.getInt("sequence");pendingBeat=null}
        }}
    }
    private fun reportQualified() {
        val track=player.currentMediaItem?.mediaId ?: return
        val grant=offlineGrant;val owner=graph.session.owner;val playedMs=meter.listenedMs;val began=started
        scope.launch(Dispatchers.IO) {
            if(grant!=null && owner!=null) {
                runCatching {
                    val end=graph.offline.clock();graph.offline.db.event(graph.offline.device(owner),JSONObject().put("id",UUID.randomUUID().toString()).put("grant_id",grant.getString("grant_id")).put("started_ms",began).put("ended_ms",end).put("listened_ms",playedMs));graph.offline.sync(owner)
                }
            } else {
                runCatching {graph.api.json("/api/music/tracks/$track/play",JSONObject())}
                if(owner!=null)runCatching {graph.api.json("/api/listener/history",JSONObject().put("trackId",track))}
            }
        }
    }
    private fun extendQueue() {
        if(loadingMore || isOffline() || graph.secure.get("queue-feed")!="true" || player.currentMediaItemIndex<player.mediaItemCount-3)return
        val config=graph.secure.get("feed-page")?.let(::JSONObject) ?: return
        val cursor=config.optString("cursor").takeIf {it.isNotBlank() && it!="null"} ?: return
        loadingMore=true
        scope.launch {try {
            val page=graph.api.discover(config.optString("query"),config.optString("genre"),cursor=cursor)
            if(!isOffline() && graph.secure.get("queue-feed")=="true" && graph.secure.get("feed-page")==config.toString()) {
                val existing=(0 until player.mediaItemCount).map {player.getMediaItemAt(it).mediaId}.toSet()
                graph.secure.put("feed-page",config.put("cursor",page.cursor).toString())
                player.addMediaItems(page.songs.filterNot {it.id in existing}.map {it.item()})
            }
        }catch(_:Exception){/* Existing native queue keeps playing; retry at the next transition. */}finally {loadingMore=false}}
    }
    private fun prefetch() {
        val next=player.nextMediaItemIndex
        if(next==C.INDEX_UNSET || player.mediaItemCount<2 || isOffline() || graph.secure.get("data-saver")=="true")return
        val uri=player.getMediaItemAt(next).localConfiguration?.uri ?: return
        if(uri.scheme!="https")return
        scope.launch(Dispatchers.IO) {runCatching {
            val factory=CacheDataSource.Factory().setCache(cache!!).setUpstreamDataSourceFactory(OkHttpDataSource.Factory(graph.api.client))
            CacheWriter(factory.createDataSource(),DataSpec.Builder().setUri(uri).setLength(131072).build(),null,null).cache()
        }}
    }
    private fun persist() {
        if(player.mediaItemCount==0)return
        val items=JSONArray()
        val first=(player.currentMediaItemIndex-25).coerceAtLeast(0)
        for(i in first until minOf(player.mediaItemCount,first+200)) {val m=player.getMediaItemAt(i);items.put(JSONObject().put("id",m.mediaId).put("title",m.mediaMetadata.title).put("artist",m.mediaMetadata.artist).put("artist_id",m.mediaMetadata.extras?.getString("artistId")).put("offline",m.localConfiguration?.uri?.scheme=="lae-offline"))}
        graph.secure.put("queue",JSONObject().put("items",items).put("index",player.currentMediaItemIndex-first).put("position",player.currentPosition).put("owner",graph.session.owner).toString())
    }
    private fun restore() {runCatching {
        val saved=graph.secure.get("queue")?.let(::JSONObject) ?: return
        val owner=graph.session.owner.orEmpty()
        val items=saved.getJSONArray("items").objects().filter { !it.optBoolean("offline") || saved.optString("owner")==owner && owner.isNotEmpty() }.map {Song.from(it).item(it.optBoolean("offline"),owner)}
        if(items.isNotEmpty()){player.setMediaItems(items,saved.optInt("index").coerceIn(0,items.lastIndex),saved.optLong("position").coerceAtLeast(0));player.prepare();player.playWhenReady=false}
    }}
    override fun onGetSession(controllerInfo:MediaSession.ControllerInfo)=session
    override fun onTaskRemoved(rootIntent:Intent?) {if(!player.playWhenReady || player.mediaItemCount==0)stopSelf()}
    override fun onDestroy() {persist();handler.removeCallbacksAndMessages(null);scope.cancel();session?.release();player.release();cache?.release();artworkExecutor.shutdownNow();super.onDestroy()}
}
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
private class RoutingSource(private val online:DataSource,private val offline:DataSource):DataSource {
    private var active:DataSource=online
    override fun addTransferListener(listener:TransferListener){online.addTransferListener(listener);offline.addTransferListener(listener)}
    override fun open(spec:DataSpec):Long {active=if(spec.uri.scheme=="lae-offline")offline else online;return active.open(spec)}
    override fun read(buffer:ByteArray,offset:Int,length:Int)=active.read(buffer,offset,length)
    override fun getUri()=active.uri
    override fun getResponseHeaders()=active.responseHeaders
    override fun close()=active.close()
}
