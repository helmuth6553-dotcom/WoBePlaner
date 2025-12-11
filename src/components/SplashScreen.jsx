import React from 'react';

export default function SplashScreen() {
    return (
        <div className="fixed inset-0 bg-white z-[9999] flex items-center justify-center">
            <div className="flex flex-col items-center animate-pulse">
                <img
                    src="/logo2.png"
                    alt="WoBePlaner Logo"
                    className="w-48 h-48 object-contain"
                />
            </div>
        </div>
    );
}
