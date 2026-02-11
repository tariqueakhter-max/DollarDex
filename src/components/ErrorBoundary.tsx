// src/components/ErrorBoundary.tsx
// ============================================================================
// DollarDex — Global Error Boundary (STEP 14.1)
// Prevents full white screen crash
// ============================================================================

import React from "react";

type State = {
  hasError: boolean;
  message: string;
};

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      message: error?.message || "Unexpected error occurred.",
    };
  }

  componentDidCatch(error: any, info: any) {
    console.error("Global Error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40,
          textAlign: "center",
          fontFamily: "sans-serif"
        }}>
          <h2>Something went wrong</h2>
          <p style={{ opacity: 0.7 }}>{this.state.message}</p>
          <button
            style={{ padding: "10px 18px", marginTop: 20 }}
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
