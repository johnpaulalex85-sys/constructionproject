const ProcurementPage = {
  initialized: false,

  init() {
    if (this.initialized) return;
    
    // Sub-view tabs
    document.querySelectorAll('[data-proc-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('[data-proc-tab]').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        document.querySelectorAll('.proc-sub-view').forEach(v => v.style.display = 'none');
        document.getElementById(`proc-tab-${e.target.dataset.procTab}`).style.display = 'block';
      });
    });

    document.getElementById('add-po-btn')?.addEventListener('click', () => {
      Utils.showModal("Create Purchase Order", `
          <div class="form-group">
              <label>Supplier Name</label>
              <input type="text" id="po-supplier" class="form-control" />
          </div>
          <div class="form-group">
              <label>Total Amount</label>
              <input type="number" id="po-amount" class="form-control" />
          </div>
      `, `
          <button class="btn-outline" onclick="Utils.closeModal()">Cancel</button>
          <button class="btn-primary" id="save-po-btn">Create</button>
      `);

      document.getElementById('save-po-btn').addEventListener('click', async () => {
          const supplier = document.getElementById('po-supplier').value;
          const amount = document.getElementById('po-amount').value;
          if(!supplier || !amount) {
              Utils.showToast("Please fill all fields", "error");
              return;
          }
          const res = await API.post('/procurement/orders', {
              supplier,
              total_amount: parseFloat(amount),
              status: "Pending"
          });
          if(res && !res.error) {
              Utils.showToast("PO Created", "success");
              Utils.closeModal();
              this.loadData();
          } else {
              Utils.showToast("Failed to create PO", "error");
          }
      });
    });

    document.getElementById('add-supplier-btn')?.addEventListener('click', () => {
      Utils.showModal("Add Supplier", `
          <div class="form-group">
              <label>Supplier Name</label>
              <input type="text" id="sup-name" class="form-control" />
          </div>
          <div class="form-group">
              <label>Contact Person</label>
              <input type="text" id="sup-contact" class="form-control" />
          </div>
          <div class="form-group">
              <label>Phone</label>
              <input type="text" id="sup-phone" class="form-control" />
          </div>
      `, `
          <button class="btn-outline" onclick="Utils.closeModal()">Cancel</button>
          <button class="btn-primary" id="save-sup-btn">Add</button>
      `);

      document.getElementById('save-sup-btn').addEventListener('click', async () => {
          const name = document.getElementById('sup-name').value;
          const contact_person = document.getElementById('sup-contact').value;
          const phone = document.getElementById('sup-phone').value;
          
          if(!name) {
              Utils.showToast("Name is required", "error");
              return;
          }
          const res = await API.post('/procurement/suppliers', {
              name, contact_person, phone, rating: "New"
          });
          if(res && !res.error) {
              Utils.showToast("Supplier Added", "success");
              Utils.closeModal();
              this.loadData();
          } else {
              Utils.showToast("Failed to add supplier", "error");
          }
      });
    });

    this.loadData();
    this.initialized = true;
  },

  async loadData() {
    try {
      // 1. Stats
      const statsRes = await API.get('/procurement/stats');
      if (statsRes && !statsRes.error) {
        document.getElementById('proc-total-pos').textContent = statsRes.total_pos || 0;
        document.getElementById('proc-pending').textContent = statsRes.pending_approvals || 0;
        document.getElementById('proc-monthly-cost').textContent = `₹${statsRes.monthly_cost || 0}`;
        document.getElementById('proc-delayed').textContent = statsRes.delayed_deliveries || 0;
      }

      // 2. Orders
      const ordersRes = await API.get('/procurement/orders');
      const ordersBody = document.getElementById('proc-orders-body');
      if (ordersRes && !ordersRes.error) {
        if (ordersRes.length === 0) {
          ordersBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No purchase orders found</td></tr>`;
        } else {
          ordersBody.innerHTML = ordersRes.map(o => `
            <tr>
              <td>${o._id ? o._id.substring(18) : '-'}</td>
              <td>${o.supplier || '-'}</td>
              <td>₹${o.total_amount || 0}</td>
              <td>${Utils.formatDate(o.created_at)}</td>
              <td><span class="status-badge ${o.status === 'Approved' ? 'bg-success text-white' : 'bg-warning text-dark'}">${o.status}</span></td>
              <td><button class="btn-outline btn-sm">View</button></td>
            </tr>
          `).join('');
        }
      }

      // 3. Requests
      const reqRes = await API.get('/procurement/requests');
      const reqBody = document.getElementById('proc-requests-body');
      if (reqRes && !reqRes.error) {
        if (reqRes.length === 0) {
          reqBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No requests found</td></tr>`;
        } else {
           reqBody.innerHTML = reqRes.map(r => `
            <tr>
              <td>${r._id ? r._id.substring(18) : '-'}</td>
              <td>${r.site_name || '-'}</td>
              <td>${r.material || '-'}</td>
              <td>${r.quantity || 0}</td>
              <td>${Utils.formatDate(r.required_date) || '-'}</td>
              <td><span class="status-badge ${r.status === 'Pending' ? 'bg-warning text-dark' : 'bg-success text-white'}">${r.status || 'Pending'}</span></td>
              <td><button class="btn-outline btn-sm">Review</button></td>
            </tr>
          `).join('');
        }
      }

      // 4. Suppliers
      const supRes = await API.get('/procurement/suppliers');
      const supBody = document.getElementById('proc-suppliers-body');
      if (supRes && !supRes.error) {
        if (supRes.length === 0) {
          supBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No suppliers found</td></tr>`;
        } else {
           supBody.innerHTML = supRes.map(s => `
            <tr>
              <td>${s.name || '-'}</td>
              <td>${s.contact_person || '-'}</td>
              <td>${s.phone || '-'}</td>
              <td>${s.rating || 'N/A'}</td>
              <td><button class="btn-outline btn-sm">Edit</button></td>
            </tr>
          `).join('');
        }
      }
    } catch (e) {
      console.error(e);
      Utils.showToast("Failed to load procurement data", "error");
    }
  }
};
