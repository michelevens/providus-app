// ui/pages/workspace-hub.js — Unified Workspace page
// One page, tab bar at top, delegates to existing renderers

if (typeof window._wsTab === 'undefined') window._wsTab = 'tasks';

const WS_TABS = [
  { key: 'tasks',          label: 'Tasks' },
  { key: 'kanban',         label: 'Kanban Board' },
  { key: 'calendar',       label: 'Calendar' },
  { key: 'messages',       label: 'Messages' },
  { key: 'communications', label: 'Communications' },
];

export async function renderWorkspaceHubPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div><div style="margin-top:12px;color:var(--gray-500);font-size:13px;">Loading Workspace...</div></div>';

  const tab = window._wsTab || 'tasks';
  const R = window._appRender;

  switch (tab) {
    case 'tasks':          await R.renderTasksPage(); break;
    case 'kanban':         await R.renderKanbanBoard(); break;
    case 'calendar':       await R.renderCalendarPage(); break;
    case 'messages':       await R.renderMessagesPage(); break;
    case 'communications': await R.renderCommunicationsPage(); break;
    default:               await R.renderTasksPage(); break;
  }

  // Inject unified tab bar (preserve sub-page internal tabs)
  const tabBar = `
    <style>
      .ws-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--gray-200);overflow-x:auto;}
      .ws-tab{padding:8px 14px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border:none;background:none;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.15s;}
      .ws-tab:hover{color:var(--brand-600);background:var(--gray-50);}
      .ws-tab.active{color:var(--brand-600);border-bottom-color:var(--brand-600);}
    </style>
    <div class="ws-tabs">
      ${WS_TABS.map(t => `<button class="ws-tab ${tab === t.key ? 'active' : ''}" onclick="window.app.wsSwitchTab('${t.key}')">${t.label}</button>`).join('')}
    </div>
  `;

  body.innerHTML = tabBar + body.innerHTML;
}
