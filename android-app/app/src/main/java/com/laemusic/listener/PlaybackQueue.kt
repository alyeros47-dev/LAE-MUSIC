package com.laemusic.listener

/** In-memory navigation of the currently displayed search results. */
class PlaybackQueue {
    data class Song(val id: Long, val title: String, val artist: String, val artistId: Long? = null)
    private val songs = mutableListOf<Song>()
    var index: Int = -1
        private set

    val size: Int get() = songs.size
    fun replace(results: List<Song>, playingId: Long? = current()?.id) {
        songs.clear()
        songs.addAll(results)
        index = songs.indexOfFirst { it.id == playingId }
    }
    fun current(): Song? = songs.getOrNull(index)
    fun select(position: Int): Song? {
        val selected = songs.getOrNull(position) ?: return null
        index = position
        return selected
    }
    fun selectById(id: Long?): Song? {
        val position = songs.indexOfFirst { it.id == id }
        return if (position >= 0) select(position) else null
    }
    fun next(): Song? = if (index == -1) null else select(index + 1)
    fun previous(): Song? = select(index - 1)
}
