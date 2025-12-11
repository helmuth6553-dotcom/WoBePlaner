import crypto from 'crypto';

// VAPID keys are essentially NIST P-256 (prime256v1) Elliptic Curve keys
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
});

// Convert to URL-safe Base64 (RFC 7515)
function toUrlSafeBase64(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// Export keys in correct format
const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });

// We need the raw coordinates for the public key to create the standard "VAPID Public Key" string
// Validation: Public Key starts with 0x04 (uncompressed) + x + y
const x = Buffer.from(publicJwk.x, 'base64');
const y = Buffer.from(publicJwk.y, 'base64');
const rawPublicKey = Buffer.concat([Buffer.from([0x04]), x, y]);

const d = Buffer.from(privateJwk.d, 'base64');

console.log('--- VAPID KEYS ---');
console.log('Public Key:', toUrlSafeBase64(rawPublicKey));
console.log('Private Key:', toUrlSafeBase64(d));
console.log('------------------');
