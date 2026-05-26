package com.sourav_roy.cadmin

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import android.net.wifi.ScanResult
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

class CAdminNativeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val tag = "CADMIN_NATIVE"

  private val wifiManager: WifiManager
    get() = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

  private val connectivityManager: ConnectivityManager
    get() = reactContext.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

  private var activeWifiCallback: ConnectivityManager.NetworkCallback? = null

  private val mediaHubClient: OkHttpClient by lazy { createMediaHubClient() }

  override fun getName(): String = "CAdminNative"

  @ReactMethod
  fun requestRequiredPermissions(promise: Promise) {
    Log.d(tag, "requestRequiredPermissions:start sdk=${Build.VERSION.SDK_INT}")
    val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      permissions.add(Manifest.permission.NEARBY_WIFI_DEVICES)
    }

    val missing =
      permissions.filter {
        ContextCompat.checkSelfPermission(reactContext, it) != PackageManager.PERMISSION_GRANTED
      }

    val activity: Activity? = reactContext.currentActivity
    Log.d(tag, "requestRequiredPermissions:missing=${missing.joinToString()} activity=${activity != null}")
    if (missing.isNotEmpty() && activity != null) {
      ActivityCompat.requestPermissions(activity, missing.toTypedArray(), 2104)
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun getCurrentSsid(promise: Promise) {
    val ssid = wifiManager.connectionInfo?.ssid
      ?.replace("\"", "")
      ?.takeUnless { it.contains("unknown ssid", ignoreCase = true) }
      ?: ""
    Log.d(tag, "getCurrentSsid:ssid=$ssid")
    promise.resolve(ssid)
  }

  @ReactMethod
  fun scanWifi(promise: Promise) {
    try {
      Log.d(tag, "scanWifi:start wifiEnabled=${wifiManager.isWifiEnabled}")
      wifiManager.startScan()
      val results = wifiManager.scanResults.orEmpty()
      Log.d(
        tag,
        "scanWifi:results count=${results.size} items=${
          results.joinToString(limit = 30) { "${it.SSID}/${it.BSSID}/${it.level}" }
        }"
      )
      promise.resolve(toWifiArray(results))
    } catch (error: SecurityException) {
      Log.e(tag, "scanWifi:permissionError", error)
      promise.reject("WIFI_SCAN_PERMISSION", error)
    } catch (error: Exception) {
      Log.e(tag, "scanWifi:error", error)
      promise.reject("WIFI_SCAN_FAILED", error)
    }
  }

  @ReactMethod
  fun switchWifi(ssid: String, password: String?, promise: Promise) {
    try {
      Log.d(tag, "switchWifi:start ssid=$ssid passwordPresent=${!password.isNullOrBlank()} wifiEnabled=${wifiManager.isWifiEnabled}")
      if (ssid.isBlank()) {
        Log.d(tag, "switchWifi:blankSsid")
        promise.resolve(false)
        return
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        switchWifiWithSpecifier(ssid, password.orEmpty(), promise)
        return
      }

      if (!wifiManager.isWifiEnabled) {
        @Suppress("DEPRECATION")
        wifiManager.isWifiEnabled = true
      }

      val current = wifiManager.connectionInfo?.ssid?.replace("\"", "") ?: ""
      Log.d(tag, "switchWifi:currentSsid=$current")
      if (current.equals(ssid, ignoreCase = true)) {
        Log.d(tag, "switchWifi:alreadyConnected ssid=$ssid")
        promise.resolve(true)
        return
      }

      val existing = wifiManager.configuredNetworks?.firstOrNull { it.SSID == "\"$ssid\"" }
      Log.d(tag, "switchWifi:existingNetwork=${existing != null} existingNetworkId=${existing?.networkId}")
      val networkId =
        if (existing != null) {
          wifiManager.updateNetwork(existing)
          existing.networkId
        } else {
          @Suppress("DEPRECATION")
          wifiManager.addNetwork(createWifiConfig(ssid, password.orEmpty()))
        }

      if (networkId == -1) {
        Log.d(tag, "switchWifi:invalidNetworkId")
        promise.resolve(false)
        return
      }

      @Suppress("DEPRECATION")
      val enabled = wifiManager.enableNetwork(networkId, true)
      @Suppress("DEPRECATION")
      wifiManager.reconnect()
      Log.d(tag, "switchWifi:result ssid=$ssid networkId=$networkId enabled=$enabled")
      promise.resolve(enabled)
    } catch (error: SecurityException) {
      Log.e(tag, "switchWifi:permissionError ssid=$ssid", error)
      promise.reject("WIFI_SWITCH_PERMISSION", error)
    } catch (error: Exception) {
      Log.e(tag, "switchWifi:error ssid=$ssid", error)
      promise.reject("WIFI_SWITCH_FAILED", error)
    }
  }

  private fun switchWifiWithSpecifier(ssid: String, password: String, promise: Promise) {
    Log.d(tag, "switchWifiWithSpecifier:start ssid=$ssid")

    val previousCallback = activeWifiCallback
    if (previousCallback != null) {
      runCatching { connectivityManager.unregisterNetworkCallback(previousCallback) }
      activeWifiCallback = null
    }

    val specifierBuilder = WifiNetworkSpecifier.Builder().setSsid(ssid)
    if (password.isNotBlank()) {
      specifierBuilder.setWpa2Passphrase(password)
    }

    val request =
      NetworkRequest.Builder()
        .addTransportType(android.net.NetworkCapabilities.TRANSPORT_WIFI)
        .setNetworkSpecifier(specifierBuilder.build())
        .build()

    var resolved = false
    val handler = Handler(Looper.getMainLooper())
    val callback =
      object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
          Log.d(tag, "switchWifiWithSpecifier:onAvailable ssid=$ssid network=$network")
          activeWifiCallback = this
          connectivityManager.bindProcessToNetwork(network)
          if (!resolved) {
            resolved = true
            promise.resolve(true)
          }
        }

        override fun onUnavailable() {
          Log.d(tag, "switchWifiWithSpecifier:onUnavailable ssid=$ssid")
          if (!resolved) {
            resolved = true
            promise.resolve(false)
          }
        }

        override fun onLost(network: Network) {
          Log.d(tag, "switchWifiWithSpecifier:onLost ssid=$ssid network=$network")
          if (activeWifiCallback === this) {
            connectivityManager.bindProcessToNetwork(null)
            activeWifiCallback = null
          }
        }
      }

    handler.postDelayed(
      {
        if (!resolved) {
          Log.d(tag, "switchWifiWithSpecifier:timeout ssid=$ssid")
          resolved = true
          runCatching { connectivityManager.unregisterNetworkCallback(callback) }
          if (activeWifiCallback === callback) {
            activeWifiCallback = null
          }
          promise.resolve(false)
        }
      },
      30000
    )

    activeWifiCallback = callback
    connectivityManager.requestNetwork(request, callback)
    Log.d(tag, "switchWifiWithSpecifier:requestNetwork ssid=$ssid")
  }

  @ReactMethod
  fun mediaHubRequest(method: String, url: String, body: String?, contentType: String?, promise: Promise) {
    Thread {
      try {
        val parsedUrl = java.net.URL(url)
        if (parsedUrl.protocol != "https" || parsedUrl.host != "192.168.39.20") {
          throw SecurityException("Media hub native client is restricted to https://192.168.39.20")
        }

        Log.d(tag, "mediaHubRequest:start method=$method url=$url bodyPresent=${!body.isNullOrBlank()}")
        val requestBuilder =
          Request.Builder()
            .url(url)
            .header("User-Agent", "OGLE-APP/Android")

        if (method.equals("POST", ignoreCase = true) || method.equals("PUT", ignoreCase = true)) {
          val requestBody = (body ?: "").toRequestBody((contentType ?: "application/json").toMediaType())
          requestBuilder.method(method.uppercase(), requestBody)
        } else {
          requestBuilder.get()
        }

        mediaHubClient.newCall(requestBuilder.build()).execute().use { response ->
          val text = response.body?.string().orEmpty()
          val responseContentType = response.header("content-type")
          Log.d(
            tag,
            "mediaHubRequest:response url=$url status=${response.code} contentType=$responseContentType preview=${text.take(300)}"
          )
          val map = Arguments.createMap()
          map.putInt("status", response.code)
          map.putBoolean("ok", response.isSuccessful)
          map.putString("contentType", responseContentType)
          map.putString("text", text)
          promise.resolve(map)
        }
      } catch (error: Exception) {
        Log.e(tag, "mediaHubRequest:error method=$method url=$url", error)
        promise.reject("MEDIA_HUB_REQUEST_FAILED", error)
      }
    }.start()
  }
  @ReactMethod
  fun openMobileData(promise: Promise) {
    Log.d(tag, "openMobileData:notImplemented")
    promise.resolve(false)
  }

  @ReactMethod
  fun getStorageRoots(promise: Promise) {
    promise.resolve(Arguments.createArray())
  }

  @ReactMethod
  fun pickSyncDirectory(promise: Promise) {
    promise.resolve(null)
  }

  @ReactMethod
  fun isValidSyncDir(path: String, promise: Promise) {
    promise.resolve(false)
  }

  @ReactMethod
  fun startSyncServer(path: String, promise: Promise) {
    val map = Arguments.createMap()
    map.putString("host", "127.0.0.1")
    map.putInt("port", 8080)
    map.putString("root", path)
    promise.resolve(map)
  }

  @ReactMethod
  fun stopSyncServer(promise: Promise) {
    promise.resolve(null)
  }

  @ReactMethod
  fun startBackgroundFmaSync(promise: Promise) {
    promise.resolve(null)
  }

  private fun toWifiArray(results: List<ScanResult>): WritableArray {
    val array = Arguments.createArray()
    results
      .filter { it.SSID.isNotBlank() }
      .sortedByDescending { it.level }
      .forEach { result ->
        val item: WritableMap = Arguments.createMap()
        item.putString("ssid", result.SSID)
        item.putString("bssid", result.BSSID?.uppercase().orEmpty())
        item.putInt("level", result.level)
        array.pushMap(item)
      }
    return array
  }

  private fun createWifiConfig(ssid: String, password: String): WifiConfiguration {
    val config = WifiConfiguration()
    config.SSID = "\"$ssid\""
    config.hiddenSSID = true
    if (password.isBlank()) {
      config.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
    } else {
      config.preSharedKey = "\"$password\""
      config.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
      config.status = WifiConfiguration.Status.ENABLED
    }
    return config
  }
  private fun createMediaHubClient(): OkHttpClient {
    val trustManager =
      object : X509TrustManager {
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
      }
    val sslContext = SSLContext.getInstance("TLS")
    sslContext.init(null, arrayOf(trustManager), SecureRandom())

    return OkHttpClient.Builder()
      .sslSocketFactory(sslContext.socketFactory, trustManager)
      .hostnameVerifier { hostname, _ -> hostname == "192.168.39.20" }
      .build()
  }
}



