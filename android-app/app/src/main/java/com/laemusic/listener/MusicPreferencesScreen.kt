package com.laemusic.listener

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** Preference choices never grant subscriptions or alter song/royalty records. */
@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun MusicPreferencesScreen(existing:ListeningPreferences?,onSave:(ListeningPreferences)->Unit,onCancel:(()->Unit)?=null) {
    var choice by remember(existing){mutableStateOf(existing?.choice)}
    var categories by remember(existing){mutableStateOf(existing?.categories ?: emptySet())}
    Surface(color=AppBackground,contentColor=Color.White) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(24.dp).testTag("music-preferences"),verticalArrangement=Arrangement.spacedBy(16.dp)) {
            Text("LAE-MUSIC",color=Purple,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
            Text("What do you like to hear?",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)
            Text("Choose your music. You can change this in Profile.",color=Color.LightGray)
            MusicChoice.entries.forEach {value->
                Row(Modifier.fillMaxWidth().background(if(choice==value)Purple.copy(alpha=.22f) else Panel,RoundedCornerShape(14.dp))
                    .clickable {choice=value}.padding(8.dp).testTag("music-choice-${value.name}")) {
                    RadioButton(selected=choice==value,onClick={choice=value},colors=RadioButtonDefaults.colors(selectedColor=Purple))
                    Text(value.label,Modifier.padding(top=12.dp),fontWeight=FontWeight.SemiBold)
                }
            }
            if(choice!=null && choice!=MusicChoice.SECULAR) {
                Text("Your Gospel choices",style=MaterialTheme.typography.titleMedium)
                Text("Choose several, or All Gospel.",color=Color.LightGray)
                FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected=categories.isEmpty(),onClick={categories=emptySet()},label={Text("All Gospel")},modifier=Modifier.testTag("gospel-all"))
                    GospelCategory.entries.forEach {value->FilterChip(selected=value in categories,onClick={categories=if(value in categories)categories-value else categories+value},label={Text(value.label)},modifier=Modifier.testTag("gospel-${value.name}"))}
                }
            }
            Text("Your choices and listening preferences stay on this device. Songs with unclear categories appear only when you choose Both.",style=MaterialTheme.typography.bodySmall,color=Color.LightGray)
            Button(onClick={choice?.let {onSave(ListeningPreferences(it,if(it==MusicChoice.SECULAR)emptySet() else categories))}},enabled=choice!=null,
                colors=ButtonDefaults.buttonColors(containerColor=Purple,contentColor=Color.White),modifier=Modifier.fillMaxWidth().testTag("save-music-preferences")) {Text(if(existing==null)"Start listening" else "Save choices")}
            if(onCancel!=null)TextButton(onClick=onCancel,modifier=Modifier.fillMaxWidth()){Text("Cancel",color=Color.White)}
        }
    }
}
