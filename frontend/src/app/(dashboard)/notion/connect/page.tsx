'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Link2, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { notionApi } from '@/lib/api';

type ConnectionState = 'idle' | 'connecting' | 'processing' | 'success' | 'error';

export default function NotionConnectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // ISSUE #46 FIX: Track redirect timeout for cleanup
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ISSUE #46 FIX: Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, []);

  // Handle OAuth callback
  const callbackMutation = useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string }) => {
      const response = await notionApi.handleCallback(code, state);
      return response.data?.notionWorkspace;
    },
    onSuccess: (workspace) => {
      setConnectionState('success');
      toast.success('Notion workspace connected successfully');
      queryClient.invalidateQueries({ queryKey: ['notion-workspaces'] });
      // ISSUE #46 FIX: Store timeout ref for cleanup on unmount
      // Redirect to the workspace detail page after a short delay
      redirectTimeoutRef.current = setTimeout(() => {
        if (workspace) {
          router.push(`/notion/${workspace.id}`);
        } else {
          router.push('/notion');
        }
      }, 2000);
    },
    onError: (error: Error) => {
      setConnectionState('error');
      setErrorMessage(error.message || 'Failed to connect Notion workspace');
    },
  });

  // Check for OAuth callback parameters
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setConnectionState('error');
      setErrorMessage(searchParams.get('error_description') || 'Authorization denied');
      return;
    }

    if (code && state) {
      setConnectionState('processing');
      callbackMutation.mutate({ code, state });
    }
  }, [searchParams, callbackMutation]);

  // Start OAuth flow
  const startOAuth = async () => {
    setConnectionState('connecting');
    try {
      const response = await notionApi.getAuthUrl();
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        throw new Error('Failed to get authorization URL');
      }
    } catch {
      setConnectionState('error');
      setErrorMessage('Failed to start Notion authorization');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Back button */}
      <Link href="/notion">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Notion
        </Button>
      </Link>

      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center">
            {connectionState === 'success' ? (
              <CheckCircle2 className="h-8 w-8 text-success" />
            ) : connectionState === 'error' ? (
              <XCircle className="h-8 w-8 text-destructive" />
            ) : connectionState === 'connecting' || connectionState === 'processing' ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Link2 className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <CardTitle>
            {connectionState === 'success'
              ? 'Connected Successfully'
              : connectionState === 'error'
              ? 'Connection Failed'
              : connectionState === 'processing'
              ? 'Connecting...'
              : 'Connect Notion Workspace'}
          </CardTitle>
          <CardDescription>
            {connectionState === 'success'
              ? 'Your Notion workspace has been connected. Redirecting...'
              : connectionState === 'error'
              ? errorMessage
              : connectionState === 'processing'
              ? 'Please wait while we connect your Notion workspace...'
              : 'Authorize access to your Notion workspace to sync your pages'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectionState === 'idle' && (
            <>
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <h3 className="font-medium">What happens when you connect:</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>1. You&apos;ll be redirected to Notion to authorize access</li>
                  <li>2. Select the pages you want to share with this workspace</li>
                  <li>3. Your pages will be synced and indexed automatically</li>
                </ul>
              </div>
              <div className="rounded-lg border border-warning/20 bg-warning/10 p-4">
                <p className="text-sm text-warning">
                  <strong>Note:</strong> We only read your Notion content. We never
                  modify or delete anything in your Notion workspace.
                </p>
              </div>
              <Button onClick={startOAuth} className="w-full" size="lg">
                <Link2 className="h-4 w-4 mr-2" />
                Connect with Notion
              </Button>
            </>
          )}

          {connectionState === 'connecting' && (
            <div className="text-center py-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Redirecting to Notion...</p>
            </div>
          )}

          {connectionState === 'processing' && (
            <div className="text-center py-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">
                Completing connection...
              </p>
            </div>
          )}

          {connectionState === 'success' && (
            <div className="text-center py-4">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-success" />
              <p className="text-success">
                Workspace connected! Redirecting...
              </p>
            </div>
          )}

          {connectionState === 'error' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                <p className="text-sm text-destructive">{errorMessage}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push('/notion')}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setConnectionState('idle');
                    setErrorMessage('');
                  }}
                  className="flex-1"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
