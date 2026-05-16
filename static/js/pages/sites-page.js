// ============ SITES PAGE ============
let allSites = [];

async function loadSites() {
  const tbody = document.getElementById('sites-body');
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Loading...</td></tr>`;
  try {
    allSites = await apiGet('/sites');
    renderSites(allSites);
  } catch (err) {
    showToast('Failed to load sites: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(5, 'Error loading sites');
  }
}

function renderSites(sites) {
  const tbody = document.getElementById('sites-body');
  if (!sites.length) { tbody.innerHTML = emptyRow(5); return; }

  tbody.innerHTML = sites.map(s => `
    <tr>
      <td>
        <div style="font-weight:600;">${s.name}</div>
      </td>
      <td>${s.supervisor_username || '—'}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" ${s.is_active ? 'checked' : ''}
            onchange="toggleSiteStatus('${s._id}', this)" />
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>${fmtDate(s.created_at)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="openEditSiteModal('${s._id}')" title="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon danger" onclick="deleteSite('${s._id}', '${s.name}')" title="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Search
document.getElementById('sites-search').addEventListener('input', function () {
  const q = this.value.toLowerCase();
  renderSites(allSites.filter(s => s.name.toLowerCase().includes(q) || (s.supervisor_username || '').toLowerCase().includes(q)));
});

// Add site
document.getElementById('add-site-btn').addEventListener('click', () => {
  openModal('Add New Site', `
    <form class="modal-form" id="site-form">
      <div class="form-group">
        <label>Site Name *</label>
        <input type="text" id="sf-name" placeholder="e.g. North Bridge Project" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Supervisor Username *</label>
          <input type="text" id="sf-username" placeholder="supervisor1" required />
        </div>
        <div class="form-group">
          <label>Supervisor Password *</label>
          <input type="password" id="sf-password" placeholder="••••••••" required />
        </div>
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="submitAddSite()">Add Site</button>
  `);
});

async function submitAddSite() {
  const name = document.getElementById('sf-name').value.trim();
  const username = document.getElementById('sf-username').value.trim();
  const password = document.getElementById('sf-password').value;
  if (!name || !username || !password) { showToast('All fields are required', 'warning'); return; }
  try {
    await apiPost('/sites', { name, supervisor_username: username, supervisor_password: password });
    closeModal();
    showToast('Site added successfully');
    loadSites();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditSiteModal(id) {
  const site = allSites.find(s => s._id === id);
  if (!site) return;
  openModal('Edit Site', `
    <form class="modal-form">
      <div class="form-group">
        <label>Site Name</label>
        <input type="text" id="ef-name" value="${site.name}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Supervisor Username</label>
          <input type="text" id="ef-username" value="${site.supervisor_username || ''}" />
        </div>
        <div class="form-group">
          <label>New Password <small style="color:#9ca3af">(leave blank to keep)</small></label>
          <input type="password" id="ef-password" placeholder="••••••••" />
        </div>
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="submitEditSite('${id}')">Save Changes</button>
  `);
}

async function submitEditSite(id) {
  const body = {};
  const name = document.getElementById('ef-name').value.trim();
  const username = document.getElementById('ef-username').value.trim();
  const password = document.getElementById('ef-password').value;
  if (name) body.name = name;
  if (username) body.supervisor_username = username;
  if (password) body.supervisor_password = password;
  try {
    await apiPut(`/sites/${id}`, body);
    closeModal();
    showToast('Site updated successfully');
    loadSites();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleSiteStatus(id, checkbox) {
  try {
    const res = await apiPatch(`/sites/${id}/status`, {});
    checkbox.checked = res.is_active;
    showToast(`Site ${res.is_active ? 'activated' : 'deactivated'}`);
    const site = allSites.find(s => s._id === id);
    if (site) site.is_active = res.is_active;
  } catch (err) {
    checkbox.checked = !checkbox.checked;
    showToast(err.message, 'error');
  }
}

function deleteSite(id, name) {
  confirmAction('Delete Site', `Delete "${name}"? This also removes all related allocations and logs.`, async () => {
    try {
      await apiDelete(`/sites/${id}`);
      showToast('Site deleted');
      loadSites();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
