const API = '';
let token = localStorage.getItem('admin_token') || '';
let allBookings = [];
let allClients = [];
let pendingDeleteId = null;
let editingBookingId = null;

const SERVICES = {
  bilan: { label: 'Bilan Médico Laser ICE', duration: 30, price: 0 },
  visage: { label: 'Visage & cou', duration: 30, price: 40 },
  aisselles: { label: 'Aisselles', duration: 30, price: 20 },
  maillot: { label: 'Maillot', duration: 45, price: 50 },
  jambes: { label: 'Jambes & bras', duration: 45, price: 30 },
  bras: { label: 'Bras / Demi-bras', duration: 45, price: 28 },
  dos: { label: 'Dos / ventre', duration: 60, price: 50 },
  corps: { label: 'Corps complet', duration: 60, price: 150 },
  forfait: { label: 'Forfait multi-zones', duration: 120, price: 120 },
};

const SLOTS = ['09:00', '10:30', '14:00', '15:30', '17:00'];

// ── AUTH ──
async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  err.textContent = '';
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.message || 'Identifiants invalides.'; return; }
    if (data.token) {
      token = data.token;
      localStorage.setItem('admin_token', token);
      showApp(data.user);
    } else {
      err.textContent = 'Connexion impossible.';
    }
  } catch {
    err.textContent = 'Serveur inaccessible.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Se connecter';
  }
}

function logout() {
  token = '';
  localStorage.removeItem('admin_token');
  document.getElementById('app').classList.remove('visible');
  document.getElementById('loginScreen').style.display = 'flex';
}

function showApp(user) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  if (user) document.getElementById('userBadge').textContent = user.name || user.email;
  loadDashboard();
  loadBookings();
  loadClients();
}

async function tryAutoLogin() {
  if (!token) return;
  try {
    const res = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const data = await res.json(); showApp(data.user); }
    else { token = ''; localStorage.removeItem('admin_token'); }
  } catch { token = ''; localStorage.removeItem('admin_token'); }
}

// ── NAVIGATION ──
function showPage(name, tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  tab.classList.add('active');
}

// ── DASHBOARD ──
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/admin/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const s = data.stats || {};
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card"><div class="label">Total RDV</div><div class="value">${s.totalBookings ?? '—'}</div><div class="icon"><i class="fas fa-calendar"></i></div></div>
      <div class="stat-card"><div class="label">En attente</div><div class="value">${s.pendingBookings ?? '—'}</div><div class="icon"><i class="fas fa-clock"></i></div></div>
      <div class="stat-card"><div class="label">Membres fidélité</div><div class="value">${s.totalClients ?? '—'}</div><div class="icon"><i class="fas fa-star"></i></div></div>
      <div class="stat-card"><div class="label">Points distribués</div><div class="value">${s.earnedPoints ?? '—'}</div><div class="icon"><i class="fas fa-gem"></i></div></div>
    `;
  } catch {
    document.getElementById('statsGrid').innerHTML = '<div class="loading">Erreur de chargement.</div>';
  }
}

// ── BOOKINGS ──
async function loadBookings() {
  try {
    const res = await fetch(`${API}/api/admin/bookings`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    allBookings = data.bookings || [];
    filterBookings();
  } catch {
    document.getElementById('bookingsBody').innerHTML = '<tr class="empty-row"><td colspan="8">Erreur de chargement.</td></tr>';
  }
}

function filterBookings() {
  const search = document.getElementById('bookingSearch').value.toLowerCase();
  const status = document.getElementById('bookingFilter').value;
  const filtered = allBookings.filter(b => {
    const matchSearch = !search ||
      b.clientName?.toLowerCase().includes(search) ||
      b.clientEmail?.toLowerCase().includes(search) ||
      b.serviceType?.toLowerCase().includes(search) ||
      b.clientPhone?.includes(search);
    const matchStatus = !status || b.status === status;
    return matchSearch && matchStatus;
  });
  renderBookings(filtered);
}

function renderBookings(bookings) {
  const tbody = document.getElementById('bookingsBody');
  if (!bookings.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Aucun rendez-vous trouvé.</td></tr>';
    return;
  }
  tbody.innerHTML = bookings.map(b => `
    <tr>
      <td>
        <div style="font-weight:600">${esc(b.clientName)}</div>
        <div style="color:var(--text-muted);font-size:0.8rem">${esc(b.clientEmail)}</div>
        <div style="color:var(--text-muted);font-size:0.8rem">${esc(b.clientPhone)}</div>
      </td>
      <td>${esc(b.serviceType)}</td>
      <td>${esc(b.appointmentDate)}</td>
      <td>${esc(b.appointmentStart)} → ${esc(b.appointmentEnd)}</td>
      <td>${b.price ? b.price + ' €' : 'Gratuit'}</td>
      <td>
        <select class="status-select" data-id="${b.id}">
          ${['pending','confirmed','completed','cancelled'].map(s =>
            `<option value="${s}" ${b.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`
          ).join('')}
        </select>
        ${b.status === 'cancelled' && b.cancelledBy ? `<div style="margin-top:0.3rem;font-size:0.75rem;color:var(--text-muted)"><i class="fas fa-${b.cancelledBy === 'client' ? 'user' : 'user-shield'}"></i> Annulé par ${b.cancelledBy === 'client' ? 'le client' : 'l\'admin'}${b.cancelledAt ? ' le ' + b.cancelledAt.slice(0, 10) : ''}</div>` : ''}
      </td>
      <td>
        <button class="btn btn-edit btn-sm" data-edit="${b.id}" title="Modifier">
          <i class="fas fa-pen"></i>
        </button>
        <button class="btn btn-danger btn-sm" data-delete="${b.id}" title="Supprimer">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => updateStatus(sel.dataset.id, sel.value));
  });
  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
  });
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.delete));
  });
}

async function updateStatus(id, status) {
  try {
    const res = await fetch(`${API}/api/admin/bookings/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const b = allBookings.find(b => b.id === id);
      if (b) b.status = status;
      toast(`Statut mis à jour : ${statusLabel(status)}`);
      loadDashboard();
    } else {
      toast('Erreur lors de la mise à jour.', true);
    }
  } catch { toast('Serveur inaccessible.', true); }
}

// ── EDIT MODAL ──
function openEditModal(id) {
  const b = allBookings.find(b => b.id === id);
  if (!b) return;
  editingBookingId = id;

  document.getElementById('editName').value = b.clientName || '';
  document.getElementById('editEmail').value = b.clientEmail || '';
  document.getElementById('editPhone').value = b.clientPhone || '';
  document.getElementById('editDate').value = b.appointmentDate || '';

  const serviceSelect = document.getElementById('editService');
  serviceSelect.innerHTML = Object.entries(SERVICES).map(([key, s]) =>
    `<option value="${key}" ${b.serviceZone === key ? 'selected' : ''}>${s.label}</option>`
  ).join('');

  const slotSelect = document.getElementById('editSlot');
  slotSelect.innerHTML = SLOTS.map(slot =>
    `<option value="${slot}" ${b.appointmentStart === slot ? 'selected' : ''}>${slot}</option>`
  ).join('');

  document.getElementById('editModal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
  editingBookingId = null;
}

async function saveEdit() {
  if (!editingBookingId) return;
  const btn = document.getElementById('saveEditBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';

  const serviceZone = document.getElementById('editService').value;
  const service = SERVICES[serviceZone];
  const appointmentStart = document.getElementById('editSlot').value;
  const startMinutes = timeToMinutes(appointmentStart);
  const endMinutes = startMinutes + service.duration;
  const appointmentEnd = minutesToTime(endMinutes);

  const payload = {
    clientName: document.getElementById('editName').value.trim(),
    clientEmail: document.getElementById('editEmail').value.trim(),
    clientPhone: document.getElementById('editPhone').value.trim(),
    serviceZone,
    serviceType: service.label,
    appointmentDate: document.getElementById('editDate').value,
    appointmentStart,
    appointmentEnd,
    price: service.price,
  };

  try {
    const res = await fetch(`${API}/api/admin/bookings/${editingBookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      closeEditModal();
      await loadBookings();
      loadDashboard();
      toast('Rendez-vous mis à jour.');
    } else {
      const data = await res.json();
      toast(data.message || 'Erreur lors de la modification.', true);
    }
  } catch { toast('Serveur inaccessible.', true); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
  }
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ── DELETE ──
function confirmDelete(id) {
  pendingDeleteId = id;
  document.getElementById('deleteModal').classList.add('open');
  document.getElementById('confirmDeleteBtn').onclick = () => deleteBooking(id);
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('open');
  pendingDeleteId = null;
}

async function deleteBooking(id) {
  try {
    const res = await fetch(`${API}/api/admin/bookings/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    closeDeleteModal();
    if (res.ok) {
      allBookings = allBookings.filter(b => b.id !== id);
      filterBookings();
      loadDashboard();
      toast('Rendez-vous supprimé. Créneau libéré.');
    } else {
      toast('Erreur lors de la suppression.', true);
    }
  } catch { toast('Serveur inaccessible.', true); }
}

// ── CLIENTS ──
async function loadClients() {
  try {
    const [bookingsRes, usersRes] = await Promise.all([
      fetch(`${API}/api/admin/bookings`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/admin/clients`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const bookingsData = await bookingsRes.json();
    const usersData = await usersRes.json();

    const bookings = bookingsData.bookings || [];
    const members = usersData.clients || [];

    // Agréger les guests depuis les bookings
    const guestMap = {};
    bookings.forEach(b => {
      if (!b.clientEmail) return;
      const email = b.clientEmail.toLowerCase();
      if (!guestMap[email]) {
        guestMap[email] = {
          name: b.clientName,
          email: b.clientEmail,
          phone: b.clientPhone,
          bookingCount: 0,
          lastBooking: null,
          pointsEarned: 0,
          isMember: false,
        };
      }
      guestMap[email].bookingCount++;
      guestMap[email].pointsEarned += b.pointsEarned || 0;
      if (!guestMap[email].lastBooking || b.appointmentDate > guestMap[email].lastBooking) {
        guestMap[email].lastBooking = b.appointmentDate;
      }
    });

    // Marquer les membres fidélité
    members.forEach(m => {
      const email = m.email.toLowerCase();
      if (guestMap[email]) {
        guestMap[email].isMember = true;
        guestMap[email].points = m.points;
        guestMap[email].memberId = m.id;
      } else {
        guestMap[email] = {
          name: m.name,
          email: m.email,
          phone: '—',
          bookingCount: 0,
          lastBooking: null,
          pointsEarned: m.points || 0,
          isMember: true,
          points: m.points,
          memberId: m.id,
        };
      }
    });

    allClients = Object.values(guestMap).sort((a, b) => b.bookingCount - a.bookingCount);
    filterClients();
  } catch {
    document.getElementById('clientsBody').innerHTML = '<tr class="empty-row"><td colspan="6">Erreur de chargement.</td></tr>';
  }
}

function filterClients() {
  const search = document.getElementById('clientSearch').value.toLowerCase();
  const filtered = allClients.filter(c =>
    !search || c.name?.toLowerCase().includes(search) || c.email?.toLowerCase().includes(search)
  );
  renderClients(filtered);
}

function renderClients(clients) {
  const tbody = document.getElementById('clientsBody');
  if (!clients.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Aucun client trouvé.</td></tr>';
    return;
  }
  tbody.innerHTML = clients.map(c => `
  <tr>
    <td>
      <div style="font-weight:600">${esc(c.name)}</div>
      <div style="color:var(--text-muted);font-size:0.8rem">${esc(c.phone)}</div>
    </td>
    <td>${esc(c.email)}</td>
    <td style="text-align:center">${c.bookingCount}</td>
    <td style="color:var(--text-muted)">${c.lastBooking || '—'}</td>
    <td>
      ${c.isMember
        ? `<span class="badge badge-member"><i class="fas fa-star"></i> ${c.points || 0} pts</span>`
        : `<span class="badge badge-guest"><i class="fas fa-user"></i> Guest</span>`
      }
    </td>
    <td>
      ${!c.isMember
        ? `<button class="btn btn-outline btn-sm" data-invite-email="${esc(c.email)}" data-invite-name="${esc(c.name)}">
            <i class="fas fa-envelope"></i> Inviter
          </button>`
        : '—'
      }
    </td>
  </tr>
`).join('');

tbody.querySelectorAll('[data-invite-email]').forEach(btn => {
  btn.addEventListener('click', () => sendInvitation(btn.dataset.inviteEmail, btn.dataset.inviteName, btn));
});
}

// ── UTILS ──
function statusLabel(s) {
  return { pending: 'En attente', confirmed: 'Confirmé', completed: 'Terminé', cancelled: 'Annulé' }[s] || s;
}

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = '', 3500);
}

async function sendInvitation(email, name, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    const res = await fetch(`${API}/api/admin/invitations/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json();
    if (res.ok) {
      toast(`Invitation envoyée à ${email}`);
      btn.innerHTML = '<i class="fas fa-check"></i> Envoyé';
    } else {
      toast(data.message || 'Erreur.', true);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-envelope"></i> Inviter';
    }
  } catch {
    toast('Serveur inaccessible.', true);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-envelope"></i> Inviter';
  }
}

// ── EVENT LISTENERS ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
  document.getElementById('deleteModal').addEventListener('click', e => {
    if (e.target === document.getElementById('deleteModal')) closeDeleteModal();
  });
  document.getElementById('closeEditBtn').addEventListener('click', closeEditModal);
  document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
  document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
  document.getElementById('editModal').addEventListener('click', e => {
    if (e.target === document.getElementById('editModal')) closeEditModal();
  });
  document.getElementById('bookingFilter').addEventListener('change', filterBookings);
  document.getElementById('bookingSearch').addEventListener('input', filterBookings);
  document.getElementById('clientSearch').addEventListener('input', filterClients);
  document.getElementById('refreshBookings').addEventListener('click', loadBookings);

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => showPage(tab.dataset.page, tab));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeEditModal(); closeDeleteModal(); }
    if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') login();
  });

  tryAutoLogin();
});