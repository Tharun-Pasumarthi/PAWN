import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Plus, CheckCircle, Clock, ChevronRight, LayoutGrid, FileText, Settings, Scale,
  Bell, Gem, Package
} from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import type { PawnItem } from '../types'

interface Stats {
  active: number
  released: number
  totalPledged: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [stats, setStats] = useState<Stats>({ active: 0, released: 0, totalPledged: 0 })
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
        }
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [])

  const activePath = location.pathname

  return (
    <>
      {/* ─── Top bar ─── */}
      <header className="topbar">
        <div className="topbar-inner">
          <Scale size={24} color="var(--accent)" />
          <span className="topbar-title">Pawn Manager</span>
          <div className="topbar-actions">
            <button className="topbar-back" style={{ border: 'none' }}>
              <Bell size={18} />
            </button>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--gold-bg)', border: '2px solid var(--gold)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)'
            }}>
              PM
            </div>
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
                  <div key={item.id} className="activity-item">
                    <div className="activity-icon">
                      {item.status === 'released' ? <Gem size={18} /> : <Package size={18} />}
                    </div>
                    <div className="activity-body">
                      <div className="activity-title">#{item.serial_number}</div>
                      <div className="activity-sub">
                        {item.status === 'active' ? 'Active pledge' : 'Released'}
                      </div>
                    </div>
                    <div className="activity-right">
                      {item.status === 'released' ? (
                        <div className="activity-badge">REDEEMED</div>
                      ) : (
                        <div className="activity-amount">₹{Number(item.amount).toLocaleString('en-IN')}</div>
                      )}
                      <div className="activity-time">
                        {item.pledge_date ? new Date(item.pledge_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.section>
      </main>

      {/* ─── Bottom Nav ─── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          <button className={`nav-item ${activePath === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
            <LayoutGrid size={20} /><span>Dashboard</span>
          </button>
          <button className={`nav-item ${activePath === '/add' ? 'active' : ''}`} onClick={() => navigate('/add')}>
            <FileText size={20} /><span>Items</span>
          </button>
          <button className={`nav-item ${activePath === '/history' ? 'active' : ''}`} onClick={() => navigate('/history')}>
            <Clock size={20} /><span>History</span>
          </button>
          <button className={`nav-item ${activePath === '/release' ? 'active' : ''}`} onClick={() => navigate('/release')}>
            <Settings size={20} /><span>Settings</span>
          </button>
        </div>
      </nav>
    </>
  )
}
