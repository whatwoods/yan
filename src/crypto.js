// crypto.js — Master-password encryption using PBKDF2 + AES-GCM (Web Crypto API).
// No external dependencies — uses browser-native crypto.subtle.

const PBKDF2_ITERATIONS = 600000;

/**
 * Derive an AES-256-GCM key from a password and salt using PBKDF2.
 */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt arbitrary data with a password.
 * Returns a base64 string containing: 12-byte IV + AES-GCM ciphertext.
 */
export async function encryptSecrets(data, password, salt) {
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64 string produced by encryptSecrets.
 * Returns the parsed data, or null if the password is wrong or data is corrupted.
 */
export async function decryptSecrets(encryptedBase64, password, salt) {
  try {
    const key = await deriveKey(password, salt);
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, key, ciphertext
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null; // wrong password or corrupted data
  }
}
