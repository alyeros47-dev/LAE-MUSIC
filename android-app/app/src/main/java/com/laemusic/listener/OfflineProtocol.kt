package com.laemusic.listener

import org.json.JSONArray
import org.json.JSONObject
import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.PublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.util.Base64

/** Wire-compatible with web/offline-protocol.js; no locally issued licences. */
object OfflineProtocol {
    fun canonical(value: Any?): String = when (value) {
        null, JSONObject.NULL -> "null"
        is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(",", "{", "}") { quote(it) + ":" + canonical(value.get(it)) }
        is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { canonical(value.get(it)) }
        is String -> quote(value)
        is Boolean, is Int, is Long -> value.toString()
        else -> error("Invalid protocol value")
    }
    private fun quote(value:String):String = buildString {
        append('"')
        for(c in value) when(c) {
            '"' -> append("\\\"")
            '\\' -> append("\\\\")
            '\b' -> append("\\b")
            '\u000c' -> append("\\f")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> if(c.code<32)append("\\u"+c.code.toString(16).padStart(4,'0')) else append(c)
        }
        append('"')
    }
    fun encode(bytes: ByteArray) = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    fun decode(s: String): ByteArray = Base64.getUrlDecoder().decode(s)
    fun publicKey(jwk: JSONObject): PublicKey {
        require(jwk.getString("kty") == "EC" && jwk.getString("crv") == "P-256" && !jwk.has("d"))
        val params = AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }.getParameterSpec(ECParameterSpec::class.java)
        return KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(BigInteger(1, decode(jwk.getString("x"))), BigInteger(1, decode(jwk.getString("y")))), params))
    }
    fun rawToDer(raw: ByteArray): ByteArray {
        require(raw.size == 64)
        val r = BigInteger(1, raw.copyOfRange(0,32)).toByteArray(); val s = BigInteger(1,raw.copyOfRange(32,64)).toByteArray()
        return byteArrayOf(0x30, (r.size+s.size+4).toByte(), 2, r.size.toByte()) + r + byteArrayOf(2,s.size.toByte()) + s
    }
    fun derToRaw(der: ByteArray): ByteArray {
        require(der.size in 8..72 && der[0] == 0x30.toByte() && der[2] == 2.toByte())
        val n = der[3].toInt() and 255; val sn = der[5+n].toInt() and 255
        fun fixed(a: ByteArray): ByteArray { val b = BigInteger(1,a).toByteArray(); require(b.size <= 33); return ByteArray(32).also { out -> val start = (b.size-32).coerceAtLeast(0); b.copyInto(out,32-(b.size-start),start) } }
        return fixed(der.copyOfRange(4,4+n)) + fixed(der.copyOfRange(6+n,6+n+sn))
    }
}
