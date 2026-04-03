// ui/pages/message-center.js — Message Center (top-level page)
// 3-column Slack/Teams-style layout: conversation list | thread view | context sidebar

const { store, auth, CONFIG, escHtml, escAttr, formatDateDisplay,
        showToast, navigateTo, appConfirm, timeAgo } = window._credentik;

// ─── State ───
if (typeof window._mcTab === 'undefined') window._mcTab = 'inbox';
if (typeof window._mcThread === 'undefined') window._mcThread = null;
if (typeof window._mcSearch === 'undefined') window._mcSearch = '';
if (typeof window._mcShowContext === 'undefined') window._mcShowContext = true;

const TYPE_COLORS = { document_request: '#f59e0b', info_request: '#3b82f6', urgent: '#ef4444', status_update: '#22c55e', follow_up: '#8b5cf6', message: '#6b7280' };
const TYPE_LABELS = { document_request: 'Doc Request', info_request: 'Info Request', urgent: 'Urgent', status_update: 'Status', follow_up: 'Follow-up', message: 'Message' };
const CHANNEL_ICONS = { phone: '&#128222;', email: '&#128231;', fax: '&#128424;', portal: '&#127760;', mail: '&#128236;', internal: '&#128172;' };

// ─── Main Render ───
export async function renderMessageCenterPage() {
  const body = document.getElementById('page-body');
  body.innerHTML = '<div style="text-align:center;padding:48px;"><div class="spinner"></div></div>';

  const currentUser = auth.getUser() || {};
  const currentUserId = String(currentUser.id || '');
  const isAdmin = ['agency', 'owner', 'superadmin'].includes(currentUser.ui_role || currentUser.uiRole || currentUser.role);

  // Parallel fetch
  const [allLogs, users, providers, apps] = await Promise.all([
    store.getCommunicationLogs().catch(() => []),
    store.getAgencyUsers().catch(() => []),
    store.getAll('providers').catch(() => []),
    store.getAll('applications').catch(() => []),
  ]);

  const logs = Array.isArray(allLogs) ? allLogs : [];
  const userArr = Array.isArray(users) ? users : [];
  const provArr = Array.isArray(providers) ? providers : [];
  const appArr = Array.isArray(apps) ? apps : [];

  // Build name maps
  const nameMap = {};
  userArr.forEach(u => { nameMap['user:' + u.id] = ((u.firstName || u.first_name || '') + ' ' + (u.lastName || u.last_name || '')).trim() || 'User'; });
  provArr.forEach(p => { nameMap['provider:' + p.id] = ((p.firstName || p.first_name || '') + ' ' + (p.lastName || p.last_name || '')).trim() || 'Provider'; });
  const getName = (type, id) => nameMap[(type || 'user') + ':' + id] || nameMap['user:' + id] || nameMap['provider:' + id] || 'Unknown';
  const getInitials = (name) => { const parts = (name || '?').split(' '); return ((parts[0] || '?')[0] + (parts[1] || '')[0] || '').toUpperCase(); };

  // Email map for Send as Email
  const emailMap = {};
  userArr.forEach(u => { if (u.email) emailMap['user:' + u.id] = u.email; });
  provArr.forEach(p => { if (p.email) emailMap['provider:' + p.id] = p.email; });

  // Split internal messages vs call logs
  const internalLogs = logs.filter(l => (l.channel || 'internal') === 'internal');
  const commLogs = logs.filter(l => l.channel && l.channel !== 'internal');

  // Group into threads
  const threadMap = {};
  internalLogs.forEach(m => {
    const tid = m.threadId || m.thread_id || ('msg_' + m.id);
    if (!threadMap[tid]) threadMap[tid] = [];
    threadMap[tid].push(m);
  });

  // Sort threads by most recent message
  let threads = Object.entries(threadMap).map(([tid, msgs]) => {
    msgs.sort((a, b) => new Date(a.createdAt || a.created_at || 0) - new Date(b.createdAt || b.created_at || 0));
    const last = msgs[msgs.length - 1];
    const first = msgs[0];
    const unreadCount = msgs.filter(m => !(m.isRead || m.is_read) && String(m.recipientId || m.recipient_id) === currentUserId).length;
    return {
      id: tid, msgs, last, first, unreadCount,
      lastDate: last.createdAt || last.created_at || '',
      subject: first.subject || '(No subject)',
      type: first.messageType || first.message_type || first.type || 'message',
      senderId: String(first.senderId || first.sender_id || ''),
      recipientId: String(first.recipientId || first.recipient_id || ''),
      senderType: first.senderType || first.sender_type || 'user',
      recipientType: first.recipientType || first.recipient_type || 'user',
      applicationId: first.applicationId || first.application_id || null,
      providerId: first.providerId || first.provider_id || null,
    };
  }).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));

  // Filter by tab
  const tab = window._mcTab || 'inbox';
  let filteredThreads = threads;
  if (tab === 'inbox') {
    filteredThreads = threads.filter(t => t.msgs.some(m => String(m.recipientId || m.recipient_id) === currentUserId));
  } else if (tab === 'sent') {
    filteredThreads = threads.filter(t => t.msgs.some(m => String(m.senderId || m.sender_id) === currentUserId));
  } else if (tab === 'all') {
    filteredThreads = threads; // admin sees all
  }

  // Apply search
  const search = (window._mcSearch || '').toLowerCase();
  if (search) {
    filteredThreads = filteredThreads.filter(t => {
      const text = t.msgs.map(m => (m.subject || '') + ' ' + (m.body || m.notes || '') + ' ' + (m.senderName || m.sender_name || '')).join(' ').toLowerCase();
      return text.includes(search);
    });
  }

  // Active thread
  const activeThread = window._mcThread ? filteredThreads.find(t => t.id === window._mcThread) || threads.find(t => t.id === window._mcThread) : null;

  // Recipient options
  const recipientOpts = userArr.map(u =>
    `<option value="user:${u.id}">${escHtml(getName('user', u.id))} (${u.uiRole || u.ui_role || u.role || 'staff'})</option>`
  ).join('') + provArr.map(p =>
    `<option value="provider:${p.id}">${escHtml(getName('provider', p.id))} (Provider)</option>`
  ).join('');

  // Stats
  const unreadTotal = threads.reduce((s, t) => s + t.unreadCount, 0);

  // Tab bar
  const _tab = (key, label, count) => `<button class="mc-tab ${tab === key ? 'active' : ''}" onclick="window.app.mcSwitchTab('${key}')">${label}${count > 0 ? ` <span style="background:var(--danger-500);color:#fff;font-size:9px;padding:1px 6px;border-radius:10px;margin-left:4px;">${count}</span>` : ''}</button>`;

  // ─── Communications tab ───
  if (tab === 'communications') {
    body.innerHTML = `
      <div class="mc-tabs">${_tab('inbox', 'Inbox', unreadTotal)}${_tab('sent', 'Sent', 0)}${isAdmin ? _tab('all', 'All Messages', 0) : ''}${_tab('communications', 'Call Log', 0)}</div>
      <div class="card" style="border-radius:12px;margin-top:12px;">
        <div class="card-header"><h3>Communication Log</h3><button class="btn btn-sm btn-primary" onclick="window.app.openCommLogModal()">+ Log Call</button></div>
        <div class="card-body" style="padding:0;"><div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Channel</th><th>Direction</th><th>Contact</th><th>Subject</th><th>Outcome</th><th>Notes</th></tr></thead>
          <tbody>
            ${commLogs.sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0)).map(l => {
              const ch = l.channel || 'phone';
              const dir = l.direction || 'outbound';
              const outcomeColors = { connected: '#16a34a', sent: '#16a34a', received: '#16a34a', voicemail: '#d97706', no_answer: '#9ca3af', bounced: '#dc2626' };
              return `<tr>
                <td class="text-sm">${formatDateDisplay(l.createdAt || l.created_at || l.logged_at) || '—'}</td>
                <td>${CHANNEL_ICONS[ch] || ''} ${escHtml(ch)}</td>
                <td><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:${dir === 'inbound' ? '#dbeafe' : '#dcfce7'};color:${dir === 'inbound' ? '#2563eb' : '#16a34a'};">${dir === 'inbound' ? 'IN' : 'OUT'}</span></td>
                <td style="font-weight:600;">${escHtml(l.contact_name || l.contactName || l.senderName || l.sender_name || '—')}</td>
                <td class="text-sm">${escHtml(l.subject || '—')}</td>
                <td><span style="font-size:11px;font-weight:600;color:${outcomeColors[l.outcome] || '#9ca3af'};">${escHtml((l.outcome || '—').replace(/_/g, ' '))}</span></td>
                <td class="text-sm text-muted" style="max-width:200px;">${escHtml((l.notes || l.body || '').substring(0, 80))}</td>
              </tr>`;
            }).join('')}
            ${commLogs.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--gray-500);">No communication logs yet. Click "+ Log Call" to record a call, email, or fax.</td></tr>' : ''}
          </tbody>
        </table></div></div>
      </div>
    `;
    return;
  }

  // ─── Main 3-column layout ───
  body.innerHTML = `
    <div class="mc-tabs">${_tab('inbox', 'Inbox', unreadTotal)}${_tab('sent', 'Sent', 0)}${isAdmin ? _tab('all', 'All Messages', 0) : ''}${_tab('communications', 'Call Log', 0)}</div>
    <div class="mc-layout ${window._mcShowContext && activeThread ? '' : 'no-context'}" id="mc-grid">

      <!-- LEFT: Conversation List -->
      <div class="mc-left">
        <div class="mc-left-search">
          <input type="text" placeholder="Search messages..." value="${escAttr(search)}" oninput="window._mcSearch=this.value;clearTimeout(window._mcSearchTimer);window._mcSearchTimer=setTimeout(()=>window.app.mcRefresh(),300);" style="width:100%;padding:8px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:13px;background:var(--surface-bg,#fff);">
        </div>
        <div class="mc-thread-list" id="mc-thread-list">
          ${filteredThreads.map(t => {
            const isActive = activeThread && t.id === activeThread.id;
            const senderName = getName(t.senderType, t.senderId) || t.first?.senderName || t.first?.sender_name || 'Unknown';
            const recipientName = getName(t.recipientType, t.recipientId);
            const initials = getInitials(senderName);
            const preview = (t.last.body || t.last.notes || '').substring(0, 60);
            const typeColor = TYPE_COLORS[t.type] || '#6b7280';
            const typeLabel = TYPE_LABELS[t.type] || 'Message';
            return `<div class="mc-thread-item ${isActive ? 'active' : ''} ${t.unreadCount > 0 ? 'unread' : ''}" onclick="window.app.mcSelectThread('${escAttr(t.id)}')">
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <div class="mc-avatar" style="background:${typeColor}20;color:${typeColor};">${initials}</div>
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:13px;font-weight:${t.unreadCount > 0 ? '700' : '500'};color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(senderName)}</span>
                    <span style="font-size:10px;color:var(--gray-400);white-space:nowrap;margin-left:8px;">${timeAgo(t.lastDate)}</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-secondary);font-weight:${t.unreadCount > 0 ? '600' : '400'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(t.subject)}</div>
                  <div style="font-size:11px;color:var(--gray-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;">${escHtml(preview)}</div>
                  <div style="display:flex;gap:4px;margin-top:3px;">
                    <span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;background:${typeColor}15;color:${typeColor};">${typeLabel}</span>
                    ${t.msgs.length > 1 ? `<span style="font-size:9px;color:var(--gray-400);">${t.msgs.length} msgs</span>` : ''}
                    ${t.unreadCount > 0 ? `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;background:var(--danger-500);color:#fff;">${t.unreadCount} new</span>` : ''}
                  </div>
                </div>
              </div>
            </div>`;
          }).join('')}
          ${filteredThreads.length === 0 ? `<div style="text-align:center;padding:3rem;color:var(--gray-400);">
            <div style="font-size:28px;margin-bottom:8px;">&#128172;</div>
            <div style="font-size:13px;font-weight:600;">No conversations${search ? ' match your search' : ''}</div>
            <div style="font-size:12px;margin-top:4px;">${search ? 'Try a different search term.' : 'Start a new conversation to get things going.'}</div>
          </div>` : ''}
        </div>
      </div>

      <!-- CENTER: Thread View or Compose -->
      <div class="mc-center">
        ${activeThread ? _renderThread(activeThread, currentUserId, nameMap, recipientOpts, emailMap) : _renderCompose(recipientOpts, emailMap)}
      </div>

      <!-- RIGHT: Context Sidebar -->
      ${window._mcShowContext && activeThread ? `<div class="mc-right">${_renderContext(activeThread, appArr, provArr)}</div>` : ''}
    </div>
  `;

  // Mark unread messages as read for active thread
  if (activeThread && activeThread.unreadCount > 0) {
    const unreadIds = activeThread.msgs
      .filter(m => !(m.isRead || m.is_read) && String(m.recipientId || m.recipient_id) === currentUserId)
      .map(m => m.id);
    if (unreadIds.length > 0) {
      store.markBulkRead(unreadIds).catch(() => {});
    }
  }

  // Scroll to bottom of messages
  const msgArea = document.getElementById('mc-messages');
  if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;

  // Polling
  clearInterval(window._mcPollInterval);
  window._mcPollInterval = setInterval(async () => {
    try {
      const fresh = await store.getCommunicationLogs({ channel: 'internal' });
      const freshCount = Array.isArray(fresh) ? fresh.length : 0;
      if (freshCount !== internalLogs.length) {
        window.app.mcRefresh();
      }
    } catch {}
  }, 30000);
}

// ─── Thread View ───
function _renderThread(thread, currentUserId, nameMap, recipientOpts, emailMap) {
  const getName2 = (type, id) => nameMap[(type || 'user') + ':' + id] || nameMap['user:' + id] || nameMap['provider:' + id] || 'Unknown';
  const getInitials2 = (name) => { const p = (name || '?').split(' '); return ((p[0] || '?')[0] + (p[1] || '')[0] || '').toUpperCase(); };

  // Determine reply recipient
  const lastMsg = thread.last;
  const replyToId = String(lastMsg.senderId || lastMsg.sender_id) === currentUserId
    ? (lastMsg.recipientId || lastMsg.recipient_id)
    : (lastMsg.senderId || lastMsg.sender_id);
  const replyToType = String(lastMsg.senderId || lastMsg.sender_id) === currentUserId
    ? (lastMsg.recipientType || lastMsg.recipient_type || 'user')
    : (lastMsg.senderType || lastMsg.sender_type || 'user');
  const replyToKey = (replyToType || 'user') + ':' + replyToId;
  const replyEmail = emailMap[replyToKey] || '';

  return `
    <div class="mc-center-header">
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${escHtml(thread.subject)}</div>
        <div style="font-size:11px;color:var(--gray-400);">${thread.msgs.length} message${thread.msgs.length !== 1 ? 's' : ''} &middot; ${escHtml(TYPE_LABELS[thread.type] || 'Message')}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm" onclick="window._mcShowContext=!window._mcShowContext;window.app.mcRefresh();" style="font-size:11px;">${window._mcShowContext ? 'Hide' : 'Show'} Context</button>
      </div>
    </div>
    <div class="mc-messages" id="mc-messages">
      ${thread.msgs.map(m => {
        const isMe = String(m.senderId || m.sender_id) === currentUserId;
        const sName = getName2(m.senderType || m.sender_type, m.senderId || m.sender_id) || m.senderName || m.sender_name || 'Unknown';
        const init = getInitials2(sName);
        const mType = m.messageType || m.message_type || m.type || 'message';
        const tColor = TYPE_COLORS[mType] || '#6b7280';
        const isRead = m.isRead || m.is_read;
        return `<div style="display:flex;gap:8px;margin-bottom:12px;${isMe ? 'flex-direction:row-reverse;' : ''}">
          <div class="mc-avatar" style="background:${isMe ? 'var(--brand-100)' : '#f3f4f6'};color:${isMe ? 'var(--brand-700)' : 'var(--gray-600)'};">${init}</div>
          <div style="max-width:70%;">
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:3px;${isMe ? 'flex-direction:row-reverse;' : ''}">
              <span style="font-size:12px;font-weight:600;color:var(--text-primary);">${escHtml(sName)}</span>
              <span style="font-size:10px;color:var(--gray-400);">${timeAgo(m.createdAt || m.created_at)}</span>
              ${mType !== 'message' ? `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${tColor}15;color:${tColor};">${TYPE_LABELS[mType] || mType}</span>` : ''}
            </div>
            ${m.subject && thread.msgs.indexOf(m) > 0 ? `<div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:2px;">${escHtml(m.subject)}</div>` : ''}
            <div class="mc-bubble ${isMe ? 'outgoing' : 'incoming'}">${escHtml(m.body || m.notes || '').replace(/\n/g, '<br>')}</div>
            <div style="font-size:10px;color:var(--gray-400);${isMe ? 'text-align:right;' : ''}">${isMe ? (isRead ? '&#10003;&#10003; Read' : '&#10003; Sent') : ''}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="mc-reply-bar">
      <textarea id="mc-reply-input" class="form-control" placeholder="Type a reply... (Enter to send, Shift+Enter for newline)" rows="1" style="flex:1;resize:none;min-height:40px;max-height:120px;border-radius:10px;" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.app.mcSendReply();}"></textarea>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <button class="btn btn-primary btn-sm" onclick="window.app.mcSendReply()" style="white-space:nowrap;">Send</button>
        ${replyEmail ? `<label style="font-size:9px;color:var(--gray-400);display:flex;align-items:center;gap:3px;cursor:pointer;white-space:nowrap;"><input type="checkbox" id="mc-send-email" style="width:12px;height:12px;"> Email</label>` : ''}
      </div>
    </div>
    <input type="hidden" id="mc-reply-thread" value="${escAttr(thread.id)}">
    <input type="hidden" id="mc-reply-to-id" value="${escAttr(replyToId || '')}">
    <input type="hidden" id="mc-reply-to-type" value="${escAttr(replyToType || 'user')}">
    <input type="hidden" id="mc-reply-to-email" value="${escAttr(replyEmail)}">
  `;
}

// ─── Compose (no thread selected) ───
function _renderCompose(recipientOpts, emailMap) {
  return `
    <div class="mc-center-header">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);">New Message</div>
    </div>
    <div style="padding:20px;flex:1;overflow-y:auto;">
      <div style="display:grid;gap:12px;max-width:600px;">
        <div class="auth-field" style="margin:0;"><label>To *</label>
          <select id="mc-compose-to" class="form-control"><option value="">Select recipient...</option>${recipientOpts}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="auth-field" style="margin:0;"><label>Type</label>
            <select id="mc-compose-type" class="form-control">
              <option value="message">Message</option>
              <option value="document_request">Document Request</option>
              <option value="info_request">Info Request</option>
              <option value="status_update">Status Update</option>
              <option value="follow_up">Follow-up</option>
              <option value="urgent">Urgent</option>
            </select></div>
          <div class="auth-field" style="margin:0;"><label>Subject</label>
            <input type="text" id="mc-compose-subject" class="form-control" placeholder="Subject line"></div>
        </div>
        <div class="auth-field" style="margin:0;"><label>Message *</label>
          <textarea id="mc-compose-body" class="form-control" rows="6" placeholder="Type your message..." style="resize:vertical;"></textarea></div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <label style="font-size:12px;color:var(--gray-500);display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="mc-compose-email" onchange="window.app.mcCheckEmailAvailable()" style="width:14px;height:14px;">
            Also send as email
            <span id="mc-compose-email-hint" style="font-size:10px;color:var(--gray-400);"></span>
          </label>
          <button class="btn btn-primary" onclick="window.app.mcSendCompose()">Send Message</button>
        </div>
      </div>
    </div>
    <div style="padding:20px;text-align:center;color:var(--gray-400);font-size:13px;border-top:1px solid var(--gray-100);">
      Select a conversation from the left to view it, or compose a new message above.
    </div>
  `;
}

// ─── Context Sidebar ───
function _renderContext(thread, appArr, provArr) {
  let html = '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-400);margin-bottom:12px;">Context</div>';

  if (thread.applicationId) {
    const app = appArr.find(a => String(a.id) === String(thread.applicationId));
    if (app) {
      const statusColors = { approved: '#16a34a', credentialed: '#059669', submitted: '#8b5cf6', denied: '#dc2626', planned: '#6366f1' };
      html += `
        <div style="background:var(--gray-50);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:600;color:var(--gray-400);margin-bottom:6px;">LINKED APPLICATION</div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${escHtml(app.payerName || app.payer_name || 'Payer')}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${escHtml(app.state || '')} &middot; ${escHtml(app.providerName || app.provider_name || '')}</div>
          <div style="margin-top:6px;"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:${(statusColors[app.status] || '#6b7280') + '20'};color:${statusColors[app.status] || '#6b7280'};">${(app.status || '').replace(/_/g, ' ').toUpperCase()}</span></div>
          ${app.submittedDate || app.submitted_date ? `<div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Submitted: ${formatDateDisplay(app.submittedDate || app.submitted_date)}</div>` : ''}
          <button class="btn btn-sm" onclick="window._selectedApplicationId='${app.id}';navigateTo('application-detail')" style="margin-top:8px;font-size:11px;width:100%;">View Application</button>
        </div>`;
    }
  }

  if (thread.providerId) {
    const prov = provArr.find(p => String(p.id) === String(thread.providerId));
    if (prov) {
      const name = ((prov.firstName || prov.first_name || '') + ' ' + (prov.lastName || prov.last_name || '')).trim();
      html += `
        <div style="background:var(--gray-50);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:600;color:var(--gray-400);margin-bottom:6px;">LINKED PROVIDER</div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${escHtml(name)}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${escHtml(prov.credentials || '')} &middot; NPI: ${escHtml(prov.npi || '—')}</div>
          ${prov.specialty ? `<div style="font-size:11px;color:var(--gray-400);margin-top:2px;">${escHtml(prov.specialty)}</div>` : ''}
          <button class="btn btn-sm" onclick="window.app.openProviderProfile('${prov.id}')" style="margin-top:8px;font-size:11px;width:100%;">View Profile</button>
        </div>`;
    }
  }

  if (!thread.applicationId && !thread.providerId) {
    html += `<div style="text-align:center;padding:2rem;color:var(--gray-400);font-size:12px;">
      <div style="font-size:24px;margin-bottom:6px;">&#128279;</div>
      No linked context.<br>Messages can be linked to applications or providers when created from those pages.
    </div>`;
  }

  // Thread info
  html += `
    <div style="margin-top:16px;border-top:1px solid var(--gray-100);padding-top:12px;">
      <div style="font-size:11px;font-weight:600;color:var(--gray-400);margin-bottom:8px;">THREAD INFO</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.8;">
        Messages: ${thread.msgs.length}<br>
        Started: ${formatDateDisplay(thread.first.createdAt || thread.first.created_at) || '—'}<br>
        Last activity: ${timeAgo(thread.lastDate)}<br>
        Type: ${TYPE_LABELS[thread.type] || 'Message'}
      </div>
    </div>`;

  return html;
}

export function mcRefresh() {
  renderMessageCenterPage();
}
