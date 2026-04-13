import { z } from 'zod'

/**
 * Zod validation schemas for Ai-Arena API routes.
 * All incoming API data is validated against these schemas.
 */

export const createServerSchema = z.object({
  name: z.string().min(1, 'Server name is required').max(100, 'Name too long'),
  hostname: z.string().min(1, 'Hostname is required').max(255).regex(
    /^[a-zA-Z0-9][a-zA-Z0-9\-_.]*$/,
    'Hostname must be alphanumeric with hyphens, underscores, or dots'
  ),
  ip: z.string().min(1, 'IP address is required').max(45).regex(
    /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^[a-fA-F0-9:]+$|^[\w.\-]+$/,
    'Invalid IP address format'
  ),
  port: z.number().int().min(1).max(65535).optional().default(3001),
  os: z.string().max(100).optional(),
  cpu: z.string().max(100).optional(),
  ram: z.string().max(50).optional(),
})

export const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  hostname: z.string().min(1).max(255).optional(),
  ip: z.string().min(1).max(45).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  os: z.string().max(100).nullable().optional(),
  cpu: z.string().max(100).nullable().optional(),
  ram: z.string().max(50).nullable().optional(),
  status: z.enum(['online', 'offline', 'connecting']).optional(),
})

export const verifyLicenseSchema = z.object({
  key: z.string().min(1, 'License key is required').max(100),
})

export const createLicenseSchema = z.object({
  serverId: z.string().max(100).optional(),
})

export const geoLookupSchema = z.object({
  ip: z.string().min(1, 'IP address is required').max(45),
})

export const createAuditLogSchema = z.object({
  serverId: z.string().min(1, 'Server ID is required').max(100),
  eventType: z.enum(['command', 'keystroke', 'login', 'process', 'window_change', 'file_access', 'clipboard']),
  username: z.string().max(100).optional().default('Unknown'),
  command: z.string().max(10000).optional(),
  windowTitle: z.string().max(500).optional(),
  processName: z.string().max(255).optional(),
  keysLogged: z.string().max(10000).optional(),
})

export type CreateServerInput = z.infer<typeof createServerSchema>
export type UpdateServerInput = z.infer<typeof updateServerSchema>
export type VerifyLicenseInput = z.infer<typeof verifyLicenseSchema>
export type CreateAuditLogInput = z.infer<typeof createAuditLogSchema>
