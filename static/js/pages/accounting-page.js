(function() {
  const accountingPage = {
    currentSiteId: null,

    init: function() {
      this.bindEvents();
      this.loadSites();
    },

    bindEvents: function() {
      // Tab switching in detail view
      document.querySelectorAll('[data-acc-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tab = e.target.getAttribute('data-acc-tab');
          this.switchTab(tab);
        });
      });

      // Back button
      document.getElementById('acc-back-btn')?.addEventListener('click', () => {
        this.currentSiteId = null;
        document.getElementById('accounting-detail-view').style.display = 'none';
        document.getElementById('accounting-sites-view').style.display = 'block';
        this.loadSites();
      });

      // Add credit button
      document.getElementById('add-credit-btn')?.addEventListener('click', () => {
        if (!this.currentSiteId) return;
        this.showAddCreditModal();
      });

      // Export buttons
      document.getElementById('acc-export-pdf-btn')?.addEventListener('click', () => {
        window.print();
      });

      document.getElementById('acc-export-excel-btn')?.addEventListener('click', () => {
        if (!this.currentLedger || this.currentLedger.length === 0) {
          showToast('No ledger transactions to export', 'error');
          return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Date,Type,Amount,Category,Description,Created By,Balance\n";

        this.currentLedger.forEach(t => {
          const type = (t.type || '').toUpperCase();
          const amount = t.amount || 0;
          const desc = `"${(t.description || '').replace(/"/g, '""')}"`;
          const balance = t.running_balance || 0;
          
          let row = `${fmtDate(t.created_at)},${type},${amount},${t.category || 'Misc'},${desc},${t.created_by || 'system'},${balance}`;
          csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `ledger_${(this.currentSiteName || 'Site').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    },

    switchTab: function(tab) {
      document.querySelectorAll('[data-acc-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-acc-tab') === tab);
      });

      document.querySelectorAll('.acc-sub-view').forEach(view => {
        view.style.display = view.id === `acc-tab-${tab}` ? 'block' : 'none';
      });
    },

    loadSites: async function() {
      const tbody = document.getElementById('acc-sites-body');
      if (!tbody) return;
      
      tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">Loading sites...</td></tr>';
      
      try {
        const sites = await apiGet('/accounting/sites');
        if (!sites || sites.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No sites found</td></tr>';
          return;
        }

        tbody.innerHTML = sites.map(site => `
          <tr>
            <td><strong>${site.name}</strong></td>
            <td><strong>₹${(site.account?.current_balance || 0).toLocaleString()}</strong></td>
            <td>
              ${site.pending_requests > 0 
                ? `<span class="badge" style="background:var(--warning);">${site.pending_requests} Pending</span>` 
                : `<span class="text-success">0 Pending</span>`}
            </td>
            <td>
              <button class="btn-sm btn-primary" onclick="window.pages.accounting.openSiteDetail('${site._id}', '${site.name.replace(/'/g, "\\'")}')">
                View Ledger
              </button>
            </td>
          </tr>
        `).join('');
      } catch (err) {
        showToast('Failed to load accounting sites', 'error');
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="4" class="loading-cell text-danger">Error loading data</td></tr>';
      }
    },

    openSiteDetail: async function(siteId, siteName) {
      this.currentSiteId = siteId;
      this.currentSiteName = siteName;
      
      document.getElementById('accounting-sites-view').style.display = 'none';
      document.getElementById('accounting-detail-view').style.display = 'block';
      document.getElementById('acc-detail-title').textContent = `${siteName} Ledger`;
      
      this.switchTab('ledger'); // default tab
      await this.loadSiteData();
    },

    loadSiteData: async function() {
      if (!this.currentSiteId) return;
      
      try {
        // Load Balance
        const balance = await apiGet(`/accounting/balance/${this.currentSiteId}`);
        document.getElementById('det-current-balance').textContent = `₹${(balance.current_balance || 0).toLocaleString()}`;
        document.getElementById('det-total-credits').textContent = `₹${(balance.total_credit || 0).toLocaleString()}`;
        document.getElementById('det-total-debits').textContent = `₹${(balance.total_debit || 0).toLocaleString()}`;

        // Load Ledger
        const ledger = await apiGet(`/accounting/ledger/${this.currentSiteId}`);
        this.currentLedger = ledger;
        this.renderLedger(ledger);
        
        // Filter out credits and debits from ledger array for other tabs
        const credits = ledger.filter(t => t.type === 'credit');
        const debits = ledger.filter(t => t.type === 'debit');
        this.renderCredits(credits);
        this.renderDebits(debits);

        // Load Requests
        const requests = await apiGet(`/accounting/requests/${this.currentSiteId}`);
        this.renderRequests(requests);
        
        // Update badge
        const pendingCount = requests.filter(r => r.status === 'pending').length;
        const badge = document.getElementById('det-req-badge');
        if (badge) {
          badge.textContent = pendingCount;
          badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        }
        
      } catch (err) {
        showToast('Failed to load site data', 'error');
        console.error(err);
      }
    },

    renderLedger: function(ledger) {
      const tbody = document.getElementById('acc-ledger-body');
      if (ledger.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">No transactions found</td></tr>';
        return;
      }
      
      tbody.innerHTML = ledger.map(t => {
        const isCredit = t.type === 'credit';
        const receiptHtml = t.receipt_url ? `<a href="${t.receipt_url}" target="_blank" class="btn-sm btn-outline">View</a>` : '-';
        return `
          <tr>
            <td>${fmtDate(t.created_at)}</td>
            <td><span class="status-badge ${isCredit ? 'approved' : 'rejected'}">${t.type.toUpperCase()}</span></td>
            <td class="${isCredit ? 'text-success' : 'text-danger'}"><strong>${isCredit ? '+' : '-'}₹${t.amount.toLocaleString()}</strong></td>
            <td><span class="category-tag">${t.category || 'Misc'}</span></td>
            <td>${t.description || '-'}</td>
            <td><span class="text-sm text-sub">${t.created_by || 'system'}</span></td>
            <td>${receiptHtml}</td>
            <td><strong>₹${(t.running_balance || 0).toLocaleString()}</strong></td>
          </tr>
        `;
      }).join('');
    },

    renderCredits: function(credits) {
      const tbody = document.getElementById('acc-credits-body');
      if (credits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No credits found</td></tr>';
        return;
      }
      
      tbody.innerHTML = credits.map(t => `
        <tr>
          <td>${fmtDate(t.created_at)}</td>
          <td class="text-success"><strong>+₹${t.amount.toLocaleString()}</strong></td>
          <td>${t.description || '-'}</td>
          <td><span class="text-sm text-sub">${t.created_by || 'system'}</span></td>
        </tr>
      `).join('');
    },

    renderDebits: function(debits) {
      const tbody = document.getElementById('acc-debits-body');
      if (debits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No debits found</td></tr>';
        return;
      }
      
      tbody.innerHTML = debits.map(t => {
        const receiptHtml = t.receipt_url ? `<a href="${t.receipt_url}" target="_blank" class="btn-sm btn-outline">View</a>` : '-';
        return `
        <tr>
          <td>${fmtDate(t.created_at)}</td>
          <td class="text-danger"><strong>-₹${t.amount.toLocaleString()}</strong></td>
          <td><span class="category-tag">${t.category || 'Misc'}</span></td>
          <td>${t.description || '-'}</td>
          <td><span class="text-sm text-sub">${t.created_by || 'supervisor'}</span></td>
          <td>${receiptHtml}</td>
        </tr>
      `}).join('');
    },

    renderRequests: function(requests) {
      const tbody = document.getElementById('acc-requests-body');
      if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No requests found</td></tr>';
        return;
      }
      
      tbody.innerHTML = requests.map(r => `
        <tr>
          <td>${fmtDate(r.created_at)}</td>
          <td><strong>₹${r.requested_amount.toLocaleString()}</strong></td>
          <td>${r.description || '-'}</td>
          <td><span class="status-badge ${r.status}">${r.status.toUpperCase()}</span></td>
          <td>
            ${r.status === 'pending' ? `
              <div class="action-btns">
                <button class="btn-sm btn-primary" onclick="window.pages.accounting.updateRequest('${r._id}', 'approve')">Approve</button>
                <button class="btn-sm btn-outline" style="color:var(--danger); border-color:var(--danger);" onclick="window.pages.accounting.updateRequest('${r._id}', 'reject')">Reject</button>
              </div>
            ` : '-'}
          </td>
        </tr>
      `).join('');
    },

    updateRequest: function(id, action) {
      confirmAction(`${action === 'approve' ? 'Approve' : 'Reject'} Request`, `Are you sure you want to ${action} this fund request?`, async () => {
        try {
          await apiPut(`/accounting/requests/${id}/${action}`);
          showToast(`Request ${action}d successfully`);
          this.loadSiteData();
        } catch (err) {
          showToast(`Failed to update request: ${err.message}`, 'error');
        }
      });
    },

    showAddCreditModal: function() {
      const html = `
        <div class="form-group">
          <label>Amount (₹)</label>
          <input type="number" id="new-credit-amount" class="form-control" placeholder="e.g. 50000" min="1" />
        </div>
        <div class="form-group">
          <label>Description/Note</label>
          <textarea id="new-credit-desc" class="form-control" placeholder="Purpose of this credit..."></textarea>
        </div>
      `;
      
      const footerHtml = `
        <button class="btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" onclick="window.pages.accounting.submitCredit()">Submit Credit</button>
      `;
      
      openModal('Add Credit to Site', html, footerHtml);
    },

    submitCredit: async function() {
      const amountStr = document.getElementById('new-credit-amount').value;
      const desc = document.getElementById('new-credit-desc').value;
      
      const amount = parseFloat(amountStr);
      if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
      }
      
      try {
        await apiPost('/accounting/credits', {
          site_id: this.currentSiteId,
          amount: amount,
          description: desc
        });
        showToast('Credit added successfully');
        closeModal();
        this.loadSiteData();
      } catch (err) {
        showToast(`Failed to add credit: ${err.message}`, 'error');
      }
    }
  };

  window.pages = window.pages || {};
  window.pages.accounting = accountingPage;
})();
