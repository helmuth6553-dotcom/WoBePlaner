import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const PUBLIC_VAPID_KEY = 'BPLhlPrMJfoXFoLDvQ06uHLNXkQsofVqafEug1Y8AAZkDpU--i-kVjx1qA3EEgXj79aKfLqhVmpL8XtArMh_gPM';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}


function arrayBufferToBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export default function NotificationToggle() {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        checkSubscription();
    }, []);

    const checkSubscription = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
    };

    const subscribeToPush = async () => {
        setLoading(true);
        setError(null);
        try {
            if (!('serviceWorker' in navigator)) {
                throw new Error('Service Worker not supported');
            }


            // VitePWA plugin creates 'sw.js' or similar, usually standard registration is handled by the plugin.
            // We just wait for ready.
            const registration = await navigator.serviceWorker.ready;


            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
            });


            // Send to Supabase
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not logged in');

            const p256dh = arrayBufferToBase64(subscription.getKey('p256dh'));
            const auth = arrayBufferToBase64(subscription.getKey('auth'));

            const { error: dbError } = await supabase
                .from('push_subscriptions')
                .upsert({
                    user_id: user.id,
                    endpoint: subscription.endpoint,
                    p256dh: p256dh,
                    auth: auth
                }, { onConflict: 'endpoint' });

            if (dbError) throw dbError;

            setIsSubscribed(true);
            alert('Benachrichtigungen aktiviert!');
        } catch (err) {
            console.error('Push subscription error:', err);
            setError(err.message);
            alert('Fehler beim Aktivieren: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const _unsubscribeFromPush = async () => {
        // Logic to unsubscribe if needed
        // For now we assume users just want to enable it.
        // Real unsubscription involves removing from DB and PushManager.
    };

    if (!('serviceWorker' in navigator)) {
        return null; // Not supported
    }

    return (
        <div className="mt-4 p-4 bg-white rounded-lg shadow border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-2">Benachrichtigungen</h3>
            <p className="text-sm text-gray-600 mb-4">
                Erhalte eine Nachricht, wenn ein Kollege krank wird und ein Dienst frei wird.
            </p>

            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

            <button
                onClick={subscribeToPush}
                disabled={isSubscribed || loading}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${isSubscribed
                    ? 'bg-green-100 text-green-700 cursor-default'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
            >
                {loading ? 'Lade...' : isSubscribed ? '✅ Aktiviert' : '🔔 Benachrichtigungen aktivieren'}
            </button>
        </div>
    );
}
