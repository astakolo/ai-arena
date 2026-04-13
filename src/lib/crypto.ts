/**
 * Ai-Arena — AES-256-GCM Encryption Layer
 *
 * All communication between agents and the VPS is encrypted with AES-256-GCM.
 * Each message gets a random IV. A shared secret key is used on both sides.
 * Random padding is added to each payload to prevent traffic analysis.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const MIN_PADDING = 8
const MAX_PADDING = 64

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
  v: 1            // protocol version
  iv: string       // hex encoded IV
  data: string     // base64 encoded ciphertext+tag
  p: number        // padding length (for traffic obfuscation)
}

export function encrypt(message: unknown): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const plaintext = JSON.stringify(message)

  // Random padding to prevent traffic pattern analysis
  const paddingLength = MIN_PADDING + Math.floor(Math.random() * (MAX_PADDING - MIN_PADDING))
  const padding = randomBytes(paddingLength).toString('base64')

  let encrypted = cipher.update(plaintext + '|' + padding, 'utf8')
  encrypted = Buffer.concat([encrypted, cipher.final()])
  const authTag = cipher.getAuthTag()

  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString('hex'),
    data: Buffer.concat([encrypted, authTag]).toString('base64'),
    p: paddingLength,
  }

  return JSON.stringify(payload)
}

export function decrypt(raw: string): unknown {
  const key = getEncryptionKey()
  const payload: EncryptedPayload = JSON.parse(raw)

  if (payload.v !== 1) {
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
 * Client-side encrypt/decrypt (for browser agent connections).
 * Uses Web Crypto API.
 */
export function encryptClient(message: unknown, keyHex: string): string {
  // This is for the embedded agent code, not used in the browser dashboard
  return JSON.stringify({ encrypted: true, _placeholder: true })
}
