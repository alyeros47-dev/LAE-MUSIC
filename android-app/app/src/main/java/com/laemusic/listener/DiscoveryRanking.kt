package com.laemusic.listener

import org.json.JSONObject
import kotlin.math.min

data class SongEvidence(
    val exposures:Int=0,val starts:Int=0,val meaningful:Int=0,val listenedMs:Long=0,
    val completionSum:Double=0.0,val completed:Int=0,val skips:Int=0,val repeats:Int=0,
    val liked:Boolean=false,val commented:Boolean=false,val saved:Int=0,val lastPlayed:Long=0
) {
    fun json()=JSONObject().put("exposures",exposures).put("starts",starts).put("meaningful",meaningful).put("listened_ms",listenedMs)
        .put("completion",completionSum).put("completed",completed).put("skips",skips).put("repeats",repeats)
        .put("liked",liked).put("commented",commented).put("saved",saved).put("last_played",lastPlayed)
    companion object {fun from(x:JSONObject)=SongEvidence(x.optInt("exposures").coerceAtLeast(0),x.optInt("starts").coerceAtLeast(0),x.optInt("meaningful").coerceAtLeast(0),x.optLong("listened_ms").coerceAtLeast(0),x.optDouble("completion",0.0).coerceAtLeast(0.0),x.optInt("completed").coerceAtLeast(0),x.optInt("skips").coerceAtLeast(0),x.optInt("repeats").coerceAtLeast(0),x.optBoolean("liked"),x.optBoolean("commented"),x.optInt("saved"),x.optLong("last_played"))}
}

/** Actual elapsed/position progress only; never connected to financial stream accounting. */
class DiscoveryListeningWindow(val songId:String,val durationMs:Long) {
    var listenedMs=0L;private set
    private var at:Long?=null;private var position=0L;private var wasPlaying=false
    fun sample(now:Long,newPosition:Long,playing:Boolean) {
        val elapsed=at?.let {now-it} ?: 0;val advance=newPosition-position
        if(wasPlaying && playing && elapsed in 1..10000 && advance in 0..(elapsed*1.15+750).toLong())listenedMs+=minOf(elapsed,advance)
        at=now;position=newPosition;wasPlaying=playing
    }
    fun discontinuity(){at=null;wasPlaying=false}
    fun finish(old:SongEvidence,now:Long,userSkipped:Boolean,error:Boolean=false):SongEvidence {
        if(listenedMs<1000)return old // A preload, tap, or failed start creates no ranking evidence.
        val threshold=if(durationMs>0)minOf(30000L,(durationMs*.5).toLong()).coerceAtLeast(5000) else 30000L
        val meaningful=listenedMs>=threshold
        val fraction=if(durationMs>0)(listenedMs.toDouble()/durationMs).coerceIn(0.0,1.0) else 0.0
        val skip=userSkipped && !error && listenedMs>=3000 && listenedMs<if(durationMs>0)minOf(30000L,(durationMs*.25).toLong()) else 30000L
        return old.copy(starts=old.starts+if(error)0 else 1,meaningful=old.meaningful+if(meaningful)1 else 0,
            listenedMs=old.listenedMs+listenedMs.coerceAtMost(if(durationMs>0)durationMs else 3600000),
            completionSum=old.completionSum+if(error)0.0 else fraction,completed=old.completed+if(!error && fraction>=.85)1 else 0,
            skips=old.skips+if(skip)1 else 0,repeats=old.repeats+if(meaningful && old.meaningful>0)1 else 0,lastPlayed=now)
    }
}

object DiscoveryRanking {
    const val EXPLORATION_INTERVAL=5
    fun score(e:SongEvidence,genreAffinity:Double=0.0):Double {
        val n=e.meaningful+e.skips
        val confidence=n.toDouble()/(n+8.0)
        val posterior=(e.completionSum+4*.5)/(e.starts+4.0)
        val behavior=confidence*((posterior-.5)*1.2+min(1.0,e.listenedMs/900000.0)*.35+min(3,e.repeats)*.07-min(1.0,e.skips/(n+1.0))*.65)
        return behavior+genreAffinity.coerceIn(0.0,.3)+(if(e.liked).65 else 0.0)+(if(e.commented).12 else 0.0)+(if(e.saved!=0).4 else 0.0)
    }
    fun order(candidates:List<Song>,preferences:ListeningPreferences,evidence:Map<String,SongEvidence>,seed:String,now:Long):List<Song> {
        val pool=candidates.distinctBy {it.id}.filter {preferences.accepts(it)}
        val affinity=pool.groupBy {MusicTaxonomy.normalized(it.genre)}.mapValues {(_,songs)->songs.count {song->evidence[song.id]?.let {it.liked || it.saved!=0 || it.meaningful>0}==true}.coerceAtMost(3)*.1}
        val artistExposure=pool.groupBy {it.artistId.ifBlank {"track:${it.id}"}}.mapValues {(_,songs)->songs.sumOf {evidence[it.id]?.exposures ?: 0}}
        val tieKeys=pool.associate {it.id to java.nio.ByteBuffer.wrap(java.security.MessageDigest.getInstance("SHA-256").digest((seed+":"+it.id).toByteArray())).long.and(Long.MAX_VALUE)}
        fun key(song:Song)=tieKeys.getValue(song.id)
        val remaining=pool.toMutableList();val result=mutableListOf<Song>()
        while(remaining.isNotEmpty() && result.size<100) {
            val recentArtists=result.takeLast(2).map {it.artistId}.toSet()
            val diverse=remaining.filterNot {it.artistId in recentArtists}.ifEmpty {remaining}
            val explore=result.size%EXPLORATION_INTERVAL==0
            val selected=if(explore)diverse.minWithOrNull(compareBy<Song> {artistExposure[it.artistId.ifBlank {"track:${it.id}"}] ?: 0}.thenBy {evidence[it.id]?.exposures ?: 0}.thenBy {key(it)})!!
                else diverse.maxWithOrNull(compareBy<Song> {song->val e=evidence[song.id] ?: SongEvidence();score(e,affinity[MusicTaxonomy.normalized(song.genre)] ?: 0.0)-(if(now-e.lastPlayed in 0..3600000 && e.lastPlayed>0).45 else 0.0)}.thenBy {key(it)})!!
            result.add(selected);remaining.removeAll {it.id==selected.id}
        }
        return result
    }
}
