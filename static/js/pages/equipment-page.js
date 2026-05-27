// ============================================================
//  EQUIPMENT & MACHINERY PAGE — Full Enterprise Implementation
// ============================================================
const EquipmentPage = {
  initialized: false,
  allEquipment: [],
  sites: [],

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Load sites for dropdowns
    const sitesRes = await apiGet('/sites');
    if (sitesRes && Array.isArray(sitesRes)) {
      this.sites = sitesRes;
    }

    // Sub-view tabs
    document.querySelectorAll('[data-eq-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('[data-eq-tab]').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        document.querySelectorAll('.eq-sub-view').forEach(v => v.style.display = 'none');
        document.getElementById(`eq-tab-${e.target.dataset.eqTab}`).style.display = 'block';
      });
    });

    // Status filter
    document.getElementById('eq-status-filter')?.addEventListener('change', () => this.applyEquipmentFilters());
    document.getElementById('eq-site-filter')?.addEventListener('change', () => this.applyEquipmentFilters());

    // Buttons
    document.getElementById('add-equipment-btn')?.addEventListener('click', () => this.showAddModal());
    document.getElementById('log-maintenance-btn')?.addEventListener('click', () => this.showMaintenanceModal());
    document.getElementById('log-fuel-btn')?.addEventListener('click', () => this.showFuelModal());
    document.getElementById('report-breakdown-btn')?.addEventListener('click', () => this.showBreakdownModal());

    await this.loadData();
  },

  showAddModal() {
    const siteOptions = this.sites.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    openModal("Register Equipment", `
      <div class="form-row">
        <div class="form-group">
          <label>Equipment Name *</label>
          <input type="text" id="eq-name" class="form-control" placeholder="e.g. Excavator JD-320" />
        </div>
        <div class="form-group">
          <label>Equipment ID *</label>
          <input type="text" id="eq-serial" class="form-control" placeholder="e.g. EX-204" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Type / Category</label>
          <select id="eq-type" class="form-control">
            <option>Heavy Machinery</option>
            <option>Light Vehicle</option>
            <option>Lifting Equipment</option>
            <option>Power Tools</option>
            <option>Compaction</option>
            <option>Concrete</option>
            <option>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="eq-status" class="form-control">
            <option value="Active">Active</option>
            <option value="Idle">Idle</option>
            <option value="Maintenance">Under Maintenance</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Assigned Site</label>
          <select id="eq-site" class="form-control">
            <option value="">-- Select Site --</option>
            ${siteOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Operator</label>
          <input type="text" id="eq-operator" class="form-control" placeholder="Operator name" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Purchase Date</label>
          <input type="date" id="eq-purchase-date" class="form-control" />
        </div>
        <div class="form-group">
          <label>Manufacturer</label>
          <input type="text" id="eq-manufacturer" class="form-control" placeholder="e.g. Caterpillar" />
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <input type="text" id="eq-notes" class="form-control" placeholder="Additional notes" />
      </div>
    `, `
      <button class="btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="save-eq-btn">Register Equipment</button>
    `);
    document.getElementById('save-eq-btn').addEventListener('click', async () => {
      const name = document.getElementById('eq-name').value.trim();
      const serial_id = document.getElementById('eq-serial').value.trim();
      if (!name || !serial_id) { showToast("Name and Equipment ID are required", "error"); return; }
      const res = await apiPost('/equipment', {
        name, serial_id,
        type: document.getElementById('eq-type').value,
        status: document.getElementById('eq-status').value,
        site: document.getElementById('eq-site').value,
        operator: document.getElementById('eq-operator').value,
        purchase_date: document.getElementById('eq-purchase-date').value,
        manufacturer: document.getElementById('eq-manufacturer').value,
        notes: document.getElementById('eq-notes').value
      });
      if (res && !res.error) { showToast("Equipment registered", "success"); closeModal(); this.loadData(); }
      else showToast(res?.error || "Failed to add equipment", "error");
    });
  },

  showMaintenanceModal() {
    const eqOptions = this.allEquipment.map(e => `<option value="${e._id}" data-name="${e.name}">${e.name} (${e.serial_id})</option>`).join('');
    openModal("Log Maintenance", `
      <div class="form-row">
        <div class="form-group">
          <label>Equipment *</label>
          <select id="maint-eq-select" class="form-control">${eqOptions}</select>
        </div>
        <div class="form-group">
          <label>Maintenance Type</label>
          <select id="maint-type" class="form-control">
            <option>Routine Service</option>
            <option>Oil Change</option>
            <option>Inspection</option>
            <option>Major Repair</option>
            <option>Parts Replacement</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cost (₹)</label>
          <input type="number" id="maint-cost" class="form-control" placeholder="e.g. 15000" />
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="maint-status" class="form-control">
            <option value="Completed">Completed</option>
            <option value="In Progress">In Progress</option>
            <option value="Scheduled">Scheduled</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Service Date</label>
          <input type="date" id="maint-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-group">
          <label>Next Service Date</label>
          <input type="date" id="maint-next-date" class="form-control" />
        </div>
      </div>
      <div class="form-group">
        <label>Description *</label>
        <textarea id="maint-desc" class="form-control" rows="3" placeholder="Describe maintenance work performed..."></textarea>
      </div>
    `, `
      <button class="btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="save-maint-btn">Log Maintenance</button>
    `);
    document.getElementById('save-maint-btn').addEventListener('click', async () => {
      const sel = document.getElementById('maint-eq-select');
      const eq_id = sel.value;
      const eq_name = sel.options[sel.selectedIndex]?.dataset.name || '';
      const desc = document.getElementById('maint-desc').value.trim();
      if (!desc) { showToast("Description is required", "error"); return; }
      const res = await apiPost('/equipment/maintenance', {
        equipment_id: eq_id, equipment_name: eq_name,
        type: document.getElementById('maint-type').value,
        cost: parseFloat(document.getElementById('maint-cost').value || 0),
        status: document.getElementById('maint-status').value,
        service_date: document.getElementById('maint-date').value,
        next_service_date: document.getElementById('maint-next-date').value,
        description: desc,
        maint_status: document.getElementById('maint-status').value
      });
      if (res && !res.error) { showToast("Maintenance logged", "success"); closeModal(); this.loadData(); }
      else showToast("Failed to log maintenance", "error");
    });
  },

  showFuelModal() {
    const eqOptions = this.allEquipment.map(e => `<option value="${e._id}" data-name="${e.name}">${e.name} (${e.serial_id})</option>`).join('');
    openModal("Log Fuel Usage", `
      <div class="form-row">
        <div class="form-group">
          <label>Equipment *</label>
          <select id="fuel-eq-select" class="form-control">${eqOptions}</select>
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="fuel-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Liters *</label>
          <input type="number" id="fuel-liters" class="form-control" placeholder="e.g. 42" step="0.1" />
        </div>
        <div class="form-group">
          <label>Cost per Liter (₹)</label>
          <input type="number" id="fuel-price" class="form-control" placeholder="e.g. 95" step="0.01" oninput="EquipmentPage.calcFuelCost()" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Total Cost (₹)</label>
          <input type="number" id="fuel-cost" class="form-control" placeholder="Auto-calculated" />
        </div>
        <div class="form-group">
          <label>Site</label>
          <select id="fuel-site" class="form-control">
            <option value="">-- Site --</option>
            ${this.sites.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
        </div>
      </div>
    `, `
      <button class="btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="save-fuel-btn">Log Fuel</button>
    `);
    document.getElementById('save-fuel-btn').addEventListener('click', async () => {
      const sel = document.getElementById('fuel-eq-select');
      const liters = parseFloat(document.getElementById('fuel-liters').value || 0);
      if (!liters) { showToast("Liters is required", "error"); return; }
      const res = await apiPost('/equipment/fuel', {
        equipment_id: sel.value,
        equipment_name: sel.options[sel.selectedIndex]?.dataset.name || '',
        liters, cost: parseFloat(document.getElementById('fuel-cost').value || 0),
        price_per_liter: parseFloat(document.getElementById('fuel-price').value || 0),
        date: document.getElementById('fuel-date').value,
        site: document.getElementById('fuel-site').value
      });
      if (res && !res.error) { showToast("Fuel logged", "success"); closeModal(); this.loadData(); }
      else showToast("Failed to log fuel", "error");
    });
  },

  calcFuelCost() {
    const liters = parseFloat(document.getElementById('fuel-liters')?.value || 0);
    const price = parseFloat(document.getElementById('fuel-price')?.value || 0);
    if (liters && price) document.getElementById('fuel-cost').value = (liters * price).toFixed(2);
  },

  showBreakdownModal() {
    const eqOptions = this.allEquipment.map(e => `<option value="${e._id}" data-name="${e.name}">${e.name} (${e.serial_id})</option>`).join('');
    openModal("Report Breakdown", `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin-bottom:16px;display:flex;gap:10px;align-items:center;">
        <span style="font-size:24px;">⚠️</span>
        <p style="margin:0;color:#dc2626;font-size:13px;">Reporting a breakdown will immediately change equipment status to <strong>Breakdown</strong></p>
      </div>
      <div class="form-group">
        <label>Equipment *</label>
        <select id="breakdown-eq-select" class="form-control">${eqOptions}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Issue Description *</label>
          <textarea id="breakdown-issue" class="form-control" rows="3" placeholder="Describe the issue in detail..."></textarea>
        </div>
        <div class="form-group">
          <label>Severity</label>
          <select id="breakdown-severity" class="form-control">
            <option value="Low">Low</option>
            <option value="Medium" selected>Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
      </div>
    `, `
      <button class="btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" id="save-breakdown-btn">Report Breakdown</button>
    `);
    document.getElementById('save-breakdown-btn').addEventListener('click', async () => {
      const sel = document.getElementById('breakdown-eq-select');
      const issue = document.getElementById('breakdown-issue').value.trim();
      if (!issue) { showToast("Issue description is required", "error"); return; }
      const res = await apiPost(`/equipment/${sel.value}/breakdown`, {
        equipment_name: sel.options[sel.selectedIndex]?.dataset.name || '',
        issue, severity: document.getElementById('breakdown-severity').value
      });
      if (res && !res.error) { showToast("Breakdown reported — equipment status changed", "warning"); closeModal(); this.loadData(); }
      else showToast("Failed to report breakdown", "error");
    });
  },

  applyEquipmentFilters() {
    const status = document.getElementById('eq-status-filter')?.value || '';
    const site = document.getElementById('eq-site-filter')?.value || '';
    const filtered = this.allEquipment.filter(e => {
      return (!status || e.status === status) && (!site || e.site === site);
    });
    this.renderInventoryTable(filtered);
  },

  async loadData() {
    try {
      // Stats
      const statsRes = await apiGet('/equipment/stats');
      if (statsRes && !statsRes.error) {
        document.getElementById('eq-active').textContent = statsRes.active_equipment || 0;
        document.getElementById('eq-maintenance').textContent = statsRes.under_maintenance || 0;
        document.getElementById('eq-breakdowns').textContent = statsRes.breakdowns || 0;
        document.getElementById('eq-fuel-cost').textContent = `₹${(statsRes.monthly_fuel_cost || 0).toLocaleString('en-IN')}`;
        const idleEl = document.getElementById('eq-idle');
        if (idleEl) idleEl.textContent = statsRes.idle_equipment || 0;
      }

      // Populate site filter
      const siteFilter = document.getElementById('eq-site-filter');
      if (siteFilter && this.sites.length && siteFilter.options.length <= 1) {
        this.sites.forEach(s => {
          const o = document.createElement('option');
          o.value = s.name; o.textContent = s.name;
          siteFilter.appendChild(o);
        });
      }

      // Inventory
      const eqRes = await apiGet('/equipment');
      if (eqRes && !eqRes.error) {
        this.allEquipment = Array.isArray(eqRes) ? eqRes : [];
        this.renderInventoryTable(this.allEquipment);
      }

      // Maintenance logs
      const mainRes = await apiGet('/equipment/maintenance');
      const mainBody = document.getElementById('eq-maintenance-body');
      if (mainBody && mainRes && Array.isArray(mainRes)) {
        mainBody.innerHTML = mainRes.length === 0
          ? `<tr><td colspan="7" class="loading-cell">No maintenance logs</td></tr>`
          : mainRes.map(m => {
              const statusMap = { 'Completed': 'bg-success text-white', 'In Progress': 'bg-warning text-dark', 'Scheduled': 'bg-info text-white' };
              const sc = statusMap[m.status] || 'bg-secondary text-white';
              return `<tr>
                <td>${fmtDate(m.created_at)}</td>
                <td>${m.equipment_name || '-'}</td>
                <td>${m.type || '-'}</td>
                <td>₹${(m.cost || 0).toLocaleString('en-IN')}</td>
                <td>${m.description || '-'}</td>
                <td>${fmtDate(m.next_service_date)}</td>
                <td><span class="status-badge ${sc}">${m.status || 'Completed'}</span></td>
              </tr>`;
          }).join('');
      }

      // Fuel logs
      const fuelRes = await apiGet('/equipment/fuel');
      const fuelBody = document.getElementById('eq-fuel-body');
      if (fuelBody && fuelRes && Array.isArray(fuelRes)) {
        const totalLiters = fuelRes.reduce((a, f) => a + parseFloat(f.liters || 0), 0);
        const totalCost = fuelRes.reduce((a, f) => a + parseFloat(f.cost || 0), 0);
        fuelBody.innerHTML = fuelRes.length === 0
          ? `<tr><td colspan="6" class="loading-cell">No fuel logs</td></tr>`
          : [
              ...fuelRes.map(f => `<tr>
                <td>${fmtDate(f.created_at)}</td>
                <td>${f.equipment_name || '-'}</td>
                <td>${f.site || '-'}</td>
                <td>${parseFloat(f.liters || 0).toFixed(1)} L</td>
                <td>₹${parseFloat(f.cost || 0).toLocaleString('en-IN')}</td>
                <td>${f.logged_by || '-'}</td>
              </tr>`),
              `<tr style="font-weight:700;background:var(--card-bg)">
                <td colspan="3">TOTAL</td>
                <td>${totalLiters.toFixed(1)} L</td>
                <td>₹${totalCost.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>`
            ].join('');
      }

      // Breakdowns
      const breakdownRes = await apiGet('/equipment/breakdowns');
      const bdBody = document.getElementById('eq-breakdowns-body');
      if (bdBody && breakdownRes && Array.isArray(breakdownRes)) {
        bdBody.innerHTML = breakdownRes.length === 0
          ? `<tr><td colspan="5" class="loading-cell">No breakdowns reported</td></tr>`
          : breakdownRes.map(b => {
              const sevMap = { Critical: 'bg-danger text-white', High: 'bg-warning text-dark', Medium: 'bg-info text-white', Low: 'bg-secondary text-white' };
              return `<tr>
                <td>${fmtDate(b.created_at)}</td>
                <td>${b.equipment_name || '-'}</td>
                <td>${b.issue || '-'}</td>
                <td><span class="status-badge ${sevMap[b.severity] || 'bg-secondary text-white'}">${b.severity || '-'}</span></td>
                <td><span class="status-badge ${b.status === 'Open' ? 'bg-danger text-white' : 'bg-success text-white'}">${b.status || 'Open'}</span></td>
              </tr>`;
          }).join('');
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to load equipment data", "error");
    }
  },

  renderInventoryTable(equipment) {
    const eqBody = document.getElementById('eq-inventory-body');
    if (!eqBody) return;
    if (equipment.length === 0) {
      eqBody.innerHTML = `<tr><td colspan="8" class="loading-cell">No equipment found</td></tr>`;
      return;
    }
    const statusMap = { Active: 'status-badge bg-success text-white', Idle: 'status-badge', Maintenance: 'status-badge bg-warning text-dark', Breakdown: 'status-badge bg-danger text-white' };
    eqBody.innerHTML = equipment.map(eq => `
      <tr>
        <td><strong>${eq.serial_id || '-'}</strong></td>
        <td>
          <div style="font-weight:600">${eq.name || '-'}</div>
          <div style="font-size:11px;color:#6b7280;">${eq.type || 'General'} · ${eq.manufacturer || ''}</div>
        </td>
        <td>${eq.site || '—'}</td>
        <td>${eq.operator || '—'}</td>
        <td><span class="${statusMap[eq.status] || 'status-badge'}">${eq.status || 'Active'}</span></td>
        <td>${(eq.operating_hours || 0).toFixed(1)} hrs</td>
        <td>${eq.next_service_date ? `<span style="color:${new Date(eq.next_service_date) < new Date() ? '#ef4444' : '#f59e0b'}">${fmtDate(eq.next_service_date)}</span>` : '—'}</td>
        <td>
          <button class="btn-outline btn-sm" onclick="EquipmentPage.showAllocateModal('${eq._id}', '${eq.name}')">Assign</button>
          <button class="btn-danger btn-sm" onclick="EquipmentPage.showBreakdownForEq('${eq._id}', '${eq.name}')">⚠</button>
        </td>
      </tr>
    `).join('');
  },

  showAllocateModal(eq_id, eq_name) {
    const siteOptions = this.sites.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    openModal(`Allocate — ${eq_name}`, `
      <div class="form-row">
        <div class="form-group">
          <label>Assign to Site</label>
          <select id="alloc-site" class="form-control">${siteOptions}</select>
        </div>
        <div class="form-group">
          <label>Operator</label>
          <input type="text" id="alloc-operator" class="form-control" placeholder="Operator name" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>From Date</label>
          <input type="date" id="alloc-from" class="form-control" value="${new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-group">
          <label>To Date</label>
          <input type="date" id="alloc-to" class="form-control" />
        </div>
      </div>
    `, `
      <button class="btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="save-alloc-btn">Allocate</button>
    `);
    document.getElementById('save-alloc-btn').addEventListener('click', async () => {
      const res = await apiPost(`/equipment/${eq_id}/allocate`, {
        site: document.getElementById('alloc-site').value,
        operator: document.getElementById('alloc-operator').value,
        from_date: document.getElementById('alloc-from').value,
        to_date: document.getElementById('alloc-to').value
      });
      if (res && !res.error) { showToast("Equipment allocated", "success"); closeModal(); this.loadData(); }
      else showToast("Failed to allocate", "error");
    });
  },

  showBreakdownForEq(eq_id, eq_name) {
    openModal("Report Breakdown", `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin-bottom:16px;display:flex;gap:10px;align-items:center;">
        <span style="font-size:24px;">&#9888;&#65039;</span>
        <p style="margin:0;color:#dc2626;font-size:13px;">Reporting a breakdown will immediately change equipment status to <strong>Breakdown</strong></p>
      </div>
      <div class="form-group">
        <label>Equipment</label>
        <input type="text" class="form-control" value="${eq_name}" readonly />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Issue Description *</label>
          <textarea id="breakdown-issue" class="form-control" rows="3" placeholder="Describe the issue in detail..."></textarea>
        </div>
        <div class="form-group">
          <label>Severity</label>
          <select id="breakdown-severity" class="form-control">
            <option value="Low">Low</option>
            <option value="Medium" selected>Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
      </div>
    `, `
      <button class="btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" id="save-breakdown-btn">Report Breakdown</button>
    `);
    document.getElementById('save-breakdown-btn').addEventListener('click', async () => {
      const issue = document.getElementById('breakdown-issue').value.trim();
      if (!issue) { showToast("Issue description is required", "error"); return; }
      const res = await apiPost(`/equipment/${eq_id}/breakdown`, {
        equipment_name: eq_name,
        issue,
        severity: document.getElementById('breakdown-severity').value
      });
      if (res && !res.error) { showToast("Breakdown reported — equipment status changed", "warning"); closeModal(); this.loadData(); }
      else showToast("Failed to report breakdown", "error");
    });
  }
};

