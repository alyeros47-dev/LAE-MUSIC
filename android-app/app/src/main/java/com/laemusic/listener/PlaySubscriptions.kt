package com.laemusic.listener

import android.app.Activity
import com.android.billingclient.api.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.security.MessageDigest

/** A Play callback alone never grants Premium. Backend verification is mandatory. */
class PlaySubscriptions(context:android.content.Context,private val api:LaeApi,private val scope:CoroutineScope,private val message:(String)->Unit):PurchasesUpdatedListener {
    private val billing=BillingClient.newBuilder(context.applicationContext).setListener(this).enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()).build()
    fun connect(){billing.startConnection(object:BillingClientStateListener {override fun onBillingSetupFinished(result:BillingResult){if(result.responseCode==BillingClient.BillingResponseCode.OK)restore()};override fun onBillingServiceDisconnected(){message("Google Play is unavailable. Your existing subscription is unchanged.")}})}
    fun restore(){billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()){result,purchases->if(result.responseCode==BillingClient.BillingResponseCode.OK)purchases.forEach(::verify)}}
    override fun onPurchasesUpdated(result:BillingResult,purchases:MutableList<Purchase>?) {if(result.responseCode==BillingClient.BillingResponseCode.OK)purchases?.forEach(::verify) else if(result.responseCode!=BillingClient.BillingResponseCode.USER_CANCELED)message("Google Play could not finish this purchase.")}
    private fun verify(p:Purchase) {
        if(p.purchaseState!=Purchase.PurchaseState.PURCHASED){message("Payment is pending. Premium has not been activated.");return}
        scope.launch {try {
            val verified=api.json("/api/platform/android/play/verify",JSONObject().put("purchase_token",p.purchaseToken).put("products",org.json.JSONArray(p.products)),LaeApi.key())
            if(verified.optBoolean("verified") && verified.optBoolean("entitlement_active"))message("Premium listening is active.") else message("Your purchase needs verification. Do not pay again.")
        }catch(_:Exception){message("Purchase verification is unavailable. Keep your Google Play receipt; do not pay again.")}}
    }
    fun purchase(activity:Activity,details:ProductDetails,offerToken:String) {
        check(BuildConfig.PLAY_PURCHASES_ENABLED) {"Google Play purchases are not enabled in this inspection build."}
        val owner=api.session.owner ?: error("Sign in before purchasing")
        val account=MessageDigest.getInstance("SHA-256").digest(("lae-listener:"+owner).toByteArray()).joinToString(""){"%02x".format(it)}
        billing.launchBillingFlow(activity,BillingFlowParams.newBuilder().setObfuscatedAccountId(account).setProductDetailsParamsList(listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).setOfferToken(offerToken).build())).build())
    }
    fun close()=billing.endConnection()
}
