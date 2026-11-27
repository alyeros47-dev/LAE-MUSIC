package com.laemusic.listener

import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale

enum class MusicChoice(val label:String) { GOSPEL("Gospel"), SECULAR("Secular"), BOTH("Both") }
enum class GospelCategory(val label:String) {
    PRAISE("Praise"), WORSHIP("Worship"), GOSPEL_REGGAE("Gospel Reggae"), CHOIR("Choir"),
    REVIVAL("Revival"), AFRICAN_GOSPEL("African Gospel")
}
data class ListeningPreferences(val choice:MusicChoice,val categories:Set<GospelCategory> = emptySet()) {
    val allGospel get()=categories.isEmpty()
    fun json()=JSONObject().put("version",1).put("choice",choice.name).put("categories",JSONArray(categories.sortedBy {it.name}.map {it.name}))
    fun accepts(song:Song):Boolean {
        val tags=MusicTaxonomy.classify(song)
        if(choice==MusicChoice.BOTH && tags.family==null)return true
        return when(tags.family){
            MusicChoice.SECULAR->choice!=MusicChoice.GOSPEL
            MusicChoice.GOSPEL->choice!=MusicChoice.SECULAR && (allGospel || tags.categories.any {it in categories})
            else->false
        }
    }
    companion object {
        fun from(value:JSONObject):ListeningPreferences {
            require(value.getInt("version")==1)
            val choice=MusicChoice.valueOf(value.getString("choice"));val list=value.getJSONArray("categories")
            require(list.length()<=GospelCategory.entries.size)
            return ListeningPreferences(choice,(0 until list.length()).map {GospelCategory.valueOf(list.getString(it))}.toSet())
        }
    }
}
data class MusicClassification(val family:MusicChoice?,val categories:Set<GospelCategory>,val source:String,val issue:String?=null)
object MusicTaxonomy {
    fun normalized(value:String)=Normalizer.normalize(value,Normalizer.Form.NFKD).replace(Regex("\\p{M}"),"").lowercase(Locale.ROOT).replace(Regex("[^a-z0-9]+")," ").trim()
    private val gospel=Regex("(^| )(gospel|worship|praise|christian)( |$)")
    private val secular=Regex("(^| )secular( |$)")
    private val musicalGenre=Regex("(^| )(afrobeats?|afropop|afro pop|afro fusion|reggae|dancehall|soca|calypso|soul|rnb|r b|highlife|fuji|juju|amapiano|dance|disco|house|electronic|pop|rock|acoustic|country|hip hop|hiphop|rap|jazz|blues|classical|traditional|folk|sungura|singeli|bongo flava|mbalax|soukous|rumba|choir|revival)( |$)")
    fun knownGenre(value:String)=normalized(value).let {gospel.containsMatchIn(it) || secular.containsMatchIn(it) || musicalGenre.containsMatchIn(it)}
    fun classify(song:Song):MusicClassification {
        val genre=normalized(song.genre)
        val explicit=normalized(song.musicFamily)
        val structured=song.gospelCategories.mapNotNull {raw->GospelCategory.entries.find {normalized(it.name)==normalized(raw) || normalized(it.label)==normalized(raw)}}.toSet()
        val invalidCategory=song.gospelCategories.size!=structured.size
        if(explicit.isNotEmpty() && explicit !in setOf("gospel","secular"))return MusicClassification(null,emptySet(),"unclassified","Unknown explicit music family")
        if(invalidCategory)return MusicClassification(null,emptySet(),"unclassified","Unrecognized Gospel category")
        if(explicit=="secular" && (gospel.containsMatchIn(genre) || structured.isNotEmpty()))return MusicClassification(null,emptySet(),"conflict","Secular family conflicts with Gospel metadata")
        // Instrumental styles (Afrobeats, reggae, soul, etc.) may be sacred or secular.
        // Only an explicit family or a family-bearing legacy genre establishes scope.
        val family=when {
            explicit=="gospel"->MusicChoice.GOSPEL
            explicit=="secular"->MusicChoice.SECULAR
            gospel.containsMatchIn(genre)->MusicChoice.GOSPEL
            secular.containsMatchIn(genre)->MusicChoice.SECULAR
            else->null
        }
        if(family==null)return MusicClassification(null,emptySet(),"unclassified","Genre needs creator/editor review")
        if(family==MusicChoice.SECULAR)return MusicClassification(family,emptySet(),if(explicit.isEmpty())"legacy genre" else "explicit metadata")
        if(structured.isNotEmpty())return MusicClassification(family,structured,"explicit metadata")
        // The platform's broad legacy label is not evidence for a specific subcategory.
        if(genre in setOf("gospel","gospel worship","christian","christian music"))return MusicClassification(family,emptySet(),"legacy broad genre","Gospel subcategory not specified")
        val categories=buildSet {
            if(Regex("(^| )praise( |$)").containsMatchIn(genre))add(GospelCategory.PRAISE)
            if(Regex("(^| )worship( |$)").containsMatchIn(genre))add(GospelCategory.WORSHIP)
            if(Regex("(^| )reggae( |$)").containsMatchIn(genre))add(GospelCategory.GOSPEL_REGGAE)
            if(Regex("(^| )(choir|choral)( |$)").containsMatchIn(genre))add(GospelCategory.CHOIR)
            if(Regex("(^| )revival( |$)").containsMatchIn(genre))add(GospelCategory.REVIVAL)
            if(Regex("(^| )(african|yoruba|igbo|hausa|ghanaian|congolese|south african)( |$)").containsMatchIn(genre))add(GospelCategory.AFRICAN_GOSPEL)
        }
        return MusicClassification(family,categories,if(explicit.isEmpty())"legacy genre" else "explicit family",if(categories.isEmpty())"Gospel subcategory not specified" else null)
    }
}
