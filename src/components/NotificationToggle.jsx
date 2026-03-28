import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Bell, Clock, Calendar, Thermometer } from 'lucide-react';

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

// Notification type definitions
const NOTIFICATION_TYPES = [
    {
        key: 'shift_reminder',
        label: 'Schicht-Erinnerung',
        description: '15 Minuten vor Dienstbeginn',
        icon: Clock,
        color: 'blue'
    },
    {
        key: 'monthly_closing',
        label: 'Monats-Erinnerung',
        description: 'Am Monatsende: Zeiten abschließen',
        icon: Calendar,
        color: 'purple'
    },
    {
        key: 'sick_alert',
        label: 'Dienstausfall',
        description: 'Kollege krank, Dienst frei',
        icon: Thermometer,
        color: 'red'
    }
];

export default function NotificationToggle() {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [error, setError] = useState(null);
    const [userId, setUserId] = useState(null);

    // Preferences state
    const [preferences, setPreferences] = useState({
        shift_reminder: true,
        monthly_closing: true,
        sick_alert: true
    });

    useEffect(() => {
        initializeState();
    }, []);

    const initializeState = async () => {
        // Check if subscribed
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);

        // Load user and preferences
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUserId(user.id);
            await loadPreferences(user.id);

            // Auto-renew: sync current browser subscription to DB on every load
            // This prevents stale FCM endpoints from causing silent push failures
            if (subscription) {
                const p256dh = arrayBufferToBase64(subscription.getKey('p256dh'));
                const auth = arrayBufferToBase64(subscription.getKey('auth'));

                // Delete stale subscriptions for this user on this endpoint prefix
                // (FCM endpoints change over time, old ones silently fail)
                const currentEndpoint = subscription.endpoint;
                const { data: existingSubs } = await supabase
                    .from('push_subscriptions')
                    .select('endpoint')
                    .eq('user_id', user.id);

                if (existingSubs) {
                    const staleEndpoints = existingSubs
                        .map(s => s.endpoint)
                        .filter(ep => ep !== currentEndpoint);
                    if (staleEndpoints.length > 0) {
                        await supabase
                            .from('push_subscriptions')
                            .delete()
                            .eq('user_id', user.id)
                            .in('endpoint', staleEndpoints);
                    }
                }

                await supabase
                    .from('push_subscriptions')
                    .upsert({
                        user_id: user.id,
                        endpoint: currentEndpoint,
                        p256dh,
                        auth
                    }, { onConflict: 'endpoint' });
            }
        }
    };

    const loadPreferences = async (uid) => {
        const { data, error } = await supabase
            .from('notification_preferences')
            .select('*')
            .eq('user_id', uid)
            .maybeSingle();

        if (error) {
            console.error('Error loading preferences:', error);
            return;
        }

        if (data) {
            setPreferences({
                shift_reminder: data.shift_reminder ?? true,
                monthly_closing: data.monthly_closing ?? true,
                sick_alert: data.sick_alert ?? true
            });
        }
    };

    const savePreferences = async (newPrefs) => {
        if (!userId) return;

        setSavingPrefs(true);
        const { error } = await supabase
            .from('notification_preferences')
            .upsert({
                user_id: userId,
                ...newPrefs
            }, { onConflict: 'user_id' });

        if (error) {
            console.error('Error saving preferences:', error);
            setError('Fehler beim Speichern');
        }
        setSavingPrefs(false);
    };

    const togglePreference = async (key) => {
        const newPrefs = {
            ...preferences,
            [key]: !preferences[key]
        };
        setPreferences(newPrefs);
        await savePreferences(newPrefs);
    };

    const subscribeToPush = async () => {
        setLoading(true);
        setError(null);
        try {
            if (!('serviceWorker' in navigator)) {
                throw new Error('Service Worker not supported');
            }

            // Add timeout to prevent infinite hanging
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Service Worker Timeout - bitte Seite neu laden')), 10000)
            );

            const registration = await Promise.race([
                navigator.serviceWorker.ready,
                timeoutPromise
            ]);

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

            // Also create default preferences if not exists
            await supabase
                .from('notification_preferences')
                .upsert({
                    user_id: user.id,
                    shift_reminder: true,
                    monthly_closing: true,
                    sick_alert: true
                }, { onConflict: 'user_id' });

            setIsSubscribed(true);
            setUserId(user.id);
            alert('Benachrichtigungen aktiviert!');
        } catch (err) {
            console.error('Push subscription error:', err);
            setError(err.message);
            alert('Fehler beim Aktivieren: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!('serviceWorker' in navigator)) {
        return null; // Not supported
    }

    return (
        <div className="mt-4 p-4 bg-white rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-3">
                <Bell className="text-gray-600" size={20} />
                <h3 className="font-bold text-gray-800">Benachrichtigungen</h3>
            </div>

            {error && <p className="text-red-500 text-sm mb-3 bg-red-50 p-2 rounded">{error}</p>}

            {!isSubscribed ? (
                <div>
                    <p className="text-sm text-gray-500 mb-4">
                        Aktiviere Push-Benachrichtigungen um keine wichtigen Updates zu verpassen.
                    </p>
                    <button
                        onClick={subscribeToPush}
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? 'Wird aktiviert...' : (
                            <>
                                <Bell size={18} />
                                Benachrichtigungen aktivieren
                            </>
                        )}
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded inline-block mb-2">
                        ✅ Push aktiviert
                    </p>

                    {NOTIFICATION_TYPES.map(type => {
                        const Icon = type.icon;
                        const isEnabled = preferences[type.key];
                        const colorClasses = {
                            blue: 'bg-blue-50 text-blue-600 border-blue-200',
                            purple: 'bg-purple-50 text-purple-600 border-purple-200',
                            red: 'bg-red-50 text-red-600 border-red-200'
                        };

                        return (
                            <div
                                key={type.key}
                                onClick={() => togglePreference(type.key)}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isEnabled
                                    ? colorClasses[type.color]
                                    : 'bg-gray-50 text-gray-400 border-gray-200'
                                    }`}
                            >
                                <div className={`p-2 rounded-full ${isEnabled ? 'bg-white' : 'bg-gray-100'}`}>
                                    <Icon size={18} />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium text-sm">{type.label}</div>
                                    <div className={`text-xs ${isEnabled ? 'opacity-70' : 'opacity-50'}`}>
                                        {type.description}
                                    </div>
                                </div>
                                <div className={`w-10 h-6 rounded-full flex items-center transition-all ${isEnabled ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'
                                    }`}>
                                    <div className="w-5 h-5 bg-white rounded-full shadow mx-0.5"></div>
                                </div>
                            </div>
                        );
                    })}

                    {savingPrefs && (
                        <p className="text-xs text-gray-400 text-center">Wird gespeichert...</p>
                    )}
                </div>
            )}
        </div>
    );
}
