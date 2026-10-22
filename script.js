const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');
menuToggle?.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!open));
  mainNav.classList.toggle('open', !open);
});
mainNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  mainNav.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}));
const form = document.querySelector('#contact-form');
form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const subject = encodeURIComponent(`Security consultation: ${data.get('service')}`);
  const body = encodeURIComponent(`Name: ${data.get('name')}\nEmail: ${data.get('email')}\nService: ${data.get('service')}\n\n${data.get('message') || ''}`);
  const mailto = `mailto:${managedContactEmail}?subject=${subject}&body=${body}`;
  document.querySelector('#form-note').textContent = 'Your email app will open with your request ready to send. Replace the sample email address before launch.';
  window.location.href = mailto;
});
const serviceTabs = [...document.querySelectorAll('[data-service-tab]')];
const serviceGrid = document.querySelector('#service-grid');
serviceTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    const category = tab.dataset.serviceTab;
    serviceGrid.dataset.active = category;
    serviceGrid.setAttribute('aria-labelledby', tab.id);
    serviceTabs.forEach((item) => {
      const selected = item === tab;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
  });
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + serviceTabs.length) % serviceTabs.length;
    serviceTabs[nextIndex].focus();
    serviceTabs[nextIndex].click();
  });
});
const header = document.querySelector('.site-header');
const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 12);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealTargets = document.querySelectorAll('.section-heading, .intro-content, .service-card, .approach-main, .feature-copy, .feature-panel, .soc-detail-head, .soc-coverage, .soc-lifecycle, .soc-engagement, .team-card, .quote-card, .insight-card, .training-card, .training-note, .faq-item');
  revealTargets.forEach((element, index) => {
    element.classList.add('reveal');
    element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 65}ms`);
  });
  document.body.classList.add('motion-enabled');
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
  revealTargets.forEach((element) => revealObserver.observe(element));
}
let managedContactEmail = 'hello@northstarcyber.example';
const isServedOverHttp = location.protocol === 'http:' || location.protocol === 'https:';
const sendTrafficEvent = (eventName) => {
  if (!isServedOverHttp || navigator.doNotTrack === '1') return;
  const event = JSON.stringify({ event: eventName, page: location.pathname });
  if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([event], { type: 'application/json' }));
  else fetch('/api/track', { method: 'POST', headers: {'Content-Type':'application/json'}, body: event, keepalive: true }).catch(() => {});
};
if (isServedOverHttp) {
  fetch('/api/content').then((response) => response.ok ? response.json() : null).then((content) => {
    if (!content) return;
    document.querySelectorAll('[data-cms-brand]').forEach((element) => { element.textContent = content.brandName; });
    const line1 = document.querySelector('[data-cms-line1]');
    const line2 = document.querySelector('[data-cms-line2]');
    if (line1 && content.heroLine1) line1.textContent = content.heroLine1;
    if (line2 && content.heroLine2) line2.textContent = content.heroLine2;
    const heroCopy = document.querySelector('[data-cms-hero-copy]'); if (heroCopy && content.heroCopy) heroCopy.textContent = content.heroCopy;
    const socSummary = document.querySelector('[data-cms-soc-summary]'); if (socSummary && content.socSummary) socSummary.textContent = content.socSummary;
    const trainingCopy = document.querySelector('[data-cms-training-copy]'); if (trainingCopy && content.trainingCopy) trainingCopy.textContent = content.trainingCopy;
    const serviceList = document.querySelector('#soc-service-list');
    if (serviceList && Array.isArray(content.socServices)) {
      serviceList.replaceChildren(...content.socServices.map((item) => { const li = document.createElement('li'); li.textContent = item; return li; }));
    }
    if (content.contactEmail) {
      managedContactEmail = content.contactEmail;
      document.querySelectorAll('[data-cms-contact-link]').forEach((link) => { link.href = `mailto:${content.contactEmail}`; link.textContent = `${content.contactEmail} ↗`; });
    }
    if (content.brandName) document.title = `${content.brandName} — See risk clearly. Move with confidence.`;
  }).catch(() => {});
  sendTrafficEvent('page_view');
  document.addEventListener('click', (event) => {
    if (event.target.closest('a[href="#contact"]')) sendTrafficEvent('cta_click');
  });
}
