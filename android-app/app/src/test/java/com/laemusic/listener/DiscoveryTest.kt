package com.laemusic.listener

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class DiscoveryTest {
    private fun song(id:String="1",genre:String="Gospel praise",artist:String=id,plays:Long=0)=Song(id,"Song $id","Artist $artist",artist,genre,plays=plays)
    @Test fun choicesPersistWithoutInventingDefaults(){
        MusicChoice.entries.forEach {c->val p=ListeningPreferences(c,setOf(GospelCategory.PRAISE,GospelCategory.CHOIR));assertEquals(p,ListeningPreferences.from(JSONObject(p.json().toString())))}
        assertThrows(Exception::class.java){ListeningPreferences.from(JSONObject("{\"version\":2,\"choice\":\"BOTH\",\"categories\":[]}"))}
    }
    @Test fun gospelSelectionsAreMultipleAndAllGospelIncludesBroadLabels(){
        val p=ListeningPreferences(MusicChoice.GOSPEL,setOf(GospelCategory.PRAISE,GospelCategory.CHOIR))
        assertTrue(p.accepts(song(genre="Gospel praise")));assertTrue(p.accepts(song(genre="Gospel choir")))
        assertFalse(p.accepts(song(genre="Worship")));assertFalse(p.accepts(song(genre="Gospel & Worship")))
        assertTrue(ListeningPreferences(MusicChoice.GOSPEL).accepts(song(genre="Gospel & Worship")))
    }
    @Test fun bothIncludesSecularAndUnknownButGospelOrSecularNeverGuessUnknown(){
        val unknown=song(genre="Afrwn")
        assertNull(unknown.classification.family);assertEquals("Uncategorized",unknown.displayGenre)
        assertTrue(ListeningPreferences(MusicChoice.BOTH).accepts(unknown))
        for(c in listOf(MusicChoice.GOSPEL,MusicChoice.SECULAR))assertFalse(ListeningPreferences(c).accepts(unknown))
        assertTrue(ListeningPreferences(MusicChoice.SECULAR).accepts(song(genre="Secular")))
        assertNull(song(genre="Afrobeats").classification.family)
        assertFalse(ListeningPreferences(MusicChoice.GOSPEL).accepts(song(genre="Reggae")))
        assertTrue(ListeningPreferences(MusicChoice.GOSPEL,setOf(GospelCategory.GOSPEL_REGGAE)).accepts(song(genre="Gospel Reggae")))
    }
    @Test fun allSixSpecificGospelCategoriesAreRecognizedFromGenre(){
        for((genre,category) in listOf("Praise" to GospelCategory.PRAISE,"Worship" to GospelCategory.WORSHIP,"Gospel reggae" to GospelCategory.GOSPEL_REGGAE,"Gospel choir" to GospelCategory.CHOIR,"Gospel revival" to GospelCategory.REVIVAL,"African gospel" to GospelCategory.AFRICAN_GOSPEL))assertTrue(song(genre=genre).classification.categories.contains(category))
        assertNull(song(genre="Choir").classification.family)
    }
    @Test fun explicitMetadataAllowsGospelAfrobeatsAndRejectsConflicts(){
        val gospel=song(genre="Afrobeats").copy(musicFamily="gospel",gospelCategories=listOf("PRAISE"))
        assertTrue(ListeningPreferences(MusicChoice.GOSPEL,setOf(GospelCategory.PRAISE)).accepts(gospel))
        assertNull(song().copy(musicFamily="secular").classification.family)
        assertNull(song().copy(musicFamily="imaginary").classification.family)
        assertNull(song().copy(gospelCategories=listOf("imaginary")).classification.family)
    }
    @Test fun metadataIsNotInferredFromTitleDescriptionOrArtist(){
        assertNull(song(genre="").copy(title="Praise Gospel",description="Worship",artist="Choir").classification.family)
    }
    @Test fun selectionFiltersNeverFallBackToUnwantedSongs(){
        val result=DiscoveryRanking.order(listOf(song(genre="Afrobeats"),song("2","Afrwn")),ListeningPreferences(MusicChoice.GOSPEL),emptyMap(),"test",100000)
        assertTrue(result.isEmpty())
    }
    @Test fun preloadPauseBufferAndSeeksCannotInventEngagement(){
        val w=DiscoveryListeningWindow("1",120000)
        w.sample(0,0,false);w.sample(1000,0,false);w.sample(2000,100000,true);w.sample(3000,101000,true)
        w.sample(4000,101000,false);w.sample(5000,110000,true);w.discontinuity();w.sample(6000,120000,true)
        assertEquals(1000,w.listenedMs)
        val noAudio=DiscoveryListeningWindow("2",120000);noAudio.sample(0,0,false);noAudio.sample(100000,0,false)
        assertEquals(SongEvidence(),noAudio.finish(SongEvidence(),200000,true))
    }
    private fun window(ms:Long,duration:Long=120000):DiscoveryListeningWindow=DiscoveryListeningWindow("1",duration).apply {sample(0,0,true);for(t in 1000..ms step 1000)sample(t,t,true)}
    @Test fun actualDurationCompletionAndRepeatsAreMeasured(){
        val one=window(110000).finish(SongEvidence(),200000,false)
        assertEquals(110000,one.listenedMs);assertEquals(1,one.meaningful);assertEquals(1,one.completed);assertEquals(0,one.repeats)
        val two=window(40000).finish(one,400000,false);assertEquals(1,two.repeats)
        assertTrue(DiscoveryRanking.score(two)>DiscoveryRanking.score(SongEvidence()))
    }
    @Test fun onlyGenuineEarlyUserSkipsCountAndErrorsAreNotPenalized(){
        assertEquals(1,window(5000).finish(SongEvidence(),100000,true).skips)
        val error=window(5000).finish(SongEvidence(),100000,true,true);assertEquals(0,error.skips);assertEquals(0,error.starts)
        assertEquals(0,window(500).finish(SongEvidence(),100000,true).starts)
        assertEquals(0,window(50000).finish(SongEvidence(),100000,true).skips)
    }
    @Test fun longSleepOrNetworkStallDoesNotBecomeListening(){
        val w=DiscoveryListeningWindow("1",120000);w.sample(0,0,true);w.sample(60000,60000,true);assertEquals(0,w.listenedMs)
        w.sample(61000,60000,true);assertEquals(0,w.listenedMs)
    }
    @Test fun feedbackIsCappedAndUnknownRawPlayCountsCannotBoostRanking(){
        assertTrue(DiscoveryRanking.score(SongEvidence(liked=true,commented=true,saved=1))>DiscoveryRanking.score(SongEvidence()))
        assertTrue(DiscoveryRanking.score(SongEvidence(starts=1,meaningful=1,listenedMs=30000,completionSum=.1))<.1)
        assertEquals(DiscoveryRanking.score(SongEvidence(repeats=3)),DiscoveryRanking.score(SongEvidence(repeats=10000)),0.0001)
        val songs=(1..12).map {song(it.toString())}
        val p=ListeningPreferences(MusicChoice.BOTH)
        assertEquals(DiscoveryRanking.order(songs,p,emptyMap(),"seed",100000).map{it.id},DiscoveryRanking.order(songs.map {it.copy(plays=999999)},p,emptyMap(),"seed",100000).map{it.id})
    }
    @Test fun explorationGivesLowExposureArtistsSpaceWithoutAgePenalty(){
        val songs=(1..25).map {song(it.toString())}
        val evidence=songs.drop(5).associate {it.id to SongEvidence(exposures=200,liked=true,meaningful=5,starts=5,completionSum=5.0)}
        val ranked=DiscoveryRanking.order(songs,ListeningPreferences(MusicChoice.BOTH),evidence,"seed",100000)
        assertTrue(ranked.first().id in songs.take(5).map{it.id})
        assertTrue((ranked.indices step 5).take(5).all {ranked[it].id in songs.take(5).map{it.id}})
        val old=songs.map {it.copy(publishedAt="2000-01-01")};val recent=songs.map {it.copy(publishedAt="2026-11-18")}
        assertEquals(DiscoveryRanking.order(old,ListeningPreferences(MusicChoice.BOTH),evidence,"seed",100000).map{it.id},DiscoveryRanking.order(recent,ListeningPreferences(MusicChoice.BOTH),evidence,"seed",100000).map{it.id})
    }
    @Test fun feedDeduplicatesSongsAndSeparatesArtistsWherePossible(){
        val songs=(1..12).map {song(it.toString(),artist=(it%3).toString())}
        val ranked=DiscoveryRanking.order(songs+songs,ListeningPreferences(MusicChoice.BOTH),emptyMap(),"seed",100000)
        assertEquals(12,ranked.size);assertTrue(ranked.zipWithNext().all {it.first.artistId!=it.second.artistId})
    }
}
