import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/shared/providers';
import { getServerSessionUser } from '@/shared/server/auth-session';

// Bold modern-sans brand direction (WHOOP-like): Space Grotesk for display headlines,
// Inter for body. Replaces the previous Cormorant serif / DM Sans pairing.
const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Retrieva',
  description: 'DORA compliance assessment powered by AI',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialUserPromise = getServerSessionUser();

  return <RootLayoutContent initialUserPromise={initialUserPromise}>{children}</RootLayoutContent>;
}

async function RootLayoutContent({
  children,
  initialUserPromise,
}: Readonly<{
  children: React.ReactNode;
  initialUserPromise: Promise<Awaited<ReturnType<typeof getServerSessionUser>>>;
}>) {
  const initialUser = await initialUserPromise;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {/* Runtime env — this layout renders dynamically (auth-session uses cookies()
            + noStore()), so the SERVER reads API_URL from the container env at request
            time and injects window.__ENV__ before hydration. One image serves every
            environment (Kargo promotes the same artifact dev->prod). Read via getApiUrl(). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ENV__=${JSON.stringify({
              API_URL: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '',
            })};`,
          }}
        />
        <Providers initialUser={initialUser ?? undefined} authResolved={!!initialUser}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
