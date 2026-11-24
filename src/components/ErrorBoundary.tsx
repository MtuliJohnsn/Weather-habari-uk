import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering error occurred.',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Habari Weather ErrorBoundary caught error:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed && parsed.error) {
          friendly = `Database access error (${parsed.operationType || 'operation'} on ${parsed.path || 'collection'}): ${parsed.error}`;
        }
      } catch {
        // Plain error message
      }

      return (
        <div className="w-screen h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4 shadow-2xl">
            <h1 className="text-lg font-semibold text-white">Habari Weather encountered an error</h1>
            <p className="text-xs text-slate-300 leading-relaxed break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
