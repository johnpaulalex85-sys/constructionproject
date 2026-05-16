// ============ DAILY REPORTS PAGE ============
let allDailyReports = [];

async function initDailyReports() {
  // Load sites into the dropdown
  try {
    const sites = await apiGet('/sites');
    if (sites) {
      const siteSelect = document.getElementById('reports-site-select');
      sites.forEach(site => {
        const opt = document.createElement('option');
        opt.value = site._id;
        opt.textContent = site.name;
        siteSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Error loading sites for daily reports:', err);
  }
  
  // Load data
  loadDailyReports();
}

async function loadDailyReports() {
  const tbody = document.getElementById('daily-reports-body');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading reports...</td></tr>';
  
  try {
    const siteId = document.getElementById('reports-site-select').value;
    const date = document.getElementById('reports-date').value;
    
    let url = '/daily-reports';
    const params = new URLSearchParams();
    if (siteId) params.append('site_id', siteId);
    if (date) params.append('date', date);
    
    if (params.toString()) {
      url += '?' + params.toString();
    }
    
    allDailyReports = await apiGet(url);
    renderDailyReports(allDailyReports);
  } catch (err) {
    showToast('Failed to load daily reports: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(7, 'Error loading daily reports');
  }
}

function renderDailyReports(reports) {
  const tbody = document.getElementById('daily-reports-body');
  if (!reports || !reports.length) { 
    tbody.innerHTML = emptyRow(7, 'No reports found'); 
    return; 
  }

  tbody.innerHTML = reports.map(r => `
    <tr>
      <td><div style="font-weight:600;">${fmtDate(r.report_date)}</div></td>
      <td><strong>${r.site_name}</strong></td>
      <td>${r.supervisor_username || '—'}</td>
      <td style="max-width: 250px; white-space: normal;">
        <div style="font-size: 0.9em; color: var(--text-sub);">${r.work_progress || '—'}</div>
      </td>
      <td>
        <span class="badge badge-info">${r.labor_count || 0} Workers</span>
      </td>
      <td>${r.weather || '—'}</td>
      <td>
        <button class="btn-sm btn-outline" onclick="openReportDetail('${r._id}')">View Full Report</button>
      </td>
    </tr>
  `).join('');
}

async function openReportDetail(id) {
  const report = allDailyReports.find(r => r._id === id);
  if (!report) return;

  const photoHtml = (report.photos && report.photos.length > 0) ?
    `<div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
      ${report.photos.map(url => `<a href="${url}" target="_blank"><img src="${url}" style="height:100px; border-radius:8px; border:1px solid #ddd;" /></a>`).join('')}
    </div>` : '<p class="text-sub">No photos attached</p>';

  const materialsHtml = (report.materials_used && report.materials_used.length > 0) ?
    `<ul>${report.materials_used.map(m => `<li>${m}</li>`).join('')}</ul>` : 'None';

  const equipmentHtml = (report.equipment_used && report.equipment_used.length > 0) ?
    `<ul>${report.equipment_used.map(e => `<li>${e}</li>`).join('')}</ul>` : 'None';

  const laborHtml = report.labor_details ? 
    Object.entries(report.labor_details).map(([type, count]) => `<div><strong>${type.charAt(0).toUpperCase() + type.slice(1)}:</strong> ${count}</div>`).join('') : 'None detailed';

  const html = `
    <div style="display:flex; flex-direction:column; gap:15px; font-size:14px;">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div><strong>Site Name:</strong> ${report.site_name}</div>
        <div><strong>Report Date:</strong> ${fmtDate(report.report_date)}</div>
        <div><strong>Supervisor:</strong> ${report.supervisor_username}</div>
        <div><strong>Weather:</strong> ${report.weather || 'N/A'}</div>
      </div>
      <hr style="border:0; border-top:1px solid #eee;" />
      
      <div>
        <strong>Work Progress:</strong>
        <p style="margin:5px 0; color:var(--text-sub);">${report.work_progress || 'N/A'}</p>
      </div>
      
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div>
          <strong>Labor Details (${report.labor_count} total):</strong>
          <div style="margin-top:5px; padding:10px; background:#f9fafb; border-radius:6px;">${laborHtml}</div>
        </div>
        <div>
          <strong>Issues / Delays:</strong>
          <p style="margin:5px 0; color:var(--danger);">${report.issues || 'None reported'}</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div>
          <strong>Materials Used:</strong>
          <div style="margin-top:5px;">${materialsHtml}</div>
        </div>
        <div>
          <strong>Equipment Used:</strong>
          <div style="margin-top:5px;">${equipmentHtml}</div>
        </div>
      </div>

      <div>
        <strong>Tomorrow's Plan:</strong>
        <p style="margin:5px 0; color:var(--text-sub);">${report.tomorrow_plan || 'N/A'}</p>
      </div>

      <div>
        <strong>Site Photos:</strong>
        ${photoHtml}
      </div>
    </div>
  `;

  openModal('Daily Report Details', html, `<button class="btn-primary" onclick="closeModal()">Close</button>`);
}

// Search
document.getElementById('reports-search')?.addEventListener('input', function () {
  const q = this.value.toLowerCase();
  renderDailyReports(allDailyReports.filter(r => 
    (r.site_name || '').toLowerCase().includes(q) || 
    (r.work_progress || '').toLowerCase().includes(q) ||
    (r.supervisor_username || '').toLowerCase().includes(q)
  ));
});

// Filter
document.getElementById('reports-site-select')?.addEventListener('change', loadDailyReports);
document.getElementById('reports-date')?.addEventListener('change', loadDailyReports);
document.getElementById('reports-refresh-btn')?.addEventListener('click', loadDailyReports);

// Exports
document.getElementById('reports-export-pdf-btn')?.addEventListener('click', () => {
  window.print();
});

document.getElementById('reports-export-excel-btn')?.addEventListener('click', () => {
  if (!allDailyReports || allDailyReports.length === 0) {
    showToast('No reports to export', 'error');
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Date,Site Name,Supervisor,Work Progress,Labor Count,Weather,Issues\n";

  allDailyReports.forEach(r => {
    // Escape quotes and wrap in quotes to handle commas and newlines
    const progress = `"${(r.work_progress || '').replace(/"/g, '""')}"`;
    const issues = `"${(r.issues || '').replace(/"/g, '""')}"`;
    
    let row = `${fmtDate(r.report_date)},"${r.site_name}","${r.supervisor_username}",${progress},${r.labor_count},"${r.weather}",${issues}`;
    csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `daily_reports_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});
