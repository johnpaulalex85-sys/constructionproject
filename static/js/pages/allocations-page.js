// ============ ALLOCATIONS PAGE ============
let currentAllocSiteId = null;
let currentAllocations = [];
let allocMaterials = [];

// ─── Init: load sites into dropdown ───────────────────────────────────────────
async function initAllocationsPage() {
  const select = document.getElementById('alloc-site-select');
  try {
    const sites = await apiGet('/sites');
    select.innerHTML = '<option value="">-- Select a Site --</option>' +
      sites.map(s => `<option value="${s._id}">${s.name}${s.is_active ? '' : ' (inactive)'}</option>`).join('');

    // Restore previously selected site
    if (currentAllocSiteId) {
      const match = sites.find(s => s._id === currentAllocSiteId);
      if (match) {
        select.value = currentAllocSiteId;
        await loadAllocations(currentAllocSiteId);
        return;
      }
    }
    // Default: reset
    currentAllocSiteId = null;
    document.getElementById('add-alloc-btn').disabled = true;
    document.getElementById('alloc-body').innerHTML =
      `<tr><td colspan="6" class="loading-cell">Select a site to view allocations</td></tr>`;
  } catch (err) {
    showToast('Failed to load sites: ' + err.message, 'error');
  }
}

// ─── Site selection ────────────────────────────────────────────────────────────
document.getElementById('alloc-site-select').addEventListener('change', async function () {
  const siteId = this.value;
  currentAllocSiteId = siteId || null;
  document.getElementById('add-alloc-btn').disabled = !siteId;
  if (siteId) {
    await loadAllocations(siteId);
  } else {
    currentAllocations = [];
    document.getElementById('alloc-body').innerHTML =
      `<tr><td colspan="6" class="loading-cell">Select a site to view allocations</td></tr>`;
  }
});

// ─── Load allocations for a site ──────────────────────────────────────────────
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

// ─── Render allocation rows ────────────────────────────────────────────────────
function renderAllocations(allocations) {
  const tbody = document.getElementById('alloc-body');
  if (!allocations.length) {
    tbody.innerHTML = emptyRow(6, 'No materials allocated to this site yet');
    return;
  }

  tbody.innerHTML = allocations.map(a => {
    const healthScore = a.health && a.health.score !== undefined ? Math.round(a.health.score) : 0;
    const stockBadge = getHealthBadge(a.health);

    // Progress bar tied directly to health score percentage
    const barColor = healthScore >= 70 ? 'var(--success-color)' : (healthScore >= 40 ? 'var(--warning-color)' : 'var(--danger-color)');
    const progressBar = `
      <div style="width:100%; background:#e5e7eb; border-radius:4px; height:6px; margin-top:4px;">
        <div style="width:${Math.max(healthScore,0)}%; background:${barColor}; height:6px; border-radius:4px; transition:width .4s;"></div>
      </div>`;

    return `
      <tr>
        <td>
          <strong>${a.material_name}</strong>
        </td>
        <td>
          <strong>${a.allocated_quantity}</strong>
        </td>
        <td>
          <strong>${a.used_quantity}</strong>
        </td>
        <td>
          <strong>${a.remaining_quantity}</strong>
          ${progressBar}
        </td>
        <td>${stockBadge}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" onclick="openAddAllocationStockModal('${a._id}', '${a.material_name}', '${a.material_unit}', '${a.material_id}')" title="Add Allocation Stock" style="color: var(--success-color);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="btn-icon" onclick="openReduceAllocationModal('${a._id}', '${a.material_name}', '${a.material_unit}', ${a.allocated_quantity}, ${a.used_quantity})" title="Reduce Allocation Quantity" style="color: var(--danger-color);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="btn-icon" onclick="openTransferAllocationModal('${a._id}', '${a.material_name}', '${a.material_unit}', ${a.allocated_quantity}, ${a.used_quantity})" title="Transfer Allocation" style="color: #6366f1;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4M21 5H9M7 23l-4-4 4-4M3 19h12"/></svg>
            </button>
            <button class="btn-icon" onclick="openAllocationHistoryModal('${a._id}', '${a.material_name}', '${a.material_unit}')" title="View Allocation History" style="color: var(--primary-color);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
            <button class="btn-icon" onclick="openViewLogsModal('${a.site_id}', '${a.material_id}', '${a.material_name}')" title="View Logs & Receipts">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
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

// ─── Add Allocation Modal ──────────────────────────────────────────────────────
document.getElementById('add-alloc-btn').addEventListener('click', async () => {
  try { allocMaterials = await apiGet('/materials'); } catch (e) { allocMaterials = []; }
  const allocatedIds = currentAllocations.map(a => a.material_id);
  const available = allocMaterials.filter(m => !allocatedIds.includes(m._id));

  openModal('Allocate Material', `
    <form class="modal-form">
      <div class="form-group">
        <label>Material *</label>
        <select id="af-material" onchange="onAllocMaterialChange(this.value)">
          <option value="">-- Select Material --</option>
          ${available.map(m => `<option value="${m._id}" data-unit="${m.unit}">${m.name}</option>`).join('')}
        </select>
      </div>

      <div id="af-stock-info" style="display:none; margin:8px 0; padding:12px; background:rgba(0,0,0,0.03); border-radius:8px; font-size:13px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;">Available for Allocation</span>
          <strong id="af-available-display">—</strong>
        </div>
      </div>

      <div class="form-group">
        <label id="af-qty-label">Allocated Quantity *</label>
        <input type="number" id="af-qty" placeholder="Enter quantity" min="0.01" step="0.01" oninput="validateAllocQty()" />
      </div>
      <div id="af-err" style="color:var(--danger-color);font-size:13px;display:none;margin-top:-8px;margin-bottom:8px;"></div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" id="af-submit" onclick="submitAddAllocation()" disabled>Allocate</button>
  `);
});

window.onAllocMaterialChange = function(matId) {
  const mat = allocMaterials.find(m => m._id === matId);
  const stockInfo = document.getElementById('af-stock-info');
  const submitBtn = document.getElementById('af-submit');
  const label = document.getElementById('af-qty-label');
  const err = document.getElementById('af-err');

  if (!mat) {
    stockInfo.style.display = 'none';
    label.textContent = 'Allocated Quantity *';
    submitBtn.disabled = true;
    err.style.display = 'none';
    return;
  }

  document.getElementById('af-available-display').textContent = `${mat.available_quantity || 0}`;
  stockInfo.style.display = 'block';
  label.textContent = `Allocated Quantity *`;
  validateAllocQty();
};

window.validateAllocQty = function() {
  const matId = document.getElementById('af-material').value;
  const qty = parseFloat(document.getElementById('af-qty').value);
  const submitBtn = document.getElementById('af-submit');
  const err = document.getElementById('af-err');

  if (!matId || isNaN(qty) || qty <= 0) {
    submitBtn.disabled = true;
    err.style.display = 'none';
    return;
  }

  const mat = allocMaterials.find(m => m._id === matId);
  if (mat && qty > mat.available_quantity) {
    submitBtn.disabled = true;
    err.textContent = `Allocated quantity cannot exceed warehouse available stock (${mat.available_quantity})`;
    err.style.display = 'block';
    return;
  }

  err.style.display = 'none';
  submitBtn.disabled = false;
};

async function submitAddAllocation() {
  const material_id = document.getElementById('af-material').value;
  const qty = parseFloat(document.getElementById('af-qty').value);
  if (!material_id || !qty || qty <= 0) {
    showToast('Select a material and enter a valid quantity', 'warning');
    return;
  }
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

// ─── Add Allocation Stock Modal (Safe Increment Flow) ───────────────────────────
window.openAddAllocationStockModal = async function(id, name, unit, materialId) {
  let materials = [];
  try { materials = await apiGet('/materials'); } catch (e) {}
  const mat = materials.find(m => m._id === materialId);
  const available = mat ? mat.available_quantity : 0;

  openModal(`Add Allocation: ${name}`, `
    <form class="modal-form">
      <div style="padding:10px 12px; background:rgba(0,0,0,0.03); border-radius:8px; margin-bottom:12px; font-size:13px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;">Warehouse Available Stock</span>
          <strong>${available}</strong>
        </div>
      </div>
      <div class="form-group">
        <label>Quantity to Allocate *</label>
        <input type="number" id="aasf-qty" placeholder="Enter quantity" min="0.01" max="${available}" step="0.01" required oninput="validateAddAllocStockQty(${available})" />
      </div>
      <div id="aasf-err" style="color:var(--danger-color);font-size:13px;display:none;margin-top:-8px;margin-bottom:8px;"></div>
      <div class="form-group">
        <label>Notes / Reason</label>
        <input type="text" id="aasf-note" placeholder="e.g. Extra demand for Phase 2" />
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" id="aasf-submit" onclick="submitAddAllocationStock('${id}')" disabled>Allocate</button>
  `);
};

window.validateAddAllocStockQty = function(maxAvailable) {
  const qty = parseFloat(document.getElementById('aasf-qty').value);
  const submitBtn = document.getElementById('aasf-submit');
  const err = document.getElementById('aasf-err');
  
  if (isNaN(qty) || qty <= 0) {
    submitBtn.disabled = true;
    err.style.display = 'none';
    return;
  }
  if (qty > maxAvailable) {
    submitBtn.disabled = true;
    err.textContent = `Quantity to allocate cannot exceed warehouse stock (${maxAvailable})`;
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  submitBtn.disabled = false;
};

window.submitAddAllocationStock = async function(id) {
  const qty = parseFloat(document.getElementById('aasf-qty').value);
  const note = document.getElementById('aasf-note').value.trim();
  if (isNaN(qty) || qty <= 0) {
    showToast('Please enter a valid quantity', 'warning');
    return;
  }
  try {
    await apiPost(`/allocations/${id}/add`, { quantity_added: qty, note });
    closeModal();
    showToast('Allocation quantity added successfully');
    loadAllocations(currentAllocSiteId);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ─── Reduce Allocation Quantity Modal ──────────────────────────────────────────
window.openReduceAllocationModal = function(id, name, unit, allocated, used) {
  const remaining = Math.max(0, allocated - used);
  openModal(`Reduce Allocation: ${name}`, `
    <form class="modal-form">
      <div style="padding:10px 12px; background:rgba(0,0,0,0.03); border-radius:8px; margin-bottom:12px; font-size:13px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:#6b7280;">Allocated Quantity</span>
          <strong>${allocated}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:#6b7280;">Already Used</span>
          <strong>${used}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid rgba(0,0,0,0.05);">
          <span style="color:#6b7280;">Max Reducible Quantity</span>
          <strong style="color:var(--danger-color);">${remaining}</strong>
        </div>
      </div>
      <div class="form-group">
        <label>Quantity to Reduce *</label>
        <input type="number" id="raf-qty" placeholder="Enter quantity" min="0.01" max="${remaining}" step="0.01" required oninput="validateReduceAllocQty(${remaining})" />
      </div>
      <div id="raf-err" style="color:var(--danger-color);font-size:13px;display:none;margin-top:-8px;margin-bottom:8px;"></div>
      <div class="form-group">
        <label>Reason / Notes</label>
        <input type="text" id="raf-note" placeholder="e.g. Stock cleanup or excess return" />
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" style="background-color: var(--danger-color); border-color: var(--danger-color);" id="raf-submit" onclick="submitReduceAllocation('${id}')" disabled>Reduce</button>
  `);
};

window.validateReduceAllocQty = function(maxReducible) {
  const qty = parseFloat(document.getElementById('raf-qty').value);
  const submitBtn = document.getElementById('raf-submit');
  const err = document.getElementById('raf-err');

  if (isNaN(qty) || qty <= 0) {
    submitBtn.disabled = true;
    err.style.display = 'none';
    return;
  }
  if (qty > maxReducible) {
    submitBtn.disabled = true;
    err.textContent = `Cannot reduce allocation by more than remaining quantity (${maxReducible})`;
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  submitBtn.disabled = false;
};

window.submitReduceAllocation = async function(id) {
  const qty = parseFloat(document.getElementById('raf-qty').value);
  const note = document.getElementById('raf-note').value.trim();
  if (isNaN(qty) || qty <= 0) {
    showToast('Please enter a valid quantity', 'warning');
    return;
  }
  try {
    await apiPost(`/allocations/${id}/reduce`, { quantity_reduced: qty, note });
    closeModal();
    showToast('Allocation reduced successfully');
    loadAllocations(currentAllocSiteId);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ─── Transfer Allocation Modal ────────────────────────────────────────────────
window.openTransferAllocationModal = async function(id, name, unit, allocated, used) {
  const remaining = Math.max(0, allocated - used);
  let sites = [];
  try { sites = await apiGet('/sites'); } catch (e) { sites = []; }
  
  // Filter out current site
  const otherSites = sites.filter(s => s._id !== currentAllocSiteId && s.is_active);

  openModal(`Transfer Allocation: ${name}`, `
    <form class="modal-form">
      <div style="padding:10px 12px; background:rgba(0,0,0,0.03); border-radius:8px; margin-bottom:12px; font-size:13px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:#6b7280;">Current Remaining stock at source</span>
          <strong>${remaining}</strong>
        </div>
      </div>
      
      <div class="form-group">
        <label>Target Site *</label>
        <select id="tf-target-site" required>
          <option value="">-- Select Target Site --</option>
          ${otherSites.map(s => `<option value="${s._id}">${s.name}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Quantity to Transfer *</label>
        <input type="number" id="tf-qty" placeholder="Enter quantity" min="0.01" max="${remaining}" step="0.01" required oninput="validateTransferQty(${remaining})" />
      </div>
      <div id="tf-err" style="color:var(--danger-color);font-size:13px;display:none;margin-top:-8px;margin-bottom:8px;"></div>
      
      <div class="form-group">
        <label>Reason / Notes</label>
        <input type="text" id="tf-note" placeholder="e.g. Cover cement shortage" />
      </div>
    </form>
  `, `
    <button class="btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" style="background-color: #6366f1; border-color: #6366f1;" id="tf-submit" onclick="submitTransferAllocation('${id}')" disabled>Transfer</button>
  `);
};

window.validateTransferQty = function(maxTransfer) {
  const qty = parseFloat(document.getElementById('tf-qty').value);
  const submitBtn = document.getElementById('tf-submit');
  const err = document.getElementById('tf-err');

  if (isNaN(qty) || qty <= 0) {
    submitBtn.disabled = true;
    err.style.display = 'none';
    return;
  }
  if (qty > maxTransfer) {
    submitBtn.disabled = true;
    err.textContent = `Cannot transfer more than remaining quantity at source (${maxTransfer})`;
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  submitBtn.disabled = false;
};

window.submitTransferAllocation = async function(id) {
  const qty = parseFloat(document.getElementById('tf-qty').value);
  const target_site_id = document.getElementById('tf-target-site').value;
  const note = document.getElementById('tf-note').value.trim();
  
  if (!target_site_id) {
    showToast('Please select a target site', 'warning');
    return;
  }
  if (isNaN(qty) || qty <= 0) {
    showToast('Please enter a valid quantity', 'warning');
    return;
  }
  
  try {
    await apiPost(`/allocations/${id}/transfer`, {
      quantity_transferred: qty,
      target_site_id,
      note
    });
    closeModal();
    showToast('Allocation transferred successfully');
    loadAllocations(currentAllocSiteId);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ─── View Allocation History Logs Modal ───────────────────────────────────────
window.openAllocationHistoryModal = async function(id, name, unit) {
  openModal(`Allocation Audit History: ${name}`, `
    <div style="max-height: 400px; overflow-y: auto;">
      <table class="data-table" style="width: 100%;">
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th>Quantity Changed</th>
            <th>User</th>
            <th>Notes / Reason</th>
          </tr>
        </thead>
        <tbody id="ah-body">
          <tr><td colspan="5" class="loading-cell">Loading history...</td></tr>
        </tbody>
      </table>
    </div>
  `, `
    <button class="btn-outline" onclick="closeModal()">Close</button>
  `);

  try {
    const history = await apiGet(`/allocations/${id}/history`);
    const tbody = document.getElementById('ah-body');
    if (!history || !history.length) {
      tbody.innerHTML = emptyRow(5, 'No allocation adjustment history found.');
      return;
    }
    
    tbody.innerHTML = history.map(h => {
      let badge = '';
      let qtyText = '';
      const action = h.action_type || (h.quantity_added >= 0 ? 'increase' : 'reduction');
      
      if (action === 'creation') {
        badge = `<span class="status-badge" style="background-color: #6366f1; color: white; border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">Creation</span>`;
        qtyText = `<strong style="color:var(--primary-color);">+${h.quantity_affected || h.quantity_added}</strong>`;
      } else if (action === 'increase') {
        badge = `<span class="status-badge badge-approved" style="border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">Increase</span>`;
        qtyText = `<strong style="color:var(--success-color);">+${h.quantity_affected || h.quantity_added}</strong>`;
      } else if (action === 'reduction') {
        badge = `<span class="status-badge badge-rejected" style="border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">Reduction</span>`;
        qtyText = `<strong style="color:var(--danger-color);">${h.quantity_added || -h.quantity_affected}</strong>`;
      } else if (action === 'transfer_in') {
        badge = `<span class="status-badge" style="background-color: #10b981; color: white; border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">Transfer In</span>`;
        qtyText = `<strong style="color:var(--success-color);">+${h.quantity_affected || h.quantity_added}</strong>`;
      } else if (action === 'transfer_out') {
        badge = `<span class="status-badge badge-rejected" style="background-color: #ef4444; color: white; border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">Transfer Out</span>`;
        qtyText = `<strong style="color:var(--danger-color);">${h.quantity_added || -h.quantity_affected}</strong>`;
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
    document.getElementById('ah-body').innerHTML = emptyRow(5, 'Failed to load allocation history.');
  }
};

// ─── Delete Allocation ─────────────────────────────────────────────────────────
function deleteAllocation(id, name) {
  confirmAction('Remove Allocation', `Remove allocation for "${name}"? Usage logs will be preserved.`, async () => {
    try {
      await apiDelete(`/allocations/${id}`);
      showToast('Allocation removed');
      loadAllocations(currentAllocSiteId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ─── View Logs Modal ───────────────────────────────────────────────────────────
async function openViewLogsModal(siteId, materialId, materialName) {
  openModal(`Usage Logs: ${materialName}`, `
    <div style="max-height: 400px; overflow-y: auto;">
      <table class="data-table" style="width: 100%;">
        <thead>
          <tr>
            <th>Date</th>
            <th>Quantity Used</th>
            <th>Notes</th>
            <th>Receipt</th>
          </tr>
        </thead>
        <tbody id="vl-body">
          <tr><td colspan="4" class="loading-cell">Loading logs...</td></tr>
        </tbody>
      </table>
    </div>
  `, `
    <button class="btn-outline" onclick="closeModal()">Close</button>
  `);

  try {
    const logs = await apiGet(`/usage/${siteId}`);
    const filtered = logs.filter(l => l.material_id === materialId);
    const tbody = document.getElementById('vl-body');
    if (!filtered.length) {
      tbody.innerHTML = emptyRow(4, 'No usage logs found for this material.');
      return;
    }
    
    tbody.innerHTML = filtered.map(l => `
      <tr>
        <td>${fmtDate(l.date)}</td>
        <td><strong>${l.used_quantity}</strong></td>
        <td>${l.notes || '<span style="color:#9ca3af;font-size:12px;">--</span>'}</td>
        <td>
          ${l.receipt_url 
            ? `<img src="${l.receipt_url}" onclick="openLightbox('${l.receipt_url}')" alt="Receipt" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #e5e7eb; cursor:pointer;" title="Click to view receipt">` 
            : `<span style="color:#9ca3af; font-size:12px;">No Receipt</span>`}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('vl-body').innerHTML = emptyRow(4, 'Failed to load logs.');
  }
}
