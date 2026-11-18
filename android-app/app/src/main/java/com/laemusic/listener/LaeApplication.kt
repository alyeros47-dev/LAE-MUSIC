package com.laemusic.listener

import android.app.Application
import android.content.Context

class LaeApplication : Application() {
    lateinit var graph: AppGraph; internal set
    override fun onCreate() { super.onCreate(); graph = AppGraph(this) }
}
class AppGraph(context: Context, transport:okhttp3.OkHttpClient?=null) {
    val secure = SecureStore(context)
    val session = SessionStore(secure)
    val api = LaeApi(session,transport)
    val offline = OfflineRepository(context, api, secure)
    val discovery = DiscoveryRepository(context.applicationContext,api,secure)
}
val Context.graph: AppGraph get() = (applicationContext as LaeApplication).graph
