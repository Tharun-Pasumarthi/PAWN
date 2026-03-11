import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import App from './App'
import './styles/global.css'

// Native app initialization
if (Capacitor.isNativePlatform()) {
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
