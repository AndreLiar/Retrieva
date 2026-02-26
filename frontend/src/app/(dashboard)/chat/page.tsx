'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /chat redirects to /conversations (Q&A history and chat)
export default function ChatRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/conversations');
  }, [router]);
  return null;
}
