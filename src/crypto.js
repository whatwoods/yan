// crypto.js — Master-password encryption using PBKDF2 + AES-GCM (Web Crypto API).
// No external dependencies — uses browser-native crypto.subtle.

import { getMeta, setMeta } from './db.js';

const PBKDF2_ITERATIONS = 600000;

// Salt: generated once, stored in IndexedDB meta so it syncs with encrypted secrets.
async function getSalt() {
  let salt = await getMeta('salt');
  if (!salt) {
    const arr = crypto.getRandomValues(new Uint8Array(24));
    salt = btoa(String.fromCharCode(...arr));
    await setMeta('salt', salt);
  }
  return salt;
}

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

// ── SecretsStore — manages encrypted secrets lifecycle ─────────

export const SecretsStore = {
  _cache: null,   // { apiKey, webdavPassword, ... } in memory while unlocked
  _password: null, // master password cached for re-encryption during session

  /** Check if master password has been configured. */
  async isSetup() {
    return !!(await getMeta('masterPwVerify'));
  },

  /** Check if secrets are currently decrypted in memory. */
  isUnlocked() {
    return this._cache !== null;
  },

  /**
   * First-time setup: encrypt current plaintext secrets and store.
   * @param {string} password - master password
   * @param {object} secrets - { apiKey, webdavPassword, ... }
   */
  async setup(password, secrets) {
    const salt = await getSalt();
    const verify = await encryptSecrets({ v: 1 }, password, salt);
    await setMeta('masterPwVerify', verify);
    const encrypted = await encryptSecrets(secrets, password, salt);
    await setMeta('secrets', encrypted);
    this._cache = { ...secrets };
    this._password = password;
  },

  /**
   * Unlock secrets with master password.
   * @returns {boolean} true if password correct and secrets decrypted
   */
  async unlock(password) {
    const verify = await getMeta('masterPwVerify');
    if (!verify) return false;
    const salt = await getSalt();
    const check = await decryptSecrets(verify, password, salt);
    if (!check || !check.v) return false;
    const encrypted = await getMeta('secrets');
    if (!encrypted) { this._cache = {}; this._password = password; return true; }
    const data = await decryptSecrets(encrypted, password, salt);
    if (!data) return false;
    this._cache = { ...data };
    this._password = password;
    return true;
  },

  /** Lock: clear in-memory cache. */
  lock() {
    this._cache = null;
    this._password = null;
  },

  /** Get a secret field value. Returns null if locked. */
  get(field) {
    return this._cache?.[field] ?? null;
  },

  /**
   * Update secrets (re-encrypt with cached password).
   * @param {object} secrets - full secrets object to persist
   */
  async update(secrets) {
    if (!this._password) return;
    const encrypted = await encryptSecrets(secrets, this._password, await getSalt());
    await setMeta('secrets', encrypted);
    this._cache = { ...secrets };
  },

  /** Remove master password and all encrypted secrets. */
  async clear() {
    this._cache = null;
    this._password = null;
    await setMeta('masterPwVerify', null);
    await setMeta('secrets', null);
    await setMeta('masterPasswordSet', null);
    await setMeta('salt', null);
  },
};
