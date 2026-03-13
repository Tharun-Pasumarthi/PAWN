import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import App from './App'
import './styles/global.css'

// Native app initialization
if (Capacitor.isNativePlatform()) {
  // Avoid stale PWA cache/chunk issues inside the native WebView.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.unregister()
      })
    }).catch(() => undefined)
  }
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => {
        caches.delete(key)
      })
    }).catch(() => undefined)
  }

  StatusBar.setBackgroundColor({ color: '#6366f1' })
  StatusBar.setStyle({ style: Style.Light })
  StatusBar.setOverlaysWebView({ overlay: false })
  SplashScreen.hide()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
