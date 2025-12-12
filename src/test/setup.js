/**
 * Vitest Setup for React Component Testing
 * This file is run before each test file.
 */
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with Testing Library matchers
expect.extend(matchers);

// Cleanup after each test to prevent memory leaks
afterEach(() => {
    cleanup();
});

// Mock window.matchMedia for components that use it
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => { },
        removeListener: () => { },
        addEventListener: () => { },
        removeEventListener: () => { },
        dispatchEvent: () => { },
    }),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
    observe = () => null;
    disconnect = () => null;
    unobserve = () => null;
}
Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
});

// Mock crypto.subtle for security tests
if (!global.crypto) {
    const { webcrypto } = require('crypto');
    global.crypto = webcrypto;
}
