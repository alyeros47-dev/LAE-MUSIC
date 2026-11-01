// Public purchase entry. No account, payment, entitlement or commission is
// created here. Guest checkout must be independently verified before signup.
export const ARTIST_PACKAGES = ['starter', 'growth', 'professional'];

export function packageReferral(url) {
  const value = url.searchParams.get('ref') || '';
  return /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value)) ? value : '';
}

export function artistPackageLink(url, plan) {
  const query = new URLSearchParams();
  const ref = packageReferral(url);
  if (ref) query.set('ref', ref);
  if (ARTIST_PACKAGES.includes(plan)) query.set('product', plan);
  return '/start' + (query.size ? '?' + query : '');
}

export function artistPackageEntry(url, session = {}) {
  if (url.hash === '#signin' || url.searchParams.get('social') === 'complete') return false;
  if (['/start', '/get-started'].includes(url.pathname)) return true;
  if (url.pathname !== '/join' || ['signin', 'login'].includes(url.searchParams.get('mode'))) return false;
  const role = url.searchParams.get('role');
  if (role === 'partner' || role === 'listener') return false;
  if (url.searchParams.has('product')) return true;
  return role === 'artist' && url.searchParams.get('mode') === 'register' && !session.artist && !session.listener && !session.review_test_access;
}

export async function artistPackagesPage(view, url, { api, e, heading, notice, currencyDisplay }) {
  const catalogue = await api('/api/plans');
  if (!ARTIST_PACKAGES.every(name => Number.isFinite(catalogue.plans?.[name]?.usd) && catalogue.plans[name].usd > 0)) {
    throw Error('Artist package prices are unavailable. Please try again.');
  }
  const ref = packageReferral(url), requested = url.searchParams.get('product');
  const selected = ARTIST_PACKAGES.includes(requested) ? requested : '';
  const invalidRef = url.searchParams.has('ref') && !ref;
  const invalidProduct = url.searchParams.has('product') && !selected;
  const label = name => name.charAt(0).toUpperCase() + name.slice(1);
  const chosen = selected ? `${label(selected)} · $${catalogue.plans[selected].usd} USD / year` : 'Choose the artist package that fits your music.';
  if (!view.set(heading('ARTIST PACKAGES', 'Choose your artist package.', 'Choose a package first. Payment comes before artist account setup.') +
    (ref ? `<p>Partner referral ${e(ref)} stays with your package selection. Registration alone earns no commission.</p>` : '') +
    (invalidRef ? notice('This referral reference is invalid. Ask the partner for a corrected link before paying.', true) : '') +
    (invalidProduct ? notice('This package was not found. The available artist packages are shown below.', true) : '') +
    `<div class="price-grid">${ARTIST_PACKAGES.map(name => {
      const plan = catalogue.plans[name];
      return `<article class="price-card ${selected === name ? 'featured' : ''}" aria-labelledby="package-${name}"><span class="eyebrow">ANNUAL ARTIST PACKAGE</span><h2 id="package-${name}">${label(name)}</h2><div class="price">$${e(plan.usd)}<small> / year</small></div>${currencyDisplay.markup('artist_subscription', name)}<ul><li>${e(plan.uploads)} annual upload slots</li><li>${e(plan.studioGenerations)} included music generations</li><li>$${e(plan.additionalGenerationUsd)} per additional generation</li></ul><button class="button ${selected === name ? '' : 'secondary'}" data-package="${name}" aria-pressed="${selected === name}">Choose ${label(name)}</button></article>`;
    }).join('')}</div>${currencyDisplay.info()}<section class="panel" id="package-next-step" tabindex="-1"><span class="eyebrow">YOUR NEXT STEP</span><p id="package-selection">${e(chosen)}</p><h2>Payment is currently unavailable.</h2><p>You can compare packages now. You have not been charged, and no artist account has been created. Account setup in this purchase flow will open only after a verified payment.</p><p>Existing accounts, songs and paid benefits are preserved.</p></section><section class="panel"><h2>Your path to the studio</h2><ol><li>Choose an artist package.</li><li>Complete payment and wait for verification.</li><li>Create your artist account, then open your dashboard and studio.</li></ol><p>No artist registration or partner enrollment is required to compare packages.</p></section>`)) return;
  document.querySelectorAll('[data-package]').forEach(button => {
    button.onclick = () => {
      const name = button.dataset.package;
      history.replaceState({}, '', artistPackageLink(url, name));
      document.querySelectorAll('[data-package]').forEach(choice => {
        const active = choice.dataset.package === name;
        choice.setAttribute('aria-pressed', String(active));
        choice.classList.toggle('secondary', !active);
        choice.closest('.price-card').classList.toggle('featured', active);
      });
      document.getElementById('package-selection').textContent = `${label(name)} · $${catalogue.plans[name].usd} USD / year`;
      const next = document.getElementById('package-next-step');
      next.focus({preventScroll: true});
      next.scrollIntoView({block: 'start', behavior: 'smooth'});
    };
  });
  currencyDisplay.paint();
}
