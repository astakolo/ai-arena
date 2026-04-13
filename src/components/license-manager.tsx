'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { LicenseKey } from '@/lib/store'
import {
  KeyRound,
  Plus,
  Copy,
  Ban,
  Search,
  Check,
  Server,
  ShieldCheck,
  ShieldX,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface LicenseManagerProps {
  licenseKeys: LicenseKey[]
  onGenerate: () => void
  onRevoke: (id: string) => void
  isLoading?: boolean
}

export function LicenseManager({ licenseKeys, onGenerate, onRevoke, isLoading }: LicenseManagerProps) {
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)

  const filtered = licenseKeys.filter(
    (k) =>
      k.key.toLowerCase().includes(search.toLowerCase()) ||
      k.server?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = licenseKeys.filter((k) => k.isActive).length
  const revokedCount = licenseKeys.filter((k) => !k.isActive).length

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast.success('License key copied to clipboard')
  }

  const maskKey = (key: string) => {
    if (key.length <= 12) return key
    return key.slice(0, 8) + '••••••••••••••' + key.slice(-4)
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="w-4 h-4 text-zinc-400" />
            <span className="text-xs text-zinc-500">Total Keys</span>
          </div>
          <div className="text-xl font-bold text-white">{licenseKeys.length}</div>
        </div>
        <div className="bg-zinc-900/80 border border-emerald-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-zinc-500">Active</span>
          </div>
          <div className="text-xl font-bold text-emerald-400">{activeCount}</div>
        </div>
        <div className="bg-zinc-900/80 border border-red-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldX className="w-4 h-4 text-red-400" />
            <span className="text-xs text-zinc-500">Revoked</span>
          </div>
          <div className="text-xl font-bold text-red-400">{revokedCount}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keys or servers..."
            className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
          />
        </div>
        <Button
          onClick={onGenerate}
          disabled={isLoading}
          className="bg-emerald-600 hover:bg-emerald-700 text-white h-9"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Generate Key
        </Button>
      </div>

      {/* Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 text-xs">License Key</TableHead>
              <TableHead className="text-zinc-400 text-xs">Server</TableHead>
              <TableHead className="text-zinc-400 text-xs">Status</TableHead>
              <TableHead className="text-zinc-400 text-xs">Created</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableCell colSpan={5} className="text-center py-8">
                  <KeyRound className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">
                    {search ? 'No keys match your search' : 'No license keys generated yet'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((key) => (
                <TableRow key={key.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-zinc-300 bg-zinc-800 px-2 py-1 rounded">
                        {maskKey(key.key)}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell>
                    {key.server ? (
                      <div className="flex items-center gap-1.5">
                        <Server className="w-3 h-3 text-zinc-500" />
                        <span className="text-xs text-zinc-300">{key.server.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] border-0',
                        key.isActive
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      )}
                    >
                      {key.isActive ? 'Active' : 'Revoked'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs text-zinc-500">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-400 hover:text-white"
                        onClick={() => copyKey(key.key, key.id)}
                      >
                        {copiedId === key.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      {key.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-zinc-400 hover:text-red-400"
                          onClick={() => setRevokeId(key.id)}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Revoke Dialog */}
      <AlertDialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Revoke License Key</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to revoke this license key? The associated server will no longer be
              able to authenticate with Ai-Arena.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (revokeId) {
                  onRevoke(revokeId)
                  setRevokeId(null)
                }
              }}
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
