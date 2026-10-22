const loginView = document.querySelector('#login-view');
const adminView = document.querySelector('#admin-view');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const contentForm = document.querySelector('#content-form');
const contentMessage = document.querySelector('#content-message');
const pageTitle = document.querySelector('#page-title');
const json = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request could not be completed.');
  return payload;
};
const showAdmin = () => { loginView.hidden = true; adminView.hidden = false; };
const showLogin = () => { adminView.hidden = true; loginView.hidden = false; };
async function loadContent() {
  const data = await json(await fetch('/api/admin/content', { credentials: 'same-origin' }));
  Object.entries(data).forEach(([key, value]) => {
    const field = contentForm.elements.namedItem(key);
    if (field) field.value = Array.isArray(value) ? value.join('\n') : value;
  });
}
async function loadAnalytics() {
  const days = Number(document.querySelector('#date-range').value);
  const data = await json(await fetch(`/api/admin/analytics?days=${days}`, { credentials: 'same-origin' }));
  document.querySelector('#metric-views').textContent = data.totalPageViews.toLocaleString();
  document.querySelector('#metric-ctas').textContent = data.totalCtaClicks.toLocaleString();
  const top = data.topPages[0];
  document.querySelector('#metric-top-page').textContent = top ? top.page : '—';
  document.querySelector('#metric-top-page-count').textContent = top ? `${top.pageViews.toLocaleString()} page views` : 'No page views recorded yet';
  document.querySelector('#chart-start').textContent = data.days[0]?.label || '—';
  document.querySelector('#chart-end').textContent = data.days.at(-1)?.label || '—';
  const chart = document.querySelector('#traffic-chart');
  chart.replaceChildren();
  const max = Math.max(1, ...data.days.map((day) => day.pageViews));
  data.days.forEach((day) => {
    const col = document.createElement('div');
    col.className = 'chart-day';
    const viewBar = document.createElement('i');
    viewBar.className = 'views-bar';
    const ctaBar = document.createElement('i');
    ctaBar.className = 'cta-bar';
    const viewHeight = Math.max(day.pageViews ? 4 : 0, day.pageViews / max * 100);
    const ctaHeight = Math.max(day.ctaClicks ? 4 : 0, day.ctaClicks / max * 100);
    viewBar.style.height = `${viewHeight}%`;
    ctaBar.style.height = `${ctaHeight}%`;
    col.style.setProperty('--bar-height', `${Math.max(viewHeight, ctaHeight)}%`);
    col.dataset.tip = `${day.label}: ${day.pageViews} views · ${day.ctaClicks} CTA clicks`;
    col.append(viewBar, ctaBar);
    chart.append(col);
  });
  const topPages = document.querySelector('#top-pages');
  topPages.replaceChildren();
  if (!data.topPages.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'No traffic has been recorded in this date range yet.'; topPages.append(empty);
  } else data.topPages.forEach((page) => {
    const row = document.createElement('div'); row.className = 'page-row';
    const left = document.createElement('div'); const dot = document.createElement('i'); const label = document.createElement('b');
    label.textContent = page.page; left.append(dot, label);
    const count = document.createElement('small'); count.textContent = `${page.pageViews.toLocaleString()} views`;
    row.append(left, count); topPages.append(row);
  });
  document.querySelector('#analytics-status').textContent = `Showing the last ${days} days. Counts are grouped by UTC date and page.`;
}
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); loginMessage.textContent = 'Signing in…';
  try {
    await json(await fetch('/api/admin/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password: new FormData(loginForm).get('password') }), credentials: 'same-origin' }));
    showAdmin(); await loadAnalytics(); await loadContent();
  } catch (error) { loginMessage.textContent = error.message; }
});
document.querySelector('#logout-button').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); showLogin();
});
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', async () => {
  const view = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item === button));
  document.querySelector('#overview-view').hidden = view !== 'overview';
  document.querySelector('#content-view').hidden = view !== 'content';
  pageTitle.textContent = view === 'overview' ? 'Traffic overview' : 'Edit site content';
  if (view === 'overview') await loadAnalytics(); else await loadContent();
}));
document.querySelector('#date-range').addEventListener('change', () => loadAnalytics().catch((error) => { document.querySelector('#analytics-status').textContent = error.message; }));
contentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); contentMessage.textContent = 'Saving…';
  const data = Object.fromEntries(new FormData(contentForm));
  data.socServices = data.socServices.split('\n').map((line) => line.trim()).filter(Boolean);
  try {
    await json(await fetch('/api/admin/content', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data), credentials: 'same-origin' }));
    contentMessage.textContent = 'Saved. The public website now uses these changes.';
  } catch (error) { contentMessage.textContent = error.message; }
});
(async () => {
  try { await json(await fetch('/api/admin/session', { credentials: 'same-origin' })); showAdmin(); await loadAnalytics(); await loadContent(); }
  catch { showLogin(); }
})();
