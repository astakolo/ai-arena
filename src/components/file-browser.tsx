'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Folder,
  File,
  FileText,
  FileImage,
  FileCode,
  FileArchive,
  ChevronRight,
  ChevronUp,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Grid3X3,
  List,
  Search,
  Home,
  HardDrive,
  Clock,
  MoreVertical,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface FileBrowserProps {
  isConnected: boolean
  serverName?: string
}

interface FileItem {
  name: string
  type: 'file' | 'folder'
  size: string
  modified: string
  ext?: string
}

// Simulated Windows file system
function getFileIcon(item: FileItem) {
  if (item.type === 'folder') return <Folder className="w-4 h-4 text-yellow-400" />
  const ext = item.ext?.toLowerCase()
  if (ext === '.txt' || ext === '.log' || ext === '.md') return <FileText className="w-4 h-4 text-blue-400" />
  if (['.jpg', '.png', '.gif', '.bmp', '.svg'].includes(ext || '')) return <FileImage className="w-4 h-4 text-purple-400" />
  if (['.js', '.ts', '.py', '.html', '.css', '.json', '.xml'].includes(ext || '')) return <FileCode className="w-4 h-4 text-emerald-400" />
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext || '')) return <FileArchive className="w-4 h-4 text-orange-400" />
  return <File className="w-4 h-4 text-zinc-400" />
}

const simulatedFS: Record<string, FileItem[]> = {
  'C:\\': [
    { name: 'Users', type: 'folder', size: '', modified: '2026-03-15 09:00' },
    { name: 'Windows', type: 'folder', size: '', modified: '2026-01-10 08:30' },
    { name: 'Program Files', type: 'folder', size: '', modified: '2026-02-20 14:15' },
    { name: 'Program Files (x86)', type: 'folder', size: '', modified: '2026-02-20 14:15' },
    { name: 'ProgramData', type: 'folder', size: '', modified: '2026-03-01 11:00' },
    { name: 'inetpub', type: 'folder', size: '', modified: '2026-01-05 10:00' },
    { name: 'RemoteHub', type: 'folder', size: '', modified: '2026-04-10 16:30' },
    { name: 'pagefile.sys', type: 'file', size: '8.00 GB', modified: '2026-04-13 07:00', ext: '.sys' },
    { name: 'hiberfil.sys', type: 'file', size: '3.24 GB', modified: '2026-04-13 07:00', ext: '.sys' },
  ],
  'C:\\RemoteHub': [
    { name: 'remotehub-agent.js', type: 'file', size: '12.4 KB', modified: '2026-04-10 16:30', ext: '.js' },
    { name: 'package.json', type: 'file', size: '1.2 KB', modified: '2026-04-10 16:28', ext: '.json' },
    { name: 'node_modules', type: 'folder', size: '', modified: '2026-04-10 16:29' },
    { name: 'logs', type: 'folder', size: '', modified: '2026-04-13 08:00' },
    { name: 'config', type: 'folder', size: '', modified: '2026-04-10 16:25' },
    { name: 'install.bat', type: 'file', size: '2.1 KB', modified: '2026-04-10 16:30', ext: '.bat' },
    { name: 'README.md', type: 'file', size: '4.5 KB', modified: '2026-04-10 16:22', ext: '.md' },
  ],
  'C:\\RemoteHub\\logs': [
    { name: 'agent-2026-04-13.log', type: 'file', size: '24.8 KB', modified: '2026-04-13 08:15', ext: '.log' },
    { name: 'agent-2026-04-12.log', type: 'file', size: '18.2 KB', modified: '2026-04-12 23:59', ext: '.log' },
    { name: 'agent-2026-04-11.log', type: 'file', size: '21.6 KB', modified: '2026-04-11 23:59', ext: '.log' },
    { name: 'error-2026-04-10.log', type: 'file', size: '3.1 KB', modified: '2026-04-10 22:45', ext: '.log' },
  ],
  'C:\\RemoteHub\\config': [
    { name: 'settings.json', type: 'file', size: '0.8 KB', modified: '2026-04-10 16:25', ext: '.json' },
    { name: 'firewall-rules.bat', type: 'file', size: '1.4 KB', modified: '2026-04-10 16:20', ext: '.bat' },
  ],
  'C:\\Users': [
    { name: 'Admin', type: 'folder', size: '', modified: '2026-04-13 07:45' },
    { name: 'Public', type: 'folder', size: '', modified: '2026-01-10 08:30' },
  ],
  'C:\\Users\\Admin': [
    { name: 'Desktop', type: 'folder', size: '', modified: '2026-04-13 08:00' },
    { name: 'Documents', type: 'folder', size: '', modified: '2026-04-12 15:30' },
    { name: 'Downloads', type: 'folder', size: '', modified: '2026-04-11 10:20' },
    { name: 'Pictures', type: 'folder', size: '', modified: '2026-03-25 09:00' },
    { name: 'AppData', type: 'folder', size: '', modified: '2026-04-13 07:45' },
  ],
  'C:\\Users\\Admin\\Desktop': [
    { name: 'backup-script.ps1', type: 'file', size: '5.2 KB', modified: '2026-04-12 14:00', ext: '.ps1' },
    { name: 'server-inventory.xlsx', type: 'file', size: '156 KB', modified: '2026-04-11 16:30', ext: '.xlsx' },
    { name: 'network-diagram.png', type: 'file', size: '2.3 MB', modified: '2026-04-10 11:00', ext: '.png' },
    { name: 'notes.txt', type: 'file', size: '1.1 KB', modified: '2026-04-09 09:15', ext: '.txt' },
  ],
  'C:\\Users\\Admin\\Documents': [
    { name: 'deploy-checklist.md', type: 'file', size: '3.4 KB', modified: '2026-04-12 15:30', ext: '.md' },
    { name: 'client-credentials.json', type: 'file', size: '0.6 KB', modified: '2026-04-08 10:00', ext: '.json' },
    { name: 'Quarterly Report.docx', type: 'file', size: '245 KB', modified: '2026-03-28 14:00', ext: '.docx' },
  ],
  'C:\\Windows': [
    { name: 'System32', type: 'folder', size: '', modified: '2026-01-10 08:30' },
    { name: 'SysWOW64', type: 'folder', size: '', modified: '2026-01-10 08:30' },
    { name: 'Temp', type: 'folder', size: '', modified: '2026-04-13 06:00' },
    { name: 'Fonts', type: 'folder', size: '', modified: '2026-01-10 08:30' },
  ],
  'C:\\Program Files': [
    { name: 'nodejs', type: 'folder', size: '', modified: '2026-02-20 14:15' },
    { name: 'Common Files', type: 'folder', size: '', modified: '2026-01-10 08:30' },
    { name: 'Windows Defender', type: 'folder', size: '', modified: '2026-04-01 12:00' },
    { name: 'RemoteHub Service', type: 'folder', size: '', modified: '2026-04-10 16:35' },
  ],
}

export function FileBrowser({ isConnected, serverName }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState('C:\\')
  const [pathHistory, setPathHistory] = useState<string[]>(['C:\\'])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const files = simulatedFS[currentPath] || []

  const navigateTo = useCallback((path: string) => {
    if (!simulatedFS[path]) {
      toast.info(`Folder "${path}" is empty or not accessible`)
      return
    }
    const newHistory = [...pathHistory.slice(0, historyIndex + 1), path]
    setPathHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setCurrentPath(path)
    setSelectedFile(null)
    setSearchQuery('')
  }, [pathHistory, historyIndex])

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1)
      setCurrentPath(pathHistory[historyIndex - 1])
      setSelectedFile(null)
    }
  }, [historyIndex, pathHistory])

  const goForward = useCallback(() => {
    if (historyIndex < pathHistory.length - 1) {
      setHistoryIndex(historyIndex + 1)
      setCurrentPath(pathHistory[historyIndex + 1])
      setSelectedFile(null)
    }
  }, [historyIndex, pathHistory])

  const goUp = useCallback(() => {
    const parts = currentPath.split('\\')
    if (parts.length > 1 && parts[parts.length - 1] !== '') {
      parts.pop()
      const parentPath = parts.join('\\') || 'C:\\'
      navigateTo(parentPath)
    }
  }, [currentPath, navigateTo])

  const handleDoubleClick = (item: FileItem) => {
    if (item.type === 'folder') {
      const newPath = currentPath.endsWith('\\') ? currentPath + item.name : currentPath + '\\' + item.name
      navigateTo(newPath)
    } else {
      toast.info(`Opening "${item.name}"...`)
    }
  }

  const filteredFiles = searchQuery
    ? files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files

  const sortedFiles = [
    ...filteredFiles.filter((f) => f.type === 'folder').sort((a, b) => a.name.localeCompare(b.name)),
    ...filteredFiles.filter((f) => f.type === 'file').sort((a, b) => a.name.localeCompare(b.name)),
  ]

  const breadcrumbs = currentPath.split('\\').filter(Boolean)

  if (!isConnected) {
    return (
      <div className="bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-900 border-b border-zinc-800">
          <Folder className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-300">File Browser</span>
        </div>
        <div className="flex flex-col items-center justify-center py-16 bg-zinc-950">
          <HardDrive className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-xs text-zinc-500">Connect to a server to browse files</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-950 rounded-xl overflow-hidden border border-emerald-500/30">
      {/* Toolbar */}
      <div className="px-3 py-2 bg-zinc-900 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-yellow-400" />
            <span className="text-xs font-medium text-zinc-300">File Browser</span>
            {serverName && (
              <span className="text-[10px] text-zinc-600 font-mono">{serverName}</span>
            )}
            <Badge className="text-[8px] bg-emerald-500/15 text-emerald-400 border-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
              Live
            </Badge>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-white"
              onClick={() => toast.info('Upload feature requires agent connection')}
            >
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-white"
              onClick={() => selectedFile && toast.info(`Downloading "${selectedFile.name}"...`)}
              disabled={!selectedFile || selectedFile.type === 'folder'}
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-red-400"
              onClick={() => selectedFile && toast.info(`Deleting "${selectedFile.name}"...`)}
              disabled={!selectedFile}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <div className="w-px h-4 bg-zinc-800 mx-0.5" />
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', viewMode === 'list' ? 'text-emerald-400' : 'text-zinc-500 hover:text-white')}
              onClick={() => setViewMode('list')}
            >
              <List className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', viewMode === 'grid' ? 'text-emerald-400' : 'text-zinc-500 hover:text-white')}
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-white shrink-0"
            onClick={goBack}
            disabled={historyIndex <= 0}
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-white shrink-0"
            onClick={goForward}
            disabled={historyIndex >= pathHistory.length - 1}
          >
            <ChevronRight className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-white shrink-0"
            onClick={goUp}
          >
            <ChevronUp className="w-3 h-3" />
          </Button>
          <div className="relative flex-1">
            <HardDrive className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
            <Input
              value={currentPath}
              onChange={(e) => {
                const newPath = e.target.value
                setCurrentPath(newPath)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  navigateTo(currentPath)
                }
              }}
              className="h-6 pl-6 pr-3 bg-zinc-950 border-zinc-800 text-xs font-mono text-zinc-300"
            />
          </div>
        </div>

        {/* Breadcrumbs + Search */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5 text-[10px] overflow-x-auto">
            <button
              onClick={() => navigateTo('C:\\')}
              className="px-1.5 py-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              <Home className="w-3 h-3" />
            </button>
            {breadcrumbs.map((part, i) => (
              <div key={i} className="flex items-center gap-0.5 shrink-0">
                <ChevronRight className="w-2.5 h-2.5 text-zinc-700" />
                <button
                  onClick={() => navigateTo(breadcrumbs.slice(0, i + 1).join('\\') + '\\')}
                  className={cn(
                    'px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors',
                    i === breadcrumbs.length - 1 ? 'text-zinc-200' : 'text-zinc-500 hover:text-white'
                  )}
                >
                  {part}
                </button>
              </div>
            ))}
          </div>
          <div className="relative w-44 shrink-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="h-5 pl-6 pr-2 bg-zinc-950 border-zinc-800 text-[10px] font-mono text-zinc-300"
            />
          </div>
        </div>
      </div>

      {/* File list / grid */}
      <div className={viewMode === 'grid' ? 'p-3 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-[420px] overflow-y-auto' : 'max-h-[420px] overflow-y-auto'}>
        {viewMode === 'list' ? (
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-zinc-500 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium w-24">Size</th>
                <th className="text-left px-3 py-2 font-medium w-36">Modified</th>
                <th className="text-left px-3 py-2 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((item, i) => (
                <tr
                  key={i}
                  className={cn(
                    'cursor-pointer transition-colors text-xs',
                    selectedFile?.name === item.name ? 'bg-emerald-500/10' : 'hover:bg-zinc-900/80',
                    i % 2 === 0 ? 'bg-transparent' : 'bg-zinc-950/30'
                  )}
                  onClick={() => setSelectedFile(item)}
                  onDoubleClick={() => handleDoubleClick(item)}
                >
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      {getFileIcon(item)}
                      <span className={cn(
                        'font-mono text-xs',
                        item.type === 'folder' ? 'text-zinc-200' : 'text-zinc-400'
                      )}>
                        {item.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-zinc-600 text-[10px] font-mono">
                    {item.type === 'file' ? item.size : ''}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-600 text-[10px] font-mono">
                    {item.modified}
                  </td>
                  <td className="px-3 py-1.5">
                    <MoreVertical className="w-3 h-3 text-zinc-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          sortedFiles.map((item, i) => (
            <div
              key={i}
              className={cn(
                'flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer transition-colors',
                selectedFile?.name === item.name ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'hover:bg-zinc-900/80'
              )}
              onClick={() => setSelectedFile(item)}
              onDoubleClick={() => handleDoubleClick(item)}
            >
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                {item.type === 'folder' ? (
                  <Folder className="w-5 h-5 text-yellow-400" />
                ) : (
                  getFileIcon(item)
                )}
              </div>
              <span className="text-[10px] text-zinc-400 text-center truncate w-full font-mono" title={item.name}>
                {item.name}
              </span>
              {item.type === 'file' && (
                <span className="text-[8px] text-zinc-600 font-mono">{item.size}</span>
              )}
            </div>
          ))
        )}

        {sortedFiles.length === 0 && (
          <div className="text-center py-12">
            <Folder className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-600">
              {searchQuery ? 'No files match your search' : 'This folder is empty'}
            </p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-3 py-1.5 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-600">
        <div className="flex items-center gap-3">
          <span>{sortedFiles.length} items</span>
          {selectedFile && (
            <span className="text-zinc-400">
              Selected: {selectedFile.name}
              {selectedFile.type === 'file' && ` (${selectedFile.size})`}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {files.length} total
        </span>
      </div>
    </div>
  )
}
