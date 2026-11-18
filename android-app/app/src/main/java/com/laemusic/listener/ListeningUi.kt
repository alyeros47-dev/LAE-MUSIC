@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package com.laemusic.listener

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import kotlinx.coroutines.launch

private val Purple=Color(0xFFAB7CFF)
@Composable fun ListeningApp(model:ListeningViewModel) {
    val s by model.state.collectAsStateWithLifecycle();val snack=remember {SnackbarHostState()};val context=LocalContext.current
    LaunchedEffect(s.message){s.message?.let {snack.showSnackbar(it);model.message(null)}}
    Scaffold(containerColor=Color(0xFF09080F),snackbarHost={SnackbarHost(snack)},topBar={Column(Modifier.statusBarsPadding()){
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal=16.dp),verticalAlignment=Alignment.CenterVertically){
            Image(painterResource(R.drawable.lae_logo_wide),"LAE-MUSIC",Modifier.width(156.dp).height(48.dp),contentScale=ContentScale.Fit)
            Spacer(Modifier.weight(1f));IconButton(onClick={model.show("search")}){Icon(Icons.Rounded.Search,"Search music")}
            FilledTonalButton(onClick={model.show("premium")},contentPadding=PaddingValues(horizontal=14.dp)){Text("Premium",fontSize=13.sp)}
        }
        if(s.tab==Destination.DISCOVER)Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Center){
            TextButton(onClick={model.explore(false)}){Text("Discover",fontWeight=if(!s.explore)FontWeight.Bold else FontWeight.Normal,color=if(!s.explore)Color.White else Color.Gray)}
            TextButton(onClick={model.explore(true)}){Text("Explore",fontWeight=if(s.explore)FontWeight.Bold else FontWeight.Normal,color=if(s.explore)Color.White else Color.Gray)}
        }
    }},bottomBar={NavigationBar(containerColor=Color(0xFF110E19),tonalElevation=0.dp){
        val icons=listOf(Icons.Rounded.Home,Icons.Rounded.AutoAwesome,Icons.Rounded.LibraryMusic,Icons.Rounded.Download,Icons.Rounded.Person)
        Destination.entries.forEachIndexed {i,d->NavigationBarItem(selected=s.tab==d,onClick={model.select(d)},icon={Icon(icons[i],d.title)},label={Text(d.title,fontSize=11.sp)},colors=NavigationBarItemDefaults.colors(indicatorColor=Purple.copy(alpha=.18f),selectedIconColor=Purple,selectedTextColor=Color.White))}
    }}){padding->Column(Modifier.padding(padding).fillMaxSize()){
        Box(Modifier.weight(1f)){when(s.tab){
            Destination.DISCOVER->if(s.explore)Browse(s,model,true) else Discover(s,model)
            Destination.HOME->Browse(s,model,false)
            Destination.MUSIC->MyMusic(s,model)
            Destination.DOWNLOADS->Downloads(s,model)
            Destination.PROFILE->Profile(s,model)
        }}
        if(s.tab!=Destination.DISCOVER || s.explore)if(s.current!=null)MiniPlayer(s,model)
    }}
    s.sheet?.let {sheet->ModalBottomSheet(onDismissRequest=model::dismiss,containerColor=Color(0xFF17131F)){
        Box(Modifier.padding(horizontal=20.dp).navigationBarsPadding().imePadding()){when(sheet){
            "search"->SearchSheet(s,model)
            "login"->LoginSheet(s,model)
            "premium"->PremiumSheet(s)
            "comments"->s.selected?.let {Comments(s,model,it)}
            "artist"->Column {Text(s.selected?.artist.orEmpty(),style=MaterialTheme.typography.headlineSmall);SongList(s.artistSongs){model.play(it,s.artistSongs)} }
            "playlist"->SongList(s.artistSongs){model.open(it,s.artistSongs);model.dismiss()}
            "save"->Column(Modifier.padding(bottom=28.dp)){Text("Add to playlist",style=MaterialTheme.typography.headlineSmall);if(s.playlists.isEmpty())Text("Create a playlist in My Music first.");s.playlists.forEach {p->TextButton(onClick={s.selected?.let {model.addToPlaylist(it,p.optString("id"))}}){Text(p.optString("name"))}}}
            "more"->s.selected?.let {song->Column(Modifier.padding(bottom=28.dp)){Text(song.title,style=MaterialTheme.typography.titleLarge);ActionRow(Icons.Rounded.Download,"Save offline"){model.save(song);model.dismiss()};ActionRow(Icons.AutoMirrored.Rounded.PlaylistAdd,"Add to playlist"){model.choosePlaylist(song)};ActionRow(Icons.Rounded.Flag,"Report this song"){model.show("report",song)}}}
            "report"->s.selected?.let {song->var reason by remember {mutableStateOf("")};Column(Modifier.padding(bottom=24.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Text("Report song",style=MaterialTheme.typography.titleLarge);OutlinedTextField(reason,{reason=it},label={Text("What should we review?")},modifier=Modifier.fillMaxWidth());Button(onClick={model.reportSong(song,reason)},enabled=reason.trim().length>=5 && !s.busy){Text("Send for review")}}}
        }}
    }}
}
@Composable private fun Discover(s:ListeningState,model:ListeningViewModel) {
    if(s.tracks.isEmpty()){EmptyState(if(s.loading)"Loading your music…" else "No songs found","Search another title or refresh the catalogue."){model.refresh()};return}
    val pager=rememberPagerState(pageCount={s.tracks.size});var syncing by remember {mutableStateOf(false)}
    LaunchedEffect(s.current,s.tracks.size){val i=s.tracks.indexOfFirst {it.id==s.current};if(i>=0 && i!=pager.currentPage && !pager.isScrollInProgress){syncing=true;pager.scrollToPage(i);syncing=false}}
    LaunchedEffect(pager.settledPage,s.playerReady,s.tracks.size){val song=s.tracks.getOrNull(pager.settledPage);if(song!=null && !syncing && s.playerReady && song.id!=s.current)model.playFeed(song);if(pager.settledPage>=s.tracks.size-5)model.nextPage()}
    VerticalPager(pager,Modifier.fillMaxSize(),beyondViewportPageCount=1,key={s.tracks[it].id}){index->val song=s.tracks[index];FeedCard(song,s,model)}
}
@Composable private fun FeedCard(song:Song,s:ListeningState,model:ListeningViewModel) {
    val context=LocalContext.current;var portrait by remember(song.id){mutableStateOf(false)};val e=s.engagements[song.id]
    LaunchedEffect(song.id){model.engagement(song)}
    Box(Modifier.fillMaxSize().testTag("feed-${song.id}").background(Color(0xFF100B1B))){
        AsyncImage(song.artwork,null,Modifier.fillMaxSize().blur(32.dp),contentScale=ContentScale.Crop,alpha=.45f)
        AsyncImage(song.artwork,"Artwork for ${song.title}",Modifier.fillMaxSize(),contentScale=if(portrait)ContentScale.Crop else ContentScale.Fit,onSuccess={portrait=it.result.drawable.intrinsicHeight.toFloat()/it.result.drawable.intrinsicWidth.coerceAtLeast(1)>1.35f})
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha=.04f),Color.Transparent,Color.Black.copy(alpha=.35f),Color.Black.copy(alpha=.96f)))))
        if(s.buffering && s.current==song.id)CircularProgressIndicator(Modifier.align(Alignment.Center).size(34.dp),color=Purple,strokeWidth=3.dp)
        Column(Modifier.align(Alignment.CenterEnd).padding(end=8.dp).width(60.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(14.dp)){
            Box(Modifier.height(66.dp),contentAlignment=Alignment.TopCenter){
                AsyncImage("${BuildConfig.API_ORIGIN}/api/artist/photo?id=${song.artistId}","View ${song.artist}'s profile",Modifier.size(46.dp).clip(CircleShape).background(Purple.copy(alpha=.3f)).clickable {model.show("artist",song)},contentScale=ContentScale.Crop,error=painterResource(R.drawable.lae_logo_square))
                FilledIconButton(onClick={model.follow(song)},modifier=Modifier.align(Alignment.BottomCenter).size(26.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=Purple)){Icon(if(e?.following==true)Icons.Rounded.Check else Icons.Rounded.Add,if(e?.following==true)"Unfollow artist" else "Follow artist",Modifier.size(17.dp))}
            }
            FeedAction(if(e?.liked==true)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,e?.likes?.toString() ?: "—","Like song",if(e?.liked==true)Color(0xFFFF6CA9) else Color.White){model.like(song)}
            FeedAction(Icons.AutoMirrored.Rounded.Chat,e?.comments?.toString() ?: "—","Open comments"){model.show("comments",song)}
            FeedAction(Icons.Rounded.Share,"Share","Share song"){context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"${song.title} — ${song.artist}\n${song.shareUrl}"),"Share LAE-MUSIC"))}
            IconButton(onClick={model.show("more",song)}){Icon(Icons.Rounded.MoreHoriz,"More song options",tint=Color.White)}
        }
        Column(Modifier.align(Alignment.BottomStart).padding(start=20.dp,end=80.dp,bottom=120.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
            Text(song.artist,Modifier.clickable {model.show("artist",song)},fontWeight=FontWeight.SemiBold,fontSize=16.sp,color=Color(0xFFDDD0FF),maxLines=1,overflow=TextOverflow.Ellipsis)
            Text(song.title,fontSize=29.sp,lineHeight=32.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis)
            if(song.genre.isNotBlank())Text(song.genre,fontSize=12.sp,color=Color.White.copy(alpha=.85f))
            if(song.description.isNotBlank())Text(song.description,fontSize=13.sp,maxLines=2,overflow=TextOverflow.Ellipsis,color=Color(0xFFDDD9E4))
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(start=16.dp,end=16.dp,bottom=10.dp)){
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text(time(s.position),fontSize=11.sp,color=Color.LightGray);Slider(value=if(s.duration>0)(s.position.toFloat()/s.duration).coerceIn(0f,1f) else 0f,onValueChange=model::seek,modifier=Modifier.weight(1f).height(30.dp));Text(time(s.duration),fontSize=11.sp,color=Color.LightGray)}
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically){IconButton(onClick=model::previous){Icon(Icons.Rounded.SkipPrevious,"Previous song")};FilledIconButton(onClick=model::toggle,modifier=Modifier.size(52.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=Purple)){Icon(if(s.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(s.playing)"Pause" else "Play")};IconButton(onClick=model::next){Icon(Icons.Rounded.SkipNext,"Next song")}}
        }
    }
}
@Composable private fun FeedAction(icon:ImageVector,label:String,description:String,color:Color=Color.White,onClick:()->Unit){Column(horizontalAlignment=Alignment.CenterHorizontally){IconButton(onClick=onClick,modifier=Modifier.size(46.dp)){Icon(icon,description,tint=color,modifier=Modifier.size(30.dp))};Text(label,fontSize=11.sp,fontWeight=FontWeight.Medium)}}
@Composable private fun Browse(s:ListeningState,model:ListeningViewModel,explore:Boolean){LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(18.dp)){
    item{Text(if(explore)"Find your next favourite." else "Your sound. Your space.",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)}
    if(explore){item{LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){item{FilterChip(selected=s.genre.isEmpty(),onClick={model.search(s.query)},label={Text("All music")})};items(s.genres){genre->FilterChip(selected=s.genre==genre,onClick={model.search(s.query,genre)},label={Text(genre)})}}}}
    if(s.history.isNotEmpty() && !explore){item{SectionTitle("Recently played")};items(s.history.take(5),key={"history:"+it.id}){SongRow(it){model.open(it,s.history)}}}
    if(s.featuredArtists.isNotEmpty()){item{SectionTitle("Featured artists")};item{LazyRow(horizontalArrangement=Arrangement.spacedBy(16.dp)){items(s.featuredArtists){artist->Column(Modifier.width(100.dp).clickable {model.artist(artist.optString("id"))},horizontalAlignment=Alignment.CenterHorizontally){AsyncImage("${BuildConfig.API_ORIGIN}/api/artist/photo?id=${artist.optString("id")}",artist.optString("display_name"),Modifier.size(80.dp).clip(CircleShape),contentScale=ContentScale.Crop,error=painterResource(R.drawable.lae_logo_square));Text(artist.optString("display_name"),fontSize=12.sp,maxLines=2)}}}}}
    if(s.popular.isNotEmpty()){item{SectionTitle("Trending songs")};item{LazyRow(horizontalArrangement=Arrangement.spacedBy(14.dp)){items(s.popular.take(10)){song->Column(Modifier.width(150.dp).clickable {model.open(song,s.popular)}){AsyncImage(song.artwork,song.title,Modifier.size(150.dp).clip(RoundedCornerShape(14.dp)),contentScale=ContentScale.Crop);Text(song.title,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis);Text(song.artist,fontSize=12.sp,color=Color.LightGray,maxLines=1)}}}}}
    item{SectionTitle(if(s.query.isNotBlank())"Search results" else "Recently released")}
    if(s.loading)item{CircularProgressIndicator()}
    items(s.tracks,key={"track:"+it.id}){SongRow(it){model.open(it)}}
    if(s.hasMore)item{TextButton(onClick=model::nextPage){Text("Load more music")}}
}}
@Composable private fun MyMusic(s:ListeningState,model:ListeningViewModel){if(s.user==null){EmptyState("Your music, together.","Sign in to find your liked songs, playlists and listening history."){model.show("login")};return};var playlist by remember{mutableStateOf("")};LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
    item{Text("My Music",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)}
    item{SectionTitle("Playlists");Row(verticalAlignment=Alignment.CenterVertically){OutlinedTextField(playlist,{playlist=it},label={Text("New playlist")},singleLine=true,modifier=Modifier.weight(1f));IconButton(onClick={model.createPlaylist(playlist);playlist=""},enabled=playlist.trim().isNotEmpty()){Icon(Icons.Rounded.Add,"Create playlist")}}}
    items(s.playlists){p->ListItem(headlineContent={Text(p.optString("name"))},supportingContent={Text("${p.optInt("song_count")} songs")},leadingContent={Icon(Icons.AutoMirrored.Rounded.QueueMusic,null)},modifier=Modifier.clickable {model.playlist(p.optString("id"))})}
    item{SectionTitle("Liked songs")};if(s.likes.isEmpty())item{Text("Tap a song’s heart to save it here.",color=Color.LightGray)};items(s.likes){SongRow(it){model.open(it,s.likes)}}
    item{SectionTitle("Listening history")};items(s.history){SongRow(it){model.open(it,s.history)}}
}}
@Composable private fun Downloads(s:ListeningState,model:ListeningViewModel){if(s.user==null){EmptyState("Your offline library","Sign in to the account with Premium listening."){model.show("login")};return};LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
    item{Text("Downloads",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold);Text("Saved on this device. Reconnect daily to refresh your offline access.",fontSize=13.sp,color=Color.LightGray)}
    if(s.downloads.isEmpty())item{Text("Use a song’s menu to save it for offline listening.",Modifier.padding(vertical=24.dp))}
    items(s.downloads,key={it.song.id}){row->Column(Modifier.fillMaxWidth().background(Color(0xFF17131F),RoundedCornerShape(16.dp)).padding(12.dp)){
        SongRow(row.song){model.open(row.song,s.downloads.filter {it.status=="ready"}.map {it.song},true)}
        Text(when(row.status){"ready"->"Saved on this device";"downloading"->"Saving · ${row.progress}%";"queued"->"Waiting to save";"paused"->"Paused";else->row.error ?: "Download failed"},fontSize=12.sp,color=Color.LightGray)
        if(row.status=="downloading")LinearProgressIndicator(progress={row.progress/100f},modifier=Modifier.fillMaxWidth())
        Row {if(row.status in listOf("queued","downloading"))TextButton(onClick={model.pauseDownload(row.song)}){Text("Pause")} else if(row.status!="ready")TextButton(onClick={model.save(row.song)}){Text("Retry")};Spacer(Modifier.weight(1f));TextButton(onClick={model.deleteDownload(row.song)}){Text("Delete")}}
    }}
    item{TextButton(onClick={model.refreshDownloads()}){Text("Refresh offline access")}}
}}
@Composable private fun Profile(s:ListeningState,model:ListeningViewModel){val context=LocalContext.current;Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.spacedBy(20.dp)){
    Text("Profile",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)
    if(s.user==null){Text("Use your existing LAE-MUSIC listening account.");Button(onClick={model.show("login")}){Text("Sign in")}}else{
        Text(s.user.optString("display_name"),style=MaterialTheme.typography.headlineSmall);Text(s.user.optString("email"),color=Color.LightGray)
        ListItem(headlineContent={Text(if(s.premium?.optBoolean("active")==true)"Premium listening is active" else "Free listening")},supportingContent={Text("Your access is checked with LAE-MUSIC.")},leadingContent={Icon(Icons.Rounded.Verified,null)})
        Text("Listening settings",style=MaterialTheme.typography.titleLarge);Row(verticalAlignment=Alignment.CenterVertically){Text("Continuous play",Modifier.weight(1f));Switch(s.continuous,model::continuous)};Row(verticalAlignment=Alignment.CenterVertically){Text("Data saving",Modifier.weight(1f));Switch(s.dataSaver,model::dataSaver)};Text("Data saving turns off upcoming audio preloads. Headphone and Bluetooth controls follow Android settings.",fontSize=13.sp,color=Color.LightGray)
        TextButton(onClick={model.show("premium")}){Text("Subscription details")}
        TextButton(onClick={context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/account/subscriptions")))}){Text("Manage Google Play subscriptions")}
        TextButton(onClick={context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("${BuildConfig.API_ORIGIN}/account?role=listener")))}){Text("Manage account") }
        TextButton(onClick=model::logout){Text("Sign out")}
    }
    Spacer(Modifier.height(12.dp));Row {TextButton(onClick={context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("${BuildConfig.API_ORIGIN}/about")))}){Text("About LAE-MUSIC")};TextButton(onClick={context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("${BuildConfig.API_ORIGIN}/publishing-policy")))}){Text("Publishing policy")}}
}}
@Composable private fun SearchSheet(s:ListeningState,model:ListeningViewModel){var query by remember{mutableStateOf(s.query)};Column(Modifier.padding(bottom=30.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){Text("Search music",style=MaterialTheme.typography.headlineSmall);OutlinedTextField(query,{query=it},label={Text("Song, artist or genre")},singleLine=true,modifier=Modifier.fillMaxWidth());Button(onClick={model.search(query);model.explore(true);model.select(Destination.DISCOVER);model.dismiss()},modifier=Modifier.fillMaxWidth()){Text("Search")}}}
@Composable private fun LoginSheet(s:ListeningState,model:ListeningViewModel){var email by remember{mutableStateOf("")};var password by remember{mutableStateOf("")};var show by remember{mutableStateOf(false)};var connectArtist by remember{mutableStateOf(false)};val context=LocalContext.current;Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom=26.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
    Text("Welcome back.",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold);Text("Sign in with your LAE-MUSIC listening account.",fontSize=14.sp)
    OutlinedTextField(email,{email=it},label={Text("Email address")},singleLine=true,keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=androidx.compose.ui.text.input.KeyboardType.Email),modifier=Modifier.fillMaxWidth())
    OutlinedTextField(password,{password=it},label={Text("Password")},singleLine=true,keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=androidx.compose.ui.text.input.KeyboardType.Password),visualTransformation=if(show)VisualTransformation.None else PasswordVisualTransformation(),trailingIcon={IconButton(onClick={show=!show}){Icon(if(show)Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,if(show)"Hide password" else "Show password")}},modifier=Modifier.fillMaxWidth())
    Row(verticalAlignment=Alignment.CenterVertically){Checkbox(connectArtist,{connectArtist=it});Text("Connect listening to my existing artist account",fontSize=13.sp)}
    Button(onClick={model.login(email,password,connectArtist);password=""},enabled=email.isNotBlank() && password.isNotEmpty() && !s.busy,modifier=Modifier.fillMaxWidth()){if(s.busy)CircularProgressIndicator(Modifier.size(20.dp),strokeWidth=2.dp) else Text("Sign in")}
    TextButton(onClick={context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("${BuildConfig.API_ORIGIN}/recover")))}){Text("Forgot password?")}
}}
@Composable private fun PremiumSheet(s:ListeningState){Column(Modifier.padding(bottom=28.dp),verticalArrangement=Arrangement.spacedBy(15.dp)){
    Icon(Icons.Rounded.WorkspacePremium,null,tint=Purple,modifier=Modifier.size(40.dp));Text("More music. Wherever you go.",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)
    Text("Premium listening includes protected offline saves inside LAE-MUSIC.")
    if(s.premium?.optBoolean("active")==true) {Text("Your Premium listening is active.",color=Color(0xFFB4EAC6));s.premium.optJSONObject("current")?.optString("expires_at")?.takeIf{it.isNotBlank()}?.let {Text("Valid until ${it.take(10)}")}}
    else Text("Google Play purchases are not available in this inspection build. Existing paid listening access is checked when you sign in.",color=Color.LightGray,fontSize=14.sp)
}}
@Composable private fun Comments(s:ListeningState,model:ListeningViewModel,song:Song){var text by remember(song.id){mutableStateOf("")};Column(Modifier.fillMaxWidth().fillMaxHeight(.75f)){
    Text("Comments",style=MaterialTheme.typography.headlineSmall);LazyColumn(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(12.dp),contentPadding=PaddingValues(vertical=16.dp)){if(s.comments.isEmpty())item{Text("No comments yet.",color=Color.Gray)};items(s.comments){c->Row {Column(Modifier.weight(1f)){Text(c.optString("author"),fontWeight=FontWeight.Bold,fontSize=13.sp);Text(c.optString("body"),fontSize=14.sp)};IconButton(onClick={model.reportComment(c.optString("id"))}){Icon(Icons.Rounded.Flag,"Report comment",Modifier.size(18.dp))}}}}
    Row(Modifier.padding(bottom=16.dp),verticalAlignment=Alignment.CenterVertically){OutlinedTextField(text,{text=it.take(1000)},label={Text("Add a comment")},modifier=Modifier.weight(1f),maxLines=3);IconButton(onClick={model.comment(song,text);text=""},enabled=text.trim().isNotEmpty() && !s.busy){Icon(Icons.AutoMirrored.Rounded.Send,"Post comment")}}
}}
@Composable private fun MiniPlayer(s:ListeningState,model:ListeningViewModel){val song=(s.tracks+s.downloads.map{it.song}).find {it.id==s.current};Row(Modifier.fillMaxWidth().background(Color(0xFF211A30)).padding(horizontal=12.dp,vertical=6.dp),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f).clickable {model.select(Destination.DISCOVER);model.explore(false)}){Text(song?.title ?: "Now playing",maxLines=1,fontWeight=FontWeight.SemiBold);Text(song?.artist.orEmpty(),fontSize=12.sp,color=Color.LightGray)};IconButton(onClick=model::toggle){Icon(if(s.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(s.playing)"Pause" else "Play")};IconButton(onClick=model::next){Icon(Icons.Rounded.SkipNext,"Next song")}}}
@Composable private fun SongRow(song:Song,onClick:()->Unit){Row(Modifier.fillMaxWidth().clickable(onClick=onClick).padding(vertical=6.dp),verticalAlignment=Alignment.CenterVertically){AsyncImage(song.artwork,null,Modifier.size(54.dp).clip(RoundedCornerShape(9.dp)).background(Color(0xFF2A203A)),contentScale=ContentScale.Crop);Column(Modifier.weight(1f).padding(horizontal=12.dp)){Text(song.title,maxLines=1,overflow=TextOverflow.Ellipsis,fontWeight=FontWeight.SemiBold);Text(song.artist,maxLines=1,color=Color.LightGray,fontSize=13.sp)};Icon(Icons.Rounded.PlayArrow,"Play ${song.title}",tint=Purple)}}
@Composable private fun SongList(songs:List<Song>,click:(Song)->Unit){LazyColumn(Modifier.fillMaxWidth().heightIn(max=480.dp),contentPadding=PaddingValues(bottom=24.dp)){items(songs){SongRow(it){click(it)}}}}
@Composable private fun ActionRow(icon:ImageVector,label:String,action:()->Unit){Row(Modifier.fillMaxWidth().clickable(onClick=action).padding(vertical=18.dp),verticalAlignment=Alignment.CenterVertically){Icon(icon,null,Modifier.padding(end=14.dp));Text(label)}}
@Composable private fun SectionTitle(text:String){Text(text,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)}
@Composable private fun EmptyState(title:String,detail:String,action:()->Unit){Column(Modifier.fillMaxSize().padding(28.dp),verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally){Icon(Icons.Rounded.MusicNote,null,tint=Purple,modifier=Modifier.size(50.dp));Text(title,style=MaterialTheme.typography.headlineSmall,modifier=Modifier.padding(vertical=16.dp));Text(detail,color=Color.LightGray);TextButton(onClick=action){Text("Continue")}}}
private fun time(ms:Long):String {val sec=ms.coerceAtLeast(0)/1000;return "${sec/60}:${(sec%60).toString().padStart(2,'0')}"}
