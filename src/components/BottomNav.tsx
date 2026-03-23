import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutGrid, FileText, Clock, CheckCircle, Settings } from 'lucide-react'

export default function BottomNav() {
  const navigate = useNavigate()
  const activePath = useLocation().pathname

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        <button className={`nav-item ${activePath === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
          <LayoutGrid size={20} /><span>Home</span>
        </button>
        <button className={`nav-item ${activePath === '/items' || activePath.startsWith('/items') ? 'active' : ''}`} onClick={() => navigate('/items')}>
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
  )
}
