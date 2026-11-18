package com.laemusic.listener

import android.app.Application
import android.content.ComponentName
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.core.content.ContextCompat
import androidx.work.WorkManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

enum class Destination(val title:String) { HOME("Home"), DISCOVER("Discover"), MUSIC("My Music"), DOWNLOADS("Downloads"), PROFILE("Profile") }
data class ListeningState(
    val tab:Destination=Destination.DISCOVER,val explore:Boolean=false,val tracks:List<Song> = emptyList(),val genres:List<String> = emptyList(),val artists:List<JSONObject> = emptyList(),
    val query:String="",val genre:String="",val loading:Boolean=true,val message:String?=null,val current:String?=null,val playing:Boolean=false,val buffering:Boolean=false,val position:Long=0,val duration:Long=0,
    val user:JSONObject?=null,val premium:JSONObject?=null,val likes:List<Song> = emptyList(),val history:List<Song> = emptyList(),val playlists:List<JSONObject> = emptyList(),val downloads:List<SavedSong> = emptyList(),val engagements:Map<String,Engagement> = emptyMap(),val comments:List<JSONObject> = emptyList(),val sheet:String?=null,val selected:Song?=null,val artistSongs:List<Song> = emptyList(),val dataSaver:Boolean=false,val continuous:Boolean=true,val hasMore:Boolean=false,val playerReady:Boolean=false,val popular:List<Song> = emptyList(),val featuredArtists:List<JSONObject> = emptyList(),val busy:Boolean=false
)
class ListeningViewModel(app:Application):AndroidViewModel(app) {
    val graph=app.graph
    private val mutable=MutableStateFlow(ListeningState(user=graph.session.user,dataSaver=graph.secure.get("data-saver")=="true",continuous=graph.secure.get("continuous")!="false"))
    val state=mutable.asStateFlow()
    private var controller:MediaController?=null
    private val future=MediaController.Builder(app,SessionToken(app,ComponentName(app,MusicPlaybackService::class.java))).buildAsync()
    private var cursor:String?=null;private var loadingPage=false;private var queryVersion=0
    init {
        future.addListener({runCatching {controller=future.get();controller!!.addListener(object:Player.Listener {
            override fun onEvents(player:Player,events:Player.Events) {
                val items=(0 until player.mediaItemCount).map {player.getMediaItemAt(it)}.map {Song(it.mediaId,it.mediaMetadata.title?.toString().orEmpty(),it.mediaMetadata.artist?.toString().orEmpty(),it.mediaMetadata.extras?.getString("artistId").orEmpty(),it.mediaMetadata.extras?.getString("genre").orEmpty(),it.mediaMetadata.extras?.getString("description").orEmpty())}
                update {it.copy(current=player.currentMediaItem?.mediaId,playing=player.isPlaying,buffering=player.playbackState==Player.STATE_BUFFERING,tracks=(it.tracks+items).distinctBy {song->song.id})}
            }
            override fun onPlayerError(error:androidx.media3.common.PlaybackException) {message(if(playerOffline())"Reconnect to refresh the saved song licence, or retry the download." else "Playback was interrupted. Check your connection and press Play to retry.")}
        });update {it.copy(playerReady=true,current=controller?.currentMediaItem?.mediaId,playing=controller?.isPlaying==true)} }.onFailure {message("The player could not start. Please reopen the app.")}},ContextCompat.getMainExecutor(app))
        refresh()
        viewModelScope.launch {while(isActive){controller?.let {p->update {it.copy(position=p.currentPosition.coerceAtLeast(0),duration=p.duration.coerceAtLeast(0))}};if(state.value.tab==Destination.DOWNLOADS)loadDownloads();delay(1000)}}
    }
    private fun playerOffline()=controller?.currentMediaItem?.mediaMetadata?.extras?.getBoolean("offline")==true
    private fun update(f:(ListeningState)->ListeningState){mutable.value=f(mutable.value)}
    fun message(s:String?){update {it.copy(message=s)}}
    fun select(tab:Destination){update {it.copy(tab=tab)};if(tab==Destination.MUSIC)library();if(tab==Destination.DOWNLOADS){loadDownloads();action {graph.offline.refresh();loadDownloads()}};if(tab==Destination.PROFILE)premium()}
    fun explore(value:Boolean){update {it.copy(explore=value)}}
    fun refresh(){loadCatalog(false);action {val popular=graph.api.discover(sort="popular");val editorial=graph.api.json("/api/platform/editorial");update {it.copy(popular=popular.songs,featuredArtists=editorial.optJSONArray("featured_artists")?.objects().orEmpty())}};if(graph.session.owner!=null){premium();library();loadDownloads()}}
    fun search(query:String,genre:String=""){update {it.copy(query=query.trim(),genre=genre)};loadCatalog(false)}
    fun nextPage(){if(cursor!=null && !loadingPage)loadCatalog(true)}
    private fun loadCatalog(append:Boolean) {
        if(loadingPage && append)return
        val request=++queryVersion;loadingPage=true;update {it.copy(loading=!append)}
        viewModelScope.launch {try {
            val s=state.value;val page=graph.api.discover(s.query,s.genre,cursor=if(append)cursor else null)
            if(request!=queryVersion)return@launch
            cursor=page.cursor;if(!append)graph.secure.put("feed-page",JSONObject().put("cursor",page.cursor).put("query",s.query).put("genre",s.genre).toString());val tracks=(if(append)state.value.tracks+page.songs else page.songs).distinctBy {it.id}
            update {it.copy(tracks=tracks,genres=page.genres,artists=page.artists,loading=false,hasMore=page.cursor!=null)}
            // Append without replacing the playing item or changing its position.
            if(append && !playerOffline())controller?.let {p-> val ids=(0 until p.mediaItemCount).map {p.getMediaItemAt(it).mediaId}.toSet();p.addMediaItems(page.songs.filterNot {it.id in ids}.map {it.item()})}
        } catch(e:Exception){if(request==queryVersion)update {it.copy(loading=false,message=error(e))}}finally{if(request==queryVersion)loadingPage=false}}
    }
    fun play(song:Song,queue:List<Song> =state.value.tracks,offline:Boolean=false) {
        val p=controller ?: run {message("Connecting to the player. Please try again shortly.");return}
        graph.secure.put("queue-feed",(!offline && queue==state.value.tracks).toString())
        val items=(if(queue.any {it.id==song.id})queue else listOf(song)+queue).distinctBy {it.id}
        if(offline) {val owner=graph.session.owner ?: return;runCatching {val row=state.value.downloads.find {it.song.id==song.id} ?: error("Save this song first");graph.offline.verify(owner,row.licence!!)}.onFailure {message(it.message);return}}
        val existing=(0 until p.mediaItemCount).indexOfFirst {p.getMediaItemAt(it).mediaId==song.id}
        val sameQueue=(0 until p.mediaItemCount).map {p.getMediaItemAt(it).mediaId}==items.map {it.id}
        if(existing>=0 && playerOffline()==offline && sameQueue) {if(p.currentMediaItem?.mediaId!=song.id)p.seekToDefaultPosition(existing)} else p.setMediaItems(items.map {it.item(offline,graph.session.owner.orEmpty())},items.indexOfFirst {it.id==song.id},0)
        p.prepare();p.play();engagement(song)
    }
    fun open(song:Song,queue:List<Song> =state.value.tracks,offline:Boolean=false){update {it.copy(tab=Destination.DISCOVER,explore=false,tracks=(if(offline)queue else queue+it.tracks).distinctBy {s->s.id})};play(song,queue,offline)}
    fun playFeed(song:Song){play(song,offline=playerOffline())}
    fun toggle(){controller?.let {if(it.isPlaying)it.pause() else {if(it.playbackState==Player.STATE_IDLE)it.prepare();it.play()}}}
    fun next(){controller?.seekToNextMediaItem()}
    fun previous(){controller?.seekToPrevious()}
    fun seek(fraction:Float){controller?.let {if(it.duration>0)it.seekTo((it.duration*fraction).toLong())}}
    fun engagement(song:Song){action {val value=graph.api.engagement(song);update {it.copy(engagements=it.engagements+(song.id to value))}}}
    fun like(song:Song){if(!signedIn())return;action {val liked=state.value.engagements[song.id]?.liked==true;graph.api.json("/api/listener/song-like",JSONObject().put("trackId",song.id).put("liked",!liked));engagement(song)}}
    fun follow(song:Song){if(!signedIn())return;action {val followed=state.value.engagements[song.id]?.following==true;graph.api.json("/api/listener/favorites",JSONObject().put("artistId",song.artistId).put("action",if(followed)"remove" else "add"));val value=graph.api.engagement(song);val ids=state.value.tracks.filter {it.artistId==song.artistId}.map {it.id}.toSet();update {it.copy(engagements=it.engagements.mapValues {entry->if(entry.key in ids)entry.value.copy(following=value.following) else entry.value}+(song.id to value))}}}
    fun show(sheet:String,song:Song?=null){update {it.copy(sheet=sheet,selected=song,comments=emptyList())};if(sheet=="comments" && song!=null)action {val x=graph.api.json("/api/listener/comments?trackId=${song.id}");update {it.copy(comments=x.getJSONArray("comments").objects())}};if(sheet=="artist" && song!=null)action {val x=graph.api.json("/api/music/artist?id=${song.artistId}");update {it.copy(artistSongs=x.songs())}};if(sheet=="premium")premium()}
    fun dismiss(){update {it.copy(sheet=null)}}
    fun comment(song:Song,text:String){if(!signedIn())return;action {val x=graph.api.json("/api/listener/comments",JSONObject().put("trackId",song.id).put("comment",text));message(x.optString("message"));show("comments",song);engagement(song)}}
    fun reportComment(id:String){if(!signedIn())return;action {graph.api.json("/api/listener/comment-report",JSONObject().put("commentId",id).put("reason","Please review this comment"));message("Comment sent for review.")}}
    fun artist(id:String){action {val x=graph.api.json("/api/music/artist?id=$id");val songs=x.songs();update {it.copy(sheet="artist",artistSongs=songs,selected=songs.firstOrNull())}}}
    fun refreshDownloads(){action {graph.offline.refresh();loadDownloads();message("Listening licences refreshed.")}}
    fun choosePlaylist(song:Song){if(!signedIn())return;library();show("save",song)}
    fun dataSaver(value:Boolean){graph.secure.put("data-saver",value.toString());update {it.copy(dataSaver=value)}}
    fun continuous(value:Boolean){graph.secure.put("continuous",value.toString());controller?.repeatMode=if(value)Player.REPEAT_MODE_ALL else Player.REPEAT_MODE_OFF;update {it.copy(continuous=value)}}
    fun reportSong(song:Song,reason:String){action {graph.api.json("/api/music/tracks/${song.id}/report",JSONObject().put("reason",reason).put("details","Reported from the Android listening app"));message("Song sent for review.");dismiss()}}
    fun login(email:String,password:String,connectArtist:Boolean=false){action {graph.api.login(email,password,connectArtist);update {it.copy(user=graph.session.user)};dismiss();refresh()}}
    fun logout(){controller?.stop();graph.session.owner?.let {WorkManager.getInstance(getApplication()).cancelAllWorkByTag("account:$it")};action {runCatching {graph.api.json("/api/listener/logout",JSONObject())};graph.session.clear();update {it.copy(user=null,premium=null,downloads=emptyList(),likes=emptyList(),history=emptyList(),playlists=emptyList())}}}
    fun premium(){if(graph.session.owner!=null)action {val x=graph.api.json("/api/platform/premium/status");if(!x.optBoolean("active"))graph.session.owner?.let {graph.offline.deny(it)};update {it.copy(premium=x)}}}
    fun library(){if(graph.session.owner!=null)action {val x=graph.api.json("/api/platform/library");update {it.copy(likes=x.songs("likes"),history=x.songs("history"),playlists=x.getJSONArray("playlists").objects())}}}
    fun createPlaylist(name:String){if(!signedIn())return;action {graph.api.json("/api/listener/playlists",JSONObject().put("name",name),LaeApi.key());library();message("Playlist created.")}}
    fun addToPlaylist(song:Song,id:String){action {graph.api.json("/api/listener/playlist/tracks",JSONObject().put("playlistId",id).put("trackId",song.id).put("action","add"));message("Song added to your playlist.");dismiss()}}
    fun playlist(id:String){action {val x=graph.api.json("/api/listener/playlist/tracks?playlistId=$id");update {it.copy(sheet="playlist",artistSongs=x.songs())}}}
    fun save(song:Song){if(!signedIn())return;action {graph.offline.enqueue(song);loadDownloads();message("Download queued. Open Downloads to follow its progress.")}}
    fun loadDownloads(){viewModelScope.launch(Dispatchers.IO) {val rows=graph.session.owner?.let {graph.offline.db.rows(it)}.orEmpty();withContext(Dispatchers.Main){update {it.copy(downloads=rows)}}}}
    fun pauseDownload(song:Song){graph.session.owner?.let {graph.offline.pause(it,song)};loadDownloads()}
    fun deleteDownload(song:Song){graph.session.owner?.let {owner->if(playerOffline() && state.value.current==song.id)controller?.stop();graph.offline.delete(owner,song)};loadDownloads()}
    fun openLink(uri:android.net.Uri?){if(uri?.scheme!="https" || uri.host !in setOf("lae-music.com","lae-music.onrender.com"))return;val id=uri.getQueryParameter("track") ?: uri.getQueryParameter("play") ?: return;if(!Regex("[1-9][0-9]{0,15}").matches(id))return;action {val song=Song.from(graph.api.json("/api/music/track/$id").getJSONObject("track"));update {it.copy(tracks=(listOf(song)+it.tracks).distinctBy {s->s.id},tab=Destination.DISCOVER,explore=false)};play(song)}}
    private fun signedIn():Boolean {if(graph.session.owner!=null)return true;show("login");return false}
    private fun error(e:Exception)=if(e is ApiException)e.message ?: "Please try again." else if(e is IllegalArgumentException || e is IllegalStateException)e.message ?: "Please try again." else "Could not connect. Check your internet and try again."
    private fun action(block:suspend ()->Unit){viewModelScope.launch {update {it.copy(busy=true)};try {block()}catch(e:Exception){if(e !is CancellationException)message(error(e))}finally {update {it.copy(busy=false)}}}}
    override fun onCleared(){MediaController.releaseFuture(future);super.onCleared()}
}
