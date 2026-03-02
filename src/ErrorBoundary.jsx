import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="loading" style={{ flexDirection: 'column', gap: '1rem' }}>
          <p style={{ color: 'var(--danger)', fontWeight: 600 }}>Something went wrong</p>
          <p className="text-muted" style={{ fontSize: '0.875rem', maxWidth: '360px', textAlign: 'center' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
