/**
 * SISCON Monitor - Frontend
 */
(function () {
  'use strict';

  // --- State ---
  let solicitacoes = [];
  let diff = null;
  let running = false;
  let timerInterval = null;
  let secondsSincePoll = 0;
  let allSituacoes = new Set();

  // --- DOM refs ---
  const $ = id => document.getElementById(id);
  const statusBadge = $('status-badge');
  const timerDisplay = $('timer-display');
  const countDisplay = $('count-display');
  const btnToggle = $('btn-toggle');
  const btnPoll = $('btn-poll');
  const btnClear = $('btn-clear');
  const tableBody = $('table-body');
  const tableContainer = $('table-container');
  const emptyState = $('empty-state');
  const filterInput = $('filter-input');
  const filterSituacao = $('filter-situacao');
  const diffSummary = $('diff-summary');
  const logList = $('log-list');
  const notifArea = $('notification-area');

  // --- Helpers ---
  function timeStr() {
    const d = new Date();
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function situacaoClass(sit) {
    const s = (sit || '').toLowerCase();
    if (s.includes('test')) return 'status-testando';
    if (s.includes('aprova') || s.includes('aprov')) return 'status-aprovado';
    if (s.includes('final')) return 'status-finalizado';
    if (s.includes('cancel')) return 'status-cancelado';
    return '';
  }

  function classificacaoClass(cls) {
    const c = (cls || '').toLowerCase();
    if (c.includes('qualidade')) return 'tag-warning';
    if (c.includes('impl') || c.includes('nao cobrada')) return 'tag-default';
    if (c.includes('urgente') || c.includes('critico')) return 'tag-danger';
    if (c.includes('melhoria')) return 'tag-info';
    if (c.includes('sucesso')) return 'tag-success';
    return 'tag-default';
  }

  function addLog(type, msg) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${timeStr()}</span><span class="log-msg ${type}">${msg}</span>`;
    logList.prepend(entry);
    // Keep only last 100
    while (logList.children.length > 100) logList.removeChild(logList.lastChild);
  }

  function showNotification(type, msg) {
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = `${timeStr()} - ${msg}`;
    notifArea.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 6000);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- UI Updates ---
  function updateTimer() {
    const m = Math.floor(secondsSincePoll / 60);
    const s = secondsSincePoll % 60;
    timerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateStatus() {
    if (running) {
      statusBadge.textContent = '🟢 Monitorando';
      statusBadge.className = 'badge active';
      btnToggle.textContent = '⏸️ Pausar';
    } else {
      statusBadge.textContent = '⏸️ Parado';
      statusBadge.className = 'badge';
      btnToggle.textContent = '▶️ Iniciar';
    }
  }

  function updateCount() {
    countDisplay.textContent = `${solicitacoes.length} solicitação${solicitacoes.length !== 1 ? 'ões' : ''}`;
  }

  function renderTable(data) {
    solicitacoes = data;
    tableBody.innerHTML = '';
    allSituacoes = new Set();

    if (data.length === 0) {
      tableContainer.style.display = 'none';
      emptyState.style.display = 'block';
      emptyState.querySelector('h2').textContent = 'Nenhuma solicitação encontrada';
      return;
    }

    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';
    updateCount();

    const filterText = filterInput.value.toLowerCase();
    const filterSit = filterSituacao.value;

    const filtered = data.filter(s => {
      if (filterSit && s.situacao !== filterSit) return false;
      if (filterText) {
        const match = `${s.protocolo} ${s.cliente} ${s.resumo} ${s.classificacao}`.toLowerCase();
        return match.includes(filterText);
      }
      return true;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim);">Nenhum resultado para os filtros atuais</td></tr>`;
      return;
    }

    // Marcar quais são novas/alteradas
    const novasSet = new Set((diff && diff.novas || []).map(s => s.protocolo));
    const alteradasSet = new Set((diff && diff.alteradas || []).map(s => s.protocolo));

    for (const s of filtered) {
      const tr = document.createElement('tr');
      const rowClass = novasSet.has(s.protocolo) ? 'row-new' : alteradasSet.has(s.protocolo) ? 'row-changed' : '';
      if (rowClass) tr.className = rowClass;

      const dotHtml = novasSet.has(s.protocolo) ? '<span class="badge-dot new"></span>' :
                      alteradasSet.has(s.protocolo) ? '<span class="badge-dot changed"></span>' : '';

      tr.innerHTML = `
        <td class="col-protocolo">${dotHtml}<a href="${escapeHtml(s.url)}" target="_blank">${s.protocolo}</a></td>
        <td class="col-classificacao"><span class="tag ${classificacaoClass(s.classificacao)}">${escapeHtml(s.classificacao)}</span></td>
        <td class="col-cliente">${escapeHtml(s.cliente)}</td>
        <td class="col-sistema">${escapeHtml(s.sistema)}</td>
        <td class="col-resumo" title="${escapeHtml(s.resumo)}">${escapeHtml(s.resumo)}</td>
        <td class="col-situacao"><span class="status-badge ${situacaoClass(s.situacao)}">${escapeHtml(s.situacao)}</span></td>
        <td class="col-acoes"><a href="${escapeHtml(s.url)}" target="_blank" title="Abrir no SISCON">🔗</a></td>
      `;
      tableBody.appendChild(tr);
    }
  }

  function renderDiff(result) {
    if (!result) return;
    diff = result;
    const { novas, alteradas, removidas, total_anterior, total_atual } = result;

    let html = '';
    if (novas.length > 0) html += `<span class="diff-item diff-novas">🆕 ${novas.length} nova(s)</span>`;
    if (alteradas.length > 0) html += `<span class="diff-item diff-alteradas">🔄 ${alteradas.length} alterada(s)</span>`;
    if (removidas.length > 0) html += `<span class="diff-item diff-removidas">🗑️ ${removidas.length} removida(s)</span>`;
    if (html) {
      html = `<span class="diff-item">📊 ${total_anterior} → ${total_atual}</span>` + html;
    }
    diffSummary.innerHTML = html;

    // Notificações + log
    for (const s of novas) {
      showNotification('new', `🆕 #${s.protocolo} - ${s.resumo} [${s.situacao}]`);
      addLog('new', `🆕 #${s.protocolo} ${s.resumo} [${s.situacao}]`);
    }
    for (const s of alteradas) {
      const changes = Object.entries(s.alteracoes).map(([k, v]) => `${k}: ${v.de} → ${v.para}`).join(', ');
      showNotification('changed', `🔄 #${s.protocolo}: ${changes}`);
      addLog('changed', `🔄 #${s.protocolo}: ${changes}`);
    }
    for (const s of removidas) {
      addLog('error', `🗑️ #${s.protocolo} ${s.resumo} (removida)`);
    }

    // Atualizar filtro de situações
    allSituacoes = new Set(solicitacoes.map(s => s.situacao));
    const currentVal = filterSituacao.value;
    filterSituacao.innerHTML = '<option value="">Todas as situações</option>';
    for (const sit of [...allSituacoes].sort()) {
      filterSituacao.innerHTML += `<option value="${escapeHtml(sit)}" ${sit === currentVal ? 'selected' : ''}>${escapeHtml(sit)}</option>`;
    }
  }

  function handlePollResult(data) {
    if (!data) return;
    const { solicitacoes: sols, diff: d } = data;
    solicitacoes = sols;
    renderDiff(d);
    renderTable(sols);
    updateCount();
    secondsSincePoll = 0;
    addLog('', `📥 Busca concluída - ${sols.length} solicitações`);
  }

  // --- Polling ---
  async function pollNow() {
    try {
      statusBadge.textContent = '🔄 Buscando...';
      statusBadge.className = 'badge';
      const result = await window.siscon.pollNow();
      handlePollResult(result);
      if (running) {
        statusBadge.textContent = '🟢 Monitorando';
        statusBadge.className = 'badge active';
      }
    } catch (err) {
      showNotification('error', `Erro na busca: ${err}`);
      addLog('error', `❌ Erro: ${err}`);
      statusBadge.textContent = '❌ Erro';
      statusBadge.className = 'badge error';
    }
  }

  async function toggleRunning() {
    if (running) {
      await window.siscon.stopPolling();
      running = false;
      clearInterval(timerInterval);
      timerInterval = null;
    } else {
      await window.siscon.startPolling();
      running = true;
      // Timer
      secondsSincePoll = 0;
      updateTimer();
      timerInterval = setInterval(() => {
        secondsSincePoll++;
        updateTimer();
      }, 1000);
    }
    updateStatus();
    addLog('', running ? '▶️ Monitoramento iniciado (5 min)' : '⏸️ Monitoramento pausado');
  }

  function clearLog() {
    logList.innerHTML = '';
    diffSummary.innerHTML = '';
    diff = null;
    // Re-render sem destaque
    if (solicitacoes.length > 0) renderTable(solicitacoes);
    addLog('', '🧹 Registros limpos');
  }

  // --- Events ---
  btnToggle.addEventListener('click', toggleRunning);
  btnPoll.addEventListener('click', pollNow);
  btnClear.addEventListener('click', clearLog);

  filterInput.addEventListener('input', () => {
    if (solicitacoes.length > 0) renderTable(solicitacoes);
  });

  filterSituacao.addEventListener('change', () => {
    if (solicitacoes.length > 0) renderTable(solicitacoes);
  });

  // --- IPC listeners ---
  window.siscon.onPollResult((data) => handlePollResult(data));
  window.siscon.onPollError((msg) => {
    showNotification('error', `Erro: ${msg}`);
    addLog('error', `❌ ${msg}`);
  });
  window.siscon.onStartAutomatic(() => {
    // Auto-start on first load
    toggleRunning();
  });

  addLog('', '🚀 SISCON Monitor carregado');
})();
