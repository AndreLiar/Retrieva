'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * ISSUE #43 FIX: Error Boundary Component
 *
 * Catches JavaScript errors in child component tree and displays
 * a fallback UI instead of crashing the entire application.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for debugging
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    this.setState({ errorInfo });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleRefresh = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/chat';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <Card className="max-w-md w-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle>Something went wrong</CardTitle>
              </div>
              <CardDescription>
                An unexpected error occurred. The issue has been logged for review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <p className="font-mono text-destructive break-all">
                    {this.state.error.message}
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button variant="outline" size="sm" onClick={this.handleReset}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button variant="outline" size="sm" onClick={this.handleRefresh}>
                Refresh Page
              </Button>
              <Button variant="ghost" size="sm" onClick={this.handleGoHome}>
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Default error page component for Next.js error.tsx files
 */
interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Something went wrong</CardTitle>
          </div>
          <CardDescription>
            An unexpected error occurred while loading this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {process.env.NODE_ENV === 'development' && (
            <div className="rounded-md bg-muted p-3 text-sm space-y-2">
              <p className="font-mono text-destructive break-all">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-xs text-muted-foreground">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/chat'}>
            <Home className="h-4 w-4 mr-2" />
            Go to Chat
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default ErrorBoundary;
