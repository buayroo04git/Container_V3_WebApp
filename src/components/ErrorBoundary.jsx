import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Inspector ErrorBoundary caught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          background: '#fff1f2',
          border: '1px solid #fecdd3',
          borderRadius: '12px',
          margin: '20px',
          color: '#9f1239'
        }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 800 }}>
            ⚠️ เกิดข้อผิดพลาดในการแสดงผลหน้านี้
          </h3>
          <p style={{ fontSize: '13px', margin: '0 0 14px 0' }}>
            รายละเอียดข้อผิดพลาด: <b>{this.state.error?.toString()}</b>
          </p>
          <pre style={{
            background: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid #fca5a5',
            fontSize: '11px',
            color: '#b91c1c',
            overflow: 'auto',
            maxHeight: '200px'
          }}>
            {this.state.error?.stack}
          </pre>
          <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                if (this.props.onReset) this.props.onReset();
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#e11d48',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🔄 รีเซ็ตและลองใหม่
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              รีเฟรชหน้าเว็บ (F5)
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
