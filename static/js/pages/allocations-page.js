// ============ ALLOCATIONS PAGE ============
let currentAllocSiteId = null;
let currentAllocations = [];

async function initAllocationsPage() {
  const select = document.getElementById('alloc-site-select');
  // Populate site dropdown (uses allSites from sites-page or fetch fresh)
  try {
    const sites = await apiGet('/sites');
    select.innerHTML = '<option value="">-- Select a Site --</option>' +
      sites.map(s => `<option value="${s._id}">${s.name}${s.is_active ? '' : ' (inactive)'}</option>`).join('');
  } catch (err) {
    showToast('Failed to load sites', 'error');
  }
}

document.getElementById('alloc-site-select').addEventListener('change', async function () {
  const siteId = this.value;
  currentAllocSiteId = siteId;
  const addBtn = document.getElementById('add-alloc-btn');
  addBtn.disabled = !siteId;
  if (siteId) {
    loadAllocations(siteId);
  } else {
    document.getElementById('alloc-body').innerHTML = `<tr><td colspan="6" class="loading-cell">Select a site to view allocations</td></tr>`;
  }
});

async function loadAllocations(siteId) {
  const tbody = document.getElementById('alloc-body');
  tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Loading...</td></tr>`;
  try {
    currentAllocations = await apiGet(`/allocations/${siteId}`);
    renderAllocations(currentAllocations);
  } catch (err) {
    showToast('Failed to load allocations: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(6, 'Error loading allocations');
  }
}

function renderAllocations(allocations) {
  const tbody = document.getElementById('alloc-body');
  if (!allocations.length) { tbody.innerHTML = emptyRow(6, 'No allocations for this site'); return; }

  tbody.innerHTML = allocations.map(a => {
    const cls = remainingClass(a.remaining_quantity, a.allocated_quantity);
    const pct = a.allocated_quantity > 0 ? Math.round((a.remaining_quantity / a.allocated_quantity) * 100) : 0;
    return `
      <tr>
        <td><strong>${a.material_name}</strong></td>
        <td>${a.material_unit}</td>
        <td>${a.allocated_quantity}</td>
        <td>${a.used_quantity}</td>
        <td class="${cls}">${a.remaining_quantity} <small style="color:#9ca3af;font-size:0.72rem;">(${pct}%)</small></td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" onclick="openEditAllocModal('${a._id}', ${a.allocated_quantity})" title="Edit">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" onclick="deleteAllocation('${a._id}', '${a.material_name}')" title="Remove">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Add allocation
document.getElementById('add-alloc-btn').addEventListener('click', async () => {
  // Fetch materials for dropdown
  let materials = [];
  try { materials = await apiGet('/materials'); } catch (e) {}
  const allocated = currentAllocations.map(a => a.material_id);
  const available = materials.filter(m => !allocated.includes(m._id));

  openModal('Allocate Material', `
    <form class="modal-form">
      <div class="form-group">
        <label>Material *</label>
        <select id="af-material">
          <option value="">-- Select Material --</option>
          ${available.map(m => `<option value="${m._id}">${m.name} (${m.unit})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Allocated Quantity *</label>
        <input type="number" id="af-qty" placeholder="e.g. 1000" min="1" step="0.01" />
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="submitAddAllocation()">Allocate</button>
  `);
});

async function submitAddAllocation() {
  const material_id = document.getElementById('af-material').value;
  const qty = parseFloat(document.getElementById('af-qty').value);
  if (!material_id || !qty || qty <= 0) { showToast('Select a material and enter a valid quantity', 'warning'); return; }
  try {
    await apiPost('/allocations', {
      site_id: currentAllocSiteId,
      material_id,
      allocated_quantity: qty
    });
    closeModal();
    showToast('Material allocated successfully');
    loadAllocations(currentAllocSiteId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditAllocModal(id, currentQty) {
  openModal('Edit Allocation', `
    <form class="modal-form">
      <div class="form-group">
        <label>New Allocated Quantity</label>
        <input type="number" id="eaf-qty" value="${currentQty}" min="1" step="0.01" />
        <small style="color:#9ca3af;margin-top:4px;display:block;">Cannot be less than already used quantity</small>
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="submitEditAllocation('${id}')">Update</button>
  `);
}

async function submitEditAllocation(id) {
  const qty = parseFloat(document.getElementById('eaf-qty').value);
  if (!qty || qty <= 0) { showToast('Enter a valid quantity', 'warning'); return; }
  try {
    await apiPut(`/allocations/${id}`, { allocated_quantity: qty });
    closeModal();
    showToast('Allocation updated');
    loadAllocations(currentAllocSiteId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function deleteAllocation(id, name) {
  confirmAction('Remove Allocation', `Remove allocation for "${name}"?`, async () => {
    try {
      await apiDelete(`/allocations/${id}`);
      showToast('Allocation removed');
      loadAllocations(currentAllocSiteId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
