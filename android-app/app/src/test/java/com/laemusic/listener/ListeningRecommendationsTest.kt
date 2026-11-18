package com.laemusic.listener

import org.junit.Assert.*
import org.junit.Test

class ListeningRecommendationsTest {
    private fun song(id:String,genre:String)=Song(id,"Song $id","Artist","9",genre)
    @Test fun recommendationsUsePublishedInputsWithoutDuplicatesOrRecentlyHeardTracks(){
        val a=song("1","Worship");val b=song("2","Praise");val c=song("3","Worship")
        val result=listeningRecommendations(listOf(a,b,c),listOf(a,b),emptyList(),listOf(a))
        assertEquals(setOf("2","3"),result.map {it.id}.toSet());assertEquals(2,result.distinctBy {it.id}.size)
    }
    @Test fun listeningPreferencesRankExistingSongsRatherThanInventingRecommendations(){
        val praise=song("1","Praise");val worship=song("2","Worship")
        val result=listeningRecommendations(listOf(praise,worship),listOf(praise),listOf(song("9","worship")),emptyList())
        assertEquals(listOf("2","1"),result.map {it.id})
    }
    @Test fun anEmptyCatalogueHasNoPlaceholderRecommendations(){
        assertTrue(listeningRecommendations(emptyList(),emptyList(),emptyList(),emptyList()).isEmpty())
    }
}
