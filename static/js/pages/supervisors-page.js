// ============ SUPERVISORS PAGE ============
let allSupervisors = [];

async function loadSupervisors() {
  const tbody = document.getElementById('supervisors-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Loading...</td></tr>`;
  try {
    const res = await apiGet('/admin/supervisors');
    if (res.error) throw new Error(res.error);
    allSupervisors = res;
    renderSupervisors(allSupervisors);
  } catch (err) {
    showToast('Failed to load supervisors: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(5, 'Error loading supervisors');
  }
}

function renderSupervisors(supervisors) {
  const tbody = document.getElementById('supervisors-body');
  if (!tbody) return;
  if (!supervisors.length) { tbody.innerHTML = emptyRow(5); return; }

  tbody.innerHTML = supervisors.map(s => `
    <tr>
      <td>
        <div style="font-weight:600;">${s.name}</div>
      </td>
      <td>${s.username}</td>
      <td><span class="badge" style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:12px;text-transform:capitalize;">${s.role || 'Supervisor'}</span></td>
      <td>${fmtDate(s.created_at)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="openEditSupervisorModal('${s._id}')" title="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon danger" onclick="deleteSupervisor('${s._id}', '${s.name}')" title="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Search
const supervisorSearch = document.getElementById('supervisors-search');
if (supervisorSearch) {
  supervisorSearch.addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderSupervisors(allSupervisors.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.username || '').toLowerCase().includes(q)
    ));
  });
}

// Add Supervisor
const addSupervisorBtn = document.getElementById('add-supervisor-btn');
if (addSupervisorBtn) {
  addSupervisorBtn.addEventListener('click', () => {
    openModal('Add New Supervisor', `
      <form class="modal-form" id="supervisor-form">
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" id="sf-full-name" placeholder="e.g. John Doe" required />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Username *</label>
            <input type="text" id="sf-user-username" placeholder="johndoe123" required />
          </div>
          <div class="form-group">
            <label>Password *</label>
            <input type="password" id="sf-user-password" placeholder="••••••••" required />
          </div>
        </div>
      </form>
    `, `
      <button class="btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitAddSupervisor()">Add Supervisor</button>
    `);
  });
}

async function submitAddSupervisor() {
  const name = document.getElementById('sf-full-name').value.trim();
  const username = document.getElementById('sf-user-username').value.trim();
  const password = document.getElementById('sf-user-password').value;
  if (!name || !username || !password) { showToast('All fields are required', 'warning'); return; }
  try {
    const res = await apiPost('/admin/supervisors', { name, username, password });
    if (res.error) throw new Error(res.error);
    closeModal();
    showToast('Supervisor added successfully');
    loadSupervisors();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditSupervisorModal(id) {
  const supervisor = allSupervisors.find(s => s._id === id);
  if (!supervisor) return;
  openModal('Edit Supervisor', `
    <form class="modal-form">
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="ef-full-name" value="${supervisor.name}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Username</label>
          <input type="text" id="ef-user-username" value="${supervisor.username}" />
        </div>
        <div class="form-group">
          <label>New Password <small style="color:#9ca3af">(leave blank to keep)</small></label>
          <input type="password" id="ef-user-password" placeholder="••••••••" />
        </div>
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="submitEditSupervisor('${id}')">Save Changes</button>
  `);
}

async function submitEditSupervisor(id) {
  const body = {};
  const name = document.getElementById('ef-full-name').value.trim();
  const username = document.getElementById('ef-user-username').value.trim();
  const password = document.getElementById('ef-user-password').value;
  if (name) body.name = name;
  if (username) body.username = username;
  if (password) body.password = password;
  try {
    const res = await apiPut(`/admin/supervisors/${id}`, body);
    if (res.error) throw new Error(res.error);
    closeModal();
    showToast('Supervisor updated successfully');
    loadSupervisors();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function deleteSupervisor(id, name) {
  confirmAction('Delete Supervisor', `Delete "${name}"? This action cannot be undone.`, async () => {
    try {
      const res = await apiDelete(`/admin/supervisors/${id}`);
      if (res.error) throw new Error(res.error);
      showToast('Supervisor deleted');
      loadSupervisors();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Intercept page change to load data
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.classList.contains('active') && mutation.target.id === 'page-supervisors') {
        loadSupervisors();
      }
    });
  });
  
  const page = document.getElementById('page-supervisors');
  if (page) {
    observer.observe(page, { attributes: true, attributeFilter: ['class'] });
  }
});
