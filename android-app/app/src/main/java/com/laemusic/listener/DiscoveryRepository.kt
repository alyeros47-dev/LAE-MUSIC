@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
package com.laemusic.listener

import android.content.ComponentName
import android.content.Context
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.util.UUID

/** Local recommendation data only. Never writes a payable stream or changes the audio service. */
class DiscoveryRepository(private val context:Context,private val api:LaeApi,private val secure:SecureStore) {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private val loading=Mutex();private val persist=Mutex()
    private val revisions=java.util.concurrent.ConcurrentHashMap<String,Long>();private val revision=java.util.concurrent.atomic.AtomicLong()
    private var owner=api.session.owner ?: "guest"
    private val mutablePreferences=MutableStateFlow(readPreferences(owner))
    val preferences=mutablePreferences.asStateFlow()
    private val mutableSongs=MutableStateFlow<List<Song>>(emptyList())
    val songs=mutableSongs.asStateFlow()
    private val mutableLoading=MutableStateFlow(false);val isLoading=mutableLoading.asStateFlow()
    private var evidence=readEvidence(owner)
    private var pool=linkedMapOf<String,Song>();private var cursor:String?=null
    private var seed=UUID.randomUUID().toString();private var controller:MediaController?=null
    private var queueVersion=0L
    private var connecting=false;private var personalized=secure.get("discovery.queue-owner")==owner && mutablePreferences.value!=null;private var window:DiscoveryListeningWindow?=null
    private var windowError=false;private var lastFailure=0L
    private fun preferenceKey(who:String)="discovery.preferences:$who"
    private fun readPreferences(who:String)=secure.get(preferenceKey(who))?.let {runCatching {ListeningPreferences.from(JSONObject(it))}.getOrNull()}
    private fun readEvidence(who:String):MutableMap<String,SongEvidence> = secure.get("discovery.evidence:$who")?.let {raw->runCatching {val x=JSONObject(raw);x.keys().asSequence().associateWith {SongEvidence.from(x.getJSONObject(it))}.toMutableMap()}.getOrNull()} ?: mutableMapOf()
    fun switchAccount() {
        val next=api.session.owner ?: "guest";if(next==owner)return
        finish(false);persistEvidence();owner=next;evidence=readEvidence(owner);mutablePreferences.value=readPreferences(owner)
        queueVersion++;personalized=false;window=null;windowError=false;rerank()
    }
    fun choose(value:ListeningPreferences) {
        secure.put(preferenceKey(owner),value.json().toString());mutablePreferences.value=value;seed=UUID.randomUUID().toString();rerank()
        observe()
    }
    fun resetRecommendations() {finish(false);evidence.clear();persistEvidence();rerank()}
    private fun change(id:String,update:(SongEvidence)->SongEvidence) {
        evidence[id]=update(evidence[id] ?: SongEvidence())
        if(evidence.size>1000)evidence.remove(evidence.minByOrNull {it.value.lastPlayed}!!.key)
    }
    fun liked(id:String,value:Boolean){if(evidence[id]?.liked==value)return;change(id){it.copy(liked=value)};persistEvidence();rerank()}
    fun commented(id:String){change(id){it.copy(commented=true)};persistEvidence();rerank()}
    fun saved(id:String,source:Int,value:Boolean=true){change(id){it.copy(saved=if(value)it.saved or source else it.saved and source.inv())};persistEvidence();rerank()}
    fun verifiedLikes(ids:List<String>){var changed=false;ids.forEach {id->if(evidence[id]?.liked!=true){change(id){it.copy(liked=true)};changed=true}};if(changed){persistEvidence();rerank()}}
    fun verifiedDownloads(ids:Set<String>){var changed=false;(evidence.keys+ids).toSet().forEach {id->val e=evidence[id] ?: SongEvidence();val next=if(id in ids)e.saved or 2 else e.saved and 2.inv();if(next!=e.saved){change(id){it.copy(saved=next)};changed=true}};if(changed){persistEvidence();rerank()}}
    fun evidenceSnapshot():Map<String,SongEvidence> = evidence.toMap()
    private fun persistEvidence() {
        val who=owner;val snapshot=evidence.toMutableMap()
        window?.let {w->snapshot[w.songId]=w.finish(snapshot[w.songId] ?: SongEvidence(),System.currentTimeMillis(),false,windowError)}
        val data=JSONObject().also {x->snapshot.forEach {(id,e)->x.put(id,e.json())}}.toString()
        val stamp=revision.incrementAndGet();revisions[who]=stamp
        scope.launch(Dispatchers.IO){persist.withLock {if(revisions[who]==stamp)secure.put("discovery.evidence:$who",data)}}
    }
    fun catalogue(id:String)=pool[id]
    private fun rerank() {
        val pref=mutablePreferences.value
        mutableSongs.value=if(pref==null)emptyList() else DiscoveryRanking.order(pool.values.toList(),pref,evidence,seed,System.currentTimeMillis())
    }
    suspend fun refresh() {
        mutableLoading.value=true
        try {loading.withLock {
            pool.clear();cursor=null
            var pages=0
            do {
                val page=api.discover(cursor=cursor);page.songs.forEach {pool[it.id]=it};cursor=page.cursor;pages++
            }while(cursor!=null && pages<4 && pool.values.count {mutablePreferences.value?.accepts(it)==true}<60)
            rerank()
        }}finally {mutableLoading.value=false}
    }
    private fun appendFollowing() {
        if(!personalized)return
        val p=controller ?: return
        val version=queueVersion
        if(p.currentMediaItemIndex<p.mediaItemCount-5)return
        scope.launch {try {loading.withLock {
            if(!personalized || version!=queueVersion)return@withLock
            if(cursor!=null && pool.size<1000){val page=api.discover(cursor=cursor);page.songs.forEach {pool[it.id]=it};cursor=page.cursor;rerank()}
            if(!personalized || version!=queueVersion)return@withLock
            val ids=(0 until p.mediaItemCount).map {p.getMediaItemAt(it).mediaId}.toSet()
            val pref=mutablePreferences.value ?: return@withLock
            val items=DiscoveryRanking.order(pool.values.filterNot {it.id in ids},pref,evidence,seed,System.currentTimeMillis()).take(30)
            if(items.isNotEmpty())p.addMediaItems(items.map {it.item()})
        }}catch(e:CancellationException){throw e}catch(_:Exception){/* Preserve the current native queue during a connection failure. */}}
    }
    fun personalizeQueue(){queueVersion++;personalized=true;secure.put("discovery.queue-owner",owner);secure.put("queue-feed","false");observe()}
    fun customQueue(){queueVersion++;personalized=false;secure.put("discovery.queue-owner",null)}
    fun observe() {
        if(controller!=null || connecting)return
        connecting=true
        val future=MediaController.Builder(context,SessionToken(context,ComponentName(context,MusicPlaybackService::class.java))).buildAsync()
        future.addListener({
            connecting=false
            runCatching {future.get()}.onSuccess {p->
                controller=p
                p.addListener(object:Player.Listener {
                    override fun onMediaItemTransition(item:MediaItem?,reason:Int){
                        finish(reason==Player.MEDIA_ITEM_TRANSITION_REASON_SEEK);windowError=false
                        appendFollowing()
                    }
                    override fun onPositionDiscontinuity(oldPosition:Player.PositionInfo,newPosition:Player.PositionInfo,reason:Int){if(reason==Player.DISCONTINUITY_REASON_SEEK && oldPosition.mediaItem?.mediaId==newPosition.mediaItem?.mediaId)window?.discontinuity()}
                    override fun onPlayerError(error:androidx.media3.common.PlaybackException){windowError=true;lastFailure=SystemClock.elapsedRealtime()}
                })
                appendFollowing()
                scope.launch {var seconds=0
                    while(isActive){
                        switchAccount()
                        val item=p.currentMediaItem
                        if(item!=null && p.isPlaying && mutablePreferences.value!=null){
                            if(window?.songId!=item.mediaId){finish(false);window=DiscoveryListeningWindow(item.mediaId,p.duration.takeIf {it!=C.TIME_UNSET} ?: 0);change(item.mediaId){it.copy(exposures=it.exposures+1)}}
                        }
                        window?.sample(SystemClock.elapsedRealtime(),p.currentPosition,p.isPlaying)
                        if(++seconds%30==0)persistEvidence()
                        delay(1000)
                    }
                }
            }
        },ContextCompat.getMainExecutor(context))
    }
    fun close(){controller?.release();scope.cancel()}
    private fun finish(userSkip:Boolean) {
        val current=window ?: return
        val e=current.finish(evidence[current.songId] ?: SongEvidence(),System.currentTimeMillis(),userSkip,windowError || lastFailure>0 && SystemClock.elapsedRealtime()-lastFailure in 0..5000)
        evidence[current.songId]=e;window=null;persistEvidence();rerank()
    }
}
