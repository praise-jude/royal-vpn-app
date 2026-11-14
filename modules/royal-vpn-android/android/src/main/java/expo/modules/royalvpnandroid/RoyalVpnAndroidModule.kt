package expo.modules.royalvpnandroid

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import android.provider.Settings
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import com.wireguard.config.InetEndpoint
import com.wireguard.config.InetNetwork
import com.wireguard.config.Interface
import com.wireguard.config.Peer
import com.wireguard.crypto.Key
import com.wireguard.crypto.KeyPair
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val VPN_PERMISSION_REQUEST_CODE = 24601
private const val PREFS_NAME = "royal_vpn_wg"
private const val PREF_PRIVATE_KEY = "private_key"
private const val PREF_KILL_SWITCH = "kill_switch"
private const val EVENT_STATE = "onTunnelState"

class RoyalVpnAndroidModule : Module() {
  private var pendingPermissionPromise: Promise? = null
  private var backend: GoBackend? = null

  // True while we are bringing the tunnel down on purpose, so a DOWN we caused never trips the Kill Switch.
  @Volatile private var stopping = false

  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  // GoBackend reports state changes here, including drops we didn't ask for (another VPN took over,
  // the system revoked us, the service died). With Kill Switch on, those engage the traffic guard.
  private val tunnel = object : Tunnel {
    override fun getName() = "royal-vpn"
    override fun onStateChange(newState: Tunnel.State) {
      val unexpected = newState == Tunnel.State.DOWN && !stopping
      val ctx = context
      if (unexpected && ctx != null && killSwitchOn(ctx)) startGuard(ctx)
      sendEvent(EVENT_STATE, mapOf("state" to if (newState == Tunnel.State.UP) "up" else "down", "unexpected" to unexpected))
    }
  }

  private fun getBackend(ctx: Context): GoBackend = backend ?: GoBackend(ctx).also { backend = it }

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun killSwitchOn(ctx: Context) = prefs(ctx).getBoolean(PREF_KILL_SWITCH, false)

  // The device's WireGuard identity. The private key is generated on-device and never leaves it.
  private fun getOrCreateKeyPair(ctx: Context): KeyPair {
    val p = prefs(ctx)
    p.getString(PREF_PRIVATE_KEY, null)?.let { return KeyPair(Key.fromBase64(it)) }
    val fresh = KeyPair()
    p.edit().putString(PREF_PRIVATE_KEY, fresh.privateKey.toBase64()).apply()
    return fresh
  }

  private fun startGuard(ctx: Context): Boolean = try {
    val intent = Intent(ctx, RoyalGuardVpnService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
    true
  } catch (e: Exception) {
    false
  }

  private fun stopGuard(ctx: Context) {
    if (!RoyalGuardVpnService.isActive) return
    try {
      ctx.startService(Intent(ctx, RoyalGuardVpnService::class.java).setAction(RoyalGuardVpnService.ACTION_STOP))
    } catch (e: Exception) {
      // Service already gone.
    }
  }

  override fun definition() = ModuleDefinition {
    Name("RoyalVpnAndroid")
    Events(EVENT_STATE)

    AsyncFunction("getPublicKeyAsync") { promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.reject("NO_CONTEXT", "No React context available", null)
      promise.resolve(getOrCreateKeyPair(ctx).publicKey.toBase64())
    }

    AsyncFunction("requestPermissionAsync") { promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.resolve(false)
      val consentIntent = VpnService.prepare(ctx) ?: return@AsyncFunction promise.resolve(true) // already granted
      val activity = appContext.currentActivity ?: return@AsyncFunction promise.resolve(false)
      pendingPermissionPromise?.resolve(false)
      pendingPermissionPromise = promise
      activity.startActivityForResult(consentIntent, VPN_PERMISSION_REQUEST_CODE)
    }

    // excludedApps: package names that bypass the VPN (split tunnelling).
    AsyncFunction("startTunnelAsync") { serverPublicKey: String, endpoint: String, clientAddress: String, dns: String, excludedApps: List<String>, promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.reject("NO_CONTEXT", "No React context available", null)
      try {
        val iface = Interface.Builder()
          .setKeyPair(getOrCreateKeyPair(ctx))
          .addAddress(InetNetwork.parse(clientAddress))
          // A private IPv6 address so IPv6 traffic enters the tunnel and is dropped there rather than
          // leaking out the normal route -- the exit servers don't route IPv6 yet.
          .addAddress(InetNetwork.parse("fd12:3456:789a::2/128"))
          .addDnsServer(java.net.InetAddress.getByName(dns))
          .apply {
            val pm = ctx.packageManager
            val installed = excludedApps.filter { pkg ->
              pkg != ctx.packageName && try { pm.getPackageInfo(pkg, 0); true } catch (e: PackageManager.NameNotFoundException) { false }
            }
            if (installed.isNotEmpty()) excludeApplications(installed)
          }
          .build()
        val peer = Peer.Builder()
          .setPublicKey(Key.fromBase64(serverPublicKey))
          .setEndpoint(InetEndpoint.parse(endpoint))
          .addAllowedIp(InetNetwork.parse("0.0.0.0/0"))
          .addAllowedIp(InetNetwork.parse("::/0"))
          .setPersistentKeepalive(25)
          .build()
        val config = Config.Builder().setInterface(iface).addPeer(peer).build()

        stopGuard(ctx) // the guard holds the VPN slot; the real tunnel replaces it
        val b = getBackend(ctx)
        // Switching servers: bring the old tunnel down first without tripping the Kill Switch.
        if (b.getState(tunnel) == Tunnel.State.UP) {
          stopping = true
          try { b.setState(tunnel, Tunnel.State.DOWN, null) } finally { stopping = false }
        }
        b.setState(tunnel, Tunnel.State.UP, config)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("TUNNEL_START_FAILED", e.message, e)
      }
    }

    // lockdown: keep blocking all traffic after disconnecting (Royal Lockdown).
    AsyncFunction("stopTunnelAsync") { lockdown: Boolean, promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.resolve(false)
      try {
        stopping = true
        getBackend(ctx).setState(tunnel, Tunnel.State.DOWN, null)
        if (lockdown) startGuard(ctx)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("TUNNEL_STOP_FAILED", e.message, e)
      } finally {
        stopping = false
      }
    }

    AsyncFunction("isActive") { promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.resolve(false)
      promise.resolve(try { getBackend(ctx).getState(tunnel) == Tunnel.State.UP } catch (e: Exception) { false })
    }

    // Bytes through the tunnel since it came up.
    AsyncFunction("getStatisticsAsync") { promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.resolve(mapOf("rxBytes" to 0.0, "txBytes" to 0.0))
      try {
        val s = getBackend(ctx).getStatistics(tunnel)
        promise.resolve(mapOf("rxBytes" to s.totalRx().toDouble(), "txBytes" to s.totalTx().toDouble()))
      } catch (e: Exception) {
        promise.resolve(mapOf("rxBytes" to 0.0, "txBytes" to 0.0))
      }
    }

    AsyncFunction("setKillSwitchAsync") { enabled: Boolean, promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.resolve(false)
      prefs(ctx).edit().putBoolean(PREF_KILL_SWITCH, enabled).apply()
      if (!enabled) stopGuard(ctx)
      promise.resolve(true)
    }

    AsyncFunction("startGuardAsync") { promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.resolve(false)
      promise.resolve(startGuard(ctx))
    }

    AsyncFunction("stopGuardAsync") { promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.resolve(false)
      stopGuard(ctx)
      promise.resolve(true)
    }

    AsyncFunction("isGuardActive") { promise: Promise ->
      promise.resolve(RoyalGuardVpnService.isActive)
    }

    // Apps with a launcher icon, for the split-tunnelling picker.
    AsyncFunction("getInstalledAppsAsync") { promise: Promise ->
      val ctx = context ?: return@AsyncFunction promise.resolve(emptyList<Map<String, String>>())
      val pm = ctx.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val apps = pm.queryIntentActivities(launcher, 0)
        .map { it.activityInfo.applicationInfo }
        .filter { it.packageName != ctx.packageName }
        .distinctBy { it.packageName }
        .map { mapOf("packageName" to it.packageName, "label" to pm.getApplicationLabel(it).toString()) }
        .sortedBy { it["label"]?.lowercase() }
      promise.resolve(apps)
    }

    // Android's own VPN settings, where "Always-on VPN" and "Block connections without VPN" live.
    AsyncFunction("openVpnSettingsAsync") { promise: Promise ->
      val activity = appContext.currentActivity ?: return@AsyncFunction promise.resolve(false)
      try {
        activity.startActivity(Intent(Settings.ACTION_VPN_SETTINGS))
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == VPN_PERMISSION_REQUEST_CODE) {
        pendingPermissionPromise?.resolve(payload.resultCode == Activity.RESULT_OK)
        pendingPermissionPromise = null
      }
    }
  }
}
