// ============================================================
//  DOCUMENT MANAGEMENT PAGE — Full Enterprise Implementation
// ============================================================
const DocumentsPage = {
  initialized: false,
  allDocs: [],
  sites: [],

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Load sites for filter dropdown
    const sitesRes = await apiGet('/sites');
    if (sitesRes && Array.isArray(sitesRes)) {
      this.sites = sitesRes;
      const siteSelects = ['docs-site-filter', 'doc-site-input'];
      siteSelects.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          sitesRes.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = s.name;
            el.appendChild(opt);
          });
        }
      });
    }

    // Upload button
    document.getElementById('upload-doc-btn')?.addEventListener('click', () => this.showUploadModal());

    // Filters
    ['docs-search', 'docs-site-filter', 'docs-category-select', 'docs-status-filter'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.applyFilters());
      document.getElementById(id)?.addEventListener('change', () => this.applyFilters());
    });

    await this.loadData();
  },

  showUploadModal() {
    openModal("Upload Document", `
      <div class="upload-drop-zone" id="upload-drop-zone" onclick="document.getElementById('doc-file-input').click()">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p style="color:#6b7280;margin:8px 0 0;">Click to browse or drop file here</p>
        <p id="drop-filename" style="color:#2563eb;font-weight:600;font-size:13px;margin-top:6px;"></p>
        <input type="file" id="doc-file-input" style="display:none" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.dwg,.dxf" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Document Title *</label>
          <input type="text" id="doc-title-input" class="form-control" placeholder="e.g. Foundation Blueprint v4" />
        </div>
        <div class="form-group">
          <label>Revision #</label>
          <input type="text" id="doc-revision-input" class="form-control" placeholder="e.g. 4" value="1" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Category *</label>
          <select id="doc-cat-input" class="form-control">
            <option value="Blueprints">Blueprints</option>
            <option value="Contracts">Contracts</option>
            <option value="Safety Docs">Safety Docs</option>
            <option value="Reports">Reports</option>
            <option value="Invoices">Invoices</option>
            <option value="Inspection Docs">Inspection Docs</option>
            <option value="Certifications">Certifications</option>
            <option value="Site Drawings">Site Drawings</option>
            <option value="Purchase Docs">Purchase Docs</option>
          </select>
        </div>
        <div class="form-group">
          <label>Site</label>
          <select id="doc-site-input" class="form-control">
            <option value="">-- Select Site --</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Project</label>
          <input type="text" id="doc-project-input" class="form-control" placeholder="Project name" />
        </div>
        <div class="form-group">
          <label>Expiry Date (optional)</label>
          <input type="date" id="doc-expiry-input" class="form-control" />
        </div>
      </div>
      <div class="form-group">
        <label>Tags (comma-separated)</label>
        <input type="text" id="doc-tags-input" class="form-control" placeholder="e.g. foundation, structural, approved" />
      </div>
    `, `
      <button class="btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="save-doc-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/></svg>
        Upload
      </button>
    `);

    // Populate site dropdown in modal from already-loaded sites
    const siteSelect = document.getElementById('doc-site-input');
    if (siteSelect && this.sites.length) {
      this.sites.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name; opt.textContent = s.name;
        siteSelect.appendChild(opt);
      });
    }

    // File input change display
    document.getElementById('doc-file-input')?.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) {
        document.getElementById('drop-filename').textContent = f.name;
        if (!document.getElementById('doc-title-input').value) {
          document.getElementById('doc-title-input').value = f.name.replace(/\.[^/.]+$/, "");
        }
      }
    });

    document.getElementById('save-doc-btn').addEventListener('click', () => this.doUpload());
  },

  async doUpload() {
    const fileInput = document.getElementById('doc-file-input');
    const title = document.getElementById('doc-title-input').value.trim();
    const cat = document.getElementById('doc-cat-input').value;

    if (!fileInput || fileInput.files.length === 0) { showToast("Please select a file", "error"); return; }
    if (!title) { showToast("Document title is required", "error"); return; }

    const btn = document.getElementById('save-doc-btn');
    btn.disabled = true; btn.textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('title', title);
    formData.append('category', cat);
    formData.append('site', document.getElementById('doc-site-input')?.value || '');
    formData.append('project', document.getElementById('doc-project-input')?.value || '');
    formData.append('tags', document.getElementById('doc-tags-input')?.value || '');
    formData.append('revision', document.getElementById('doc-revision-input')?.value || '1');
    formData.append('expiry_date', document.getElementById('doc-expiry-input')?.value || '');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(API_BASE + '/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        showToast("Document uploaded successfully", "success");
        closeModal();
        this.loadData();
      } else {
        const err = await res.json();
        showToast(err.error || "Upload failed", "error");
      }
    } catch (e) {
      showToast("Error uploading file", "error");
    } finally {
      btn.disabled = false;
    }
  },

  applyFilters() {
    const search = (document.getElementById('docs-search')?.value || '').toLowerCase();
    const site = document.getElementById('docs-site-filter')?.value || '';
    const cat = document.getElementById('docs-category-select')?.value || '';
    const status = document.getElementById('docs-status-filter')?.value || '';

    const filtered = this.allDocs.filter(d => {
      const matchSearch = !search || (d.title || d.name || '').toLowerCase().includes(search) || (d.tags || '').toLowerCase().includes(search) || (d.uploaded_by || '').toLowerCase().includes(search);
      const matchSite = !site || d.site === site;
      const matchCat = !cat || d.category === cat;
      const matchStatus = !status || d.status === status;
      return matchSearch && matchSite && matchCat && matchStatus;
    });
    this.renderTable(filtered);
  },

  async loadData() {
    try {
      const stats = await apiGet('/documents/stats');
      if (stats && !stats.error) {
        document.getElementById('doc-total').textContent = stats.total_documents || 0;
        document.getElementById('doc-recent').textContent = stats.recently_uploaded || 0;
        document.getElementById('doc-pending').textContent = stats.pending_approvals || 0;
        const expEl = document.getElementById('doc-expiring');
        if (expEl) expEl.textContent = stats.expiring_certifications || 0;
      }

      const docs = await apiGet('/documents');
      if (docs && !docs.error) {
        this.allDocs = docs;
        this.renderTable(docs);
      }

      // Activity log
      const activity = await apiGet('/documents/activity');
      const actBody = document.getElementById('docs-activity-body');
      if (actBody && activity && Array.isArray(activity)) {
        if (activity.length === 0) {
          actBody.innerHTML = `<tr><td colspan="4" class="loading-cell">No activity yet</td></tr>`;
        } else {
          actBody.innerHTML = activity.slice(0, 10).map(a => `
            <tr>
              <td>${fmtDate(a.timestamp)}</td>
              <td>${a.action?.toUpperCase() || '-'}</td>
              <td>${a.user || '-'}</td>
              <td>${a.detail || '-'}</td>
            </tr>
          `).join('');
        }
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to load documents", "error");
    }
  },

  renderTable(docs) {
    const tbody = document.getElementById('docs-body');
    if (!tbody) return;
    if (docs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No documents found</td></tr>`;
      return;
    }
    tbody.innerHTML = docs.map(d => {
      const status = d.status || 'Draft';
      const statusMap = { 'Approved': 'status-badge bg-success text-white', 'Review': 'status-badge bg-warning text-dark', 'Rejected': 'status-badge bg-danger text-white', 'Draft': 'status-badge bg-secondary text-white' };
      const statusClass = statusMap[status] || 'status-badge bg-secondary text-white';
      const catIcon = DocumentsPage.getCatIcon(d.category);
      const expiry = d.expiry_date ? `<span style="color:${new Date(d.expiry_date) < new Date(Date.now() + 30*24*3600*1000) ? '#f59e0b' : '#6b7280'}">${fmtDate(d.expiry_date)}</span>` : '—';
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:22px;">${catIcon}</span>
              <div>
                <div style="font-weight:600;font-size:13px;">${d.title || d.name || '-'}</div>
                <div style="font-size:11px;color:#6b7280;">Rev. ${d.revision || '1'} · ${d.file_type || 'File'}</div>
              </div>
            </div>
          </td>
          <td><span class="doc-category-tag">${d.category || '-'}</span></td>
          <td>${d.site || '—'}</td>
          <td>${d.project || '—'}</td>
          <td>${d.uploaded_by || '-'}</td>
          <td>${expiry}</td>
          <td><span class="${statusClass}">${status}</span></td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${d.file_url ? `<a href="${d.file_url}" target="_blank" class="btn-outline btn-sm" style="text-decoration:none;">View</a>` : ''}
              ${status !== 'Approved' ? `<button class="btn-primary btn-sm" onclick="DocumentsPage.approveDoc('${d._id}')">Approve</button>` : ''}
              ${status === 'Draft' || status === 'Rejected' ? `<button class="btn-outline btn-sm" onclick="DocumentsPage.sendReview('${d._id}')">Review</button>` : ''}
              <button class="btn-danger btn-sm" onclick="DocumentsPage.deleteDoc('${d._id}')">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  getCatIcon(cat) {
    const icons = {
      'Blueprints': '📐', 'Contracts': '📝', 'Safety Docs': '🦺', 'Reports': '📊',
      'Invoices': '🧾', 'Inspection Docs': '🔍', 'Certifications': '🏅',
      'Site Drawings': '🗺️', 'Purchase Docs': '🛒'
    };
    return icons[cat] || '📄';
  },

  async approveDoc(id) {
    const res = await apiPatch(`/documents/${id}/status`, { status: 'Approved', comment: 'Approved by admin' });
    if (res && !res.error) { showToast("Document approved", "success"); this.loadData(); }
    else showToast("Failed to approve", "error");
  },

  async sendReview(id) {
    const res = await apiPatch(`/documents/${id}/status`, { status: 'Review', comment: 'Sent for review' });
    if (res && !res.error) { showToast("Sent for review", "success"); this.loadData(); }
    else showToast("Failed to update", "error");
  },

  async deleteDoc(id) {
    confirmAction('Delete Document', 'Are you sure you want to permanently delete this document?', async () => {
      const res = await apiDelete(`/documents/${id}`);
      if (res && !res.error) { showToast("Document deleted", "success"); this.loadData(); }
      else showToast("Failed to delete", "error");
    });
  }
};
