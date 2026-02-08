import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
