package org.regrind.appicon

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.regrind.MainActivity
import org.regrind.R

@InvokeArg
class SetAppIconArgs {
    var icon: String? = null
}

/**
 * Each launcher icon is an `.AppIcon<Glyph>_<Color>` activity-alias of
 * MainActivity in the manifest; exactly one is enabled. `AppIconDefault` is
 * the ReGrind icon.
 */
@TauriPlugin
class AppIconPlugin(private val activity: Activity) : Plugin(activity) {

    private fun aliases(): List<ActivityInfo> = aliases(activity)

    private fun isEnabled(alias: ActivityInfo): Boolean = isEnabled(activity, alias)

    private fun component(name: String) = ComponentName(activity.packageName, name)

    // `weather-blue` is the `.AppIconWeather_Blue` alias.
    private fun aliasName(icon: String?): String =
        PREFIX + (
            icon?.split('-')?.joinToString("_") { word -> word.replaceFirstChar { it.uppercase() } }
                ?: DEFAULT
            )

    @Command
    fun getAppIcon(invoke: Invoke) {
        val enabled = aliases().firstOrNull(::isEnabled)?.name?.removePrefix(PREFIX)
        val result = JSObject()
        result.put("icon", if (enabled == null || enabled == DEFAULT) null else enabled.lowercase().replace('_', '-'))
        invoke.resolve(result)
    }

    @Command
    fun setAppIcon(invoke: Invoke) {
        val target = aliasName(invoke.parseArgs(SetAppIconArgs::class.java).icon)
        val aliases = aliases()
        if (aliases.none { it.name == target }) {
            invoke.reject(ERROR_UNKNOWN_ICON)
            return
        }
        val packageManager = activity.packageManager
        // Enable the new alias first so the app never has no launcher entry.
        packageManager.setComponentEnabledSetting(
            component(target),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )
        for (alias in aliases) {
            if (alias.name == target) continue
            packageManager.setComponentEnabledSetting(
                component(alias.name),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )
        }
        invoke.resolve()
    }

    companion object {
        private val PREFIX = "${MainActivity::class.java.name.substringBeforeLast('.')}.AppIcon"
        private const val DEFAULT = "Default"
        private const val ERROR_UNKNOWN_ICON = "unknown-icon"

        private fun aliases(context: Context): List<ActivityInfo> {
            val info = context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS,
            )
            return info.activities.orEmpty().filter {
                it.targetActivity == MainActivity::class.java.name && it.name.startsWith(PREFIX)
            }
        }

        private fun isEnabled(context: Context, alias: ActivityInfo): Boolean =
            when (context.packageManager.getComponentEnabledSetting(
                ComponentName(context.packageName, alias.name),
            )) {
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
                PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> alias.enabled
                else -> false
            }

        /** Notification small icon matching the chosen launcher icon's glyph. */
        fun notificationIcon(context: Context): Int {
            val glyph = aliases(context).firstOrNull { isEnabled(context, it) }
                ?.name?.removePrefix(PREFIX)?.substringBefore('_')?.lowercase()
            if (glyph == null || glyph == DEFAULT.lowercase()) return R.drawable.ic_notification
            @Suppress("DiscouragedApi")
            val id = context.resources.getIdentifier(
                "ic_launcher_alt_${glyph}_notification",
                "drawable",
                context.packageName,
            )
            return if (id != 0) id else R.drawable.ic_notification
        }
    }
}
