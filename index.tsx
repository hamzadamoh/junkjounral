import React, { Component, type ErrorInfo } from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#0f0e13',
            color: '#e2e8f0',
            padding: 24,
            fontFamily: 'sans-serif',
          }}
        >
          <h1 style={{ color: '#d4af37', marginBottom: 16 }}>Something went wrong</h1>
          <pre
            style={{
              background: '#1a1821',
              padding: 16,
              borderRadius: 8,
              overflow: 'auto',
              fontSize: 14,
            }}
          >
            {this.state.error.message}
          </pre>
          <p style={{ marginTop: 16, color: '#94a3b8' }}>
            Open the browser console (F12 → Console) for more details.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);