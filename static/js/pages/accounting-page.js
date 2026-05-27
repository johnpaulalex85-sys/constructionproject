// ============================================================
//  FULL ACCOUNTING MANAGEMENT — Admin Dashboard
//  Tabs: Overview | Materials Cost | Equipment Costs | Site Ledger
// ============================================================
(function () {
  const INR = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const NUM = (v, d = 1) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

  // ── Chart instances ────────────────────────────────────────────────────────
  let spendChart = null;
  let siteChart  = null;

  // ── Cached data ───────────────────────────────────────────────────────────
  let overviewData   = null;
  let materialsData  = null;
  let fuelData       = null;
  let maintData      = null;

  const accountingPage = {
    currentSiteId:   null,
    currentSiteName: null,
    currentLedger:   [],

    init() {
      this._bindTopTabs();
      this._bindEqCostTabs();
      this._bindLedgerEvents();
      this._bindSearchAndExport();
      document.getElementById('acc-refresh-btn')?.addEventListener('click', () => this.loadAll());
      this.loadAll();
    },

    // ── Load everything ──────────────────────────────────────────────────────
    async loadAll() {
      await Promise.all([
        this._loadOverview(),
        this._loadMaterialsCost(),
        this._loadEquipmentCosts(),
        this._loadSitesList(),
      ]);
    },

    // ════════════════════════════════════════════════════════════════════════
    // TOP-LEVEL TAB SWITCHING
    // ════════════════════════════════════════════════════════════════════════
    _bindTopTabs() {
      document.querySelectorAll('[data-acc-main]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('[data-acc-main]').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          document.querySelectorAll('.acc-main-view').forEach(v => v.style.display = 'none');
          const tab = e.currentTarget.dataset.accMain;
          const el = document.getElementById(`acc-view-${tab}`);
          if (el) el.style.display = 'block';
        });
      });
    },

    _bindEqCostTabs() {
      document.querySelectorAll('[data-eq-cost-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('[data-eq-cost-tab]').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          const tab = e.currentTarget.dataset.eqCostTab;
          document.getElementById('eq-cost-tab-fuel').style.display        = tab === 'fuel'        ? 'block' : 'none';
          document.getElementById('eq-cost-tab-maintenance').style.display = tab === 'maintenance' ? 'block' : 'none';
        });
      });
    },

    // ════════════════════════════════════════════════════════════════════════
    // TAB 1 — OVERVIEW
    // ════════════════════════════════════════════════════════════════════════
    async _loadOverview() {
      try {
        const d = await apiGet('/accounting/overview');
        overviewData = d;

        // ── Cash KPIs ────────────────────────────────────────────────────────
        document.getElementById('ov-cash-credit').textContent  = INR(d.cash.total_credit);
        document.getElementById('ov-cash-debit').textContent   = INR(d.cash.total_debit);
        document.getElementById('ov-cash-balance').textContent = INR(d.cash.total_balance);

        // ── Materials KPIs ───────────────────────────────────────────────────
        document.getElementById('ov-mat-total').textContent     = INR(d.materials.total_value);
        document.getElementById('ov-mat-used').textContent      = INR(d.materials.used_cost);
        document.getElementById('ov-mat-remaining').textContent = INR(d.materials.remaining_value);

        // ── Equipment KPIs ───────────────────────────────────────────────────
        document.getElementById('ov-eq-fuel').textContent         = INR(d.equipment.total_fuel_cost);
        document.getElementById('ov-eq-fuel-liters').textContent  = `${NUM(d.equipment.total_fuel_liters)} L total`;
        document.getElementById('ov-eq-maint').textContent        = INR(d.equipment.total_maint_cost);
        document.getElementById('ov-eq-monthly-fuel').textContent = INR(d.equipment.monthly_fuel_cost);

        // ── Charts ───────────────────────────────────────────────────────────
        this._renderSpendChart(d);
        this._renderSiteChart(d.sites);

        // ── Per-site table ───────────────────────────────────────────────────
        const tbody = document.getElementById('ov-site-table-body');
        if (!d.sites || d.sites.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No sites found</td></tr>`;
          return;
        }
        tbody.innerHTML = d.sites.map(s => `
          <tr>
            <td><strong>${s.site_name}</strong></td>
            <td class="${s.cash_balance >= 0 ? 'text-success' : 'text-danger'}">${INR(s.cash_balance)}</td>
            <td>${INR(s.material_cost)}</td>
            <td>${INR(s.equipment_fuel)}</td>
            <td>${INR(s.equipment_maint)}</td>
            <td><strong>${INR(s.total_spend)}</strong></td>
            <td>
              <button class="btn-sm btn-primary" onclick="window.pages.accounting.openSiteDetail('${s.site_id}', '${s.site_name.replace(/'/g, "\\'")}')">View Ledger</button>
            </td>
          </tr>
        `).join('');

      } catch (err) {
        console.error('Overview load error:', err);
        showToast('Failed to load financial overview', 'error');
      }
    },

    _renderSpendChart(d) {
      const ctx = document.getElementById('acc-spend-chart');
      if (!ctx) return;
      if (spendChart) spendChart.destroy();

      const cashDebit  = d.cash.total_debit        || 0;
      const matUsed    = d.materials.used_cost      || 0;
      const fuel       = d.equipment.total_fuel_cost || 0;
      const maint      = d.equipment.total_maint_cost || 0;

      spendChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Cash Debits', 'Material Used', 'Fuel', 'Maintenance'],
          datasets: [{
            data: [cashDebit, matUsed, fuel, maint],
            backgroundColor: ['#ef4444', '#8b5cf6', '#f59e0b', '#ec4899'],
            borderWidth: 2,
            borderColor: '#fff',
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${INR(ctx.parsed)}`
              }
            }
          }
        }
      });
    },

    _renderSiteChart(sites) {
      const ctx = document.getElementById('acc-site-chart');
      if (!ctx || !sites || sites.length === 0) return;
      if (siteChart) siteChart.destroy();

      siteChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: sites.map(s => s.site_name),
          datasets: [
            {
              label: 'Material Cost',
              data: sites.map(s => s.material_cost),
              backgroundColor: '#8b5cf6',
              borderRadius: 4,
            },
            {
              label: 'Fuel Cost',
              data: sites.map(s => s.equipment_fuel),
              backgroundColor: '#f59e0b',
              borderRadius: 4,
            },
            {
              label: 'Maintenance',
              data: sites.map(s => s.equipment_maint),
              backgroundColor: '#ec4899',
              borderRadius: 4,
            },
          ]
        },
        options: {
          responsive: true,
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
              stacked: true,
              ticks: {
                callback: v => `₹${Number(v).toLocaleString('en-IN')}`
              }
            }
          },
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${INR(ctx.parsed.y)}`
              }
            }
          }
        }
      });
    },

    // ════════════════════════════════════════════════════════════════════════
    // TAB 2 — MATERIALS COST
    // ════════════════════════════════════════════════════════════════════════
    async _loadMaterialsCost() {
      try {
        const mats = await apiGet('/materials');
        materialsData = mats;
        this._renderMaterialsCost(mats);
      } catch (err) {
        console.error('Materials cost error:', err);
        document.getElementById('mat-cost-body').innerHTML = `<tr><td colspan="12" class="loading-cell text-danger">Failed to load</td></tr>`;
      }
    },

    _renderMaterialsCost(mats) {
      const tbody = document.getElementById('mat-cost-body');
      const tfoot = document.getElementById('mat-cost-foot');

      if (!mats || mats.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="loading-cell">No materials found</td></tr>`;
        return;
      }

      let totValue = 0, totAllocCost = 0, totUsedCost = 0, totRemCost = 0;

      tbody.innerHTML = mats.map(m => {
        const cpu       = parseFloat(m.cost_per_unit || 0);
        const total_qty = parseFloat(m.total_quantity || 0);
        const alloc_qty = parseFloat(m.allocated_quantity || 0);
        const used_qty  = parseFloat(m.total_used || 0);
        const rem_qty   = parseFloat(m.available_quantity || 0);

        const total_val  = cpu * total_qty;
        const alloc_cost = cpu * alloc_qty;
        const used_cost  = cpu * used_qty;
        const rem_cost   = cpu * rem_qty;

        totValue    += total_val;
        totAllocCost += alloc_cost;
        totUsedCost += used_cost;
        totRemCost  += rem_cost;

        const health   = m.health || {};
        const hStatus  = health.status || 'good';
        const hColor   = hStatus === 'critical' ? '#ef4444' : hStatus === 'warning' ? '#f59e0b' : '#22c55e';
        const pct      = Math.round((health.ratio || 0) * 100);

        return `
          <tr>
            <td><strong>${m.name || '-'}</strong></td>
            <td>${m.unit || '-'}</td>
            <td>${INR(cpu)}</td>
            <td>${NUM(total_qty)}</td>
            <td>${INR(total_val)}</td>
            <td>${NUM(alloc_qty)}</td>
            <td>${INR(alloc_cost)}</td>
            <td>${NUM(used_qty)}</td>
            <td class="text-danger">${INR(used_cost)}</td>
            <td>${NUM(rem_qty)}</td>
            <td class="text-success">${INR(rem_cost)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:6px;min-width:80px;">
                <div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
                  <div style="width:${pct}%;height:100%;background:${hColor};border-radius:3px;"></div>
                </div>
                <span style="font-size:10px;color:${hColor};font-weight:700;">${pct}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Totals row
      document.getElementById('mct-total-value').textContent = INR(totValue);
      document.getElementById('mct-alloc-cost').textContent  = INR(totAllocCost);
      document.getElementById('mct-used-cost').textContent   = INR(totUsedCost);
      document.getElementById('mct-remaining').textContent   = INR(totRemCost);
      tfoot.style.display = '';

      // KPI cards
      document.getElementById('mc-total-value').textContent    = INR(totValue);
      document.getElementById('mc-alloc-value').textContent    = INR(totAllocCost);
      document.getElementById('mc-used-value').textContent     = INR(totUsedCost);
      document.getElementById('mc-remaining-value').textContent = INR(totRemCost);
    },

    // ════════════════════════════════════════════════════════════════════════
    // TAB 3 — EQUIPMENT COSTS
    // ════════════════════════════════════════════════════════════════════════
    async _loadEquipmentCosts() {
      try {
        const [fuel, maint] = await Promise.all([
          apiGet('/equipment/fuel'),
          apiGet('/equipment/maintenance'),
        ]);
        fuelData  = Array.isArray(fuel)  ? fuel  : [];
        maintData = Array.isArray(maint) ? maint : [];

        this._renderFuelLogs(fuelData);
        this._renderMaintLogs(maintData);

        // KPI cards
        const fuelTotal  = fuelData.reduce((s, f)  => s + parseFloat(f.cost  || 0), 0);
        const maintTotal = maintData.reduce((s, m)  => s + parseFloat(m.cost  || 0), 0);
        const fuelLiters = fuelData.reduce((s, f)  => s + parseFloat(f.liters || 0), 0);

        document.getElementById('eq-kpi-fuel').textContent   = INR(fuelTotal);
        document.getElementById('eq-kpi-maint').textContent  = INR(maintTotal);
        document.getElementById('eq-kpi-liters').textContent = `${NUM(fuelLiters)} L`;
        document.getElementById('eq-kpi-total').textContent  = INR(fuelTotal + maintTotal);

      } catch (err) {
        console.error('Equipment cost error:', err);
        showToast('Failed to load equipment costs', 'error');
      }
    },

    _renderFuelLogs(fuel) {
      const tbody = document.getElementById('eq-fuel-body');
      const tfoot = document.getElementById('eq-fuel-foot');
      if (!fuel || fuel.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No fuel logs found</td></tr>`;
        tfoot.style.display = 'none';
        return;
      }
      let totLiters = 0, totCost = 0;
      tbody.innerHTML = fuel.map(f => {
        const liters = parseFloat(f.liters || 0);
        const cost   = parseFloat(f.cost   || 0);
        const cpl    = parseFloat(f.price_per_liter || 0);
        totLiters += liters; totCost += cost;
        return `
          <tr>
            <td>${fmtDate(f.created_at)}</td>
            <td>${f.equipment_name || '-'}</td>
            <td>${f.site || '-'}</td>
            <td>${NUM(liters)} L</td>
            <td>${cpl > 0 ? INR(cpl) : '-'}</td>
            <td class="text-danger"><strong>${INR(cost)}</strong></td>
            <td><span class="text-sm text-sub">${f.logged_by || 'supervisor'}</span></td>
          </tr>
        `;
      }).join('');
      document.getElementById('eq-fuel-total-liters').textContent = `${NUM(totLiters)} L`;
      document.getElementById('eq-fuel-total-cost').textContent   = INR(totCost);
      tfoot.style.display = '';
    },

    _renderMaintLogs(maint) {
      const tbody = document.getElementById('eq-maint-body');
      const tfoot = document.getElementById('eq-maint-foot');
      if (!maint || maint.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">No maintenance logs found</td></tr>`;
        tfoot.style.display = 'none';
        return;
      }
      let totCost = 0;
      const statusMap = { Completed: 'approved', 'In Progress': 'pending', Scheduled: 'pending' };
      tbody.innerHTML = maint.map(m => {
        const cost = parseFloat(m.cost || 0);
        totCost += cost;
        return `
          <tr>
            <td>${fmtDate(m.created_at)}</td>
            <td>${m.equipment_name || '-'}</td>
            <td>${m.type || '-'}</td>
            <td class="text-danger"><strong>${INR(cost)}</strong></td>
            <td>${m.description || '-'}</td>
            <td><span class="status-badge ${statusMap[m.status] || ''}">${m.status || '-'}</span></td>
          </tr>
        `;
      }).join('');
      document.getElementById('eq-maint-total-cost').textContent = INR(totCost);
      tfoot.style.display = '';
    },

    // ════════════════════════════════════════════════════════════════════════
    // TAB 4 — SITE LEDGER
    // ════════════════════════════════════════════════════════════════════════
    async _loadSitesList() {
      const tbody = document.getElementById('acc-sites-body');
      if (!tbody) return;
      tbody.innerHTML = `<tr><td colspan="4" class="loading-cell">Loading sites...</td></tr>`;
      try {
        const sites = await apiGet('/accounting/sites');
        if (!sites || sites.length === 0) {
          tbody.innerHTML = `<tr><td colspan="4" class="loading-cell">No sites found</td></tr>`;
          return;
        }
        tbody.innerHTML = sites.map(s => `
          <tr>
            <td><strong>${s.name}</strong></td>
            <td><strong>${INR(s.account?.current_balance)}</strong></td>
            <td>${s.pending_requests > 0 ? `<span class="badge" style="background:var(--warning);">${s.pending_requests} Pending</span>` : `<span class="text-success">0 Pending</span>`}</td>
            <td><button class="btn-sm btn-primary" onclick="window.pages.accounting.openSiteDetail('${s._id}', '${s.name.replace(/'/g, "\\'")}')">View Ledger</button></td>
          </tr>
        `).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="loading-cell text-danger">Error loading sites</td></tr>`;
      }
    },

    _bindLedgerEvents() {
      // Site sub-tabs
      document.querySelectorAll('[data-acc-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tab = e.currentTarget.getAttribute('data-acc-tab');
          document.querySelectorAll('[data-acc-tab]').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          document.querySelectorAll('.acc-sub-view').forEach(v => v.style.display = 'none');
          const el = document.getElementById(`acc-tab-${tab}`);
          if (el) el.style.display = 'block';
        });
      });

      // Back button
      document.getElementById('acc-back-btn')?.addEventListener('click', () => {
        this.currentSiteId = null;
        document.getElementById('accounting-detail-view').style.display = 'none';
        document.getElementById('accounting-sites-view').style.display  = 'block';
        this._loadSitesList();
      });

      // Add Credit
      document.getElementById('add-credit-btn')?.addEventListener('click', () => {
        if (!this.currentSiteId) return;
        this._showAddCreditModal();
      });

      // Export PDF / Excel
      document.getElementById('acc-export-pdf-btn')?.addEventListener('click', () => window.print());
      document.getElementById('acc-export-excel-btn')?.addEventListener('click', () => this._exportLedgerCSV());
    },

    async openSiteDetail(siteId, siteName) {
      this.currentSiteId   = siteId;
      this.currentSiteName = siteName;

      // Switch to Site Ledger main tab
      document.querySelectorAll('[data-acc-main]').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-acc-main="ledger"]')?.classList.add('active');
      document.querySelectorAll('.acc-main-view').forEach(v => v.style.display = 'none');
      document.getElementById('acc-view-ledger').style.display = 'block';

      document.getElementById('accounting-sites-view').style.display  = 'none';
      document.getElementById('accounting-detail-view').style.display = 'block';
      document.getElementById('acc-detail-title').textContent = `${siteName} — Ledger`;

      // Switch to first tab
      document.querySelectorAll('[data-acc-tab]').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-acc-tab="ledger"]')?.classList.add('active');
      document.querySelectorAll('.acc-sub-view').forEach(v => v.style.display = 'none');
      const ledgerTab = document.getElementById('acc-tab-ledger');
      if (ledgerTab) ledgerTab.style.display = 'block';

      await this._loadSiteData();
    },

    async _loadSiteData() {
      if (!this.currentSiteId) return;
      try {
        // Cash balance
        const balance = await apiGet(`/accounting/balance/${this.currentSiteId}`);
        document.getElementById('det-current-balance').textContent = INR(balance.current_balance);
        document.getElementById('det-total-credits').textContent   = INR(balance.total_credit);
        document.getElementById('det-total-debits').textContent    = INR(balance.total_debit);

        // Ledger
        const ledger = await apiGet(`/accounting/ledger/${this.currentSiteId}`);
        this.currentLedger = ledger;
        this._renderLedger(ledger);
        const credits = ledger.filter(t => t.type === 'credit');
        const debits  = ledger.filter(t => t.type === 'debit');
        this._renderCredits(credits);
        this._renderDebits(debits);

        // Requests
        const requests = await apiGet(`/accounting/requests/${this.currentSiteId}`);
        this._renderRequests(requests);
        const pending = requests.filter(r => r.status === 'pending').length;
        const badge = document.getElementById('det-req-badge');
        if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? 'inline-block' : 'none'; }

        // Site summary (material + equipment costs)
        const summary = await apiGet(`/accounting/site-summary/${this.currentSiteId}`);
        const matCost = summary.materials?.total_allocated_cost || 0;
        const eqCost  = (summary.equipment?.fuel_total || 0) + (summary.equipment?.maint_total || 0);
        document.getElementById('det-mat-cost').textContent = INR(matCost);
        document.getElementById('det-eq-cost').textContent  = INR(eqCost);
        this._renderSiteMatCosts(summary.materials?.rows || []);
        this._renderSiteEqCosts(summary.equipment || {});

      } catch (err) {
        console.error('Site data error:', err);
        showToast('Failed to load site data', 'error');
      }
    },

    _renderLedger(ledger) {
      const tbody = document.getElementById('acc-ledger-body');
      if (!ledger || ledger.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No transactions found</td></tr>`;
        return;
      }
      tbody.innerHTML = ledger.map(t => {
        const isCredit = t.type === 'credit';
        const receipt  = t.receipt_url ? `<a href="${t.receipt_url}" target="_blank" class="btn-sm btn-outline">View</a>` : '-';
        return `
          <tr>
            <td>${fmtDate(t.created_at)}</td>
            <td><span class="status-badge ${isCredit ? 'approved' : 'rejected'}">${t.type.toUpperCase()}</span></td>
            <td class="${isCredit ? 'text-success' : 'text-danger'}"><strong>${isCredit ? '+' : '-'}${INR(t.amount)}</strong></td>
            <td><span class="category-tag">${t.category || 'Misc'}</span></td>
            <td>${t.description || '-'}</td>
            <td><span class="text-sm text-sub">${t.created_by || 'system'}</span></td>
            <td>${receipt}</td>
            <td><strong>${INR(t.running_balance)}</strong></td>
          </tr>
        `;
      }).join('');
    },

    _renderCredits(credits) {
      const tbody = document.getElementById('acc-credits-body');
      tbody.innerHTML = credits.length === 0
        ? `<tr><td colspan="4" class="loading-cell">No credits found</td></tr>`
        : credits.map(t => `
          <tr>
            <td>${fmtDate(t.created_at)}</td>
            <td class="text-success"><strong>+${INR(t.amount)}</strong></td>
            <td>${t.description || '-'}</td>
            <td><span class="text-sm text-sub">${t.created_by || 'system'}</span></td>
          </tr>
        `).join('');
    },

    _renderDebits(debits) {
      const tbody = document.getElementById('acc-debits-body');
      tbody.innerHTML = debits.length === 0
        ? `<tr><td colspan="6" class="loading-cell">No debits found</td></tr>`
        : debits.map(t => {
          const receipt = t.receipt_url ? `<a href="${t.receipt_url}" target="_blank" class="btn-sm btn-outline">View</a>` : '-';
          return `
            <tr>
              <td>${fmtDate(t.created_at)}</td>
              <td class="text-danger"><strong>-${INR(t.amount)}</strong></td>
              <td><span class="category-tag">${t.category || 'Misc'}</span></td>
              <td>${t.description || '-'}</td>
              <td><span class="text-sm text-sub">${t.created_by || 'supervisor'}</span></td>
              <td>${receipt}</td>
            </tr>
          `;
        }).join('');
    },

    _renderRequests(requests) {
      const tbody = document.getElementById('acc-requests-body');
      tbody.innerHTML = requests.length === 0
        ? `<tr><td colspan="5" class="loading-cell">No requests found</td></tr>`
        : requests.map(r => `
          <tr>
            <td>${fmtDate(r.created_at)}</td>
            <td><strong>${INR(r.requested_amount)}</strong></td>
            <td>${r.description || '-'}</td>
            <td><span class="status-badge ${r.status}">${r.status.toUpperCase()}</span></td>
            <td>
              ${r.status === 'pending' ? `
                <div class="action-btns">
                  <button class="btn-sm btn-primary" onclick="window.pages.accounting.updateRequest('${r._id}', 'approve')">Approve</button>
                  <button class="btn-sm btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="window.pages.accounting.updateRequest('${r._id}', 'reject')">Reject</button>
                </div>
              ` : '-'}
            </td>
          </tr>
        `).join('');
    },

    _renderSiteMatCosts(rows) {
      const tbody = document.getElementById('site-mat-body');
      if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">No material allocations for this site</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td><strong>${r.material_name}</strong></td>
          <td>${r.unit}</td>
          <td>${INR(r.cost_per_unit)}</td>
          <td>${NUM(r.allocated_qty)}</td>
          <td>${INR(r.allocated_cost)}</td>
          <td>${NUM(r.used_qty)}</td>
          <td class="text-danger">${INR(r.used_cost)}</td>
          <td>${NUM(r.remaining_qty)}</td>
          <td class="text-success">${INR(r.remaining_cost)}</td>
        </tr>
      `).join('');
    },

    _renderSiteEqCosts(eq) {
      document.getElementById('site-eq-fuel-total').textContent  = INR(eq.fuel_total  || 0);
      document.getElementById('site-eq-maint-total').textContent = INR(eq.maint_total || 0);

      const fuelBody  = document.getElementById('site-fuel-body');
      const maintBody = document.getElementById('site-maint-body');

      const fuel  = eq.fuel_logs  || [];
      const maint = eq.maint_logs || [];

      fuelBody.innerHTML = fuel.length === 0
        ? `<tr><td colspan="5" class="loading-cell">No fuel logs for this site</td></tr>`
        : fuel.map(f => `
            <tr>
              <td>${fmtDate(f.created_at)}</td>
              <td>${f.equipment_name || '-'}</td>
              <td>${NUM(f.liters || 0)} L</td>
              <td class="text-danger">${INR(f.cost || 0)}</td>
              <td><span class="text-sm text-sub">${f.logged_by || '-'}</span></td>
            </tr>
          `).join('');

      maintBody.innerHTML = maint.length === 0
        ? `<tr><td colspan="5" class="loading-cell">No maintenance logs for this site</td></tr>`
        : maint.map(m => `
            <tr>
              <td>${fmtDate(m.created_at)}</td>
              <td>${m.equipment_name || '-'}</td>
              <td>${m.type || '-'}</td>
              <td class="text-danger">${INR(m.cost || 0)}</td>
              <td><span class="status-badge ${m.status === 'Completed' ? 'approved' : 'pending'}">${m.status || '-'}</span></td>
            </tr>
          `).join('');
    },

    updateRequest(id, action) {
      confirmAction(
        `${action === 'approve' ? 'Approve' : 'Reject'} Request`,
        `Are you sure you want to ${action} this fund request?`,
        async () => {
          try {
            await apiPut(`/accounting/requests/${id}/${action}`);
            showToast(`Request ${action}d successfully`);
            this._loadSiteData();
          } catch (err) {
            showToast(`Failed to update request: ${err.message}`, 'error');
          }
        }
      );
    },

    _showAddCreditModal() {
      openModal('Add Credit to Site', `
        <div class="form-group">
          <label>Amount (₹)</label>
          <input type="number" id="new-credit-amount" class="form-control" placeholder="e.g. 50000" min="1" />
        </div>
        <div class="form-group">
          <label>Description/Note</label>
          <textarea id="new-credit-desc" class="form-control" placeholder="Purpose of this credit..."></textarea>
        </div>
      `, `
        <button class="btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" onclick="window.pages.accounting.submitCredit()">Submit Credit</button>
      `);
    },

    async submitCredit() {
      const amount = parseFloat(document.getElementById('new-credit-amount').value);
      const desc   = document.getElementById('new-credit-desc').value;
      if (!amount || amount <= 0) { showToast('Please enter a valid amount', 'error'); return; }
      try {
        await apiPost('/accounting/credits', { site_id: this.currentSiteId, amount, description: desc });
        showToast('Credit added successfully');
        closeModal();
        this._loadSiteData();
        this._loadOverview();
      } catch (err) {
        showToast(`Failed to add credit: ${err.message}`, 'error');
      }
    },

    // ════════════════════════════════════════════════════════════════════════
    // SEARCH & EXPORT
    // ════════════════════════════════════════════════════════════════════════
    _bindSearchAndExport() {
      // Material search
      document.getElementById('mat-cost-search')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        if (!materialsData) return;
        const filtered = q ? materialsData.filter(m => (m.name || '').toLowerCase().includes(q)) : materialsData;
        this._renderMaterialsCost(filtered);
      });

      // Material CSV export
      document.getElementById('mat-cost-export-btn')?.addEventListener('click', () => {
        if (!materialsData) return;
        let csv = 'Material,Unit,Cost/Unit,Total Qty,Total Value,Allocated Qty,Allocated Cost,Used Qty,Used Cost,Remaining Qty,Remaining Value\n';
        materialsData.forEach(m => {
          const cpu = parseFloat(m.cost_per_unit || 0);
          csv += `"${m.name}",${m.unit},${cpu},${m.total_quantity},${(cpu * m.total_quantity).toFixed(2)},${m.allocated_quantity},${(cpu * m.allocated_quantity).toFixed(2)},${m.total_used},${(cpu * m.total_used).toFixed(2)},${m.available_quantity},${(cpu * m.available_quantity).toFixed(2)}\n`;
        });
        this._downloadCSV(csv, `materials_cost_${new Date().toISOString().split('T')[0]}.csv`);
      });

      // Fuel CSV export
      document.getElementById('eq-fuel-export-btn')?.addEventListener('click', () => {
        if (!fuelData) return;
        let csv = 'Date,Equipment,Site,Liters,Cost/L,Total Cost,Logged By\n';
        fuelData.forEach(f => {
          csv += `${fmtDate(f.created_at)},"${f.equipment_name || ''}","${f.site || ''}",${f.liters || 0},${f.price_per_liter || 0},${f.cost || 0},"${f.logged_by || ''}"\n`;
        });
        this._downloadCSV(csv, `fuel_logs_${new Date().toISOString().split('T')[0]}.csv`);
      });

      // Maintenance CSV export
      document.getElementById('eq-maint-export-btn')?.addEventListener('click', () => {
        if (!maintData) return;
        let csv = 'Date,Equipment,Type,Cost,Description,Status\n';
        maintData.forEach(m => {
          csv += `${fmtDate(m.created_at)},"${m.equipment_name || ''}","${m.type || ''}",${m.cost || 0},"${(m.description || '').replace(/"/g,'""')}","${m.status || ''}"\n`;
        });
        this._downloadCSV(csv, `maintenance_logs_${new Date().toISOString().split('T')[0]}.csv`);
      });

      // Global CSV export
      document.getElementById('acc-export-global-btn')?.addEventListener('click', () => {
        if (!overviewData) return;
        const d = overviewData;
        let csv = 'Category,Value\n';
        csv += `Cash Credits,${d.cash.total_credit}\nCash Debits,${d.cash.total_debit}\nCash Balance,${d.cash.total_balance}\n`;
        csv += `Material Total Value,${d.materials.total_value}\nMaterial Used Cost,${d.materials.used_cost}\nMaterial Remaining,${d.materials.remaining_value}\n`;
        csv += `Equipment Fuel Cost,${d.equipment.total_fuel_cost}\nEquipment Maintenance,${d.equipment.total_maint_cost}\n`;
        this._downloadCSV(csv, `financial_overview_${new Date().toISOString().split('T')[0]}.csv`);
      });
    },

    _exportLedgerCSV() {
      if (!this.currentLedger || this.currentLedger.length === 0) {
        showToast('No ledger transactions to export', 'error'); return;
      }
      let csv = 'Date,Type,Amount,Category,Description,Created By,Balance\n';
      this.currentLedger.forEach(t => {
        csv += `${fmtDate(t.created_at)},${t.type},${t.amount},"${t.category || ''}","${(t.description || '').replace(/"/g,'""')}","${t.created_by || ''}",${t.running_balance}\n`;
      });
      this._downloadCSV(csv, `ledger_${(this.currentSiteName || 'site').replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.csv`);
    },

    _downloadCSV(content, filename) {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURI(content);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
  };

  window.pages = window.pages || {};
  window.pages.accounting = accountingPage;
})();
