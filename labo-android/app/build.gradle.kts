plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fr.indiemusician.labo"
    compileSdk = 34

    defaultConfig {
        applicationId = "fr.indiemusician.labo"
        minSdk = 26
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
        externalNativeBuild { cmake { cppFlags += listOf("-std=c++17", "-O2") } }
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
    }

    signingConfigs {
        create("labo") {
            storeFile = rootProject.file("labo.keystore")
            storePassword = "labo-maquettes"
            keyAlias = "labo"
            keyPassword = "labo-maquettes"
        }
    }

    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("labo") }
        getByName("release") { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("labo") }
    }

    buildFeatures { prefab = true }

    externalNativeBuild { cmake { path = file("src/main/cpp/CMakeLists.txt"); version = "3.22.1" } }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("com.google.oboe:oboe:1.9.0")
}
