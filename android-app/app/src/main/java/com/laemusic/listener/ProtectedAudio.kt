package com.laemusic.listener

import java.io.File
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Fixed authenticated blocks support seeking without writing decrypted MP3 files. */
object ProtectedAudio {
    const val BLOCK = 65536
    private const val HEADER = 20
    fun write(input: InputStream, destination: File, key: SecretKey, binding: String, maxBytes: Long, cancelled: ()->Boolean, progress: (Long)->Unit): Long {
        val prefix=ByteArray(8).also { SecureRandom().nextBytes(it) };var total=0L;var index=0
        RandomAccessFile(destination,"rw").use { out ->
            out.setLength(0);out.writeInt(0x4c414531);out.writeLong(0);out.write(prefix)
            val buffer=ByteArray(BLOCK)
            while(true) {
                if(cancelled()) throw InterruptedException("Download paused")
                var n=0;while(n<BLOCK) { if(cancelled())throw InterruptedException("Download paused");val read=input.read(buffer,n,BLOCK-n);if(read<0)break;n+=read }
                if(n==0)break
                total+=n;require(total<=maxBytes) { "Song exceeds the offline storage limit" }
                val nonce=prefix+ByteBuffer.allocate(4).putInt(index).array()
                val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply {init(Cipher.ENCRYPT_MODE,key,GCMParameterSpec(128,nonce));updateAAD("$binding:$index".toByteArray())}
                out.write(cipher.doFinal(buffer,0,n));index++;progress(total)
            }
            out.seek(4);out.writeLong(total);out.fd.sync()
        }
        return total
    }
    class Reader(file: File, private val key: SecretKey, private val binding: String):AutoCloseable {
        private val source=RandomAccessFile(file,"r");val size:Long;private val prefix=ByteArray(8);private var block=-1L;private var plain=ByteArray(0)
        init {require(source.readInt()==0x4c414531);size=source.readLong();require(size in 1..20971520);source.readFully(prefix);require(source.length()==HEADER+size+((size+BLOCK-1)/BLOCK)*16)}
        fun read(position:Long, target:ByteArray, offset:Int, length:Int):Int {
            if(position>=size)return -1
            require(position>=0)
            val index=position/BLOCK
            if(block!=index) {
                val n=minOf(BLOCK.toLong(),size-index*BLOCK).toInt();val bytes=ByteArray(n+16);source.seek(HEADER+index*(BLOCK+16));source.readFully(bytes)
                val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply {init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,prefix+ByteBuffer.allocate(4).putInt(index.toInt()).array()));updateAAD("$binding:$index".toByteArray())}
                plain=cipher.doFinal(bytes);block=index
            }
            val start=(position%BLOCK).toInt();val n=minOf(length,plain.size-start);plain.copyInto(target,offset,start,start+n);return n
        }
        override fun close(){plain.fill(0);source.close()}
    }
}
