import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("YN Studio customer UI error:", error, info);
  }

  handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="app-error-screen">
        <div className="app-error-card">
          <div className="app-error-mark">YN</div>
          <span className="app-error-eyebrow">YN STUDIO</span>
          <h1>Something went wrong</h1>
          <p>We couldn't render this page correctly. Reload and try again.</p>
          <button type="button" onClick={this.handleReload}>Reload page</button>
          {import.meta.env.DEV && this.state.error?.message && <code>{this.state.error.message}</code>}
        </div>
      </main>
    );
  }
}
