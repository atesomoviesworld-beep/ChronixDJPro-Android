# ChronixDJ Pro ProGuard / R8 rules
-keep class com.chronixdj.pro.model.** { *; }
-keepclassmembers class * {
    @androidx.annotation.Keep <methods>;
}
-dontwarn androidx.media3.**
