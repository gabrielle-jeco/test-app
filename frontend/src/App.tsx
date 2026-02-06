import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react'
import './App.css'

type TaskStatus = 'todo' | 'doing' | 'done'
type SortOrder = 'newest' | 'oldest'

type Task = {
  id: number
  title: string
  description: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
}

type TaskResponse = {
  data: Task[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
    from: number | null
    to: number | null
  }
}

type TaskStats = {
  total: number
  todo: number
  doing: number
  done: number
}

type AuthUser = {
  id: number
  name: string
  email: string
}

type AuthResponse = {
  user: AuthUser
  token: string
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const TOKEN_STORAGE_KEY = 'task_studio_token'

function App() {
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
  })
  const [authLoading, setAuthLoading] = useState(false)
  const [authChecking, setAuthChecking] = useState(false)

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(8)
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [meta, setMeta] = useState<TaskResponse['meta'] | null>(null)
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')

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
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const fallbackStats = useMemo(() => {
    const total = tasks.length
    const todo = tasks.filter((task) => task.status === 'todo').length
    const doing = tasks.filter((task) => task.status === 'doing').length
    const done = tasks.filter((task) => task.status === 'done').length
    return { total, todo, doing, done }
  }, [tasks])
  const displayStats = stats ?? fallbackStats
  const isAuthenticated = Boolean(currentUser)
  const isBoardView = viewMode === 'board'

  const tasksByStatus = useMemo(
    () => ({
      todo: tasks.filter((task) => task.status === 'todo'),
      doing: tasks.filter((task) => task.status === 'doing'),
      done: tasks.filter((task) => task.status === 'done'),
    }),
    [tasks],
  )

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2600)
  }

  const clearSession = () => {
    setAuthToken(null)
    setCurrentUser(null)
    setTasks([])
    setMeta(null)
    setStats(null)
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  }

  const buildHeaders = (
    extra?: Record<string, string>,
    includeAuth = true,
  ): Record<string, string> => ({
    Accept: 'application/json',
    ...(extra ?? {}),
    ...(includeAuth && authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  })

  const apiFetch = (path: string, options: RequestInit = {}, includeAuth = true) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: buildHeaders(
        options.headers as Record<string, string> | undefined,
        includeAuth,
      ),
    })

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY)
    if (storedToken) {
      setAuthToken(storedToken)
    }
  }, [])

  useEffect(() => {
    if (!authToken) {
      setCurrentUser(null)
      return
    }

    const controller = new AbortController()
    setAuthChecking(true)
    apiFetch('/api/auth/me', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('UNAUTHORIZED')
        }
        return response.json()
      })
      .then((user: AuthUser) => setCurrentUser(user))
      .catch(() => {
        clearSession()
      })
      .finally(() => setAuthChecking(false))

    return () => controller.abort()
  }, [authToken])

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, perPage, sortOrder])

  useEffect(() => {
    if (!authToken) {
      setLoading(false)
      setTasks([])
      setMeta(null)
      setStats(null)
      return
    }

    const controller = new AbortController()
    const listParams = new URLSearchParams()
    const statsParams = new URLSearchParams()
    if (query.trim()) {
      listParams.set('search', query.trim())
      statsParams.set('search', query.trim())
    }
    if (statusFilter !== 'all') {
      listParams.set('status', statusFilter)
      statsParams.set('status', statusFilter)
    }

    const effectivePage = isBoardView ? 1 : page
    const effectivePerPage = isBoardView ? 200 : perPage

    listParams.set('page', String(effectivePage))
    listParams.set('per_page', String(effectivePerPage))
    listParams.set('sort', sortOrder)

    const listPath = `/api/tasks${listParams.toString() ? `?${listParams}` : ''}`
    const statsPath = `/api/tasks/stats${statsParams.toString() ? `?${statsParams}` : ''}`

    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      Promise.all([
        apiFetch(listPath, {
          signal: controller.signal,
        }),
        apiFetch(statsPath, {
          signal: controller.signal,
        }),
      ])
        .then(async ([listResponse, statsResponse]) => {
          if (listResponse.status === 401) {
            throw new Error('UNAUTHORIZED')
          }
          if (!listResponse.ok) {
            const text = await listResponse.text()
            throw new Error(text || 'Gagal memuat data.')
          }
          const listData: TaskResponse = await listResponse.json()
          let statsData: TaskStats | null = null
          if (statsResponse.ok) {
            statsData = await statsResponse.json()
          }
          return { listData, statsData }
        })
        .then(({ listData, statsData }) => {
          setTasks(listData.data)
          setMeta(listData.meta)
          setStats(statsData)
          if (listData.meta.last_page > 0 && page > listData.meta.last_page) {
            setPage(listData.meta.last_page)
          }
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') {
            return
          }
          if (err.message === 'UNAUTHORIZED') {
            clearSession()
            setError('Silakan login terlebih dahulu.')
            return
          }
          setError('Gagal memuat data. Pastikan backend Laravel aktif.')
        })
        .finally(() => setLoading(false))
    }, 320)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [authToken, query, statusFilter, page, perPage, sortOrder, refreshToken, isBoardView])

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!authForm.email.trim() || !authForm.password.trim()) {
      setError('Email dan password wajib diisi.')
      return
    }

    if (authMode === 'register') {
      if (!authForm.name.trim()) {
        setError('Nama wajib diisi.')
        return
      }
      if (authForm.password.length < 6) {
        setError('Password minimal 6 karakter.')
        return
      }
      if (authForm.password !== authForm.passwordConfirm) {
        setError('Konfirmasi password tidak sama.')
        return
      }
    }

    setAuthLoading(true)

    try {
      const response = await apiFetch(
        `/api/auth/${authMode}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            authMode === 'register'
              ? {
                  name: authForm.name.trim(),
                  email: authForm.email.trim(),
                  password: authForm.password,
                  password_confirmation: authForm.passwordConfirm,
                }
              : {
                  email: authForm.email.trim(),
                  password: authForm.password,
                },
          ),
        },
        false,
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message ?? 'Gagal memproses autentikasi.')
      }

      const data: AuthResponse = await response.json()
      setAuthToken(data.token)
      setCurrentUser(data.user)
      window.localStorage.setItem(TOKEN_STORAGE_KEY, data.token)
      setAuthForm({ name: '', email: '', password: '', passwordConfirm: '' })
      showNotice(authMode === 'register' ? 'Registrasi berhasil.' : 'Login berhasil.')
      setRefreshToken((prev) => prev + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    if (!authToken) {
      return
    }

    setAuthLoading(true)
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore logout failures
    } finally {
      clearSession()
      setAuthLoading(false)
      showNotice('Logout berhasil.')
    }
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!authToken) {
      setError('Silakan login terlebih dahulu.')
      return
    }
    if (!form.title.trim()) {
      setError('Judul task wajib diisi.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      await response.json()
      setForm({ title: '', description: '', status: 'todo' })
      if (sortOrder === 'newest' && page !== 1) {
        setPage(1)
      } else {
        setRefreshToken((prev) => prev + 1)
      }
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
    if (!authToken) {
      setError('Silakan login terlebih dahulu.')
      return
    }
    if (!editForm.title.trim()) {
      setError('Judul task wajib diisi.')
      return
    }

    setSavingId(taskId)
    setError(null)

    try {
      const response = await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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

      await response.json()
      setEditingId(null)
      setRefreshToken((prev) => prev + 1)
      showNotice('Task berhasil diperbarui.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setSavingId(null)
    }
  }

  const handleStatusUpdate = async (taskId: number, nextStatus: TaskStatus) => {
    if (!authToken) {
      setError('Silakan login terlebih dahulu.')
      return
    }
    const task = tasks.find((item) => item.id === taskId)
    if (!task || task.status === nextStatus) {
      return
    }

    setStatusUpdatingId(taskId)
    setError(null)

    try {
      const response = await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message ?? 'Gagal memperbarui status.')
      }

      await response.json()
      showNotice('Status task berhasil diperbarui.')
      setRefreshToken((prev) => prev + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const handleDragStart = (taskId: number) => (event: DragEvent<HTMLElement>) => {
    setDraggingId(taskId)
    event.dataTransfer.setData('text/plain', String(taskId))
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverStatus(null)
  }

  const handleDragOver = (status: TaskStatus) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOverStatus(status)
  }

  const handleDrop = (status: TaskStatus) => async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const droppedId = draggingId ?? Number(event.dataTransfer.getData('text/plain'))
    setDragOverStatus(null)
    setDraggingId(null)
    if (!droppedId) {
      return
    }
    await handleStatusUpdate(droppedId, status)
  }

  const handleDelete = async (taskId: number) => {
    if (!authToken) {
      setError('Silakan login terlebih dahulu.')
      return
    }
    const confirmed = window.confirm('Hapus task ini? Tindakan tidak bisa dibatalkan.')
    if (!confirmed) {
      return
    }

    setDeletingId(taskId)
    setError(null)

    try {
      const response = await apiFetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Gagal menghapus task.')
      }

      if (tasks.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        setRefreshToken((prev) => prev + 1)
      }
      showNotice('Task berhasil dihapus.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value))

  const listSummary = !authToken
    ? 'Silakan login terlebih dahulu.'
    : loading
      ? 'Memuat...'
      : meta
        ? `Halaman ${meta.current_page} dari ${meta.last_page} - ${meta.total} task`
        : `${tasks.length} task ditampilkan`

  const panelSummary =
    viewMode === 'board'
      ? 'Tarik kartu ke kolom status untuk memperbarui.'
      : listSummary

  const renderTaskCard = (task: Task, mode: 'list' | 'board') => {
    const isEditing = editingId === task.id
    const isDragging = draggingId === task.id
    const canDrag = mode === 'board' && !isEditing && statusUpdatingId !== task.id

    return (
      <article
        key={task.id}
        className={`task-card status-${task.status}${isDragging ? ' is-dragging' : ''}`}
        draggable={canDrag}
        onDragStart={canDrag ? handleDragStart(task.id) : undefined}
        onDragEnd={canDrag ? handleDragEnd : undefined}
      >
        <div className="task-main">
          <div className="task-meta">
            <span className={`badge badge-${task.status}`}>{STATUS_LABEL[task.status]}</span>
            <span className="tiny">Dibuat {formatDate(task.created_at)}</span>
          </div>
          {isEditing ? (
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
          {isEditing ? (
            <>
              <button className="ghost" onClick={cancelEdit} disabled={savingId === task.id}>
                Batal
              </button>
              <button onClick={() => handleUpdate(task.id)} disabled={savingId === task.id}>
                {savingId === task.id ? 'Menyimpan...' : 'Simpan'}
              </button>
            </>
          ) : (
            <>
              {mode === 'list' ? (
                <select
                  className="status-select"
                  value={task.status}
                  onChange={(event) =>
                    handleStatusUpdate(task.id, event.target.value as TaskStatus)
                  }
                  disabled={statusUpdatingId === task.id}
                  aria-label="Ubah status"
                >
                  <option value="todo">To do</option>
                  <option value="doing">In progress</option>
                  <option value="done">Done</option>
                </select>
              ) : null}
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
    )
  }

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
        <div className="hero-side">
          <div className="hero-card">
            <div className="hero-card-header">
              <span>API Endpoint</span>
              <span className={`dot ${error ? 'dot--error' : 'dot--ok'}`} />
            </div>
            <p className="mono">{API_BASE}/api/tasks</p>
            <p className="tiny">
              Pastikan backend Laravel berjalan di{' '}
              <span className="mono">http://localhost:8000</span>.
            </p>
            <button className="ghost" onClick={() => setRefreshToken((prev) => prev + 1)}>
              Refresh Data
            </button>
          </div>
          <div className="hero-card auth-card">
            <div className="hero-card-header">
              <span>Akun</span>
              <span className={`dot ${isAuthenticated ? 'dot--ok' : 'dot--error'}`} />
            </div>
            {authChecking ? (
              <p className="tiny">Memeriksa sesi...</p>
            ) : currentUser ? (
              <>
                <div className="auth-user">
                  <p className="auth-name">{currentUser.name}</p>
                  <p className="tiny">{currentUser.email}</p>
                </div>
                <button className="ghost" onClick={handleLogout} disabled={authLoading}>
                  {authLoading ? 'Memproses...' : 'Logout'}
                </button>
              </>
            ) : (
              <>
                <div className="auth-toggle">
                  <button
                    type="button"
                    className={`ghost ${authMode === 'login' ? 'is-active' : ''}`}
                    onClick={() => {
                      setAuthMode('login')
                      setError(null)
                    }}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    className={`ghost ${authMode === 'register' ? 'is-active' : ''}`}
                    onClick={() => {
                      setAuthMode('register')
                      setError(null)
                    }}
                  >
                    Register
                  </button>
                </div>
                <form className="auth-form" onSubmit={handleAuthSubmit}>
                  {authMode === 'register' ? (
                    <input
                      value={authForm.name}
                      onChange={(event) =>
                        setAuthForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="Nama lengkap"
                      autoComplete="name"
                      disabled={authLoading}
                    />
                  ) : null}
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(event) =>
                      setAuthForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder="Email"
                    autoComplete="email"
                    disabled={authLoading}
                  />
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) =>
                      setAuthForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                    placeholder="Password"
                    autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                    disabled={authLoading}
                  />
                  {authMode === 'register' ? (
                    <input
                      type="password"
                      value={authForm.passwordConfirm}
                      onChange={(event) =>
                        setAuthForm((prev) => ({
                          ...prev,
                          passwordConfirm: event.target.value,
                        }))
                      }
                      placeholder="Konfirmasi password"
                      autoComplete="new-password"
                      disabled={authLoading}
                    />
                  ) : null}
                  <button type="submit" disabled={authLoading}>
                    {authLoading
                      ? 'Memproses...'
                      : authMode === 'register'
                        ? 'Buat Akun'
                        : 'Login'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className="stats">
        <div className="stat-card">
          <p>Total Task</p>
          <h3>{displayStats.total}</h3>
        </div>
        <div className="stat-card">
          <p>To do</p>
          <h3>{displayStats.todo}</h3>
        </div>
        <div className="stat-card">
          <p>In progress</p>
          <h3>{displayStats.doing}</h3>
        </div>
        <div className="stat-card">
          <p>Done</p>
          <h3>{displayStats.done}</h3>
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
        <div className="control">
          <label htmlFor="sort">Urutkan</label>
          <select
            id="sort"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
          >
            <option value="newest">Terbaru dulu</option>
            <option value="oldest">Terlama dulu</option>
          </select>
        </div>
        <div className="control">
          <label htmlFor="perPage">Jumlah per halaman</label>
          <select
            id="perPage"
            value={perPage}
            onChange={(event) => setPerPage(Number(event.target.value))}
          >
            <option value={6}>6</option>
            <option value={8}>8</option>
            <option value={12}>12</option>
            <option value={20}>20</option>
          </select>
        </div>
        <div className="control">
          <label htmlFor="view">Tampilan</label>
          <select
            id="view"
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as 'list' | 'board')}
          >
            <option value="list">List</option>
            <option value="board">Board</option>
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
                disabled={!authToken}
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
                disabled={!authToken}
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as TaskStatus }))
                }
                disabled={!authToken}
              >
                <option value="todo">To do</option>
                <option value="doing">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>
            <button type="submit" disabled={isSubmitting || !authToken}>
              {isSubmitting ? 'Menyimpan...' : 'Tambah Task'}
            </button>
            {!authToken ? (
              <p className="tiny">Login dulu untuk menambah task baru.</p>
            ) : null}
          </form>
        </section>

        <section className="panel list-panel">
          <div className="panel-header">
            <h2>Daftar Task</h2>
            <span className="tiny">{panelSummary}</span>
          </div>

          {viewMode === 'list' ? (
            <div className="task-list">
              {!authToken ? (
                <div className="empty-state">Silakan login untuk melihat task.</div>
              ) : loading ? (
                <div className="empty-state">Memuat data dari server...</div>
              ) : tasks.length === 0 ? (
                <div className="empty-state">Belum ada task. Buat yang pertama!</div>
              ) : (
                tasks.map((task) => renderTaskCard(task, 'list'))
              )}
            </div>
          ) : !authToken ? (
            <div className="empty-state">Silakan login untuk melihat task.</div>
          ) : loading ? (
            <div className="empty-state">Memuat data dari server...</div>
          ) : (
            <div className="board">
              {(['todo', 'doing', 'done'] as TaskStatus[]).map((status) => (
                <div
                  key={status}
                  className={`board-column${dragOverStatus === status ? ' is-over' : ''}`}
                >
                  <div className="board-column-header">
                    <h3>{STATUS_LABEL[status]}</h3>
                    <span className="tiny">{tasksByStatus[status].length} task</span>
                  </div>
                  <div
                    className="board-drop"
                    onDragOver={handleDragOver(status)}
                    onDragLeave={() => setDragOverStatus(null)}
                    onDrop={handleDrop(status)}
                  >
                    {tasksByStatus[status].length === 0 ? (
                      <div className="empty-state empty-state--compact">
                        Belum ada task.
                      </div>
                    ) : (
                      tasksByStatus[status].map((task) => renderTaskCard(task, 'board'))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {meta && viewMode === 'list' ? (
            <div className="pagination">
              <span className="tiny">
                Menampilkan {meta.from ?? 0}-{meta.to ?? 0} dari {meta.total} task
              </span>
              <div className="pager">
                <button
                  className="ghost"
                  onClick={() => setPage(1)}
                  disabled={loading || meta.current_page <= 1}
                >
                  Awal
                </button>
                <button
                  className="ghost"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={loading || meta.current_page <= 1}
                >
                  Sebelumnya
                </button>
                <span className="page-indicator">
                  Halaman {meta.current_page} / {meta.last_page || 1}
                </span>
                <button
                  className="ghost"
                  onClick={() =>
                    setPage((current) => Math.min(meta.last_page || 1, current + 1))
                  }
                  disabled={loading || meta.current_page >= meta.last_page}
                >
                  Berikutnya
                </button>
                <button
                  className="ghost"
                  onClick={() => setPage(meta.last_page || 1)}
                  disabled={loading || meta.current_page >= meta.last_page}
                >
                  Akhir
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

export default App
