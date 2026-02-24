import { useCallback } from 'react'
import {
  Folder,
  File,
  FileCode,
  FileJson,
  Image,
  FileType,
  Braces,
  Hash,
} from 'lucide-react'
import { FileEntry } from '../../lib/types'
import {
  getExtensionColor,
  getExtensionLabel,
  formatFileSize,
  getGitStatusInfo,
} from '../../lib/fileUtils'

interface FileGridProps {
  files: FileEntry[]
  onNavigate?: (entry: FileEntry) => void
  onSelect?: (entry: FileEntry | null) => void
  selectedPath?: string | null
  gitStatuses?: Record<string, string>
}

function getGridIcon(name: string, size: number) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const cls = `w-${size} h-${size}`
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs':
      return <FileCode style={{ width: size * 4, height: size * 4 }} />
    case 'json':
      return <FileJson style={{ width: size * 4, height: size * 4 }} />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'svg': case 'ico':
      return <Image style={{ width: size * 4, height: size * 4 }} />
    case 'css': case 'scss': case 'less':
      return <Braces style={{ width: size * 4, height: size * 4 }} />
    case 'md': case 'mdx': case 'txt':
      return <FileType style={{ width: size * 4, height: size * 4 }} />
    case 'py': case 'rs': case 'go': case 'java': case 'rb': case 'c': case 'cpp': case 'h':
      return <Hash style={{ width: size * 4, height: size * 4 }} />
    default:
      return <File style={{ width: size * 4, height: size * 4 }} />
  }
}

export function FileGrid({ files, onNavigate, onSelect, selectedPath, gitStatuses }: FileGridProps) {
  const handleClick = useCallback(
    (file: FileEntry) => {
      if (file.isDirectory) {
        onNavigate?.(file)
      } else {
        onSelect?.(file)
      }
    },
    [onNavigate, onSelect]
  )

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-ghost-text-dim/40">
        <Folder className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs">Empty directory</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-1 py-1 px-1">
      {files.map((file) => {
        const extColor = !file.isDirectory ? getExtensionColor(file.name) : null
        const extLabel = !file.isDirectory ? getExtensionLabel(file.name) : null
        const isSelected = selectedPath === file.path
        const gitCode = gitStatuses?.[file.name]
        const gitInfo = gitCode ? getGitStatusInfo(gitCode) : null
        const sizeStr = !file.isDirectory ? formatFileSize(file.size) : null

        return (
          <button
            key={file.path}
            onClick={() => handleClick(file)}
            className={`relative flex flex-col items-center gap-1 p-3 rounded-2xl transition-all duration-100 group ${
              isSelected
                ? 'bg-indigo-950/40 border border-ghost-accent/25'
                : 'border border-transparent hover:bg-slate-800/40 hover:border-ghost-border/20'
            } ${file.isDirectory ? 'cursor-pointer' : ''}`}
          >
            {/* Git status dot */}
            {gitInfo && (
              <div
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: gitInfo.color }}
              />
            )}

            {/* Icon */}
            <div
              className="transition-transform group-hover:scale-110"
              style={{ color: file.isDirectory ? '#60a5fa' : (extColor || 'var(--ghost-text-dim)') }}
            >
              {file.isDirectory ? (
                <Folder style={{ width: 20, height: 20 }} />
              ) : (
                getGridIcon(file.name, 5)
              )}
            </div>

            {/* Name */}
            <span className="text-2xs text-ghost-text truncate w-full text-center leading-tight">
              {file.name}
            </span>

            {/* Extension badge or size */}
            {extLabel ? (
              <span
                className="text-[9px] px-1 rounded opacity-50"
                style={{
                  backgroundColor: extColor ? extColor + '15' : 'rgba(255,255,255,0.04)',
                  color: extColor || 'var(--ghost-text-dim)',
                }}
              >
                {extLabel}
              </span>
            ) : sizeStr ? (
              <span className="text-[9px] text-ghost-text-dim/25">{sizeStr}</span>
            ) : (
              <span className="text-[9px] opacity-0">-</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
