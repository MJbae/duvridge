/* Static HTML owns the content and navigation; JavaScript only adds visual effects. */
(() => {
  const head = document.getElementById('head');
  if (head) {
    const onScroll = () => head.classList.toggle('scrolled', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !('IntersectionObserver' in window) || !('animate' in Element.prototype)) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      // No persistent hidden state: content is still visible if this script fails or is blocked.
      entry.target.animate([
        { opacity: 0, transform: 'translateY(20px)' },
        { opacity: 1, transform: 'none' }
      ], { duration: 800, easing: 'cubic-bezier(.2,.7,.2,1)' });
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
})();
