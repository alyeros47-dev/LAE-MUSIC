package com.laemusic.listener

/** Only elapsed audible playback advances time. Preload/swipe/seek/buffering do not. */
class ListeningMeter {
    var listenedMs=0L;private set
    private var lastAt:Long?=null;private var lastPosition=0L
    fun tick(now:Long,position:Long,playing:Boolean):Long {
        val last=lastAt;val elapsed=if(last==null)0 else now-last;val progress=position-lastPosition
        lastAt=now;lastPosition=position
        val valid=playing && last!=null && elapsed in 0..25000 && progress>=0 && progress<=elapsed*1.15+1000
        val earned=if(valid) minOf(elapsed,progress,15000) else 0
        listenedMs=(listenedMs+earned).coerceAtMost(300000)
        return earned
    }
}
