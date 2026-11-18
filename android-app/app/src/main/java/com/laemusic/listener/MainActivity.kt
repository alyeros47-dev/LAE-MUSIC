package com.laemusic.listener

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color

class MainActivity:ComponentActivity() {
    private val model:ListeningViewModel by viewModels()
    private val notifications=registerForActivityResult(ActivityResultContracts.RequestPermission()){}
    override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);enableEdgeToEdge(statusBarStyle=SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),navigationBarStyle=SystemBarStyle.dark(android.graphics.Color.TRANSPARENT));if(Build.VERSION.SDK_INT>=33)notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        setContent { MaterialTheme(colorScheme=darkColorScheme(primary=Color(0xFFB294FF),secondary=Color(0xFFD5C5FF),background=Color(0xFF09080F),surface=Color(0xFF17131F),onSurface=Color.White,onBackground=Color.White)){ListeningApp(model)} }
        model.openLink(intent?.data)
    }
    override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);model.openLink(intent.data)}
}
