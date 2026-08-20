import { useState } from 'react'

const LANGS = [
  { label: 'Node.js', value: 'node' },
  { label: 'Python', value: 'python' },
  { label: 'Java', value: 'java' },
  { label: 'C++', value: 'cpp' },
]

export default function CreateRepl() {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    if (!name.trim()) return setError('Repl name is required')
    if (!language) return setError('Language is required')
    setLoading(true)
    try {
      const res = await fetch('http://localhost:4000/api/repls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, language }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed')
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-4">Create Repl</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Repl Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border rounded p-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} className="mt-1 block w-full border rounded p-2">
              <option value="">Select language</option>
              {LANGS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          <div>
            <button disabled={loading} className="w-full bg-blue-600 text-white p-2 rounded disabled:opacity-50">
              {loading ? 'Creating Repl...' : 'Create Repl'}
            </button>
          </div>
        </form>

        {error && <div className="mt-4 text-red-600">{error}</div>}
        {result && (
          <div className="mt-4 p-4 bg-green-50 rounded">
            <div className="font-medium">Repl created successfully!</div>
            <pre className="text-xs mt-2">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
