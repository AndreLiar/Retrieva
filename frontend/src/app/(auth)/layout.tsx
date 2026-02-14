import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Logo/Brand */}
        <div className="text-center">
          <Link href="/" className="inline-block">
            <h1 className="text-3xl font-bold text-foreground">
              Retrieva
            </h1>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Knowledge retrieval powered by AI
          </p>
        </div>

        {/* Auth Form Container */}
        <div className="bg-card border border-border rounded-lg shadow-sm p-8">
          {children}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="underline hover:text-foreground">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
