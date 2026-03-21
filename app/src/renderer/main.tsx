import './lib/monaco-setup'
import './stores/theme'
import ReactDOM from 'react-dom/client'
import App from './App'
import './global.css'

// Note: React.StrictMode is intentionally omitted.
// Monaco Editor uses imperative DOM APIs that break under StrictMode's
// double-mount behavior in development (creates editor → disposes → recreates,
// causing "Canceled" errors and blank editors).
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
