// ============ REQUESTS PAGE ============
let currentReqFilter = 'all';
let allRequests = [];

async function loadRequests() {
  const tbody = document.getElementById('requests-body');
  tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Loading...</td></tr>`;
  try {
    allRequests = await apiGet('/requests');
    renderRequests();
  } catch (err) {
    showToast('Failed to load requests: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(6, 'Error loading requests');
  }
}

function renderRequests() {
  const tbody = document.getElementById('requests-body');
  const filtered = currentReqFilter === 'all'
    ? allRequests
    : allRequests.filter(r => r.status === currentReqFilter);

  if (!filtered.length) { tbody.innerHTML = emptyRow(6); return; }

  tbody.innerHTML = filtered.map(r => {
    const badgeCls = {
      pending: 'badge-pending',
      approved: 'badge-approved',
      rejected: 'badge-rejected'
    }[r.status] || 'badge-inactive';

    const actions = r.status === 'pending' ? `
      <div class="action-btns">
        <button class="btn-primary btn-sm" onclick="updateRequest('${r._id}', 'approved')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Approve
        </button>
        <button class="btn-danger btn-sm" onclick="updateRequest('${r._id}', 'rejected')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Reject
        </button>
      </div>
    ` : '—';

    return `
      <tr>
        <td><strong>${r.site_name}</strong></td>
        <td>${r.material_name}</td>
        <td>${r.requested_quantity} ${r.material_unit}</td>
        <td><span class="status-badge ${badgeCls}">${r.status}</span></td>
        <td>${fmtDate(r.created_at)}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
}

// Filter tabs
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    currentReqFilter = this.dataset.status;
    renderRequests();
  });
});

async function updateRequest(id, status) {
  const label = status === 'approved' ? 'approve' : 'reject';
  confirmAction(`${label.charAt(0).toUpperCase() + label.slice(1)} Request`,
    `Are you sure you want to ${label} this material request?`,
    async () => {
      try {
        await apiPut(`/requests/${id}`, { status });
        showToast(`Request ${status} successfully`, status === 'approved' ? 'success' : 'warning');
        loadRequests();
        // Refresh pending badge
        try {
          const stats = await apiGet('/dashboard/stats');
          const badge = document.getElementById('pending-badge');
          if (stats.pending_requests > 0) {
            badge.textContent = stats.pending_requests;
            badge.style.display = 'inline-flex';
          } else {
            badge.style.display = 'none';
          }
        } catch (e) {}
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}
