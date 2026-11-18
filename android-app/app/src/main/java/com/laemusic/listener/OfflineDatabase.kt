package com.laemusic.listener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

data class SavedSong(val song: Song, val status: String, val progress: Int, val error: String?, val licence: JSONObject?, val file: String, val work: String?)
class OfflineDatabase(context: Context) : SQLiteOpenHelper(context, "listening.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE downloads(owner TEXT NOT NULL,track TEXT NOT NULL,metadata TEXT NOT NULL,status TEXT NOT NULL,progress INTEGER NOT NULL DEFAULT 0,error TEXT,licence TEXT,file TEXT NOT NULL,work TEXT,PRIMARY KEY(owner,track))")
        db.execSQL("CREATE TABLE events(device TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(device,sequence))")
        db.execSQL("CREATE TABLE sequences(device TEXT PRIMARY KEY,next INTEGER NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) { error("An explicit, non-destructive migration is required") }
    @Synchronized fun save(owner: String, song: Song, status: String, progress: Int = 0, error: String? = null, licence: JSONObject? = null, file: String = "", work: String? = null) {
        val values = ContentValues().apply { put("owner",owner);put("track",song.id);put("metadata",song.json().toString());put("status",status);put("progress",progress);put("error",error);put("file",file);put("licence",licence?.toString());put("work",work) }
        writableDatabase.insertWithOnConflict("downloads",null,values,SQLiteDatabase.CONFLICT_REPLACE)
    }
    @Synchronized fun rows(owner: String): List<SavedSong> = readableDatabase.query("downloads",null,"owner=?",arrayOf(owner),null,null,"rowid DESC").use { c -> buildList { while(c.moveToNext()) {
        fun field(s:String) = c.getString(c.getColumnIndexOrThrow(s))
        add(SavedSong(Song.from(JSONObject(field("metadata"))),field("status"),field("progress").toInt(),field("error"),field("licence")?.let(::JSONObject),field("file"),field("work")))
    } } }
    @Synchronized fun progress(owner:String,track:String,work:String,status:String,progress:Int,error:String?=null,licence:JSONObject?=null,file:String="") {
        val values=ContentValues().apply {put("status",status);put("progress",progress);put("error",error);if(licence!=null){put("licence",licence.toString());put("file",file)}}
        writableDatabase.update("downloads",values,"owner=? AND track=? AND work=?",arrayOf(owner,track,work))
    }
    @Synchronized fun renew(owner:String,track:String,licence:JSONObject) {
        val value=ContentValues().apply {put("licence",licence.toString())}
        writableDatabase.update("downloads",value,"owner=? AND track=? AND status='ready'",arrayOf(owner,track))
    }
    @Synchronized fun remove(owner: String, track: String) { writableDatabase.delete("downloads","owner=? AND track=?",arrayOf(owner,track)) }
    @Synchronized fun event(device: String, event: JSONObject) {
        val db=writableDatabase;db.beginTransaction();try {
            val seq=db.rawQuery("SELECT next FROM sequences WHERE device=?",arrayOf(device)).use { if(it.moveToFirst())it.getLong(0) else 1L }
            event.put("sequence",seq)
            db.execSQL("INSERT INTO events(device,sequence,payload) VALUES(?,?,?)",arrayOf<Any>(device,seq,event.toString()))
            db.execSQL("INSERT OR REPLACE INTO sequences(device,next) VALUES(?,?)",arrayOf<Any>(device,seq+1));db.setTransactionSuccessful()
        } finally {db.endTransaction()}
    }
    @Synchronized fun events(device: String) = readableDatabase.rawQuery("SELECT payload FROM events WHERE device=? ORDER BY sequence LIMIT 100",arrayOf(device)).use { c -> buildList { while(c.moveToNext())add(JSONObject(c.getString(0))) } }
    @Synchronized fun acknowledge(device: String, sequence: Long) { writableDatabase.delete("events","device=? AND sequence<=?",arrayOf(device,sequence.toString())) }
}
