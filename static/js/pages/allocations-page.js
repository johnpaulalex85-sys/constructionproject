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
      `<tr><td colspan="5" class="loading-cell">Select a site to view allocations</td></tr>`;
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
      `<tr><td colspan="5" class="loading-cell">Select a site to view allocations</td></tr>`;
  }
});

// ─── Load allocations for a site ──────────────────────────────────────────────
async function loadAllocations(siteId) {
  const tbody = document.getElementById('alloc-body');
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Loading...</td></tr>`;
  try {
    currentAllocations = await apiGet(`/allocations/${siteId}`);
    renderAllocations(currentAllocations);
  } catch (err) {
    showToast('Failed to load allocations: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(5, 'Error loading allocations');
  }
}

// ─── Render allocation rows ────────────────────────────────────────────────────
function renderAllocations(allocations) {
  const tbody = document.getElementById('alloc-body');
  if (!allocations.length) {
    tbody.innerHTML = emptyRow(5, 'No materials allocated to this site yet');
    return;
  }

  tbody.innerHTML = allocations.map(a => {
    const pct = a.allocated_quantity > 0
      ? Math.round((a.remaining_quantity / a.allocated_quantity) * 100)
      : 0;

    let stockBadge, rowCls;
    if (pct <= 15) {
      stockBadge = `<span class="status-badge badge-rejected">Critical (${pct}%)</span>`;
    } else if (pct <= 40) {
      stockBadge = `<span class="status-badge badge-pending">Low (${pct}%)</span>`;
    } else {
      stockBadge = `<span class="status-badge badge-approved">Healthy (${pct}%)</span>`;
    }

    // Progress bar
    const barColor = pct <= 15 ? 'var(--danger-color)' : pct <= 40 ? 'var(--warning-color)' : 'var(--success-color)';
    const progressBar = `
      <div style="width:100%; background:#e5e7eb; border-radius:4px; height:6px; margin-top:4px;">
        <div style="width:${Math.max(pct,0)}%; background:${barColor}; height:6px; border-radius:4px; transition:width .4s;"></div>
      </div>`;

    return `
      <tr>
        <td>
          <strong>${a.material_name}</strong>
          <div style="font-size:0.75rem;color:#6b7280;margin-top:2px;">${a.material_unit}</div>
        </td>
        <td>
          <strong>${a.allocated_quantity}</strong>
          <span style="color:#9ca3af;font-size:0.8em;"> ${a.material_unit}</span>
        </td>
        <td>
          <strong>${a.used_quantity}</strong>
          <span style="color:#9ca3af;font-size:0.8em;"> ${a.material_unit}</span>
        </td>
        <td>
          <strong>${a.remaining_quantity}</strong>
          <span style="color:#9ca3af;font-size:0.8em;"> ${a.material_unit}</span>
          ${progressBar}
        </td>
        <td>${stockBadge}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" onclick="openViewLogsModal('${a.site_id}', '${a.material_id}', '${a.material_name}')" title="View Logs & Receipts">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </button>
            <button class="btn-icon" onclick="openEditAllocModal('${a._id}', ${a.allocated_quantity}, '${a.material_name}', '${a.material_unit}', ${a.used_quantity})" title="Edit">
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
          ${available.map(m => `<option value="${m._id}" data-unit="${m.unit}">${m.name} (${m.unit})</option>`).join('')}
        </select>
      </div>

      <div id="af-stock-info" style="display:none; margin:8px 0; padding:12px; background:rgba(0,0,0,0.03); border-radius:8px; font-size:13px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:#6b7280;">Unit</span>
          <strong id="af-unit-display">—</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:#6b7280;">Already Allocated (all sites)</span>
          <strong id="af-allocated-display">—</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid rgba(0,0,0,0.05);">
          <span style="color:#6b7280;">Total Used (all sites)</span>
          <strong id="af-used-display">—</strong>
        </div>
      </div>

      <div class="form-group">
        <label id="af-qty-label">Allocated Quantity *</label>
        <input type="number" id="af-qty" placeholder="e.g. 500" min="1" step="0.01" oninput="validateAllocQty()" />
      </div>
      <div id="af-err" style="color:var(--danger-color);font-size:13px;display:none;margin-top:-8px;"></div>
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

  document.getElementById('af-unit-display').textContent = mat.unit;
  document.getElementById('af-allocated-display').textContent = `${mat.allocated_quantity || 0} ${mat.unit}`;
  document.getElementById('af-used-display').textContent = `${mat.total_used || 0} ${mat.unit}`;
  stockInfo.style.display = 'block';
  label.textContent = `Allocated Quantity (${mat.unit}) *`;
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

// ─── Edit Allocation Modal ─────────────────────────────────────────────────────
function openEditAllocModal(id, currentQty, matName, matUnit, usedQty) {
  openModal(`Edit Allocation: ${matName}`, `
    <form class="modal-form">
      <div style="padding:10px 12px; background:rgba(0,0,0,0.03); border-radius:8px; margin-bottom:12px; font-size:13px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:#6b7280;">Current Allocation</span>
          <strong>${currentQty} ${matUnit}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;">Already Used</span>
          <strong>${usedQty} ${matUnit}</strong>
        </div>
      </div>
      <div class="form-group">
        <label>New Allocated Quantity (${matUnit})</label>
        <input type="number" id="eaf-qty" value="${currentQty}" min="${usedQty}" step="0.01" />
        <small style="color:#9ca3af;margin-top:4px;display:block;">Minimum: ${usedQty} ${matUnit} (already used)</small>
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
        <td><strong>${l.used_quantity}</strong> ${l.material_unit}</td>
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
