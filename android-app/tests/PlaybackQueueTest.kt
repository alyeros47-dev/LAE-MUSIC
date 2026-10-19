package com.laemusic.listener

fun main() {
    val queue = PlaybackQueue()
    check(queue.current() == null)
    check(queue.next() == null)
    queue.replace(listOf(PlaybackQueue.Song(1, "First", "Artist A"), PlaybackQueue.Song(2, "Second", "Artist B")))
    check(queue.size == 2)
    check(queue.select(0)?.id == 1L)
    check(queue.next()?.id == 2L)
    check(queue.next() == null)
    check(queue.current()?.id == 2L)
    check(queue.previous()?.id == 1L)
    queue.replace(listOf(PlaybackQueue.Song(2, "Second", "Artist B")))
    check(queue.current() == null)
    check(queue.select(0)?.id == 2L)
    queue.replace(listOf(PlaybackQueue.Song(2, "Second", "Artist B"), PlaybackQueue.Song(3, "Third", "Artist C")))
    check(queue.current()?.id == 2L)
    queue.replace(listOf(PlaybackQueue.Song(10, "Song X", "Artist X", 101), PlaybackQueue.Song(11, "Song Y", "Artist Y", 202)))
    check(queue.select(0)?.artistId == 101L)
    check(queue.next()?.artistId == 202L)
    check(queue.previous()?.artistId == 101L)
    println("PlaybackQueue tests passed")
}
