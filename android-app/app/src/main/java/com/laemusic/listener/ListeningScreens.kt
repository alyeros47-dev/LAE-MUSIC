@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package com.laemusic.listener

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import org.json.JSONObject
import java.util.Locale

@Composable internal fun BrandHeader(model:ListeningViewModel) {
    Row(Modifier.fillMaxWidth().height(59.dp).padding(horizontal=15.dp),verticalAlignment=Alignment.CenterVertically){
        Image(painterResource(R.drawable.lae_logo_square),"LAE-MUSIC logo",Modifier.size(37.dp),contentScale=ContentScale.Fit)
        Column(Modifier.weight(1f).padding(start=7.dp)){
            Text("LAE-MUSIC",fontSize=20.sp,fontWeight=FontWeight.Bold,letterSpacing=.25.sp,maxLines=1)
            Text("Music streaming",fontSize=11.sp,color=Color(0xFFCBC5D2),maxLines=1)
        }
        IconButton(onClick={model.show("search")}){Icon(Icons.Rounded.Search,"Search music",Modifier.size(25.dp))}
        Button(onClick={model.show("premium")},shape=RoundedCornerShape(10.dp),contentPadding=PaddingValues(horizontal=10.dp,vertical=5.dp),
            colors=ButtonDefaults.buttonColors(containerColor=Purple),modifier=Modifier.height(33.dp)){
            Icon(Icons.Rounded.WorkspacePremium,null,Modifier.size(15.dp));Spacer(Modifier.width(3.dp));Text("Premium",fontSize=11.sp,fontWeight=FontWeight.SemiBold)
        }
    }
}

@Composable internal fun DiscoveryTabs(s:ListeningState,model:ListeningViewModel) {
    Row(Modifier.fillMaxWidth().padding(start=17.dp,bottom=6.dp),horizontalArrangement=Arrangement.spacedBy(24.dp)){
        listOf("Discover" to false,"Explore" to true).forEach {(label,explore)->
            Column(Modifier.testTag("top-tab-$label").clickable {model.explore(explore)}.padding(top=8.dp),horizontalAlignment=Alignment.CenterHorizontally){
                Text(label,color=if(s.explore==explore)Color.White else Color(0xFFC1B9CA),fontSize=16.sp,fontWeight=if(s.explore==explore)FontWeight.Bold else FontWeight.Medium)
                Spacer(Modifier.height(7.dp))
                Box(Modifier.width(76.dp).height(3.dp).clip(CircleShape).background(if(s.explore==explore)Purple else Color.Transparent))
            }
        }
    }
}

@Composable internal fun ListeningNavigation(s:ListeningState,model:ListeningViewModel,immersive:Boolean) {
    Box(Modifier.fillMaxWidth().background(if(immersive)Brush.verticalGradient(listOf(Color.Transparent,Color.Black.copy(alpha=.92f))) else Brush.verticalGradient(listOf(AppBackground,AppBackground)))){
        NavigationBar(containerColor=Color.Transparent,tonalElevation=0.dp){
            val icons=listOf(Icons.Rounded.Home,Icons.Rounded.Explore,Icons.Rounded.MusicNote,Icons.Rounded.Download,Icons.Rounded.PersonOutline)
            Destination.entries.forEachIndexed {i,d->NavigationBarItem(
                modifier=Modifier.testTag("bottom-nav-${d.title}"),selected=s.tab==d,onClick={model.select(d)},
                icon={Icon(icons[i],d.title,Modifier.size(25.dp))},label={Text(d.title,fontSize=10.sp,maxLines=1)},
                colors=NavigationBarItemDefaults.colors(indicatorColor=Color.Transparent,selectedIconColor=Purple,selectedTextColor=Purple,
                    unselectedIconColor=Color(0xFFCECAD5),unselectedTextColor=Color(0xFFCECAD5)))}
        }
    }
}

@Composable internal fun SlimSeek(s:ListeningState,model:ListeningViewModel,modifier:Modifier=Modifier) {
    val fraction=if(s.duration>0)(s.position.toFloat()/s.duration).coerceIn(0f,1f) else 0f
    Slider(value=fraction,onValueChange=model::seek,modifier=modifier,
        thumb={Box(Modifier.size(8.dp).clip(CircleShape).background(Color.White))},
        track={Box(Modifier.fillMaxWidth().height(3.dp).clip(CircleShape).background(Color.White.copy(alpha=.28f))){
            Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().background(Purple))
        }})
}

/** All recommendations are existing published songs; no invented engagement. */
internal fun listeningRecommendations(releases:List<Song>,popular:List<Song>,likes:List<Song>,history:List<Song>):List<Song> {
    val genres=(likes+history).map {it.genre.lowercase(Locale.ROOT)}.filter {it.isNotBlank()}.toSet()
    val heard=history.map {it.id}.toSet()
    return (popular+releases).distinctBy {it.id}.filterNot {it.id in heard}
        .sortedByDescending {if(it.genre.lowercase(Locale.ROOT) in genres)1 else 0}.take(12)
}

@Composable internal fun HomeScreen(s:ListeningState,model:ListeningViewModel) {
    val heroes=s.featuredSongs.ifEmpty {s.releases.take(4)}
    val recommendations=listeningRecommendations(s.releases,s.popular,s.likes,s.history)
    LazyColumn(Modifier.fillMaxSize().testTag("home-screen"),contentPadding=PaddingValues(start=14.dp,end=14.dp,bottom=18.dp),verticalArrangement=Arrangement.spacedBy(21.dp)){
        item {HomeShortcuts(model)}
        if(heroes.isNotEmpty())item {FeaturedSongs(heroes,s,model,s.featuredSongs.isNotEmpty())}
        else if(s.loading)item {CircularProgressIndicator(Modifier.padding(24.dp),color=Purple)}
        else item {Text("Music will appear here as it is published.",color=Color.LightGray)}
        if(s.popular.isNotEmpty()){
            item {ShelfHeading("Trending songs"){model.collection("Trending songs",s.popular)}}
            item {SongCards(s.popular,s,model)}
        }
        item {ShelfHeading("Recently played",if(s.history.isEmpty())null else ({model.collection("Recently played",s.history)}))}
        if(s.history.isEmpty())item {Text(if(s.user==null)"Sign in to see your listening history." else "Your recently played songs will appear here.",fontSize=12.sp,color=Color(0xFFA7A1B1))}
        else items(s.history.take(3),key={"recent:${it.id}"}){ListeningSongRow(it,s.history,s,model)}
        if(recommendations.isNotEmpty()){
            item {ShelfHeading(if(s.likes.isEmpty() && s.history.isEmpty())"Recommended music" else "Recommended for you"){model.collection("Recommended music",recommendations)}}
            item {SongCards(recommendations,s,model)}
        }
    }
}

@Composable private fun HomeShortcuts(model:ListeningViewModel) {
    LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        item {Shortcut("Home",true){model.select(Destination.HOME)}}
        item {Shortcut("Discover",false){model.select(Destination.DISCOVER);model.explore(false)}}
        item {Shortcut("Playlists",false){model.select(Destination.MUSIC)}}
        item {Shortcut("Premium",false){model.show("premium")}}
    }
}
@Composable private fun Shortcut(title:String,active:Boolean,click:()->Unit){
    Surface(onClick=click,color=if(active)Purple else Panel,shape=CircleShape){Text(title,Modifier.padding(horizontal=18.dp,vertical=11.dp),fontSize=13.sp,fontWeight=FontWeight.SemiBold)}
}
@Composable private fun FeaturedSongs(songs:List<Song>,s:ListeningState,model:ListeningViewModel,curated:Boolean) {
    val pager=rememberPagerState(pageCount={songs.size})
    Column(verticalArrangement=Arrangement.spacedBy(9.dp)){
        HorizontalPager(pager,key={songs[it].id},pageSpacing=10.dp){index->val song=songs[index]
            Box(Modifier.fillMaxWidth().aspectRatio(1.65f).clip(RoundedCornerShape(19.dp)).background(Panel).testTag("featured-song").clickable {model.play(song,songs)}){
                AsyncImage(song.artwork,"Featured artwork for ${song.title}",Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha=.32f),Color.Transparent,Color.Black.copy(alpha=.85f)))))
                Row(Modifier.align(Alignment.TopStart).fillMaxWidth().padding(13.dp),verticalAlignment=Alignment.CenterVertically){
                    Text("Featured song",fontSize=17.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
                    Surface(color=Purple,shape=CircleShape){Text(if(curated)"Featured" else "Listen now",Modifier.padding(horizontal=10.dp,vertical=5.dp),fontSize=10.sp,fontWeight=FontWeight.SemiBold)}
                }
                Column(Modifier.align(Alignment.BottomStart).padding(start=15.dp,end=73.dp,bottom=17.dp)){
                    Text(song.title,fontSize=24.sp,lineHeight=27.sp,fontWeight=FontWeight.Bold,maxLines=2,overflow=TextOverflow.Ellipsis)
                    Text(song.artist,fontSize=12.sp,color=Color(0xFFE1DBE8),maxLines=1)
                }
                FilledIconButton(onClick={if(s.current==song.id)model.toggle() else model.play(song,songs)},
                    modifier=Modifier.align(Alignment.BottomEnd).padding(14.dp).size(42.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=Color.White,contentColor=Color.Black)){
                    Icon(if(s.current==song.id && s.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,if(s.current==song.id && s.playing)"Pause featured song" else "Play featured song")
                }
            }
        }
        if(songs.size>1)Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(5.dp,Alignment.CenterHorizontally)){
            repeat(songs.size){i->Box(Modifier.width(if(pager.currentPage==i)14.dp else 5.dp).height(5.dp).clip(CircleShape).background(if(pager.currentPage==i)Purple else Color.White.copy(alpha=.32f)))}
        }
    }
}

@Composable internal fun ExploreScreen(s:ListeningState,model:ListeningViewModel) {
    val artists=s.featuredArtists.ifEmpty {s.artists}
    val trending=s.popular.filter {s.genre.isEmpty() || it.genre==s.genre}
    val filtered=s.query.isNotBlank() || s.genre.isNotEmpty()
    LazyColumn(Modifier.fillMaxSize().testTag("explore-screen"),contentPadding=PaddingValues(start=14.dp,end=14.dp,top=14.dp,bottom=22.dp),verticalArrangement=Arrangement.spacedBy(19.dp)){
        item {Row(verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){
            Text("Discover music",fontSize=25.sp,fontWeight=FontWeight.Bold)
            Text("Find songs and artists you love.",fontSize=12.sp,color=Color(0xFFB9B3C4))
        };FilledIconButton(onClick={model.show("categories")},colors=IconButtonDefaults.filledIconButtonColors(containerColor=Purple)){Icon(Icons.Rounded.Tune,"Filter music")}}}
        if(s.genres.isNotEmpty()){
            item {ShelfHeading("Browse by category"){model.show("categories")}}
            item {LazyRow(horizontalArrangement=Arrangement.spacedBy(9.dp)){items(s.genres,key={it}){CategoryCard(it,s.genre==it){model.search("",it)}}}}
        }
        if(artists.isNotEmpty()){
            item {ShelfHeading(if(s.featuredArtists.isNotEmpty())"Featured artists" else "Artists to discover"){model.show("artists")}}
            item {ArtistShelf(artists,model)}
        }
        if(filtered){
            item {ShelfHeading(if(s.query.isNotBlank())"Search results" else s.genre)}
            if(s.loading)item {CircularProgressIndicator(color=Purple)}
            else if(s.results.isEmpty())item {Text("No songs found. Try another search.",fontSize=13.sp,color=Color.LightGray)}
            items(s.results,key={"result:${it.id}"}){ListeningSongRow(it,s.results,s,model)}
            if(s.hasMore)item {TextButton(onClick=model::nextPage){Text("More songs")}}
        } else {
            if(trending.isNotEmpty()){
                item {ShelfHeading("Trending now"){model.collection("Trending songs",trending)}}
                items(trending.take(5),key={"trending:${it.id}"}){ListeningSongRow(it,trending,s,model)}
            }
            if(s.releases.isNotEmpty()){
                item {ShelfHeading("Recently released"){model.collection("Recently released",s.releases)}}
                items(s.releases.take(5),key={"release:${it.id}"}){ListeningSongRow(it,s.releases,s,model)}
            }
        }
    }
}

@Composable private fun SongCards(songs:List<Song>,s:ListeningState,model:ListeningViewModel){
    LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){
        items(songs.take(12),key={it.id}){song->Column(Modifier.width(137.dp).clickable {model.play(song,songs)}){
            Box(Modifier.fillMaxWidth().height(157.dp).clip(RoundedCornerShape(14.dp)).background(Panel)){
                AsyncImage(song.artwork,song.title,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                Icon(Icons.Rounded.PlayCircle,"Play ${song.title}",Modifier.align(Alignment.BottomEnd).padding(8.dp).size(27.dp),tint=Color.White)
            }
            Text(song.title,Modifier.padding(top=6.dp),fontSize=12.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
            Text(song.artist,fontSize=10.sp,color=Color(0xFFAAA4B5),maxLines=1,overflow=TextOverflow.Ellipsis)
        }}
    }
}
@Composable private fun ListeningSongRow(song:Song,queue:List<Song>,s:ListeningState,model:ListeningViewModel){
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Panel).clickable {model.play(song,queue)}.padding(9.dp),verticalAlignment=Alignment.CenterVertically){
        AsyncImage(song.artwork,null,Modifier.size(49.dp).clip(RoundedCornerShape(9.dp)),contentScale=ContentScale.Crop)
        Column(Modifier.weight(1f).padding(horizontal=11.dp)){
            Text(song.title,fontSize=13.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
            Text(song.artist,fontSize=11.sp,color=Color(0xFFB7B1C1),maxLines=1)
        }
        if(s.current==song.id && s.duration>0)Text(time(s.duration),fontSize=11.sp,color=Color.LightGray)
        IconButton(onClick={model.show("more",song)}){Icon(Icons.Rounded.MoreVert,"Options for ${song.title}",Modifier.size(20.dp))}
    }
}
@Composable private fun ShelfHeading(title:String,action:(()->Unit)?=null){
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
        Text(title,Modifier.weight(1f),fontSize=19.sp,fontWeight=FontWeight.Bold)
        if(action!=null)TextButton(onClick=action,contentPadding=PaddingValues(horizontal=2.dp)){Text("See all",color=Purple,fontSize=12.sp)}
    }
}
private fun categoryLook(genre:String):Pair<ImageVector,List<Color>> = when {
    genre.contains("worship",true)->Icons.Rounded.VolunteerActivism to listOf(Color(0xFFAF2387),Color(0xFF3E134A))
    genre.contains("praise",true)->Icons.Rounded.Church to listOf(Color(0xFF8C32C1),Color(0xFF33124F))
    genre.contains("choir",true)->Icons.Rounded.Groups to listOf(Color(0xFF9231B2),Color(0xFF2A174C))
    genre.contains("reggae",true)->Icons.Rounded.MusicNote to listOf(Color(0xFFCB7824),Color(0xFF542A29))
    genre.contains("revival",true)->Icons.Rounded.LocalFireDepartment to listOf(Color(0xFFC82B46),Color(0xFF4C152E))
    else->Icons.Rounded.Public to listOf(Color(0xFF19648F),Color(0xFF162C52))
}
@Composable private fun CategoryCard(genre:String,selected:Boolean,click:()->Unit){
    val (icon,colors)=categoryLook(genre)
    Column(Modifier.width(88.dp).height(95.dp).clip(RoundedCornerShape(14.dp)).background(Brush.verticalGradient(colors))
        .border(if(selected)2.dp else 0.dp,if(selected)Color.White else Color.Transparent,RoundedCornerShape(14.dp)).clickable(onClick=click).padding(9.dp),
        horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
        Icon(icon,null,Modifier.size(28.dp));Spacer(Modifier.height(6.dp));Text(genre,fontSize=11.sp,lineHeight=13.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
    }
}
private fun artistName(artist:JSONObject)=artist.optString("display_name").ifBlank {artist.optString("name")}
@Composable private fun ArtistShelf(artists:List<JSONObject>,model:ListeningViewModel){
    LazyRow(horizontalArrangement=Arrangement.spacedBy(13.dp)){
        items(artists,key={it.optString("id")}){artist->Column(Modifier.width(70.dp).clickable {model.artist(artist.optString("id"))},horizontalAlignment=Alignment.CenterHorizontally){
            ArtistPicture(artist,Modifier.size(66.dp));Text(artistName(artist),Modifier.padding(top=6.dp),fontSize=11.sp,lineHeight=13.sp,maxLines=2,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
        }}
    }
}
@Composable private fun ArtistPicture(artist:JSONObject,modifier:Modifier){
    AsyncImage("${BuildConfig.API_ORIGIN}/api/artist/photo?id=${artist.optString("id")}",artistName(artist),modifier.clip(CircleShape).border(1.dp,Purple.copy(alpha=.6f),CircleShape),contentScale=ContentScale.Crop,error=painterResource(R.drawable.lae_logo_square))
}
@Composable internal fun ArtistSheet(s:ListeningState,model:ListeningViewModel){
    Column {Text("Artists",fontSize=22.sp,fontWeight=FontWeight.Bold);LazyColumn(Modifier.heightIn(max=440.dp),contentPadding=PaddingValues(vertical=14.dp)){
        items(s.featuredArtists.ifEmpty {s.artists},key={it.optString("id")}){artist->Row(Modifier.fillMaxWidth().clickable {model.artist(artist.optString("id"))}.padding(vertical=9.dp),verticalAlignment=Alignment.CenterVertically){
            ArtistPicture(artist,Modifier.size(46.dp));Text(artistName(artist),Modifier.padding(start=13.dp),fontSize=15.sp)
        }}
    }}
}
@Composable internal fun CategorySheet(s:ListeningState,model:ListeningViewModel){
    Column {Text("Choose music",fontSize=22.sp,fontWeight=FontWeight.Bold);LazyColumn(Modifier.heightIn(max=440.dp),contentPadding=PaddingValues(vertical=12.dp)){
        items(listOf("")+s.genres){genre->ListItem(headlineContent={Text(genre.ifEmpty {"All music"})},trailingContent={if(s.genre==genre)Icon(Icons.Rounded.Check,null,tint=Purple)},
            colors=ListItemDefaults.colors(containerColor=Color.Transparent),modifier=Modifier.clickable {model.search("",genre);model.select(Destination.DISCOVER);model.explore(true);model.dismiss()})}
    }}
}
