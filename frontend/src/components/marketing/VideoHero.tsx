'use client';

export function VideoHero() {
  return (
    <section className="relative w-full aspect-video max-w-5xl mx-auto my-12 rounded-xl overflow-hidden border border-border shadow-2xl">
      <div
        className="absolute inset-0 rounded-xl pointer-events-none z-10"
        style={{ boxShadow: '0 0 60px 0 rgba(59,130,246,0.15) inset' }}
      />
      <video
        autoPlay
        muted
        loop
        playsInline
        poster="/videos/product-explainer-poster.jpg"
        className="w-full h-full object-cover"
        aria-label="Retrieva DORA compliance platform demo"
      >
        <source src="/videos/product-explainer-720p.mp4" type="video/mp4" />
        <source src="/videos/product-explainer.mp4" type="video/mp4" />
      </video>
    </section>
  );
}
