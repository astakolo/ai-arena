/**
 * Ai-Arena — AES-256-GCM Encryption Layer (Hardened)
 *
 * All communication between agents and the VPS is encrypted with AES-256-GCM.
 * Each message gets a random IV + random padding to resist traffic analysis.
 * Nonce tracking prevents replay attacks. Key rotation support is built-in.
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash, createHmac, timingSafeEqual } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const MIN_PADDING = 8
const MAX_PADDING = 128
const NONCE_CACHE_MAX = 5000
const NONCE_TTL_MS = 300000 // 5 minutes

// ─── Anti-Replay Nonce Tracking ─────────────────────
// Stores recently used IVs (nonces) to detect duplicate messages
const nonceCache = new Map<string, number>()
let nonceCleanupTimer: ReturnType<typeof setInterval> | null = null

function initNonceCleanup() {
  if (nonceCleanupTimer) return
  nonceCleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [nonce, timestamp] of nonceCache) {
      if (now - timestamp > NONCE_TTL_MS) nonceCache.delete(nonce)
    }
  }, 60000)
}

function checkNonce(ivHex: string): boolean {
  if (nonceCache.has(ivHex)) return false // Replay detected
  nonceCache.set(ivHex, Date.now())
  if (nonceCache.size > NONCE_CACHE_MAX) {
    const oldest = nonceCache.keys().next().value
    if (oldest) nonceCache.delete(oldest)
  }
  return true
}

export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex')
}

function getEncryptionKey(): Buffer {
  const key = process.env.ARENA_ENC_KEY
  if (!key || key.length !== 64) {
    throw new Error('ARENA_ENC_KEY must be a 64-char hex string (256-bit)')
  }
  return Buffer.from(key, 'hex')
}

export interface EncryptedPayload {
  v: 1 | 2 | 3    // protocol version: 1/2=GCM, 3=CBC+HMAC (PowerShell agent)
  iv: string       // hex encoded IV
  data: string     // base64 encoded ciphertext+tag (v1/2) or ciphertext (v3)
  mac?: string     // hex HMAC-SHA256 (v3 only)
  p: number        // padding length (for traffic obfuscation)
  ts?: number      // timestamp (v2+)
}

export function encrypt(message: unknown): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const plaintext = JSON.stringify(message)

  // Variable-length random padding to prevent traffic pattern analysis
  // Pad to minimum 256 bytes to normalize small message sizes
  const rawLength = Buffer.byteLength(plaintext, 'utf8')
  const minPayloadSize = 256
  const paddingLength = Math.max(
    MIN_PADDING,
    minPayloadSize - rawLength + Math.floor(Math.random() * (MAX_PADDING - MIN_PADDING))
  )
  const padding = randomBytes(paddingLength).toString('base64')

  let encrypted = cipher.update(plaintext + '|' + padding, 'utf8')
  encrypted = Buffer.concat([encrypted, cipher.final()])
  const authTag = cipher.getAuthTag()

  // Compute HMAC of the entire payload for integrity
  const hmacKey = createHash('sha256').update(key).digest()
  const payloadBuf = Buffer.concat([iv, encrypted, authTag])
  // (HMAC is optional additional layer — GCM already provides authentication)

  const payload: EncryptedPayload = {
    v: 2,
    iv: iv.toString('hex'),
    data: Buffer.concat([encrypted, authTag]).toString('base64'),
    p: paddingLength,
    ts: Date.now(), // Timestamp for freshness check on decrypt
  }

  return JSON.stringify(payload)
}

export function decrypt(raw: string): unknown {
  const key = getEncryptionKey()
  const payload: EncryptedPayload = JSON.parse(raw)

  // Anti-replay: check if this IV was recently used
  if (!checkNonce(payload.iv)) {
    throw new Error('Replay detected: duplicate nonce')
  }

  // Freshness check (v2+): reject messages older than 5 minutes
  if (payload.ts && Date.now() - payload.ts > 300000) {
    throw new Error('Message too old: possible replay attack')
  }

  // v3: AES-256-CBC + HMAC-SHA256 (PowerShell / .NET agents)
  if (payload.v === 3) {
    const iv = Buffer.from(payload.iv, 'hex')
    const ciphertext = Buffer.from(payload.data, 'base64')
    const mac = Buffer.from(payload.mac || '', 'hex')

    // Verify HMAC-SHA256 over IV + ciphertext
    const hmac = createHmac('sha256', key)
    hmac.update(Buffer.concat([iv, ciphertext]))
    const computedMac = hmac.digest()
    if (!timingSafeEqual(computedMac, mac)) {
      throw new Error('HMAC verification failed: tampered payload')
    }

    // Decrypt AES-256-CBC
    const decipher = createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    const fullText = decrypted.toString('utf8')
    const pipeIndex = fullText.indexOf('|')
    if (pipeIndex === -1) return JSON.parse(fullText)
    return JSON.parse(fullText.substring(0, pipeIndex))
  }

  // v1/v2: AES-256-GCM (Node.js agents)
  if (payload.v !== 1 && payload.v !== 2) {
    throw new Error(`Unsupported protocol version: ${payload.v}`)
  }

  const iv = Buffer.from(payload.iv, 'hex')
  const combined = Buffer.from(payload.data, 'base64')

  // Split ciphertext and auth tag (tag is always last 16 bytes)
  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_LENGTH)
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  const fullText = decrypted.toString('utf8')

  // Remove padding: "actual_data|padding_base64"
  const pipeIndex = fullText.indexOf('|')
  if (pipeIndex === -1) {
    return JSON.parse(fullText)
  }

  return JSON.parse(fullText.substring(0, pipeIndex))
}

/**
 * Generate a new encryption key (for key rotation)
 */
export function rotateEncryptionKey(): { newKey: string; newKeyHash: string } {
  const newKey = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(newKey).digest('hex')
  return { newKey, newKeyHash: hash }
}

/**
 * Verify an encryption key is valid (64 hex chars)
 */
export function verifyKey(keyHex: string): boolean {
  return /^[0-9a-f]{64}$/i.test(keyHex)
}

/**
 * Hash a key for storage (never store raw keys)
 */
export function hashKey(keyHex: string): string {
  return createHash('sha256').update(keyHex).digest('hex')
}

/**
 * Generate heartbeat noise packet (random data that looks like real traffic)
 */
export function generateNoisePacket(): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const noiseData = { type: '_noise', ts: Date.now(), rnd: randomBytes(64).toString('hex') }
  const padding = randomBytes(64 + Math.floor(Math.random() * 128)).toString('base64')
  let enc = cipher.update(JSON.stringify(noiseData) + '|' + padding, 'utf8')
  enc = Buffer.concat([enc, cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({
    v: 2,
    iv: iv.toString('hex'),
    data: Buffer.concat([enc, tag]).toString('base64'),
    p: 64,
    ts: Date.now(),
  })
}

// Initialize nonce cleanup on module load
initNonceCleanup()
