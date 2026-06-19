async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  } catch (err) {
    if (location.protocol === 'file:') throw new Error('No abras el HTML directamente. Arranca iniciar-windows.bat y entra por http://localhost:3000/admin');
    throw new Error('No se puede conectar con el servidor. Comprueba que sigue abierta la ventana negra.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
}
function number(value) { return (Number(value) || 0).toLocaleString('es-ES'); }
function money(value) { return (Number(value) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function slugify(text) {
  return String(text || 'general').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'general';
}
function goalDoneBits(goal) { return goal.type === 'chapters' ? goal.completedChapters * goal.bitsPerChapter + goal.currentBits : goal.currentBits; }
function goalTotalBits(goal) { return goal.type === 'chapters' ? goal.totalChapters * goal.bitsPerChapter : goal.targetBits; }
function totalPct(goal) {
  const total = goalTotalBits(goal);
  return total ? Math.max(0, Math.min(100, goalDoneBits(goal) / total * 100)) : 0;
}
function currentPct(goal) {
  if (goal.type === 'chapters') return goal.bitsPerChapter ? Math.max(0, Math.min(100, goal.currentBits / goal.bitsPerChapter * 100)) : 0;
  return goal.targetBits ? Math.max(0, Math.min(100, goal.currentBits / goal.targetBits * 100)) : 0;
}
function goalActive(goal) {
  if (!goal.visible) return false;
  if (goal.type === 'chapters') return !goal.completed;
  return !goal.completed && goal.currentBits < goal.targetBits;
}
function goalText(goal) {
  if (goal.type === 'chapters') {
    const remaining = goal.currentBits === 0 ? goal.bitsPerChapter : Math.max(0, goal.bitsPerChapter - goal.currentBits);
    return `${number(goal.completedChapters)}/${number(goal.totalChapters)} caps · faltan ${number(remaining)} Bits para el siguiente`;
  }
  return `${number(goal.currentBits)}/${number(goal.targetBits)} Bits · quedan ${number(goal.remainingBits ?? Math.max(0, goal.targetBits - goal.currentBits))}`;
}
function overlayGoalText(goal) {
  if (goal.type === 'chapters') {
    const remaining = goal.currentBits === 0 ? goal.bitsPerChapter : Math.max(0, goal.bitsPerChapter - goal.currentBits);
    return `${goal.name.toUpperCase()} (${number(goal.completedChapters)}/${number(goal.totalChapters)}) - ${number(remaining)}`;
  }
  return `${goal.name.toUpperCase()} - ${number(goal.remainingBits ?? Math.max(0, goal.targetBits - goal.currentBits))}`;
}
function txStateText(state) {
  if (!state) return '-';
  if (state.type === 'pending') return `bote: ${number(state.currentBits)} Bits`;
  if (state.type === 'chapters') return `${number(state.completedChapters)}/${number(state.totalChapters)} caps · ${number(state.currentBits)}/${number(state.bitsPerChapter)}`;
  return `${number(state.currentBits)}/${number(state.targetBits)} · quedan ${number(state.remainingBits)}`;
}
function connectEvents(onUpdate, onError) {
  if (location.protocol === 'file:') { onError?.('No abras este HTML directamente. Arranca el servidor primero.'); return null; }
  const source = new EventSource('/events');
  source.addEventListener('update', ev => { try { onUpdate(JSON.parse(ev.data)); } catch (err) { console.error(err); } });
  source.onerror = () => onError?.('Reconectando con el servidor...');
  return source;
}
function qs(selector, root = document) { return root.querySelector(selector); }
function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
function setStatus(selector, text, kind = '') {
  const el = qs(selector); if (!el) return;
  el.textContent = text || ''; el.className = `status ${kind}`.trim();
}
function activeGoals(state) { return (state?.goals || []).filter(goalActive); }
function categoryById(state, id) { return (state?.categories || []).find(c => c.id === id) || (state?.categories || [])[0]; }
window.MetasApp = { api, esc, number, money, slugify, goalDoneBits, goalTotalBits, totalPct, currentPct, goalActive, goalText, overlayGoalText, txStateText, connectEvents, qs, qsa, setStatus, activeGoals, categoryById };
