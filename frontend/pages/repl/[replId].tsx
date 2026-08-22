import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { io, Socket } from 'socket.io-client'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
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
    () => process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:4100',
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
      const runnerUrl = `http://${replId}.${domain}`
      
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

  const retry = () => {
    if (typeof replId === 'string') {
      void startAndPoll(replId)
    }
  }

  const showWorkspace = workspaceReady && status === 'ready' && !error

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="flex min-h-screen flex-col">
        <WorkspaceHeader replId={typeof replId === 'string' ? replId : 'Workspace'} status={showWorkspace ? 'ready' : 'provisioning'} />

        <main className="flex min-h-0 flex-1 bg-white">
          <aside className="hidden w-[250px] shrink-0 border-r border-slate-200 bg-slate-50 md:flex md:flex-col">
            {showWorkspace ? <FileExplorer socket={socket} onSelectFile={setSelectedFile} /> : <SkeletonSidebar />}
          </aside>

          <section className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 border-b border-slate-200">
              {showWorkspace ? <EditorPanel socket={socket} selectedFile={selectedFile} /> : <WorkspaceSkeleton />}
            </div>
            <div className="h-[230px] shrink-0 bg-slate-950">
              {showWorkspace ? <TerminalPanel socket={socket} /> : <TerminalSkeleton />}
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
  const [nodes, setNodes] = useState<FileNode[]>([])

  useEffect(() => {
    if (!socket) return
    socket.emit('fetchDir', '', (res: any) => {
      if (res && res.success) setNodes(res.data)
    })
  }, [socket])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Explorer
      </div>
      <div className="flex-1 overflow-auto px-3 py-3 text-sm text-slate-700">
        <Tree nodes={nodes} socket={socket} parentPath="" onSelectFile={onSelectFile} />
      </div>
    </div>
  )
}

function Tree({ nodes, socket, parentPath, depth = 0, onSelectFile }: { nodes: FileNode[], socket: Socket | null, parentPath: string, depth?: number, onSelectFile: (path: string) => void }) {
  return (
    <ul className="space-y-1">
      {nodes.map(node => (
        <TreeNode key={node.name} node={node} socket={socket} parentPath={parentPath} depth={depth} onSelectFile={onSelectFile} />
      ))}
    </ul>
  )
}

function TreeNode({ node, socket, parentPath, depth, onSelectFile }: { node: FileNode, socket: Socket | null, parentPath: string, depth: number, onSelectFile: (path: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [children, setChildren] = useState<FileNode[]>([])
  
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name

  const handleClick = () => {
    if (node.type === 'folder') {
      if (!isOpen && socket) {
        socket.emit('fetchDir', currentPath, (res: any) => {
          if (res && res.success) setChildren(res.data)
        })
      }
      setIsOpen(!isOpen)
    } else {
      onSelectFile(currentPath)
    }
  }

  return (
    <li>
      <div onClick={handleClick} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100">
        <span className="text-slate-500">{node.type === 'folder' ? (isOpen ? '▾' : '▸') : '•'}</span>
        <span className={node.type === 'folder' ? 'font-medium text-slate-800' : 'text-slate-700'}>{node.name}</span>
      </div>
      {isOpen && children.length > 0 && (
        <div className="pl-4">
          <Tree nodes={children} socket={socket} parentPath={currentPath} depth={depth + 1} onSelectFile={onSelectFile} />
        </div>
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
    return <div className="flex h-full min-h-0 flex-col items-center justify-center bg-white text-slate-400">Select a file to edit</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        <span className="rounded-md bg-white px-2 py-1 font-medium text-slate-700 shadow-sm">{selectedFile}</span>
      </div>
      <div className="min-h-0 flex-1 bg-white p-4">
        <textarea 
          className="h-full w-full resize-none outline-none font-mono text-[13px] leading-6 text-slate-900"
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

    const term = new Terminal({
      theme: { background: '#020617', foreground: '#e2e8f0' },
      fontFamily: 'monospace',
      fontSize: 14,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(terminalRef.current)
    fitAddon.fit()
    xtermRef.current = term

    socket.emit('requestTerminal')

    term.onData(data => {
      socket.emit('terminalData', data)
    })

    const onTerminalOutput = (data: string) => {
      term.write(data)
    }

    socket.on('terminal output', onTerminalOutput)

    const handleResize = () => {
      fitAddon.fit()
      socket.emit('resizeTerminal', { cols: term.cols, rows: term.rows })
    }

    window.addEventListener('resize', handleResize)
    // Delay initial resize slightly to allow container to fully render
    setTimeout(handleResize, 100)

    return () => {
      socket.off('terminal output', onTerminalOutput)
      window.removeEventListener('resize', handleResize)
      term.dispose()
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
