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
      <td>${s.supervisor_name ? s.supervisor_name + ' (' + s.supervisor_username + ')' : s.supervisor_username || '—'}</td>
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
document.getElementById('add-site-btn').addEventListener('click', async () => {
  let supervisorOptions = '<option value="">-- Select Supervisor --</option>';
  try {
    const supervisors = await apiGet('/admin/supervisors');
    supervisors.forEach(s => {
      supervisorOptions += `<option value="${s._id}">${s.name} (${s.username})</option>`;
    });
  } catch (e) {
    console.error("Failed to load supervisors", e);
  }

  openModal('Add New Site', `
    <form class="modal-form" id="site-form">
      <div class="form-group">
        <label>Site Name *</label>
        <input type="text" id="sf-name" placeholder="e.g. North Bridge Project" required />
      </div>
      <div class="form-group">
        <label>Supervisor *</label>
        <select id="sf-supervisor-id" required>
          ${supervisorOptions}
        </select>
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="submitAddSite()">Add Site</button>
  `);
});

async function submitAddSite() {
  const name = document.getElementById('sf-name').value.trim();
  const supervisor_id = document.getElementById('sf-supervisor-id').value;
  if (!name || !supervisor_id) { showToast('All fields are required', 'warning'); return; }
  try {
    const res = await apiPost('/sites', { name, supervisor_id });
    if (res.error) throw new Error(res.error);
    closeModal();
    showToast('Site added successfully');
    loadSites();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openEditSiteModal(id) {
  const site = allSites.find(s => s._id === id);
  if (!site) return;

  let supervisorOptions = '<option value="">-- Select Supervisor --</option>';
  try {
    const supervisors = await apiGet('/admin/supervisors');
    supervisors.forEach(s => {
      const selected = (site.supervisor_id === s._id || site.supervisor_username === s.username) ? 'selected' : '';
      supervisorOptions += `<option value="${s._id}" ${selected}>${s.name} (${s.username})</option>`;
    });
  } catch (e) {
    console.error("Failed to load supervisors", e);
  }

  openModal('Edit Site', `
    <form class="modal-form">
      <div class="form-group">
        <label>Site Name</label>
        <input type="text" id="ef-name" value="${site.name}" />
      </div>
      <div class="form-group">
        <label>Supervisor</label>
        <select id="ef-supervisor-id">
          ${supervisorOptions}
        </select>
        <small style="color:#9ca3af; display:block; margin-top:4px;">Existing legacy credentials will be replaced if a new supervisor is selected.</small>
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
  const supervisor_id = document.getElementById('ef-supervisor-id').value;
  if (name) body.name = name;
  if (supervisor_id) body.supervisor_id = supervisor_id;
  try {
    const res = await apiPut(`/sites/${id}`, body);
    if (res.error) throw new Error(res.error);
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
