package com.laemusic.listener

import android.Manifest
import android.content.ComponentName
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.test.uiautomator.UiDevice
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.util.concurrent.TimeUnit

/** Read-only visual check against the existing public catalogue on a disposable emulator. */
class GuestDesignScreensTest {
    @get:Rule val compose=createEmptyComposeRule()
    @get:Rule val notification=GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
    @Test fun captureTheThreeDistinctScreensWithRealCatalogueArtwork() {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.targetContext
        val future=MediaController.Builder(context,SessionToken(context,ComponentName(context,MusicPlaybackService::class.java))).buildAsync()
        val player=future.get(30,TimeUnit.SECONDS)
        // Connect before opening the catalogue, then pause as soon as a song is
        // loaded. This visual check must never manufacture a payable stream.
        val scenario=ActivityScenario.launch(MainActivity::class.java)
        try {
            compose.waitUntil(30000){var loaded=false;instrumentation.runOnMainSync {loaded=player.currentMediaItem!=null;if(loaded)player.pause()};loaded}
            lateinit var model:ListeningViewModel
            scenario.onActivity {model=androidx.lifecycle.ViewModelProvider(it)[ListeningViewModel::class.java]}
            fun artwork(url:String){kotlinx.coroutines.runBlocking {coil.Coil.imageLoader(context).execute(coil.request.ImageRequest.Builder(context).data(url).build())};compose.waitForIdle()}
            model.state.value.tracks.firstOrNull()?.let {artwork(it.artwork)}
            fun capture(name:String){
                compose.mainClock.advanceTimeByFrame();compose.waitForIdle();instrumentation.waitForIdleSync()
                Thread.sleep(500) // UiDevice captures SurfaceFlinger, after the Compose frame is presented.
                UiDevice.getInstance(instrumentation).takeScreenshot(File(context.getExternalFilesDir(null),name))
            }
            capture("discover-public.png")
            compose.onNodeWithTag("bottom-nav-Home").performClick()
            compose.waitUntil(15000){compose.onAllNodesWithTag("featured-song").fetchSemanticsNodes().isNotEmpty()}
            compose.waitUntil(15000){model.state.value.popular.isNotEmpty()}
            model.state.value.let {state->(state.featuredSongs.ifEmpty {state.releases}).firstOrNull()?.let {artwork(it.artwork)}}
            model.state.value.popular.take(3).forEach {artwork(it.artwork)}
            capture("home-public.png")
            compose.onNodeWithTag("bottom-nav-Discover").performClick()
            compose.onNodeWithTag("top-tab-Explore").performClick()
            compose.onNodeWithTag("explore-screen").assertExists()
            model.state.value.popular.take(3).forEach {artwork(it.artwork)}
            capture("explore-public.png")
            instrumentation.runOnMainSync {org.junit.Assert.assertFalse(player.isPlaying)}
        } finally {
            instrumentation.runOnMainSync {player.stop();player.release()};scenario.close()
            context.stopService(android.content.Intent(context,MusicPlaybackService::class.java))
        }
    }
}
