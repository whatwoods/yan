// main.jsx — Vite entry point.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app.jsx';
import { showToast } from './components.jsx';

// Backward compatibility: some code may still call window.showToast
window.showToast = showToast;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
