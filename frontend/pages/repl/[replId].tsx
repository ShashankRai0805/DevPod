import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { io, Socket } from 'socket.io-client'
import type { Terminal } from 'xterm'
import 'xterm/css/xterm.css'

type Status = 'provisioning' | 'starting' | 'ready' | 'failed'

type StatusResponse = {
  success: boolean
  replId: string
  status: Status
  message?: string
}

type FileNode = {
  name: string
  type: 'file' | 'folder'
  children?: FileNode[]
}

function getFileIcon(filename: string) {
  if (filename.endsWith('.js') || filename.endsWith('.jsx')) return <span className="text-yellow-400 font-bold text-[10px]">JS</span>;
  if (filename.endsWith('.json')) return <span className="text-purple-400 font-bold text-[10px]">{'{}'}</span>;
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return <span className="text-blue-400 font-bold text-[10px]">TS</span>;
  if (filename.endsWith('.py')) return <span className="text-blue-500 font-bold text-[10px]">PY</span>;
  if (filename.endsWith('.css')) return <span className="text-pink-400 font-bold text-[10px]">#</span>;
  if (filename.endsWith('.html')) return <span className="text-orange-500 font-bold text-[10px]">&lt;&gt;</span>;
  return <span className="text-slate-400 text-[10px]">📄</span>;
}

export default function ReplPage() {
  const router = useRouter()
  const { replId } = router.query
  const [status, setStatus] = useState<Status>('provisioning')
  const [error, setError] = useState<string | null>(null)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const startedRef = useRef(false)
  const pollRef = useRef<number | null>(null)

  const [socket, setSocket] = useState<Socket | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const orchestratorUrl = useMemo(
    () => process.env.NEXT_PUBLIC_ORCHESTRATOR_URL,
    [],
  )

  async function startAndPoll(id: string) {
    setError(null)
    setWorkspaceReady(false)

    try {
      const startResp = await fetch(`${orchestratorUrl}/api/repls/${encodeURIComponent(id)}/start`, {
        method: 'POST',
      })

      if (!startResp.ok) {
        const payload = await startResp.json().catch(() => null)
        throw new Error(payload?.message || 'Failed to start repl')
      }

      const poll = async () => {
        const resp = await fetch(`${orchestratorUrl}/api/repls/${encodeURIComponent(id)}/status`)
        const payload: StatusResponse = await resp.json()

        if (!resp.ok) throw new Error(payload?.message || 'Failed to fetch repl status')

        setStatus(payload.status)

        if (payload.status === 'ready') {
          setWorkspaceReady(true)
          if (pollRef.current) window.clearInterval(pollRef.current)
          pollRef.current = null
        }

        if (payload.status === 'failed') {
          setError(payload.message || 'Repl failed to load')
          if (pollRef.current) window.clearInterval(pollRef.current)
          pollRef.current = null
        }
      }

      await poll()
      pollRef.current = window.setInterval(() => {
        void poll().catch(err => setError(err.message))
      }, 1500)
    } catch (err: any) {
      setError(err.message)
      setStatus('failed')
    }
  }

  useEffect(() => {
    if (!router.isReady || typeof replId !== 'string' || startedRef.current) return

    startedRef.current = true
    void startAndPoll(replId)

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [router.isReady, replId])

  useEffect(() => {
    if (workspaceReady && status === 'ready' && typeof replId === 'string') {
      const domain = process.env.NEXT_PUBLIC_REPL_BASE_DOMAIN || 'codecohort.xyz'
      // Use http in local dev, in production you'd use wss/https
      const runnerUrl = `http://runner-${replId}.${domain}`
      
      const newSocket = io(runnerUrl, {
        transports: ['websocket', 'polling']
      })
      
      newSocket.on('connect', () => {
        console.log('Connected to runner WebSocket')
        setSocket(newSocket)
      })
      
      return () => {
        newSocket.disconnect()
        setSocket(null)
      }
    }
  }, [workspaceReady, status, replId])

  const [previewKey, setPreviewKey] = useState(0)

  const retry = () => {
    if (typeof replId === 'string') {
      void startAndPoll(replId)
    }
  }

  const showWorkspace = workspaceReady && status === 'ready' && !error
  const previewUrl = `http://${replId}.${process.env.NEXT_PUBLIC_REPL_BASE_DOMAIN || 'codecohort.xyz'}`

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="flex min-h-screen flex-col">
        <WorkspaceHeader replId={typeof replId === 'string' ? replId : 'Workspace'} status={showWorkspace ? 'ready' : 'provisioning'} />

        <main className="flex min-h-0 flex-1 bg-[#1e1e1e] text-slate-300">
          <aside className="hidden w-[250px] shrink-0 border-r border-[#333] bg-[#252526] md:flex md:flex-col">
            {showWorkspace ? <FileExplorer socket={socket} onSelectFile={setSelectedFile} /> : <SkeletonSidebar />}
          </aside>

          <section className="flex min-w-0 flex-1 flex-row bg-[#1e1e1e]">
            {/* Editor Panel (Middle) */}
            <div className="flex-1 min-w-0 border-r border-[#333] flex flex-col">
              {showWorkspace ? <EditorPanel socket={socket} selectedFile={selectedFile} /> : <WorkspaceSkeleton />}
            </div>
            
            {/* Right Panel: Output & Terminal */}
            <div className="flex w-[40%] flex-col min-w-0 bg-[#1e1e1e]">
              <div className="flex-1 min-h-0 border-b border-[#333] bg-white flex flex-col">
                <div className="bg-[#252526] flex items-center justify-between px-3 py-1.5 border-b border-[#333]">
                  <div className="text-xs font-medium text-slate-400">Output</div>
                  <div className="flex items-center gap-3">
                    <a href={previewUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 text-[10px] font-semibold" title="Open in new tab">
                      Open App ↗
                    </a>
                    <button onClick={() => setPreviewKey(k => k + 1)} className="text-slate-400 hover:text-white" title="Refresh Output">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M8 2.5a5.5 5.5 0 105.5 5.5h1.5A7 7 0 118 1v1.5z"/></svg>
                    </button>
                  </div>
                </div>
                {showWorkspace ? (
                  <iframe 
                    key={previewKey}
                    className="w-full h-full border-none bg-white" 
                    src={previewUrl} 
                    title="Output" 
                  />
                ) : (
                  <div className="flex-1 bg-white" />
                )}
              </div>
              <div className="h-[50%] shrink-0 bg-black">
                {showWorkspace ? <TerminalPanel socket={socket} /> : <TerminalSkeleton />}
              </div>
            </div>
          </section>
        </main>
      </div>

      {!showWorkspace && error && (
        <div className="fixed bottom-4 right-4 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-lg">
          <div className="font-medium text-slate-900">Unable to load workspace</div>
          <p className="mt-1 text-slate-600">{error}</p>
          <button
            onClick={retry}
            className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function WorkspaceHeader({ replId, status }: { replId: string; status: Status }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
          {replId.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{replId}</div>
          <div className="text-xs text-slate-500">Repl workspace</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <StatusBadge status={status} />
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Run
        </button>
      </div>
    </header>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const label = status === 'ready' ? 'Ready' : 'Loading'
  const tone = status === 'ready' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'

  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>{label}</span>
}

function FileExplorer({ socket, onSelectFile }: { socket: Socket | null, onSelectFile: (path: string) => void }) {
  const [nodesByPath, setNodesByPath] = useState<Record<string, FileNode[]>>({})
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']))
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null)
  const [createName, setCreateName] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string>('')

  const fetchFolder = (path: string) => {
    if (!socket) return;
    socket.emit('fetchDir', path, (res: any) => {
      if (res && res.success) {
        setNodesByPath(prev => ({ ...prev, [path]: res.data }))
      }
    })
  }

  // Initial load
  useEffect(() => {
    fetchFolder('')
  }, [socket])

  // File watcher refresh
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      expandedFolders.forEach(folder => fetchFolder(folder))
    }
    socket.on('fileChanged', handler)
    return () => { socket.off('fileChanged', handler) }
  }, [socket, expandedFolders])

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        fetchFolder(path)
      }
      return next
    })
  }

  const handleCreateSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && createName.trim() && socket) {
      const targetPath = selectedFolder ? `${selectedFolder}/${createName.trim()}` : createName.trim()
      const eventName = isCreating === 'file' ? 'createFile' : 'createFolder'
      socket.emit(eventName, targetPath, (res: any) => {
        if (!res?.success) console.error(res?.error)
      })
      setIsCreating(null)
      setCreateName('')
    } else if (e.key === 'Escape') {
      setIsCreating(null)
      setCreateName('')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#333] px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Explorer
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsCreating('file')} title="New File" className="text-slate-400 hover:text-white">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5.414a1 1 0 00-.293-.707l-4-4A1 1 0 009 1zm0 1.414L12.586 6H9V2.414zM4 14V3h4v4h4v7H4z"/></svg>
          </button>
          <button onClick={() => setIsCreating('folder')} title="New Folder" className="text-slate-400 hover:text-white">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M1 4a2 2 0 012-2h4l1.5 2H13a2 2 0 012 2v6a2 2 0 01-2 2H3a2 2 0 01-2-2V4zm2 0v8h10V6H7.83L6.33 4H3z"/></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-2 py-3 text-sm text-slate-300" onClick={() => setSelectedFolder('')}>
        {isCreating && (
          <div className="mb-2 px-2">
            <input 
              autoFocus
              className="w-full rounded border border-[#444] bg-[#1e1e1e] text-white px-2 py-1 text-[13px] outline-none focus:border-blue-500"
              placeholder={isCreating === 'file' ? 'File name...' : 'Folder name...'}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={handleCreateSubmit}
              onBlur={() => { setIsCreating(null); setCreateName(''); }}
            />
            {selectedFolder && <div className="text-[10px] text-slate-500 mt-1">in {selectedFolder}</div>}
          </div>
        )}
        <Tree 
          nodes={nodesByPath[''] || []} 
          nodesByPath={nodesByPath}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          parentPath="" 
          onSelectFile={onSelectFile} 
          selectedFolder={selectedFolder}
          setSelectedFolder={setSelectedFolder}
        />
      </div>
    </div>
  )
}

type TreeProps = { nodes: FileNode[], nodesByPath: Record<string, FileNode[]>, expandedFolders: Set<string>, toggleFolder: (p: string) => void, parentPath: string, depth?: number, onSelectFile: (path: string) => void, selectedFolder: string, setSelectedFolder: (p: string) => void }

function Tree({ nodes, nodesByPath, expandedFolders, toggleFolder, parentPath, depth = 0, onSelectFile, selectedFolder, setSelectedFolder }: TreeProps) {
  if (!nodes || nodes.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {nodes.map(node => (
        <TreeNode 
          key={node.name} 
          node={node} 
          nodesByPath={nodesByPath}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          parentPath={parentPath} 
          depth={depth} 
          onSelectFile={onSelectFile}
          selectedFolder={selectedFolder}
          setSelectedFolder={setSelectedFolder}
        />
      ))}
    </ul>
  )
}

function TreeNode({ node, nodesByPath, expandedFolders, toggleFolder, parentPath, depth, onSelectFile, selectedFolder, setSelectedFolder }: TreeProps & { node: FileNode, depth: number }) {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name
  const isOpen = expandedFolders.has(currentPath)
  const isSelected = selectedFolder === currentPath
  const children = nodesByPath[currentPath] || []

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation() // prevent FileExplorer background click
    if (node.type === 'folder') {
      setSelectedFolder(currentPath)
      toggleFolder(currentPath)
    } else {
      setSelectedFolder(parentPath)
      onSelectFile(currentPath)
    }
  }

  return (
    <li>
      <div 
        onClick={handleClick} 
        className={`flex cursor-pointer items-center gap-2 rounded-md py-1.5 transition-colors ${isSelected ? 'bg-[#37373d]' : 'hover:bg-[#2a2d2e]'}`}
        style={{ paddingLeft: `${(depth * 12) + 8}px`, paddingRight: '8px' }}
      >
        <span className="flex w-4 items-center justify-center text-[10px] text-slate-400 shrink-0">
          {node.type === 'folder' ? (isOpen ? '▼' : '▶') : getFileIcon(node.name)}
        </span>
        <span className={`truncate text-[13px] ${node.type === 'folder' ? 'text-slate-200' : 'text-slate-300'}`}>
          {node.name}
        </span>
      </div>
      {isOpen && (
        <Tree 
          nodes={children} 
          nodesByPath={nodesByPath}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          parentPath={currentPath} 
          depth={depth + 1} 
          onSelectFile={onSelectFile} 
          selectedFolder={selectedFolder}
          setSelectedFolder={setSelectedFolder}
        />
      )}
    </li>
  )
}

function EditorPanel({ socket, selectedFile }: { socket: Socket | null, selectedFile: string | null }) {
  const [content, setContent] = useState<string>('')
  
  useEffect(() => {
    if (!socket || !selectedFile) return
    socket.emit('fetchContent', selectedFile, (res: any) => {
      if (res && res.success) {
        setContent(res.content)
      } else {
        setContent(`// Failed to load file ${selectedFile}`)
      }
    })
  }, [socket, selectedFile])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)
    if (socket && selectedFile) {
      socket.emit('updateContent', { path: selectedFile, content: newContent })
    }
  }

  if (!selectedFile) {
    return <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[#1e1e1e] text-slate-500">Select a file to edit</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1e1e1e]">
      <div className="flex items-center gap-2 border-b border-[#333] bg-[#252526] px-4 py-2 text-xs text-slate-400">
        <span className="rounded-md bg-[#1e1e1e] px-2 py-1 font-medium text-slate-300 shadow-sm border border-[#333]">{selectedFile}</span>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <textarea 
          className="h-full w-full resize-none outline-none font-mono text-[13px] leading-6 text-slate-300 bg-transparent"
          value={content}
          onChange={handleChange}
          spellCheck={false}
        />
      </div>
    </div>
  )
}

function TerminalPanel({ socket }: { socket: Socket | null }) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!terminalRef.current || !socket) return

    let term: Terminal;
    let onTerminalOutput: (data: string) => void;
    let handleResize: () => void;

    (async () => {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');

      term = new Terminal({
        theme: { background: '#000000', foreground: '#e2e8f0' },
        fontFamily: 'monospace',
        fontSize: 14,
      })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      if (!terminalRef.current) {
        term.dispose();
        return;
      }

      term.open(terminalRef.current)
      fitAddon.fit()
      xtermRef.current = term

      socket.emit('requestTerminal')

      term.onData(data => {
        socket.emit('terminalData', data)
      })

      onTerminalOutput = (data: string) => {
        term.write(data)
      }

      socket.on('terminal output', onTerminalOutput)

      handleResize = () => {
        fitAddon.fit()
        socket.emit('resizeTerminal', { cols: term.cols, rows: term.rows })
      }

      window.addEventListener('resize', handleResize)
      // Delay initial resize slightly to allow container to fully render
      setTimeout(handleResize, 100)
    })();

    return () => {
      if (onTerminalOutput) socket.off('terminal output', onTerminalOutput)
      if (handleResize) window.removeEventListener('resize', handleResize)
      if (term) term.dispose()
    }
  }, [socket])

  return (
    <div className="flex h-full flex-col border-t border-slate-800 bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        Terminal
      </div>
      <div className="flex-1 overflow-hidden p-2" ref={terminalRef}></div>
    </div>
  )
}

function WorkspaceSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-12 items-center gap-3 border-b border-slate-200 px-4">
        <SkeletonBlock className="h-6 w-32 rounded-md" />
        <SkeletonBlock className="h-4 w-20 rounded-full" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[48px_1fr]">
        <div className="border-r border-slate-200 bg-slate-50 px-3 py-4">
          <div className="space-y-2">
            {Array.from({ length: 12 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-3 rounded-full bg-slate-300/80" style={{ width: `${40 + (index % 4) * 14}%` }} />
            ))}
          </div>
        </div>
        <div className="px-4 py-4">
          <div className="space-y-3">
            {Array.from({ length: 12 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-3 rounded-full bg-slate-300/80" style={{ width: `${55 + (index % 5) * 7}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SkeletonSidebar() {
  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="border-b border-slate-200 px-4 py-3">
        <SkeletonBlock className="h-3 w-24 rounded-full bg-slate-300/80" />
      </div>
      <div className="space-y-3 px-4 py-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-3 rounded-full bg-slate-300/80" style={{ width: `${70 - (index % 3) * 10}%` }} />
        ))}
      </div>
    </div>
  )
}

function TerminalSkeleton() {
  return (
    <div className="flex h-full flex-col border-t border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 px-4 py-2">
        <SkeletonBlock className="h-3 w-20 rounded-full bg-slate-700/80" />
      </div>
      <div className="space-y-3 px-4 py-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-3 rounded-full bg-slate-700/80" style={{ width: `${75 - index * 8}%` }} />
        ))}
      </div>
    </div>
  )
}

function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton-shimmer bg-slate-200 ${className || ''}`} style={style} />
}
