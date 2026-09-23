/* Bislig Ride service worker — background Web Push only.
 *
 * Scope: served from /sw.js so it controls the whole origin.
 * No secrets here. No database mutations here.
 * Foreground chimes/in-app notifications remain handled by the app.
 */

const DEFAULT_ICON = '/favicon.png';

function isAppVisible() {
  if (!('clients' in self)) return Promise.resolve(false);

  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windowClients) =>
      windowClients.some((client) => client.visibilityState === 'visible'),
    )
    .catch(() => false);
}

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title =
    typeof payload.title === 'string' && payload.title
      ? payload.title
      : 'Bislig Ride';
  const body =
    typeof payload.body === 'string' && payload.body
      ? payload.body
      : 'You have a new update.';
  const url =
    typeof payload.url === 'string' && payload.url.startsWith('/')
      ? payload.url
      : '/';
  const tag =
    typeof payload.tag === 'string' && payload.tag
      ? payload.tag
      : 'bislig-ride-request';

  event.waitUntil(
    isAppVisible().then((visible) => {
      if (visible) {
        // The open app already handles this event with its own
        // chime + in-app notification — stay quiet to avoid a double.
        return undefined;
      }

      return self.registration.showNotification(title, {
        body,
        icon: DEFAULT_ICON,
        badge: DEFAULT_ICON,
        tag,
        renotify: false,
        data: { url },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl =
    event.notification && event.notification.data
      ? event.notification.data.url
      : '/';
  const url =
    typeof rawUrl === 'string' && rawUrl.startsWith('/') ? rawUrl : '/';

  event.waitUntil(
    (async () => {
      if (!('clients' in self)) {
        await self.clients.openWindow(url);
        return;
      }

      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        try {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(url);
          }
          return;
        } catch {
          // Fall through to opening a fresh window below.
        }
      }

      await self.clients.openWindow(url);
    })(),
  );
});
