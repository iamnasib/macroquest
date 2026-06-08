// ─── Web Push subscription management (client side) ───────────────────────────
// Service worker lives at /sw.js (served from public/). The VAPID public key is
// NOT secret — it's meant to be shipped to the browser. The matching private key
// stays server-side as an edge-function secret.

import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY =
  'BDZBHGZiDwmUPcOKwbzMyjOrVrZgg-MYI4qDcrHPgC6rF15IvZD19ilrVwImLj8w2Ha4GPOwxlThy3Ovp2yM8Io'

// Web Push is only usable where Service Workers + Push API exist AND the page is
// secure (https or localhost). On iOS this additionally requires the app to be
// installed to the Home Screen (standalone PWA).
export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// iOS Safari only delivers push to an installed PWA. Detect "browser tab on iOS"
// so the UI can tell the user to Add to Home Screen instead of failing silently.
export function iosNeedsInstall() {
  const ua = navigator.userAgent || ''
  const isIOS = /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  return isIOS && !standalone
}

export function permissionState() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

async function getRegistration() {
  // Reuse an existing registration if present; otherwise register.
  const existing = await navigator.serviceWorker.getRegistration('/sw.js')
  if (existing) return existing
  return navigator.serviceWorker.register('/sw.js')
}

// Request permission + subscribe + persist the subscription. Returns
// { ok, reason } so callers can show a precise message.
export async function enablePush(userId) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  if (iosNeedsInstall()) return { ok: false, reason: 'ios-install' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  const reg = await getRegistration()
  await navigator.serviceWorker.ready

  // Reuse an existing browser subscription if there is one.
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = sub.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'no-keys' }
  }

  // Upsert on endpoint so re-subscribing the same browser doesn't duplicate.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )
  if (error) return { ok: false, reason: 'save-failed', error }

  return { ok: true }
}

// Unsubscribe this browser and remove its row.
export async function disablePush() {
  if (!pushSupported()) return { ok: true }
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
  return { ok: true }
}

// Is THIS browser currently subscribed? (permission granted + active sub row)
export async function isSubscribedHere() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  return !!sub
}
