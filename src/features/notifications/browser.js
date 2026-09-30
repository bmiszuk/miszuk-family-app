import {api} from '../../shared/client.js';
const markerKey = 'miszuk-notification-device';
export function canEnroll(browser = window) {
  const nav = browser.navigator;
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return Boolean(browser.isSecureContext && 'serviceWorker' in nav && 'PushManager' in browser && 'Notification' in browser && browser.Notification.permission !== 'denied' && (!ios || nav.standalone || browser.matchMedia('(display-mode: standalone)').matches));
}
export function browserStatus(browser = window) {
  const nav = browser.navigator;
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  if (ios && !nav.standalone && !browser.matchMedia('(display-mode: standalone)').matches) return 'Install this site on your Home Screen to use notifications on iPhone or iPad.';
  if (!browser.isSecureContext || !('serviceWorker' in nav) || !('PushManager' in browser) || !('Notification' in browser)) return 'Notifications are not supported in this browser.';
  return {default: 'Permission has not been requested.', denied: 'Permission is blocked. Change notification permissions in your device settings.', granted: 'Browser permission is allowed.'}[browser.Notification.permission];
}
export function registerWorker() {
  if (window.isSecureContext && 'serviceWorker' in navigator) return navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'}).then(() => navigator.serviceWorker.ready);
  return Promise.resolve(null);
}
export function deviceMarker() {
  try { return JSON.parse(localStorage.getItem(markerKey)); } catch { return null; }
}
export async function detachDevice(userId) {
  const marker = deviceMarker();
  let failed = false;
  if (marker?.userId === userId && marker?.id) {
    try { await api(`notifications/subscriptions/${encodeURIComponent(marker.id)}`, {method: 'DELETE'}); } catch { failed = true; }
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/');
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription && !await subscription.unsubscribe()) failed = true;
  } catch { failed = true; }
  if (failed) throw new Error('Could not fully detach notifications. Retry, or continue signing out; this device may still receive generic notifications until detached.');
  localStorage.removeItem(markerKey);
}
export async function enrollDevice(userId, config, registration) {
  // Called only from the explicit Enable button, never during page loading.
  if (!config.enrollment_allowed || !registration) throw new Error('Notifications are not available yet.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notification permission was not granted.');
  const old = await registration.pushManager.getSubscription();
  const marker = deviceMarker();
  if (old && marker?.userId !== userId) {
    if (!await old.unsubscribe()) throw new Error('Unable to detach the previous browser subscription.');
  }
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: Uint8Array.from(atob(config.public_key.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)),
  });
  try {
    const device_label = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad' : 'Browser device';
    const result = await api('notifications/subscriptions', {method: 'POST', body: {subscription: subscription.toJSON(), device_label}});
    localStorage.setItem(markerKey, JSON.stringify({userId, id: result.item.id}));
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}
