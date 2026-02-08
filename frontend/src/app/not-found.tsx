import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
          <FileQuestion className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Page Not Found</h2>
        <p className="text-muted-foreground mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
