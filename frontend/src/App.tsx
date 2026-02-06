import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'

type TaskStatus = 'todo' | 'doing' | 'done'

type Task = {
  id: number
  title: string
  description: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const matchesFilters = (
  task: Task,
  search: string,
  statusFilter: 'all' | TaskStatus,
) => {
  if (statusFilter !== 'all' && task.status !== statusFilter) {
    return false
  }

  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) {
    return true
  }

  const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase()
  return haystack.includes(normalizedSearch)
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')

  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo' as TaskStatus,
  })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: 'todo' as TaskStatus,
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const stats = useMemo(() => {
    const total = tasks.length
    const todo = tasks.filter((task) => task.status === 'todo').length
    const doing = tasks.filter((task) => task.status === 'doing').length
    const done = tasks.filter((task) => task.status === 'done').length
    return { total, todo, doing, done }
  }, [tasks])

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2600)
  }

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (query.trim()) {
      params.set('search', query.trim())
    }
    if (statusFilter !== 'all') {
      params.set('status', statusFilter)
    }

    const url = `${API_BASE}/api/tasks${params.toString() ? `?${params}` : ''}`
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
        .then(async (response) => {
          if (!response.ok) {
            const text = await response.text()
            throw new Error(text || 'Gagal memuat data.')
          }
          return response.json()
        })
        .then((data: Task[]) => setTasks(data))
        .catch((err: Error) => {
          if (err.name !== 'AbortError') {
            setError('Gagal memuat data. Pastikan backend Laravel aktif.')
          }
        })
        .finally(() => setLoading(false))
    }, 320)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, statusFilter, refreshToken])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) {
      setError('Judul task wajib diisi.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          status: form.status,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message ?? 'Gagal menambahkan task.')
      }

      const created: Task = await response.json()
      if (matchesFilters(created, query, statusFilter)) {
        setTasks((prev) => [created, ...prev])
      }
      setForm({ title: '', description: '', status: 'todo' })
      showNotice('Task baru berhasil dibuat.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const startEdit = (task: Task) => {
    setEditingId(task.id)
    setEditForm({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleUpdate = async (taskId: number) => {
    if (!editForm.title.trim()) {
      setError('Judul task wajib diisi.')
      return
    }

    setSavingId(taskId)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
          status: editForm.status,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message ?? 'Gagal memperbarui task.')
      }

      const updated: Task = await response.json()
      setTasks((prev) => {
        const next = prev.map((task) => (task.id === taskId ? updated : task))
        return matchesFilters(updated, query, statusFilter)
          ? next
          : next.filter((task) => task.id !== taskId)
      })
      setEditingId(null)
      showNotice('Task berhasil diperbarui.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (taskId: number) => {
    const confirmed = window.confirm('Hapus task ini? Tindakan tidak bisa dibatalkan.')
    if (!confirmed) {
      return
    }

    setDeletingId(taskId)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error('Gagal menghapus task.')
      }

      setTasks((prev) => prev.filter((task) => task.id !== taskId))
      showNotice('Task berhasil dihapus.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value))

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-text">
          <span className="eyebrow">Task Studio</span>
          <h1>Kelola pekerjaan dengan rapi, cepat, dan elegan.</h1>
          <p className="sub">
            CRUD sederhana dengan tampilan premium. Fokus pada prioritas utama, tanpa
            kehilangan detail kecil.
          </p>
        </div>
        <div className="hero-card">
          <div className="hero-card-header">
            <span>API Endpoint</span>
            <span className={`dot ${error ? 'dot--error' : 'dot--ok'}`} />
          </div>
          <p className="mono">{API_BASE}/api/tasks</p>
          <p className="tiny">
            Pastikan backend Laravel berjalan di <span className="mono">http://localhost:8000</span>.
          </p>
          <button className="ghost" onClick={() => setRefreshToken((prev) => prev + 1)}>
            Refresh Data
          </button>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className="stats">
        <div className="stat-card">
          <p>Total Task</p>
          <h3>{stats.total}</h3>
        </div>
        <div className="stat-card">
          <p>To do</p>
          <h3>{stats.todo}</h3>
        </div>
        <div className="stat-card">
          <p>In progress</p>
          <h3>{stats.doing}</h3>
        </div>
        <div className="stat-card">
          <p>Done</p>
          <h3>{stats.done}</h3>
        </div>
      </section>

      <section className="controls">
        <div className="control">
          <label htmlFor="search">Cari task</label>
          <input
            id="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ketik judul atau deskripsi..."
          />
        </div>
        <div className="control">
          <label htmlFor="status">Filter status</label>
          <select
            id="status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | TaskStatus)}
          >
            <option value="all">Semua</option>
            <option value="todo">To do</option>
            <option value="doing">In progress</option>
            <option value="done">Done</option>
          </select>
        </div>
        <button className="ghost" onClick={() => setRefreshToken((prev) => prev + 1)}>
          Sync
        </button>
      </section>

      <div className="grid">
        <section className="panel form-panel">
          <h2>Buat Task Baru</h2>
          <form onSubmit={handleCreate}>
            <label>
              Judul
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Contoh: Finalisasi desain landing page"
              />
            </label>
            <label>
              Deskripsi
              <textarea
                rows={4}
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Tuliskan detail singkat untuk membantu fokus."
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as TaskStatus }))
                }
              >
                <option value="todo">To do</option>
                <option value="doing">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Menyimpan...' : 'Tambah Task'}
            </button>
          </form>
        </section>

        <section className="panel list-panel">
          <div className="panel-header">
            <h2>Daftar Task</h2>
            <span className="tiny">
              {loading ? 'Memuat...' : `${tasks.length} task ditampilkan`}
            </span>
          </div>

          <div className="task-list">
            {loading ? (
              <div className="empty-state">Memuat data dari server...</div>
            ) : tasks.length === 0 ? (
              <div className="empty-state">Belum ada task. Buat yang pertama!</div>
            ) : (
              tasks.map((task) => (
                <article key={task.id} className={`task-card status-${task.status}`}>
                  <div className="task-main">
                    <div className="task-meta">
                      <span className={`badge badge-${task.status}`}>
                        {STATUS_LABEL[task.status]}
                      </span>
                      <span className="tiny">Dibuat {formatDate(task.created_at)}</span>
                    </div>
                    {editingId === task.id ? (
                      <div className="task-edit">
                        <input
                          value={editForm.title}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, title: event.target.value }))
                          }
                        />
                        <textarea
                          rows={3}
                          value={editForm.description}
                          onChange={(event) =>
                            setEditForm((prev) => ({
                              ...prev,
                              description: event.target.value,
                            }))
                          }
                        />
                        <select
                          value={editForm.status}
                          onChange={(event) =>
                            setEditForm((prev) => ({
                              ...prev,
                              status: event.target.value as TaskStatus,
                            }))
                          }
                        >
                          <option value="todo">To do</option>
                          <option value="doing">In progress</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                    ) : (
                      <>
                        <h3>{task.title}</h3>
                        <p>{task.description || 'Tidak ada deskripsi.'}</p>
                      </>
                    )}
                  </div>
                  <div className="task-actions">
                    {editingId === task.id ? (
                      <>
                        <button
                          className="ghost"
                          onClick={cancelEdit}
                          disabled={savingId === task.id}
                        >
                          Batal
                        </button>
                        <button
                          onClick={() => handleUpdate(task.id)}
                          disabled={savingId === task.id}
                        >
                          {savingId === task.id ? 'Menyimpan...' : 'Simpan'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="ghost" onClick={() => startEdit(task)}>
                          Edit
                        </button>
                        <button
                          className="danger"
                          onClick={() => handleDelete(task.id)}
                          disabled={deletingId === task.id}
                        >
                          {deletingId === task.id ? 'Menghapus...' : 'Hapus'}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
