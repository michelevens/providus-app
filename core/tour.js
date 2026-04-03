// core/tour.js — Lightweight guided onboarding tour
// Vanilla JS spotlight tour with no dependencies

const TOUR_STEPS = [
  {
    selector: '[data-page="command-center"]',
    title: 'Command Center',
    description: 'Your daily overview — see agency-wide stats, activity, and reports at a glance.',
    position: 'right',
  },
  {
    selector: '[data-page="credentialing"]',
    title: 'Healthcare Credentialing',
    description: 'Track providers, applications, licenses, and payer enrollments across all states.',
    position: 'right',
  },
  {
    selector: '[data-page="revenue-cycle"]',
    title: 'Revenue Cycle',
    description: 'Full RCM suite — claims, payments, denials, ERA posting, eligibility, and more.',
    position: 'right',
  },
  {
    selector: '[data-page="workspace"]',
    title: 'Workspace',
    description: 'Tasks, kanban boards, calendar, and team messaging in one place.',
    position: 'right',
  },
  {
    selector: '[data-page="analytics"]',
    title: 'Analytics & Strategy',
    description: 'Pipeline analytics, forecasting, payer coverage maps, and service line planning.',
    position: 'right',
  },
  {
    selector: '#theme-toggle',
    title: 'Dark Mode',
    description: 'Toggle dark mode anytime. Press Ctrl+K for the command palette with quick actions.',
    position: 'bottom',
  },
];

const TOUR_KEY = 'credentik_tour_complete';

function isTourComplete() {
  return localStorage.getItem(TOUR_KEY) === '1';
}

function markTourComplete() {
  localStorage.setItem(TOUR_KEY, '1');
}

function startTour() {
  if (isTourComplete()) return;
  _renderStep(0);
}

function _renderStep(index) {
  // Remove existing overlay
  document.getElementById('tour-overlay')?.remove();

  if (index >= TOUR_STEPS.length) {
    markTourComplete();
    return;
  }

  const step = TOUR_STEPS[index];
  const target = document.querySelector(step.selector);
  if (!target) {
    // Skip missing elements
    _renderStep(index + 1);
    return;
  }

  const rect = target.getBoundingClientRect();
  const pad = 6;

  // Build overlay with spotlight cutout
  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  overlay.innerHTML = `
    <div class="tour-backdrop" onclick="window._tourSkip()"></div>
    <div class="tour-spotlight" style="top:${rect.top - pad}px;left:${rect.left - pad}px;width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px;"></div>
    <div class="tour-card tour-${step.position || 'right'}" style="${_positionCard(rect, step.position)}">
      <div class="tour-step-indicator">${index + 1} of ${TOUR_STEPS.length}</div>
      <h4 class="tour-title">${step.title}</h4>
      <p class="tour-desc">${step.description}</p>
      <div class="tour-actions">
        <button class="tour-skip" onclick="window._tourSkip()">Skip Tour</button>
        <button class="tour-next" onclick="window._tourNext()">${index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}</button>
      </div>
      <div class="tour-dots">${TOUR_STEPS.map((_, i) => `<span class="tour-dot ${i === index ? 'active' : ''} ${i < index ? 'done' : ''}"></span>`).join('')}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  window._tourNext = () => _renderStep(index + 1);
  window._tourSkip = () => {
    document.getElementById('tour-overlay')?.remove();
    markTourComplete();
  };
}

function _positionCard(rect, position) {
  const cardW = 300;
  const gap = 16;
  switch (position) {
    case 'right':
      return `top:${Math.max(8, rect.top)}px;left:${rect.right + gap}px;`;
    case 'left':
      return `top:${Math.max(8, rect.top)}px;left:${rect.left - cardW - gap}px;`;
    case 'bottom':
      return `top:${rect.bottom + gap}px;left:${Math.max(8, rect.left)}px;`;
    case 'top':
      return `top:${rect.top - 180}px;left:${Math.max(8, rect.left)}px;`;
    default:
      return `top:${Math.max(8, rect.top)}px;left:${rect.right + gap}px;`;
  }
}

export { startTour, isTourComplete, markTourComplete, TOUR_STEPS };
