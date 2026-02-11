import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Client render error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    const { hasError, error } = this.state;
    const { FallbackComponent, children } = this.props;
    if (hasError && FallbackComponent) {
      return <FallbackComponent error={error} onReset={this.handleReset} />;
    }
    if (hasError) {
      return null;
    }
    return children;
  }
}
