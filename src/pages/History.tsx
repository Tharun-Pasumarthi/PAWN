import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Download, Search, FileSpreadsheet, Image as ImageIcon,
  Loader2, ChevronDown, Calendar, IndianRupee, Clock
} from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import { exportToCSV } from '../services/csvExport'
import ImageLightbox from '../components/ImageLightbox'
import ResolvedImage from '../components/ResolvedImage'
import type { PawnHistory } from '../types'

type Tab = 'all' | 'recent' | 'high'

export default function History() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PawnHistory[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const { data: rows, error } = await supabase
          .from('pawn_history')
          .select('*')
          .order('release_date', { ascending: false })
        if (error) throw error
        setData(rows ?? [])
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to load history')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const searched = query
    ? data.filter(r =>
        r.serial_number.toLowerCase().includes(query.toLowerCase()) ||
        (r.customer_name ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (r.source_shopkeepers ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : data

  const filtered = (() => {
    switch (tab) {
      case 'recent': {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 30)
        return searched.filter(r => new Date(r.release_date) >= cutoff)
      }
      case 'high':
        return [...searched].sort((a, b) => Number(b.final_amount) - Number(a.final_amount))
      default:
        return searched
    }
  })()

  const stats = filtered.reduce(
    (acc, r) => ({
      principal: acc.principal + Number(r.amount),
      interest: acc.interest + Number(r.total_interest),
      total: acc.total + Number(r.final_amount)
    }),
    { principal: 0, interest: 0, total: 0 }
  )

  const handleExport = async () => {
    if (!filtered.length) { toast.error('No data to export'); return }
    const stamp = new Date().toISOString().split('T')[0]
    try {
      const message = await exportToCSV(filtered, `pawn-history-${stamp}.csv`)
      toast.success(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed'
      toast.error(message)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="topbar-back" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title">History</span>
          <div className="topbar-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExport}
              disabled={!filtered.length}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>
      </header>

      <main className="page-shell" style={{ paddingTop: 16 }}>
        {/* Stats Summary */}
        {!loading && filtered.length > 0 && (
          <motion.div
            className="card"
            style={{ marginBottom: 16, padding: 16 }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Records</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>{filtered.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Interest</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f59e0b' }}>{inr(stats.interest)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Collected</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#22c55e' }}>{inr(stats.total)}</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Search */}
        <motion.div
          style={{ marginBottom: 12, position: 'relative' }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="field-input"
            style={{ paddingLeft: 38, borderRadius: 12 }}
            placeholder="Search by serial, customer, or source shopkeeper…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </motion.div>

        {/* Tabs */}
        <div className="tab-group" style={{ marginBottom: 16 }}>
          {([['all', 'All'], ['recent', 'Last 30 Days'], ['high', 'Highest']] as const).map(([key, label]) => (
            <button
              key={key}
              className={`tab-item${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <Loader2 size={28} className="spin" color="var(--accent)" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading history…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <FileSpreadsheet size={48} />
            <p style={{ fontWeight: 600, fontSize: '1rem', marginTop: 12 }}>No records found</p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {query ? 'Try a different search term' : 'Released items will appear here'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 100 }}>
            <AnimatePresence>
              {filtered.map((row, i) => {
                const days = daysBetween(row.pledge_date, row.release_date)
                const isOpen = expandedId === row.id
                return (
                  <motion.div
                    key={row.id}
                    className="history-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => setExpandedId(isOpen ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="history-card-header">
                      {row.image_url ? (
                        <ResolvedImage
                          src={row.image_url}
                          alt=""
                          className="history-thumb"
                          onClick={e => { e.stopPropagation(); setLightboxSrc(row.image_url) }}
                          style={{ cursor: 'zoom-in' }}
                          fallback={(
                            <div className="history-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
                              <ImageIcon size={20} color="var(--text-muted)" />
                            </div>
                          )}
                        />
                      ) : (
                        <div className="history-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
                          <ImageIcon size={20} color="var(--text-muted)" />
                        </div>
                      )}
                      <div className="history-body">
                        <span className="history-serial">#{row.serial_number}</span>
                        {row.customer_name && (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {row.customer_name}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Released {shortDate(row.release_date)}
                        </span>
                      </div>
                      <div className="history-right">
                        <span className="history-amount">{inr(Number(row.final_amount))}</span>
                        <span className="history-rate-meta">{days}d @ ₹{Number(row.interest_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <ChevronDown
                        size={16}
                        color="var(--text-muted)"
                        style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', marginLeft: 4, flexShrink: 0 }}
                      />
                    </div>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div className="history-detail-grid" style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.8125rem' }}>
                            <DetailRow icon={<IndianRupee size={14} />} label="Principal" value={`₹${fmt(row.amount)}`} />
                            <DetailRow icon={<Calendar size={14} />} label="Pledged" value={shortDate(row.pledge_date)} />
                            <DetailRow icon={<IndianRupee size={14} />} label="Interest" value={`₹${fmt(row.total_interest)}`} />
                            <DetailRow icon={<Clock size={14} />} label="Duration" value={`${days} days`} />
                            {Number(row.source_total ?? 0) > 0 && (
                              <>
                                <DetailRow icon={<IndianRupee size={14} />} label="Source Principal" value={`₹${fmt(Number(row.source_principal ?? 0))}`} />
                                <DetailRow icon={<IndianRupee size={14} />} label="Source Interest" value={`₹${fmt(Number(row.source_interest ?? 0))}`} />
                                <DetailRow icon={<IndianRupee size={14} />} label="Source Total" value={`₹${fmt(Number(row.source_total ?? 0))}`} />
                                <DetailRow icon={<Search size={14} />} label="Source Shopkeeper" value={(row.source_shopkeepers ?? '—')} />
                              </>
                            )}
                            {row.image_url && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <button
                                  onClick={e => { e.stopPropagation(); setLightboxSrc(row.image_url) }}
                                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                                >
                                  <ImageIcon size={14} /> View Full Image
                                </button>
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
    </>
  )
}

/* ─── Helpers ─── */
function inr(n: number) {
  return '\u20B9' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmt(n: number) {
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function shortDate(d: string) {
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`
}
function daysBetween(a: string, b: string) {
  return Math.ceil(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span style={{ color: 'var(--text-muted)' }}>{label}:</span>
      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}
