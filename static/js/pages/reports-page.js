// ============ REPORTS PAGE ============

async function initReportsPage() {
  const select = document.getElementById('report-site-select');
  try {
    const sites = await apiGet('/sites');
    select.innerHTML = '<option value="">All Sites</option>' +
      sites.map(s => `<option value="${s._id}">${s.name}</option>`).join('');
  } catch (err) {
    showToast('Failed to load sites for report filter', 'error');
  }
}

document.getElementById('run-report-btn').addEventListener('click', runReport);

async function runReport() {
  const siteId = document.getElementById('report-site-select').value;
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;

  let endpoint = '/reports/usage?';
  if (siteId) endpoint += `site_id=${siteId}&`;
  if (start) endpoint += `start_date=${start}&`;
  if (end) endpoint += `end_date=${end}&`;

  const tbody = document.getElementById('report-body');
  tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Loading report...</td></tr>`;

  try {
    const data = await apiGet(endpoint);
    const summary = document.getElementById('report-summary');

    if (!data.rows.length) {
      tbody.innerHTML = emptyRow(7, 'No usage data for the selected filters');
      summary.style.display = 'none';
      return;
    }

    document.getElementById('report-total-records').textContent = data.rows.length;
    document.getElementById('report-total-cost').textContent = fmtCurrency(data.total_cost);
    summary.style.display = 'flex';

    tbody.innerHTML = data.rows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.site}</td>
        <td>${r.material}</td>
        <td>${r.unit}</td>
        <td>${r.used_quantity}</td>
        <td>${fmtCurrency(r.cost_per_unit)}</td>
        <td><strong>${fmtCurrency(r.total_cost)}</strong></td>
      </tr>
    `).join('');

  } catch (err) {
    showToast('Failed to run report: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(7, 'Error generating report');
  }
}

document.getElementById('export-pdf-btn').addEventListener('click', async () => {
  const siteId = document.getElementById('report-site-select').value;
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  let endpoint = '/reports/export/pdf?';
  if (siteId) endpoint += `site_id=${siteId}&`;
  if (start) endpoint += `start_date=${start}&`;
  if (end) endpoint += `end_date=${end}&`;
  try {
    await apiDownload(endpoint);
    showToast('PDF exported successfully');
  } catch (err) {
    showToast('PDF export failed: ' + err.message, 'error');
  }
});

document.getElementById('export-excel-btn').addEventListener('click', async () => {
  const siteId = document.getElementById('report-site-select').value;
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  let endpoint = '/reports/export/excel?';
  if (siteId) endpoint += `site_id=${siteId}&`;
  if (start) endpoint += `start_date=${start}&`;
  if (end) endpoint += `end_date=${end}&`;
  try {
    await apiDownload(endpoint);
    showToast('Excel exported successfully');
  } catch (err) {
    showToast('Excel export failed: ' + err.message, 'error');
  }
});
