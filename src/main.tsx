import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installBrowserBridge } from './lib/browserBridge';
import './styles/app.css';

installBrowserBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
