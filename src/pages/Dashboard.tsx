import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Plus, CheckCircle, ChevronRight, LayoutGrid, FileText, Scale,
  Gem, Package, LogOut, Store
} from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import ResolvedImage from '../components/ResolvedImage'
import type { PawnItem } from '../types'

interface Stats {
  active: number
  released: number
  totalPledged: number
}

interface ShopStats {
  userId: string
  active: number
  released: number
  totalPledged: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { shopName, signOut, isSuperUser } = useAuth()
  const [stats, setStats] = useState<Stats>({ active: 0, released: 0, totalPledged: 0 })
  const [shopStats, setShopStats] = useState<ShopStats[]>([])
  const [shopNames, setShopNames] = useState<Record<string, string>>({})
  const [recent, setRecent] = useState<PawnItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const { data: items } = await supabase
          .from('pawn_items')
          .select('*')
          .order('created_at', { ascending: false })
        if (items) {
          setStats({
            active: items.filter(i => i.status === 'active').length,
            released: items.filter(i => i.status === 'released').length,
            totalPledged: items
              .filter(i => i.status === 'active')
              .reduce((s, i) => s + Number(i.amount), 0)
          })
          setRecent(items.slice(0, 4) as PawnItem[])

          // Per-shop breakdown for super user
          if (isSuperUser) {
            const byShop = new Map<string, { active: number; released: number; totalPledged: number }>()
            for (const it of items) {
              const uid = (it as any).user_id ?? 'unknown'
              if (!byShop.has(uid)) byShop.set(uid, { active: 0, released: 0, totalPledged: 0 })
              const s = byShop.get(uid)!
              if (it.status === 'active') { s.active++; s.totalPledged += Number(it.amount) }
              else { s.released++ }
            }
            setShopStats(Array.from(byShop.entries()).map(([userId, s]) => ({ userId, ...s })))

            // Fetch shop names via secure RPC
            const { data: shops } = await supabase.rpc('get_shops')
            if (shops) {
              const names: Record<string, string> = {}
              for (const s of shops) names[s.user_id] = s.shop_name || s.phone || s.user_id.slice(0, 8)
              setShopNames(names)
            }
          }
        }
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [])

  return (
    <>
      {/* ─── Top bar ─── */}
      <header className="topbar">
        <div className="topbar-inner">
          <Scale size={24} color="var(--accent)" style={{ flexShrink: 0 }} />
          <span className="topbar-title">
            {shopName}
            {isSuperUser && (
              <button
                onClick={() => navigate('/shops')}
                style={{
                  fontSize: '0.7rem', fontWeight: 700, color: '#fff',
                  background: 'var(--accent)', border: 'none', borderRadius: 20,
                  padding: '3px 10px', marginLeft: 8, cursor: 'pointer',
                  verticalAlign: 'middle', letterSpacing: '0.02em'
                }}
              >
                All Shops
              </button>
            )}
          </span>
          <div className="topbar-actions">
            <button
              className="topbar-back"
              style={{ border: 'none' }}
              onClick={signOut}
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="page-shell" style={{ paddingTop: 28 }}>
        {/* ─── Business Summary ─── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ marginBottom: 28 }} 
        >
          <div className="section-header" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LayoutGrid size={18} color="var(--accent)" />
              <span className="section-title">Business Summary</span>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="stat">
                <span className="stat-label">Active Pledges</span>
                <span className="stat-value" style={{ fontSize: '2rem' }}>
                  {loading ? '—' : stats.active.toLocaleString()}
                </span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--success)' }}>
                  {loading ? '' : `₹${stats.totalPledged.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                </span>
              </div>
            </div>
            <div className="card">
              <div className="stat">
                <span className="stat-label">Recently Released</span>
                <span className="stat-value" style={{ fontSize: '2rem' }}>
                  {loading ? '—' : stats.released}
                </span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ─── Per-Shop Breakdown (super user only) ─── */}
        {isSuperUser && !loading && shopStats.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.4 }}
            style={{ marginBottom: 28 }}
          >
            <div className="section-header" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Store size={18} color="var(--accent)" />
                <span className="section-title">Shop Breakdown</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shopStats.map(shop => (
                <motion.button
                  key={shop.userId}
                  className="action-card"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(`/items?shop=${shop.userId}`)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '14px 18px', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)',
                    display: 'block'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Store size={16} color="var(--accent)" />
                      <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                        {shopNames[shop.userId] || shop.userId.slice(0, 8)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                        {shop.active + shop.released} total
                      </span>
                      <ChevronRight size={16} color="var(--accent)" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: 2 }}>Active</div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent)' }}>{shop.active}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: 2 }}>Released</div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--success)' }}>{shop.released}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: 2 }}>Pledged</div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                        ₹{shop.totalPledged.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.section>
        )}

        {/* ─── Quick Actions ─── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          style={{ marginBottom: 32 }}
        >
          <div className="section-header">
            <span className="section-title">Quick Actions</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button className="action-card primary" onClick={() => navigate('/add')}>
              <div className="action-icon">
                <Plus size={22} />
              </div>
              <div className="action-body">
                <div className="action-title">Add New Pledge</div>
                <div className="action-desc">Create a new loan agreement</div>
              </div>
              <ChevronRight size={20} className="action-chevron" />
            </button>

            <button className="action-card" onClick={() => navigate('/release')}>
              <div className="action-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                <CheckCircle size={22} />
              </div>
              <div className="action-body">
                <div className="action-title">Release Item</div>
                <div className="action-desc">Process final payment and return</div>
              </div>
              <ChevronRight size={20} className="action-chevron" />
            </button>

            <button className="action-card" onClick={() => navigate('/history')}>
              <div className="action-icon" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                <FileText size={22} />
              </div>
              <div className="action-body">
                <div className="action-title">View History</div>
                <div className="action-desc">Audit logs and past transactions</div>
              </div>
              <ChevronRight size={20} className="action-chevron" />
            </button>
          </div>
        </motion.section>

        {/* ─── Recent Activity ─── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className="section-header">
            <span className="section-title">Recent Activity</span>
            <button className="section-link" onClick={() => navigate('/history')}>See All</button>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '4px 20px' }}>
              {loading ? (
                <p style={{ padding: '20px 0', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.875rem' }}>Loading…</p>
              ) : recent.length === 0 ? (
                <p style={{ padding: '20px 0', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.875rem' }}>No recent activity</p>
              ) : (
                recent.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="activity-item activity-item-link"
                    onClick={() => navigate(`/items?status=${item.status}&item=${item.id}`)}
                  >
                    <div className="activity-thumb">
                      <ResolvedImage
                        src={item.image_url}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        fallback={
                          <div className="activity-icon" style={{ width: '100%', height: '100%', borderRadius: 12 }}>
                            {item.status === 'released' ? <Gem size={18} /> : <Package size={18} />}
                          </div>
                        }
                      />
                    </div>
                    <div className="activity-body">
                      <div className="activity-title">#{item.serial_number}</div>
                      <div className="activity-sub">
                        {item.mediator_name ? `${item.mediator_name} · ` : ''}{item.status === 'active' ? 'Active pledge' : 'Released'}
                      </div>
                    </div>
                    <div className="activity-right">
                      {item.status === 'released' ? (
                        <div className="activity-badge">REDEEMED</div>
                      ) : (
                        <div className="activity-amount">₹{Number(item.amount).toLocaleString('en-IN')}</div>
                      )}
                      <div className="activity-time">
                        {item.pledge_date ? (() => { const dt = new Date(item.pledge_date); return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}` })() : ''}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </motion.section>
      </main>
    </>
  )
}
