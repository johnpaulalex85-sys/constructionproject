// ============ MATERIALS PAGE ============
let allMaterials = [];

async function loadMaterials() {
  const tbody = document.getElementById('materials-body');
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Loading...</td></tr>`;
  try {
    allMaterials = await apiGet('/materials');
    renderMaterials(allMaterials);
  } catch (err) {
    showToast('Failed to load materials: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(5, 'Error loading materials');
  }
}

function getStockBadge(allocated, used) {
  if (!allocated || allocated === 0) return `<span class="status-badge badge-inactive">No Stock</span>`;
  const pct = ((allocated - used) / allocated) * 100;
  if (pct <= 15) return `<span class="status-badge badge-rejected">Critical (${Math.round(pct)}%)</span>`;
  if (pct <= 40) return `<span class="status-badge badge-pending">Low (${Math.round(pct)}%)</span>`;
  return `<span class="status-badge badge-approved">Healthy (${Math.round(pct)}%)</span>`;
}

function renderMaterials(materials) {
  const tbody = document.getElementById('materials-body');
  if (!materials.length) { tbody.innerHTML = emptyRow(5, 'No materials found'); return; }

  tbody.innerHTML = materials.map(m => {
    const allocated = m.allocated_quantity || 0;
    const used = m.total_used || 0;
    const remaining = allocated - used;
    return `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td><span class="status-badge badge-inactive">${m.unit}</span></td>
        <td>${fmtCurrency(m.cost_per_unit)}</td>
        <td>
          <div style="font-size:0.82rem; line-height:1.6;">
            <div>Allocated: <strong>${allocated} ${m.unit}</strong></div>
            <div>Used: <strong>${used} ${m.unit}</strong></div>
            <div>Remaining: <strong>${remaining} ${m.unit}</strong></div>
          </div>
        </td>
        <td>${getStockBadge(allocated, used)}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" onclick="openEditMaterialModal('${m._id}')" title="Edit">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" onclick="deleteMaterial('${m._id}', '${m.name}')" title="Delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Search
document.getElementById('materials-search').addEventListener('input', function () {
  const q = this.value.toLowerCase();
  renderMaterials(allMaterials.filter(m =>
    m.name.toLowerCase().includes(q) || m.unit.toLowerCase().includes(q)
  ));
});

// Add material
document.getElementById('add-material-btn').addEventListener('click', () => {
  openModal('Add New Material', `
    <form class="modal-form">
      <div class="form-group">
        <label>Material Name *</label>
        <input type="text" id="mf-name" placeholder="e.g. Cement" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Unit *</label>
          <input type="text" id="mf-unit" placeholder="kg, bags, liters..." required />
        </div>
        <div class="form-group">
          <label>Cost Per Unit (₹)</label>
          <input type="number" id="mf-cost" placeholder="0.00" min="0" step="0.01" />
        </div>
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="submitAddMaterial()">Add Material</button>
  `);
});

async function submitAddMaterial() {
  const name = document.getElementById('mf-name').value.trim();
  const unit = document.getElementById('mf-unit').value.trim();
  const cost = document.getElementById('mf-cost').value;
  if (!name || !unit) { showToast('Name and unit are required', 'warning'); return; }
  try {
    await apiPost('/materials', { name, unit, cost_per_unit: parseFloat(cost) || 0 });
    closeModal();
    showToast('Material added successfully');
    loadMaterials();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditMaterialModal(id) {
  const mat = allMaterials.find(m => m._id === id);
  if (!mat) return;
  openModal('Edit Material', `
    <form class="modal-form">
      <div class="form-group">
        <label>Material Name</label>
        <input type="text" id="emf-name" value="${mat.name}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Unit</label>
          <input type="text" id="emf-unit" value="${mat.unit}" />
        </div>
        <div class="form-group">
          <label>Cost Per Unit (₹)</label>
          <input type="number" id="emf-cost" value="${mat.cost_per_unit}" min="0" step="0.01" />
        </div>
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="submitEditMaterial('${id}')">Save Changes</button>
  `);
}

async function submitEditMaterial(id) {
  const name = document.getElementById('emf-name').value.trim();
  const unit = document.getElementById('emf-unit').value.trim();
  const cost = document.getElementById('emf-cost').value;
  try {
    await apiPut(`/materials/${id}`, { name, unit, cost_per_unit: parseFloat(cost) || 0 });
    closeModal();
    showToast('Material updated');
    loadMaterials();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function deleteMaterial(id, name) {
  confirmAction('Delete Material', `Delete "${name}"? This will also remove all its allocations and usage logs.`, async () => {
    try {
      await apiDelete(`/materials/${id}`);
      showToast('Material deleted');
      loadMaterials();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
