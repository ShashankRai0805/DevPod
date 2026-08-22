import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

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

const fileTree: FileNode[] = [
  {
    name: 'src',
    type: 'folder',
    children: [
      { name: 'index.tsx', type: 'file' },
      { name: 'app.tsx', type: 'file' },
      { name: 'utils.ts', type: 'file' },
    ],
  },
  {
    name: 'public',
    type: 'folder',
    children: [{ name: 'favicon.ico', type: 'file' }],
  },
  { name: 'package.json', type: 'file' },
  { name: 'README.md', type: 'file' },
]

const codeLines = [
  'import React from "react"',
  '',
  'export default function App() {',
  '  const message = "Hello from your repl"',
  '',
  '  return (',
  '    <main className="p-6">',
  '      <h1>{message}</h1>',
  '    </main>',
  '  )',
  '}',
]

const terminalLines = [
  'npm run dev',
  '> ready',
  'workspace loaded successfully',
]

export default function ReplPage() {
  const router = useRouter()
  const { replId } = router.query
  const [status, setStatus] = useState<Status>('provisioning')
  const [error, setError] = useState<string | null>(null)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const startedRef = useRef(false)
  const pollRef = useRef<number | null>(null)

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
            {showWorkspace ? <FileExplorer /> : <SkeletonSidebar />}
          </aside>

          <section className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 border-b border-slate-200">
              {showWorkspace ? <EditorPanel /> : <WorkspaceSkeleton />}
            </div>
            <div className="h-[230px] shrink-0 bg-slate-950">
              {showWorkspace ? <TerminalPanel /> : <TerminalSkeleton />}
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

function FileExplorer() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Explorer
      </div>
      <div className="flex-1 overflow-auto px-3 py-3 text-sm text-slate-700">
        <Tree nodes={fileTree} />
      </div>
    </div>
  )
}

function Tree({ nodes, depth = 0 }: { nodes: FileNode[]; depth?: number }) {
  return (
    <ul className="space-y-1">
      {nodes.map(node => (
        <li key={`${node.name}-${depth}`}>
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100">
            <span className="text-slate-500">{node.type === 'folder' ? '▸' : '•'}</span>
            <span className={node.type === 'folder' ? 'font-medium text-slate-800' : 'text-slate-700'}>{node.name}</span>
          </div>
          {node.children && <div className="pl-4"><Tree nodes={node.children} depth={depth + 1} /></div>}
        </li>
      ))}
    </ul>
  )
}

function EditorPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        <span className="rounded-md bg-white px-2 py-1 font-medium text-slate-700 shadow-sm">index.tsx</span>
        <span>•</span>
        <span>TypeScript React</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <div className="grid min-h-full grid-cols-[48px_1fr] font-mono text-[13px] leading-6">
          <div className="select-none border-r border-slate-200 bg-slate-50 px-3 py-4 text-right text-slate-400">
            {codeLines.map((_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>
          <pre className="overflow-x-auto px-4 py-4 text-slate-900">
            {codeLines.map((line, index) => (
              <CodeLine key={index} line={line} />
            ))}
          </pre>
        </div>
      </div>
    </div>
  )
}

function CodeLine({ line }: { line: string }) {
  if (line.startsWith('import React')) {
    return <div><span className="text-blue-700">import</span> <span className="text-slate-900">React</span> <span className="text-slate-500">from</span> <span className="text-emerald-700">"react"</span></div>
  }

  if (line.startsWith('export default function')) {
    return <div><span className="text-blue-700">export default function</span> <span className="text-slate-900">App</span> <span className="text-slate-900">()</span> <span className="text-slate-900">{`{`}</span></div>
  }

  if (line.includes('message =')) {
    return <div className="pl-4"><span className="text-blue-700">const</span> <span className="text-slate-900">message</span> <span className="text-slate-500">=</span> <span className="text-emerald-700">"Hello from your repl"</span></div>
  }

  if (line === '  return (') {
    return <div className="pl-4"><span className="text-blue-700">return</span> <span className="text-slate-900">(</span></div>
  }

  if (line.includes('<main')) {
    return <div className="pl-8 text-slate-700">&lt;<span className="text-blue-700">main</span> <span className="text-slate-500">className</span>=<span className="text-emerald-700">"p-6"</span>&gt;</div>
  }

  if (line.includes('<h1>')) {
    return <div className="pl-10 text-slate-700">&lt;<span className="text-blue-700">h1</span>&gt;{'{'}message{'}'}&lt;/<span className="text-blue-700">h1</span>&gt;</div>
  }

  if (line.includes('</main>')) {
    return <div className="pl-8 text-slate-700">&lt;/<span className="text-blue-700">main</span>&gt;</div>
  }

  if (line === '  )') {
    return <div className="pl-4 text-slate-900">)</div>
  }

  if (line === '}') {
    return <div className="text-slate-900">{`}`}</div>
  }

  return <div>{line || '\u00A0'}</div>
}

function TerminalPanel() {
  return (
    <div className="flex h-full flex-col border-t border-slate-800 bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        Terminal
      </div>
      <div className="flex-1 overflow-auto px-4 py-3 font-mono text-sm leading-6 text-slate-200">
        {terminalLines.map((line, index) => (
          <div key={index}>
            <span className="text-slate-500">$ </span>
            {line}
          </div>
        ))}
      </div>
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
