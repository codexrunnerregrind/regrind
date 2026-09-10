# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# The FCM spoof in org.regrind.push identifies its callers by matching Firebase
# class names in the stack trace, so R8 must not rename them. Without this the
# release build registers under our own package and Grindr's pushes never
# arrive. Shrinking is unaffected.
-keepnames class com.google.firebase.**
-keepnames class com.google.android.gms.**

# Reached only from wry over JNI, so R8 cannot see the call and strips it
-keep class org.regrind.RustWebView {
  void clearAllBrowsingData();
}
