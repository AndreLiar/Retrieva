import Link from 'next/link';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">Retrieva</span>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/pricing">
              <Button variant="ghost">Pricing</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 py-16 max-w-xl">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to pricing
        </Link>

        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-6">
            <Mail className="h-7 w-7" />
          </div>

          <h1 className="text-3xl font-bold mb-4">Talk to Sales</h1>
          <p className="text-muted-foreground max-w-sm mx-auto mb-8">
            Interested in Enterprise? Tell us about your organisation and we&apos;ll get back to you
            within one business day.
          </p>

          <a
            href="mailto:sales@retrieva.online?subject=Enterprise%20inquiry%20%E2%80%94%20Retrieva"
          >
            <Button size="lg" className="gap-2 mb-3">
              <Mail className="h-4 w-4" />
              Email Sales
            </Button>
          </a>

          <p className="text-sm text-muted-foreground mb-6">sales@retrieva.online</p>

          <p className="text-sm text-muted-foreground">
            We typically respond within 1 business day.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>
            &copy; {new Date().getFullYear()} Retrieva.{' '}
            <span className="opacity-60">
              Built for DORA (Regulation EU 2022/2554) compliance.
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}
