// ============ MATERIALS PAGE ============
let allMaterials = [];

async function loadMaterials() {
  const tbody = document.getElementById('materials-body');
  tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Loading...</td></tr>`;
  try {
    allMaterials = await apiGet('/materials');
    renderMaterials(allMaterials);
  } catch (err) {
    showToast('Failed to load materials: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(6, 'Error loading materials');
  }
}

function getStockBadge(health) {
  return getHealthBadge(health);
}

function renderMaterials(materials) {
  const tbody = document.getElementById('materials-body');
  if (!materials.length) { tbody.innerHTML = emptyRow(6, 'No materials found'); return; }

  tbody.innerHTML = materials.map(m => {
    const allocated = m.allocated_quantity || 0;
    const totalStock = m.total_quantity || 0;
    const availableStock = m.available_quantity || 0;
    
    return `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td><span class="status-badge badge-inactive">${m.unit}</span></td>
        <td>${fmtCurrency(m.cost_per_unit)}</td>
        <td>
          <div style="font-size:0.82rem; line-height:1.6;">
            <div>Total Stock: <strong style="color: var(--primary-color);">${totalStock}</strong></div>
            <div>Allocated: <strong>${allocated}</strong></div>
            <div>Available: <strong style="color: var(--success-color);">${availableStock}</strong></div>
          </div>
        </td>
        <td>${getStockBadge(m.health)}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" onclick="openAddStockModal('${m._id}', '${m.name}', '${m.unit}')" title="Add Stock" style="color: var(--success-color);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="btn-icon" onclick="openRemoveStockModal('${m._id}', '${m.name}', '${m.unit}')" title="Remove Stock" style="color: var(--danger-color);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="btn-icon" onclick="openMaterialHistoryModal('${m._id}', '${m.name}', '${m.unit}')" title="View Stock History" style="color: var(--primary-color);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
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
      <div class="form-group">
        <label>Initial Warehouse Stock Quantity *</label>
        <input type="number" id="mf-total-qty" placeholder="e.g. 1000" min="0" step="0.01" value="0" required />
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
  const total_quantity = document.getElementById('mf-total-qty').value;
  if (!name || !unit) { showToast('Name and unit are required', 'warning'); return; }
  try {
    await apiPost('/materials', {
      name,
      unit,
      cost_per_unit: parseFloat(cost) || 0,
      total_quantity: parseFloat(total_quantity) || 0
    });
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
    await apiPut(`/materials/${id}`, {
      name,
      unit,
      cost_per_unit: parseFloat(cost) || 0
    });
    closeModal();
    showToast('Material updated');
    loadMaterials();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.openAddStockModal = function(id, name, unit) {
  openModal(`Add Stock: ${name}`, `
    <form class="modal-form">
      <div class="form-group">
        <label>Quantity to Add (${unit}) *</label>
        <input type="number" id="asf-qty" placeholder="e.g. 500" min="0.01" step="0.01" required />
      </div>
      <div class="form-group">
        <label>Notes / Remarks</label>
        <input type="text" id="asf-note" placeholder="e.g. Purchase order #123" />
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="submitAddStock('${id}')">Add Stock</button>
  `);
};

window.submitAddStock = async function(id) {
  const qty = parseFloat(document.getElementById('asf-qty').value);
  const note = document.getElementById('asf-note').value.trim();
  if (isNaN(qty) || qty <= 0) {
    showToast('Please enter a valid quantity', 'warning');
    return;
  }
  try {
    await apiPost(`/materials/${id}/add-stock`, { quantity_added: qty, note });
    closeModal();
    showToast('Stock added successfully');
    loadMaterials();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openRemoveStockModal = function(id, name, unit) {
  openModal(`Remove Stock: ${name}`, `
    <form class="modal-form">
      <div class="form-group">
        <label>Quantity to Remove (${unit}) *</label>
        <input type="number" id="rsf-qty" placeholder="e.g. 50" min="0.01" step="0.01" required />
      </div>
      <div class="form-group">
        <label>Reason / Notes *</label>
        <input type="text" id="rsf-note" placeholder="e.g. Expired, damaged, or wastage" required />
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" style="background-color: var(--danger-color); border-color: var(--danger-color);" onclick="submitRemoveStock('${id}')">Remove Stock</button>
  `);
};

window.submitRemoveStock = async function(id) {
  const qty = parseFloat(document.getElementById('rsf-qty').value);
  const note = document.getElementById('rsf-note').value.trim();
  if (isNaN(qty) || qty <= 0) {
    showToast('Please enter a valid quantity', 'warning');
    return;
  }
  if (!note) {
    showToast('Please enter a reason/notes for removal', 'warning');
    return;
  }
  try {
    await apiPost(`/materials/${id}/remove-stock`, { quantity_removed: qty, note });
    closeModal();
    showToast('Stock removed successfully');
    loadMaterials();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openMaterialHistoryModal = async function(id, name, unit) {
  openModal(`Stock Audit History: ${name}`, `
    <div style="max-height: 400px; overflow-y: auto;">
      <table class="data-table" style="width: 100%;">
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th>Quantity Changed</th>
            <th>User</th>
            <th>Notes / Remarks</th>
          </tr>
        </thead>
        <tbody id="sh-body">
          <tr><td colspan="5" class="loading-cell">Loading history...</td></tr>
        </tbody>
      </table>
    </div>
  `, `
    <button class="btn-outline" onclick="closeModal()">Close</button>
  `);

  try {
    const history = await apiGet(`/materials/${id}/history`);
    const tbody = document.getElementById('sh-body');
    if (!history || !history.length) {
      tbody.innerHTML = emptyRow(5, 'No stock audit logs found for this material.');
      return;
    }
    
    tbody.innerHTML = history.map(h => {
      let badge = '';
      let qtyText = '';
      const action = h.action_type || (h.quantity_added > 0 ? 'addition' : (h.quantity_added < 0 ? 'removal' : 'creation'));
      
      if (action === 'creation') {
        badge = `<span class="status-badge" style="background-color: #6366f1; color: white; border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">Creation</span>`;
        qtyText = `<strong style="color:var(--primary-color);">+${h.quantity_affected || h.quantity_added}</strong> ${unit}`;
      } else if (action === 'addition') {
        badge = `<span class="status-badge badge-approved" style="border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">Addition</span>`;
        qtyText = `<strong style="color:var(--success-color);">+${h.quantity_affected || h.quantity_added}</strong> ${unit}`;
      } else if (action === 'removal') {
        badge = `<span class="status-badge badge-rejected" style="border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">Removal</span>`;
        qtyText = `<strong style="color:var(--danger-color);">${h.quantity_added || -h.quantity_affected}</strong> ${unit}`;
      }
      
      return `
        <tr>
          <td>${fmtDate(h.date)}</td>
          <td>${badge}</td>
          <td>${qtyText}</td>
          <td><strong>${h.username || 'admin'}</strong></td>
          <td>${h.note || '<span style="color:#9ca3af;font-size:12px;">--</span>'}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    document.getElementById('sh-body').innerHTML = emptyRow(5, 'Failed to load stock history.');
  }
};

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
