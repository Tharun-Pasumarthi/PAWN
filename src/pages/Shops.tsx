import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Store, ChevronRight, Loader2 } from 'lucide-react'
import { supabase } from '../services/supabaseClient'

interface Shop {
  user_id: string
  shop_name: string | null
  phone: string | null
  created_at: string
  active: number
  released: number
  totalPledged: number
}

export default function Shops() {
  const navigate = useNavigate()
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        // Fetch all shops via secure RPC
        const { data: shopRows } = await supabase.rpc('get_shops')        
        // Fetch all items to compute per-shop stats
        const { data: items } = await supabase
          .from('pawn_items')
          .select('user_id, status, amount')

        const statsMap = new Map<string, { active: number; released: number; totalPledged: number }>()
        if (items) {
          for (const it of items) {
            const uid = (it as any).user_id ?? 'unknown'
            if (!statsMap.has(uid)) statsMap.set(uid, { active: 0, released: 0, totalPledged: 0 })
            const s = statsMap.get(uid)!
            if (it.status === 'active') { s.active++; s.totalPledged += Number(it.amount) }
            else { s.released++ }
          }
        }

        if (shopRows) {
          const merged: Shop[] = (shopRows as any[]).map((s: any) => ({
            user_id: s.user_id,
            shop_name: s.shop_name,
            phone: s.phone,
            created_at: s.created_at,
            ...(statsMap.get(s.user_id) || { active: 0, released: 0, totalPledged: 0 })
          }))
          setShops(merged)
        }
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [])

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="topbar-back" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title">All Shops</span>
        </div>
      </header>

      <div style={{ height: 3, background: 'var(--accent)' }} />

      <main className="page-shell" style={{ paddingTop: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <Loader2 size={28} className="spin" />
            <div style={{ marginTop: 12, fontSize: '0.875rem' }}>Loading shops…</div>
          </div>
        ) : shops.length === 0 ? (
          <div className="empty-state">
            <Store size={48} />
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>No shops registered</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20 }}>
            {shops.map((shop, idx) => (
              <motion.button
                key={shop.user_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/items?shop=${shop.user_id}`)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '16px 18px', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)',
                  display: 'block', boxShadow: 'var(--shadow-sm)'
                }}
              >
                {/* Shop header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 'var(--radius-md)',
                      background: 'var(--accent-bg)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Store size={18} color="var(--accent)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                        {shop.shop_name || shop.phone || shop.user_id.slice(0, 8)}
                      </div>
                      {shop.phone && shop.shop_name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                          {shop.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} color="var(--accent)" />
                </div>

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 4px' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: 2 }}>Active</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent)' }}>{shop.active}</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 4px' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: 2 }}>Released</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--success)' }}>{shop.released}</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 4px' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: 2 }}>Pledged</div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      ₹{shop.totalPledged.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
