import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'

// Attach API key to every request
const apiKey = import.meta.env.VITE_API_KEY
if (apiKey) {
  axios.defaults.headers.common['x-api-key'] = apiKey
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
