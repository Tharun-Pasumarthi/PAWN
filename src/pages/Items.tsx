import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Search, Plus, Edit3, Trash2, Package, Gem, Loader2,
  ChevronDown, ChevronUp, Download, Calendar, IndianRupee
} from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import { exportItemsToCSV } from '../services/csvExport'
import ResolvedImage from '../components/ResolvedImage'
import ImageLightbox from '../components/ImageLightbox'
import { useVerifyAuth } from '../hooks/useVerifyAuth'
import { useAuth } from '../contexts/AuthContext'
import type { PawnAllocation, PawnItem, PawnPartPayment } from '../types'

type FilterStatus = 'all' | 'active' | 'released'

export default function Items() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rawShopFilter = searchParams.get('shop')
  const statusParam = searchParams.get('status')
  const focusItemParam = searchParams.get('item')
  const { user, isSuperUser } = useAuth()
  const shopFilter = isSuperUser ? null : rawShopFilter
  const { verify, modal: authModal } = useVerifyAuth()

  const [items, setItems] = useState<PawnItem[]>([])
  const [shopName, setShopName] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterStatus>(
    statusParam === 'all' || statusParam === 'active' || statusParam === 'released' ? statusParam : 'active'
  )
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single')
  const [filterDate, setFilterDate] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [itemFinance, setItemFinance] = useState<Record<string, {
    allocationCount: number
    allocationPrincipal: number
    partPaymentTotal: number
    allocationNames: string[]
    sourceLoanNames: string[]
  }>>({})

  const [allocModalItem, setAllocModalItem] = useState<PawnItem | null>(null)
  const [allocating, setAllocating] = useState(false)
  const [allocName, setAllocName] = useState('')
  const [allocAmount, setAllocAmount] = useState('')
  const [allocRateOption, setAllocRateOption] = useState('1.5')
  const [allocCustomRate, setAllocCustomRate] = useState('')
  const [allocDate, setAllocDate] = useState(todayStr())

  const [partModalItem, setPartModalItem] = useState<PawnItem | null>(null)
  const [parting, setParting] = useState(false)
  const [partAmount, setPartAmount] = useState('')
  const [partDate, setPartDate] = useState(todayStr())
  const [partNote, setPartNote] = useState('')

  const fetchItems = async () => {
    if (!user?.id) {
      setItems([])
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('pawn_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setItems((data ?? []) as PawnItem[])
    } catch {
      toast.error('Failed to load items')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItems() }, [user?.id])

  useEffect(() => {
    if (!items.length) { setItemFinance({}); return }
    const ids = items.map(i => i.id)
    ;(async () => {
      try {
        const [{ data: allocations }, { data: partPayments }] = await Promise.all([
          supabase
            .from('pawn_allocations')
            .select('item_id, amount, status, allocated_name')
            .in('item_id', ids),
          supabase
            .from('pawn_part_payments')
            .select('item_id, amount')
            .in('item_id', ids)
        ])

        const finance: Record<string, {
          allocationCount: number
          allocationPrincipal: number
          partPaymentTotal: number
          allocationNames: string[]
          sourceLoanNames: string[]
        }> = {}
        for (const item of items) {
          finance[item.id] = {
            allocationCount: 0,
            allocationPrincipal: 0,
            partPaymentTotal: 0,
            allocationNames: [],
            sourceLoanNames: []
          }
        }

        ;((allocations ?? []) as Array<Pick<PawnAllocation, 'item_id' | 'amount' | 'allocated_name' | 'status'>>).forEach(a => {
          if (!finance[a.item_id]) return
          if (a.status !== 'active') return

          const normalizedName = a.allocated_name.trim()
          if (normalizedName && !finance[a.item_id].sourceLoanNames.includes(normalizedName)) {
            finance[a.item_id].sourceLoanNames.push(normalizedName)
          }

          finance[a.item_id].allocationCount += 1
          finance[a.item_id].allocationPrincipal += Number(a.amount)
          if (normalizedName && !finance[a.item_id].allocationNames.includes(normalizedName)) {
            finance[a.item_id].allocationNames.push(normalizedName)
          }
        })

        ;((partPayments ?? []) as Array<Pick<PawnPartPayment, 'item_id' | 'amount'>>).forEach(p => {
          if (!finance[p.item_id]) return
          finance[p.item_id].partPaymentTotal += Number(p.amount)
        })

        setItemFinance(finance)
      } catch {
        // ignore summary errors; core list should still work
      }
    })()
  }, [items])

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

  useEffect(() => {
    if (statusParam === 'all' || statusParam === 'active' || statusParam === 'released') {
      setFilter(statusParam)
    }
  }, [statusParam])

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
        (itemFinance[i.id]?.sourceLoanNames ?? []).some(name => name.toLowerCase().includes(q)) ||
        String(i.amount).includes(q)
      )
    }
    return list
  }, [items, filter, search, shopFilter, dateMode, filterDate, rangeStart, rangeEnd, isSuperUser, itemFinance])

  useEffect(() => {
    if (!focusItemParam) return
    const focusedItem = items.find(i => i.id === focusItemParam)
    if (!focusedItem) return
    setExpandedId(focusedItem.id)
  }, [focusItemParam, items])

  const handleExport = async () => {
    if (!filtered.length) { toast.error('No items to export'); return }
    const stamp = new Date().toISOString().split('T')[0]
    try {
      const rowsWithPartPayments = filtered.map(item => ({
        ...item,
        part_payment_total: Number(itemFinance[item.id]?.partPaymentTotal ?? 0),
        source_loan_names: (itemFinance[item.id]?.sourceLoanNames ?? []).join(' | ')
      }))
      const message = await exportItemsToCSV(rowsWithPartPayments, `pawn-items-${stamp}.csv`)
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
      if (user?.id) {
        const { error } = await supabase.from('pawn_items').delete().eq('id', item.id).eq('user_id', user.id)
        if (error) throw error
      } else {
        throw new Error('User session missing')
      }
      toast.success(`#${item.serial_number} deleted`)
      setItems(prev => prev.filter(i => i.id !== item.id))
      setExpandedId(null)
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const openAllocate = (item: PawnItem) => {
    if ((itemFinance[item.id]?.allocationCount ?? 0) > 0) {
      toast.error('Only one source loan is allowed. Use Edit to update it.')
      return
    }
    setAllocModalItem(item)
    setAllocName('')
    setAllocAmount('')
    setAllocRateOption('1.5')
    setAllocCustomRate('')
    setAllocDate(todayStr())
  }

  const openPartPayment = (item: PawnItem) => {
    setPartModalItem(item)
    setPartAmount('')
    setPartDate(todayStr())
    setPartNote('')
  }

  const saveAllocation = async () => {
    if (!allocModalItem) return
    if (!user?.id) { toast.error('User session missing'); return }
    if (!allocName.trim()) { toast.error('Enter source name'); return }
    const amount = Number(allocAmount)
    if (!amount || amount <= 0) { toast.error('Enter a valid source amount'); return }
    const rate = allocRateOption === 'custom' ? Number(allocCustomRate) : Number(allocRateOption)
    if (!rate || rate <= 0) { toast.error('Enter a valid source interest'); return }
    if (!allocDate) { toast.error('Pick source date'); return }

    setAllocating(true)
    try {
      const { data: existingAllocations, error: existingError } = await supabase
        .from('pawn_allocations')
        .select('id')
        .eq('item_id', allocModalItem.id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
      if (existingError) throw existingError
      if ((existingAllocations?.length ?? 0) > 0) {
        toast.error('Only one source loan is allowed. Use Edit to update it.')
        setAllocModalItem(null)
        return
      }

      const { error } = await supabase.from('pawn_allocations').insert([{
        item_id: allocModalItem.id,
        user_id: user.id,
        allocated_name: allocName.trim(),
        amount,
        interest_rate: rate,
        allocation_date: allocDate,
        status: 'active'
      }])
      if (error) throw error

      toast.success('Source loan added')
      setAllocModalItem(null)
      await fetchItems()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add source loan')
    } finally {
      setAllocating(false)
    }
  }

  const savePartPayment = async () => {
    if (!partModalItem) return
    if (!user?.id) { toast.error('User session missing'); return }
    const amount = Number(partAmount)
    if (!amount || amount <= 0) { toast.error('Enter a valid payment amount'); return }
    if (!partDate) { toast.error('Pick payment date'); return }

    setParting(true)
    try {
      const { error } = await supabase.from('pawn_part_payments').insert([{
        item_id: partModalItem.id,
        user_id: user.id,
        amount,
        payment_date: partDate,
        note: partNote.trim() || null
      }])
      if (error) throw error

      toast.success('Part payment saved')
      setPartModalItem(null)
      await fetchItems()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save part payment')
    } finally {
      setParting(false)
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
          <div className="topbar-actions items-topbar-actions">
            <motion.button
              className="btn btn-ghost btn-sm"
              onClick={handleExport}
              disabled={!filtered.length}
              whileTap={{ scale: 0.95 }}
              style={{ borderRadius: 'var(--radius-full)', padding: '8px 12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={16} /> Export
            </motion.button>
            <motion.button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/add')}
              whileTap={{ scale: 0.95 }}
              style={{ borderRadius: 'var(--radius-full)', padding: '8px 16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} /> <span className="items-add-label">Add New</span>
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
            placeholder="Search by serial, customer, source loan name, or amount…"
          />
        </div>

        {/* ─── Date filters ─── */}
        {!isSuperUser && (
          <div className="card" style={{ marginBottom: 16, padding: 14 }}>
            <div className="items-filter-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Calendar size={16} color="var(--accent)" />
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pledge Date Filter
              </span>
              <div className="items-filter-actions" style={{ marginLeft: 'auto' }}>
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
                const hasSourceLoan = (itemFinance[item.id]?.allocationCount ?? 0) > 0
                const sourceLoanLocked = hasSourceLoan
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
                          {item.status === 'active' && (
                            (itemFinance[item.id]?.allocationNames?.length ?? 0) > 0
                              ? <span className="badge badge-gold">{itemFinance[item.id].allocationNames[0]}</span>
                              : <span className="badge badge-warning">Not Allocated</span>
                          )}
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
                                <span className="detail-key">Interest</span>
                                <span className="detail-val">₹{Number(item.interest_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
                              {item.status === 'active' && !isSuperUser && (
                                <>
                                  <div className="detail-row" style={{ padding: '8px 0' }}>
                                    <span className="detail-key">Allocation Status</span>
                                    <span className="detail-val" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                                      {(itemFinance[item.id]?.allocationNames?.length ?? 0) === 0
                                        ? <span className="badge badge-warning">Not Allocated</span>
                                        : itemFinance[item.id].allocationNames.map(name => (
                                          <span key={`${item.id}-${name}`} className="badge badge-gold">{name}</span>
                                        ))}
                                    </span>
                                  </div>
                                  <div className="detail-row" style={{ padding: '8px 0' }}>
                                    <span className="detail-key">Source Loans</span>
                                    <span className="detail-val">{itemFinance[item.id]?.allocationCount ?? 0}</span>
                                  </div>
                                  <div className="detail-row" style={{ padding: '8px 0' }}>
                                    <span className="detail-key">Allocated Principal</span>
                                    <span className="detail-val">₹{Number(itemFinance[item.id]?.allocationPrincipal ?? 0).toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="detail-row" style={{ padding: '8px 0' }}>
                                    <span className="detail-key">Part Payments</span>
                                    <span className="detail-val">₹{Number(itemFinance[item.id]?.partPaymentTotal ?? 0).toLocaleString('en-IN')}</span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Action buttons — only for active items */}
                            {item.status === 'active' && (
                              <>
                                <div className="item-action-row" style={{ display: 'flex', gap: 10, marginTop: 16 }}>
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
                                {!isSuperUser && (
                                  <div className="item-action-row" style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                    <motion.button
                                      className="btn btn-full"
                                      onClick={() => openAllocate(item)}
                                      disabled={sourceLoanLocked}
                                      whileTap={{ scale: 0.97 }}
                                      style={{
                                        flex: 1,
                                        borderRadius: 'var(--radius-xl)',
                                        fontSize: '0.875rem',
                                        fontWeight: 700,
                                        padding: '12px 16px',
                                        background: sourceLoanLocked ? '#94a3b8' : '#0ea5e9',
                                        color: 'white',
                                        opacity: sourceLoanLocked ? 0.95 : 1
                                      }}
                                    >
                                      <Plus size={16} />
                                      {hasSourceLoan ? 'Use Edit for Loan' : 'Source Loan'}
                                    </motion.button>
                                    <motion.button
                                      className="btn btn-full"
                                      onClick={() => openPartPayment(item)}
                                      whileTap={{ scale: 0.97 }}
                                      style={{
                                        flex: 1,
                                        borderRadius: 'var(--radius-xl)',
                                        fontSize: '0.875rem',
                                        fontWeight: 700,
                                        padding: '12px 16px',
                                        background: '#7c3aed',
                                        color: 'white',
                                        opacity: 1
                                      }}
                                    >
                                      <IndianRupee size={16} /> Part Payment
                                    </motion.button>
                                  </div>
                                )}
                              </>
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

      {allocModalItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: 16 }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 12, color: 'var(--text-primary)' }}>
              Add Source Loan for #{allocModalItem.serial_number}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="field-input" value={allocName} onChange={e => setAllocName(e.target.value)} placeholder="Source name (shop/person)" />
              <input className="field-input" type="number" inputMode="decimal" value={allocAmount} onChange={e => setAllocAmount(e.target.value)} placeholder="Source amount" min="0" step="0.01" />
              <select className="field-input" value={allocRateOption} onChange={e => setAllocRateOption(e.target.value)}>
                <option value="1">₹1.00</option>
                <option value="1.5">₹1.50</option>
                <option value="2">₹2.00</option>
                <option value="3">₹3.00</option>
                <option value="5">₹5.00</option>
                <option value="custom">Custom ₹</option>
              </select>
              {allocRateOption === 'custom' && (
                <input className="field-input" type="number" inputMode="decimal" value={allocCustomRate} onChange={e => setAllocCustomRate(e.target.value)} placeholder="Custom source interest" min="0" step="0.01" />
              )}
              <input className="field-input" type="date" value={allocDate} onChange={e => setAllocDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setAllocModalItem(null)} disabled={allocating}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveAllocation} disabled={allocating}>
                {allocating ? <Loader2 size={16} className="spin" /> : null}
                {allocating ? 'Saving…' : 'Save Source Loan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {partModalItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: 16 }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 12, color: 'var(--text-primary)' }}>
              Part Payment for #{partModalItem.serial_number}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="field-input" type="number" inputMode="decimal" value={partAmount} onChange={e => setPartAmount(e.target.value)} placeholder="Enter amount" min="0" step="0.01" />
              <input className="field-input" type="date" value={partDate} onChange={e => setPartDate(e.target.value)} />
              <input className="field-input" value={partNote} onChange={e => setPartNote(e.target.value)} placeholder="Note (optional)" />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPartModalItem(null)} disabled={parting}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={savePartPayment} disabled={parting}>
                {parting ? <Loader2 size={16} className="spin" /> : null}
                {parting ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
      {authModal}
    </>
  )
}

function dateOnly(value: string) {
  return value.split('T')[0]
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
