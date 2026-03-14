import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Standard Workbox setup
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Cache Supabase REST API calls for profiles (rarely change — serve cached, revalidate in background)
registerRoute(
    ({ url }) => url.pathname.includes('/rest/v1/profiles'),
    new StaleWhileRevalidate({
        cacheName: 'supabase-profiles',
        plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 300 })]
    })
)
// Handle SKIP_WAITING from frontend
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING')
        self.skipWaiting()
})

clientsClaim()

// Push Notification Listener
self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? { title: 'Dienstplan Info', body: 'Neue Nachricht' }

    const options = {
        body: data.body,
        icon: '/logo2.png',
        badge: '/logo2.png',
        data: data.data, // Contains URL for deep linking
        vibrate: [100, 50, 100],
        actions: [
            {
                action: 'open',
                title: 'Ansehen'
            }
        ]
    }

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    )
})

// Notification Click Listener
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification click received', event);
    event.notification.close()

    if (event.action === 'open' || !event.action) {
        // Default to root if no URL provided
        // Use absolute URL construction to be safe
        const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;
        console.log('[SW] URL to open:', urlToOpen);

        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
                console.log('[SW] Found clients:', windowClients.length);
                // Challenge: Check if there is already a window/tab open for this app
                // We match loosely on origin to catch any open page of our app
                for (let i = 0; i < windowClients.length; i++) {
                    const client = windowClients[i];
                    console.log('[SW] Checking client:', client.url);
                    if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                        console.log('[SW] Focusing existing client');
                        return client.focus().then(activeClient => {
                            // After focusing, navigate to the specific page
                            if (activeClient) {
                                console.log('[SW] Navigating existing client');
                                return activeClient.navigate(urlToOpen);
                            }
                        });
                    }
                }
                // If no window is open, open a new one
                if (self.clients.openWindow) {
                    console.log('[SW] Opening new window');
                    return self.clients.openWindow(urlToOpen);
                }
            })
        );
    }
})
