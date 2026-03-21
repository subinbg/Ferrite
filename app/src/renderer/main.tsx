import './lib/monaco-setup'
import './stores/theme' // Apply theme on load
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
