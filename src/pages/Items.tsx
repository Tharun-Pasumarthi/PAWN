import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Search, Plus, Edit3, Trash2, Package, Gem, Loader2,
  ChevronDown, ChevronUp, Download, Calendar
} from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import { exportItemsToCSV } from '../services/csvExport'
import ResolvedImage from '../components/ResolvedImage'
import ImageLightbox from '../components/ImageLightbox'
import { useVerifyAuth } from '../hooks/useVerifyAuth'
import { useAuth } from '../contexts/AuthContext'
import type { PawnItem } from '../types'

type FilterStatus = 'all' | 'active' | 'released'

export default function Items() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const shopFilter = searchParams.get('shop')
  const { user, isSuperUser } = useAuth()
  const { verify, modal: authModal } = useVerifyAuth()

  const [items, setItems] = useState<PawnItem[]>([])
  const [shopName, setShopName] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('active')
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single')
  const [filterDate, setFilterDate] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

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

  // Fetch shop name when filtering by shop
  useEffect(() => {
    if (!shopFilter) { setShopName(''); return }
    ;(async () => {
      const { data } = await supabase.rpc('get_shops')
      if (data) {
        const shop = (data as any[]).find((s: any) => s.user_id === shopFilter)
        if (shop) setShopName(shop.shop_name || shop.phone || shopFilter.slice(0, 8))
      }
    })()
  }, [shopFilter])

  const filtered = useMemo(() => {
    let list = items
    if (shopFilter) list = list.filter(i => (i as any).user_id === shopFilter)
    if (filter !== 'all') list = list.filter(i => i.status === filter)
    if (!isSuperUser) {
      if (dateMode === 'single' && filterDate) {
        const target = filterDate
        list = list.filter(i => dateOnly(i.pledge_date) === target)
      }
      if (dateMode === 'range' && (rangeStart || rangeEnd)) {
        const startMs = rangeStart ? new Date(rangeStart).getTime() : null
        const endMs = rangeEnd ? new Date(rangeEnd).getTime() : null
        list = list.filter(i => {
          const itemMs = new Date(dateOnly(i.pledge_date)).getTime()
          if (startMs !== null && itemMs < startMs) return false
          if (endMs !== null && itemMs > endMs) return false
          return true
        })
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(i =>
        i.serial_number.toLowerCase().includes(q) ||
        (i.mediator_name ?? '').toLowerCase().includes(q) ||
        (i.customer_name ?? '').toLowerCase().includes(q) ||
        String(i.amount).includes(q)
      )
    }
    return list
  }, [items, filter, search, shopFilter, dateMode, filterDate, rangeStart, rangeEnd, isSuperUser])

  const handleExport = async () => {
    if (!filtered.length) { toast.error('No items to export'); return }
    const stamp = new Date().toISOString().split('T')[0]
    try {
      const message = await exportItemsToCSV(filtered, `pawn-items-${stamp}.csv`)
      toast.success(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed'
      toast.error(message)
    }
  }

  const shopItems = useMemo(() => {
    return shopFilter ? items.filter(i => (i as any).user_id === shopFilter) : items
  }, [items, shopFilter])

  const counts = useMemo(() => ({
    all: shopItems.length,
    active: shopItems.filter(i => i.status === 'active').length,
    released: shopItems.filter(i => i.status === 'released').length,
  }), [shopItems])

  const handleEdit = async (item: PawnItem) => {
    const verified = await verify('Authenticate to edit this pledge')
    if (!verified) {
      toast.error('Biometric verification failed')
      return
    }
    navigate(`/add?id=${item.id}`)
  }

  const handleDelete = async (item: PawnItem) => {
    const verified = await verify('Authenticate to delete this pledge')
    if (!verified) {
      toast.error('Biometric verification failed')
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

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="topbar-back" onClick={() => shopFilter ? navigate('/items') : navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title">{shopFilter && shopName ? shopName : 'All Items'}</span>
          <div className="topbar-actions">
            {!isSuperUser && (
              <motion.button
                className="btn btn-ghost btn-sm"
                onClick={handleExport}
                disabled={!filtered.length}
                whileTap={{ scale: 0.95 }}
                style={{ borderRadius: 'var(--radius-full)', padding: '8px 12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={16} /> Export
              </motion.button>
            )}
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
            placeholder="Search by serial, name, or amount…"
          />
        </div>

        {/* ─── Date filters ─── */}
        {!isSuperUser && (
          <div className="card" style={{ marginBottom: 16, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Calendar size={16} color="var(--accent)" />
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pledge Date Filter
              </span>
              <div style={{ marginLeft: 'auto' }}>
                <button
                  className={`chip ${dateMode === 'single' ? 'active' : ''}`}
                  onClick={() => setDateMode('single')}
                  type="button"
                >
                  Single
                </button>
                <button
                  className={`chip ${dateMode === 'range' ? 'active' : ''}`}
                  onClick={() => setDateMode('range')}
                  type="button"
                  style={{ marginLeft: 8 }}
                >
                  Range
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setFilterDate(''); setRangeStart(''); setRangeEnd('') }}
                  style={{ marginLeft: 8 }}
                >
                  Clear
                </button>
              </div>
            </div>
            {dateMode === 'single' ? (
              <input
                className="field-input"
                style={{ width: '100%' }}
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
              />
            ) : (
              <div className="grid-2" style={{ gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                    From
                  </label>
                  <input
                    className="field-input"
                    style={{ width: '100%' }}
                    type="date"
                    value={rangeStart}
                    onChange={e => setRangeStart(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                    To
                  </label>
                  <input
                    className="field-input"
                    style={{ width: '100%' }}
                    type="date"
                    value={rangeEnd}
                    onChange={e => setRangeEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

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
                        <ResolvedImage
                          src={item.image_url}
                          alt=""
                          onClick={e => { if (item.image_url) { e.stopPropagation(); setLightboxSrc(item.image_url) } }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                          fallback={item.status === 'released'
                            ? <Gem size={20} color="var(--success)" />
                            : <Package size={20} color="var(--text-muted)" />}
                        />
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
                          {item.customer_name || item.mediator_name || '—'} · {(() => { const dt = new Date(item.pledge_date); return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}` })()}
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
                              <div onClick={() => setLightboxSrc(item.image_url)} style={{ marginTop: 14, marginBottom: 14, borderRadius: 'var(--radius-md)', overflow: 'hidden', maxHeight: 220, cursor: 'zoom-in' }}>
                                <ResolvedImage src={item.image_url} alt="" style={{ width: '100%', objectFit: 'cover' }} />
                              </div>
                            )}

                            {/* Detail rows */}
                            <div style={{ marginTop: item.image_url ? 0 : 14 }}>
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Serial Number</span>
                                <span className="detail-val" style={{ fontWeight: 700 }}>#{item.serial_number}</span>
                              </div>
                              {item.customer_name && (
                                <div className="detail-row" style={{ padding: '8px 0' }}>
                                  <span className="detail-key">Customer</span>
                                  <span className="detail-val">{item.customer_name}</span>
                                </div>
                              )}
                              {item.item_type && (
                                <div className="detail-row" style={{ padding: '8px 0' }}>
                                  <span className="detail-key">Type</span>
                                  <span className="detail-val">{item.item_type}</span>
                                </div>
                              )}
                              {item.mediator_name && (
                                <div className="detail-row" style={{ padding: '8px 0' }}>
                                  <span className="detail-key">Mediator</span>
                                  <span className="detail-val">{item.mediator_name}</span>
                                </div>
                              )}
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Amount</span>
                                <span className="detail-val" style={{ fontWeight: 700, color: 'var(--accent)' }}>₹{Number(item.amount).toLocaleString('en-IN')}</span>
                              </div>
                              {!isSuperUser && item.weight !== null && item.weight !== undefined && (
                                <div className="detail-row" style={{ padding: '8px 0' }}>
                                  <span className="detail-key">Weight</span>
                                  <span className="detail-val">{Number(item.weight).toLocaleString('en-IN')} g</span>
                                </div>
                              )}
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Interest Rate</span>
                                <span className="detail-val">{item.interest_rate}% / month</span>
                              </div>
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Pledge Date</span>
                                <span className="detail-val">{(() => { const dt = new Date(item.pledge_date); return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}` })()}</span>
                              </div>
                              <div className="detail-row" style={{ padding: '8px 0' }}>
                                <span className="detail-key">Status</span>
                                <span className={`badge ${item.status === 'active' ? 'badge-info' : 'badge-success'}`}>
                                  {item.status === 'active' ? 'Active' : 'Released'}
                                </span>
                              </div>
                            </div>

                            {/* Action buttons — only for active items */}
                            {item.status === 'active' && (!isSuperUser || item.user_id === user?.id) && (
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

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      {authModal}
    </>
  )
}

function dateOnly(value: string) {
  return value.split('T')[0]
}
