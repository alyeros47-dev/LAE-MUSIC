package com.laemusic.listener

import org.junit.Assert.*
import org.junit.Test

class PlaybackQueueTest {
    @Test fun navigationAndBounds() {
        val queue = PlaybackQueue()
        assertNull(queue.next())
        assertNull(queue.previous())
        queue.replace(listOf(
            PlaybackQueue.Song(1, "One", "Artist"),
            PlaybackQueue.Song(2, "Two", "Artist")
        ))
        assertEquals(1L, queue.select(0)?.id)
        assertEquals(2L, queue.next()?.id)
        assertNull(queue.next())
        assertEquals(2L, queue.current()?.id)
        assertEquals(1L, queue.previous()?.id)
    }

    @Test fun preservesSelectionAcrossSearchWhenSongStillExists() {
        val queue = PlaybackQueue()
        queue.replace(listOf(PlaybackQueue.Song(1, "One", "A"), PlaybackQueue.Song(2, "Two", "B")))
        queue.select(1)
        queue.replace(listOf(PlaybackQueue.Song(2, "Two", "B"), PlaybackQueue.Song(3, "Three", "C")))
        assertEquals(2L, queue.current()?.id)
        queue.replace(listOf(PlaybackQueue.Song(3, "Three", "C")))
        assertNull(queue.current())
        assertEquals(3L, queue.next()?.id)
    }
}
