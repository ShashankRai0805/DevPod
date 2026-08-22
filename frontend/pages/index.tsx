import { useRouter } from 'next/router'
import { useState } from 'react'

const LANGS = [
  { label: 'Node.js', value: 'node' },
  { label: 'Python', value: 'python' },
  { label: 'Java', value: 'java' },
  { label: 'C++', value: 'cpp' },
]

export default function CreateRepl() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Repl name is required')
    if (!language) return setError('Language is required')
    setLoading(true)
    try {
      const initServiceUrl = process.env.NEXT_PUBLIC_INIT_SERVICE_URL || 'http://localhost:4000'
      const res = await fetch(`${initServiceUrl}/api/repls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, language }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed')
      const replId = data?.repl?.replId || data?.repl?.name || name
      await router.push(`/repl/${encodeURIComponent(replId)}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8">
            <p className="text-sm font-medium text-blue-600">Replit Clone</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Create a new repl</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Start a clean workspace, then open it in a VS Code-style editor once provisioning is done.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700">Repl name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="my-project"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Language</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select language</option>
                {LANGS.map(l => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Creating repl…' : 'Create repl'}
            </button>
          </form>

          {error && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{error}</div>}
        </div>
      </div>
    </div>
  )
}
