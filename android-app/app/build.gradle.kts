plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
val uploadNames = listOf("LAE_UPLOAD_KEYSTORE_PATH", "LAE_UPLOAD_STORE_PASSWORD", "LAE_UPLOAD_KEY_ALIAS", "LAE_UPLOAD_KEY_PASSWORD")
val uploadValues = uploadNames.map { providers.environmentVariable(it).orNull }
require(uploadValues.all { it.isNullOrBlank() } || uploadValues.all { !it.isNullOrBlank() }) { "Configure all four LAE_UPLOAD signing variables, or leave all unset for an unsigned review bundle." }
val hasUploadKey = uploadValues.all { !it.isNullOrBlank() }

android {
    namespace = "com.laemusic.listener"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.laemusic.listener"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "0.3.0-preview"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_ORIGIN", "\"https://lae-music.com\"")
        // No live product or purchase can be enabled by a client preference.
        buildConfigField("boolean", "PLAY_PURCHASES_ENABLED", "false")
    }
    buildFeatures { compose = true; buildConfig = true }
    signingConfigs {
        if (hasUploadKey) create("ownerUpload") {
            storeFile = file(uploadValues[0]!!)
            storePassword = uploadValues[1]
            keyAlias = uploadValues[2]
            keyPassword = uploadValues[3]
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".preview.preferences"; versionNameSuffix = "-internal" }
        release { if (hasUploadKey) signingConfig = signingConfigs.getByName("ownerUpload"); isMinifyEnabled = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isReturnDefaultValues = true }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.05.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.fragment:fragment-ktx:1.8.6")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    implementation("androidx.media3:media3-exoplayer:1.7.1")
    implementation("androidx.media3:media3-session:1.7.1")
    implementation("androidx.media3:media3-datasource-okhttp:1.7.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.android.billingclient:billing-ktx:8.0.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250107")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.05.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
