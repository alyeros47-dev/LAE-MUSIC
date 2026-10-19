package com.laemusic.listener

import android.app.Activity
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Color
import android.webkit.CookieManager

/**
 * Phase 1 Android shell for the existing listener catalogue.
 * This is NOT an offline player or a subscription/payment implementation.
 */
class MainActivity : Activity() {
    private lateinit var browser: WebView
    private val origin = "https://lae-music.onrender.com"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(19, 14, 33))
        }
        val title = TextView(this).apply {
            text = "LAE-MUSIC"
            textSize = 20f
            setTextColor(Color.WHITE)
            setPadding(22, 22, 22, 22)
        }
        browser = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    if (uri.scheme == "https" && uri.host == "lae-music.onrender.com") return false
                    if (uri.scheme == "https" || uri.scheme == "mailto") {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                    }
                    return true
                }
            }
        }
        CookieManager.getInstance().setAcceptCookie(true)
        container.addView(title)
        container.addView(browser, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(container)
        if (savedInstanceState == null) browser.loadUrl("$origin/music")
        else browser.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        browser.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Legacy Activity back handling")
    override fun onBackPressed() {
        if (browser.canGoBack()) browser.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        browser.destroy()
        super.onDestroy()
    }
}
