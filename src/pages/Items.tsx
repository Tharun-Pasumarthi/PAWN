import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Search, Plus, Edit3, Trash2, Package, Gem, Loader2,
  ChevronDown, ChevronUp, IndianRupee, Calendar, Users, Filter,
  LayoutGrid, FileText, Clock, CheckCircle, Settings
} from 'lucide-react'
import { supabase, STORAGE_BUCKET } from '../services/supabaseClient'
import { requestBiometricAuth, hasRegisteredUsers } from '../services/biometricAuth'
import type { PawnItem } from '../types'

type FilterStatus = 'all' | 'active' | 'released'

export default function Items() {
  const navigate = useNavigate()
  const location = useLocation()

  const [items, setItems] = useState<PawnItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('active')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('pawn_items')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setItems((data ?? []) as PawnItem[])
    } catch {
      toast.error('Failed to load items')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItems() }, [])

  const filtered = useMemo(() => {
    let list = items
    if (filter !== 'all') list = list.filter(i => i.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(i =>
        i.serial_number.toLowerCase().includes(q) ||
        (i.mediator_name ?? '').toLowerCase().includes(q) ||
        String(i.amount).includes(q)
      )
    }
    return list
  }, [items, filter, search])

  const counts = useMemo(() => ({
    all: items.length,
    active: items.filter(i => i.status === 'active').length,
    released: items.filter(i => i.status === 'released').length,
  }), [items])

  const handleEdit = async (item: PawnItem) => {
    const verified = await requestBiometricAuth('Authenticate to edit this pledge')
    if (!verified) {
      toast.error(hasRegisteredUsers() ? 'Biometric verification failed' : 'Register a biometric user in Settings first')
      return
    }
    navigate(`/add?id=${item.id}`)
  }

  const handleDelete = async (item: PawnItem) => {
    const verified = await requestBiometricAuth('Authenticate to delete this pledge')
    if (!verified) {
      toast.error(hasRegisteredUsers() ? 'Biometric verification failed' : 'Register a biometric user in Settings first')
      return
    }

    if (!window.confirm(`Delete pledge #${item.serial_number}? This cannot be undone.`)) return

    setDeletingId(item.id)
    try {
      const { error } = await supabase.from('pawn_items').delete().eq('id', item.id)
      if (error) throw error
      toast.success(`#${item.serial_number} deleted`)
      setItems(prev => prev.filter(i => i.id !== item.id))
      setExpandedId(null)
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const activePath = location.pathname

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="topbar-back" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title">All Items</span>
          <div className="topbar-actions">
            <motion.button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/add')}
              whileTap={{ scale: 0.95 }}
              style={{ borderRadius: 'var(--radius-full)', padding: '8px 16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} /> Add New
            </motion.button>
          </div>
        </div>
      </header>

      <div style={{ height: 3, background: 'var(--accent)' }} />

      <main className="page-shell" style={{ paddingTop: 20 }}>
        {/* ─── Search ─── */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="field-input"
            style={{ width: '100%', paddingLeft: 42, fontSize: '0.9375rem' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by serial, mediator, or amount…"
          />
        </div>

        {/* ─── Filter chips ─── */}
        <div className="chip-group" style={{ marginBottom: 20 }}>
          {(['all', 'active', 'released'] as FilterStatus[]).map(f => (
            <button
              key={f}
              className={`chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
              style={{ textTransform: 'capitalize' }}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        {/* ─── Items list ─── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <Loader2 size={28} className="spin" />
            <div style={{ marginTop: 12, fontSize: '0.875rem' }}>Loading items…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Package size={48} />
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {search ? 'No items match your search' : filter === 'all' ? 'No items yet' : `No ${filter} items`}
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              {!search && filter === 'all' && 'Tap "Add New" to create your first pledge.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20 }}>
            <AnimatePresence>
              {filtered.map((item, idx) => {
                const isExpanded = expandedId === item.id
                const isDeleting = deletingId === item.id
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25, delay: idx * 0.02 }}
                    className="card"
                    style={{ padding: 0, overflow: 'hidden' }}
                  >
                    {/* ─── Item Header (clickable to expand) ─── */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                        padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      {/* Thumbnail or icon */}
                      <div style={{
                        width: 48, height: 48, borderRadius: 'var(--radius-md)', flexShrink: 0, overflow: 'hidden',
                        background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {item.image_url ? (
                          <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          item.status === 'released'
                            ? <Gem size={20} color="var(--success)" />
                            : <Package size={20} color="var(--text-muted)" />
                        )}
                      </div>

                      {/* Basic info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                            #{item.serial_number}
                          </span>
                          <span className={`badge ${item.status === 'active' ? 'badge-info' : 'badge-success'}`}>
                            {item.status === 'active' ? 'Active' : 'Released'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {item.mediator_name ?? 'No mediator'} · {new Date(item.pledge_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>

                      {/* Amount + chevron */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent)' }}>
                          ₹{Number(item.amount).toLocaleString('en-IN')}
                        </div>
                        <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </button>

                    {/* ─── Expanded Details ─── */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-subtle)' }}>
                            {/* Item image */}
                            {item.image_url && (
                              <div style={{ marginTop: 14, marginBottom: 14, borderRadius: 'var(--radius-md)', overflow: 'hidden', maxHeight: 220 }}>
                                <img src={item.image_url} alt="" style={{ width: '100%', objectFit: 'cover' }} />
                              </div>
                            )}

                            {/* Detail rows */}
                            <div style={{ marginTop: item.image_url ? 0 : 14 }}>
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Serial Number</span>
                                <span className="detail-val" style={{ fontWeight: 700 }}>#{item.serial_number}</span>
                              </div>
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Mediator</span>
                                <span className="detail-val">{item.mediator_name ?? '—'}</span>
                              </div>
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Amount</span>
                                <span className="detail-val" style={{ fontWeight: 700, color: 'var(--accent)' }}>₹{Number(item.amount).toLocaleString('en-IN')}</span>
                              </div>
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Interest Rate</span>
                                <span className="detail-val">{item.interest_rate}% / month</span>
                              </div>
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Pledge Date</span>
                                <span className="detail-val">{new Date(item.pledge_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                              </div>
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Status</span>
                                <span className={`badge ${item.status === 'active' ? 'badge-info' : 'badge-success'}`}>
                                  {item.status === 'active' ? 'Active' : 'Released'}
                                </span>
                              </div>
                            </div>

                            {/* Action buttons — only for active items */}
                            {item.status === 'active' && (
                              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                <motion.button
                                  className="btn btn-full"
                                  onClick={() => handleEdit(item)}
                                  whileTap={{ scale: 0.97 }}
                                  style={{ flex: 1, borderRadius: 'var(--radius-xl)', fontSize: '0.875rem', fontWeight: 700, padding: '12px 16px', background: 'var(--accent)', color: 'white' }}
                                >
                                  <Edit3 size={16} /> Edit
                                </motion.button>
                                <motion.button
                                  className="btn btn-full"
                                  onClick={() => handleDelete(item)}
                                  disabled={isDeleting}
                                  whileTap={{ scale: 0.97 }}
                                  style={{ flex: 1, borderRadius: 'var(--radius-xl)', fontSize: '0.875rem', fontWeight: 700, padding: '12px 16px', background: '#ef4444', color: 'white' }}
                                >
                                  {isDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                                  {isDeleting ? 'Deleting…' : 'Delete'}
                                </motion.button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* ─── Bottom Nav ─── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          <button className={`nav-item ${activePath === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
            <LayoutGrid size={20} /><span>Dashboard</span>
          </button>
          <button className={`nav-item ${activePath === '/items' ? 'active' : ''}`} onClick={() => navigate('/items')}>
            <FileText size={20} /><span>Items</span>
          </button>
          <button className={`nav-item ${activePath === '/history' ? 'active' : ''}`} onClick={() => navigate('/history')}>
            <Clock size={20} /><span>History</span>
          </button>
          <button className={`nav-item ${activePath === '/release' ? 'active' : ''}`} onClick={() => navigate('/release')}>
            <CheckCircle size={20} /><span>Release</span>
          </button>
          <button className={`nav-item ${activePath === '/settings' ? 'active' : ''}`} onClick={() => navigate('/settings')}>
            <Settings size={20} /><span>Settings</span>
          </button>
        </div>
      </nav>
    </>
  )
}
