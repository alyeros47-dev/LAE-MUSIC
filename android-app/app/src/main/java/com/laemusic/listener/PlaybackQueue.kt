package com.laemusic.listener

/** In-memory navigation of the currently displayed search results. */
class PlaybackQueue {
    data class Song(val id: Long, val title: String, val artist: String)
    private val songs = mutableListOf<Song>()
    var index: Int = -1
        private set

    val size: Int get() = songs.size
    fun replace(results: List<Song>) {
        val playingId = current()?.id
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
    fun next(): Song? = select(index + 1)
    fun previous(): Song? = select(index - 1)
}
