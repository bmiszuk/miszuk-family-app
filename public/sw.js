/* Notification-only worker. Keep this URL available across releases and rollback.
 * No fetch handler, cache, background API calls, or authentication shortcuts. */
const destinations = {home: '/#home', chat: '/#chat'};
function notificationPayload(value) {
  if (!value || value.version !== 1 || typeof value.title !== 'string' ||
      !value.title.trim() || value.title.length > 80 || typeof value.body !== 'string' ||
      value.body.length > 240 || !Object.hasOwn(destinations, value.destination)) {
    return {title: 'Miszuk Family', body: 'Open your family portal.', destination: 'home'};
  }
  return {title: value.title, body: value.body, destination: value.destination};
}
self.addEventListener('push', event => {
  let value;
  try { value = event.data?.json(); } catch { /* Generic content for invalid payloads. */ }
  const message = notificationPayload(value);
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body, icon: '/app-icons/icon-192.png',
    data: {destination: message.destination},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = event.notification.data?.destination;
  const route = Object.hasOwn(destinations, destination) ? destinations[destination] : destinations.home;
  const url = new URL(route, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      const navigated = await client.navigate(url);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(url);
  })());
});
