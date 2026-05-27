// ============ API HELPER ============
async function apiRequest(method, endpoint, body = null, raw = false) {
  const token = localStorage.getItem('token');
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, opts);

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/';
    return;
  }

  if (raw) return res; // For blob/file downloads

  const data = await res.json();
  if (!res.ok) return data; // Return error object so callers can check res.error
  return data;
}

async function apiGet(endpoint) { return apiRequest('GET', endpoint); }
async function apiPost(endpoint, body) { return apiRequest('POST', endpoint, body); }
async function apiPut(endpoint, body) { return apiRequest('PUT', endpoint, body); }
async function apiPatch(endpoint, body) { return apiRequest('PATCH', endpoint, body); }
async function apiDelete(endpoint) { return apiRequest('DELETE', endpoint); }

async function apiDownload(endpoint) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="?(.+?)"?$/);
  const filename = match ? match[1] : 'report';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
