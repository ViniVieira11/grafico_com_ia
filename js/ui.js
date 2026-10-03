/* ui.js — indicadores, listas, tabela, filtros e tela de carregamento */
window.Dash = window.Dash || {};

(function (D) {
  const $ = id => document.getElementById(id);
  const ICON = {
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2zM12 10v5M12 18h.01"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16h.01"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>'
  };

  /* ---------- Overlay ---------- */
  D.ui = {
    loading(msg) {
      $('overlay').classList.remove('hide');
      $('spinner').hidden = false;
      $('dropzone').hidden = true;
      $('overlayTitle').textContent = 'Carregando planilha…';
      $('overlayMsg').textContent = msg || 'Lendo Base_Consolidada.xlsx';
    },
    askFile(reason) {
      $('overlay').classList.remove('hide');
      $('spinner').hidden = true;
      $('dropzone').hidden = false;
      $('overlayTitle').textContent = 'Selecione a planilha';
      $('overlayMsg').innerHTML = reason ||
        'O navegador bloqueia a leitura automática de arquivos locais. Use o <code>iniciar_dashboard.bat</code> ou selecione o arquivo abaixo.';
    },
    hideOverlay() { $('overlay').classList.add('hide'); },

    bindFileInputs(onFile) {
      ['fileInput', 'fileInputSide'].forEach(id => $(id).addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) onFile(file);
        e.target.value = '';
      }));
      const dz = $('dropzone');
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) onFile(f); });
    },

    /* ---------- Filtros ---------- */
    fillFilters(dims) {
      const fill = (id, items, all) => {
        $(id).innerHTML = `<option value="">${all}</option>` + items.map(v => `<option>${D.esc(v)}</option>`).join('');
      };
      fill('fFilial', dims.filiais, 'Todas');
      fill('fCategoria', dims.categorias, 'Todas');
      fill('fFornecedor', dims.fornecedores, 'Todos');
    },
    bindFilters(onChange) {
      const read = () => ({ filial: $('fFilial').value, categoria: $('fCategoria').value, fornecedor: $('fFornecedor').value });
      ['fFilial', 'fCategoria', 'fFornecedor'].forEach(id => $(id).addEventListener('change', () => onChange(read())));
      $('btnClear').addEventListener('click', () => onChange({ filial: '', categoria: '', fornecedor: '' }));
    },
    syncFilters(f) {
      $('fFilial').value = f.filial;
      $('fCategoria').value = f.categoria;
      $('fFornecedor').value = f.fornecedor;
      ['fFilial', 'fCategoria', 'fFornecedor'].forEach(id => $(id).classList.toggle('on', !!$(id).value));
      $('btnClear').disabled = !(f.filial || f.categoria || f.fornecedor);
    },

    /* ---------- Cabeçalho ---------- */
    header(db) {
      const p = db.periodo;
      let periodo = '—';
      if (p) periodo = +p.ini === +p.fim ? D.fmt.date(p.ini) : `${D.fmt.date(p.ini)} – ${D.fmt.date(p.fim)}`;
      $('kPeriodo').textContent = periodo;
      $('subtitle').textContent = `Base consolidada · ${p ? D.fmt.monthYear(p.ini) : ''} · ${D.fmt.int(db.vendas.length)} registros · ${db.dims.filiais.length} filiais`;
    },

    /* ---------- KPIs ---------- */
    kpis(a) {
      const k = a.kpis;
      D.countUp($('kLiquido'), k.liquido, D.fmt.brl);
      D.countUp($('kVendasHero'), k.vendas, D.fmt.int);
      D.countUp($('kBruto'), k.bruto, D.fmt.brl);
      D.countUp($('kDesc'), k.desconto, v => '− ' + D.fmt.brl(v));
      $('kDescPct').textContent = k.bruto ? `${D.fmt.pct(k.desconto / k.bruto)} do bruto` : '—';
      D.countUp($('kVendas'), k.vendas, D.fmt.int);
      $('kClientes').textContent = `${D.fmt.int(k.clientes)} clientes distintos`;
      D.countUp($('kTicket'), k.ticket, D.fmt.brl2);
      D.countUp($('kItens'), k.itens, D.fmt.int);
      $('kItensMedia').textContent = k.vendas ? `${(k.itens / k.vendas).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} itens por venda` : '—';
      D.countUp($('kEstoque'), a.estoque.total, D.fmt.int);
      $('kEstoqueSub').textContent = `${D.fmt.int(a.estoque.produtos)} produtos · ${a.estoque.abaixo30} abaixo de 30 un.`;

      // Gauge de desconto
      D.countUp($('gPct'), k.pctComDesc * 100, v => Math.round(v) + '%');
      $('gMedio').textContent = D.fmt.pct(k.descMedio / 100, 1);
      $('gTotal').textContent = D.fmt.brl(k.desconto);
      const maxN = Math.max(1, ...a.faixas.map(x => x.n));
      $('faixas').innerHTML = a.faixas.map(x => `
        <li><span>${x.desc ? x.desc + '% off' : 'Sem desconto'}</span>
            <div class="bar"><i data-w="${(x.n / maxN) * 100}"></i></div>
            <b>${D.fmt.int(x.n)}</b></li>`).join('');
      growBars($('faixas'));
    },

    /* ---------- Legenda de categorias ---------- */
    categorias(a, f, onPick) {
      const total = a.categorias.reduce((s, c) => s + c.liquido, 0);
      $('catTotal').textContent = D.fmt.compact(total);
      const ul = $('catLegend');
      ul.innerHTML = a.categorias.map(c => `
        <li data-cat="${D.esc(c.categoria)}" class="${f.categoria === c.categoria ? 'on' : ''}" tabindex="0" role="button">
          <i class="sw" style="background:${D.colorForCategoria(c.categoria)}"></i>
          <span>${D.esc(c.categoria)}</span>
          <b>${D.fmt.compact(c.liquido)}</b>
          <em>${total ? D.fmt.pct(c.liquido / total, 0) : '0%'}</em>
        </li>`).join('');
      ul.querySelectorAll('li').forEach(li => {
        const pick = () => onPick(li.dataset.cat);
        li.addEventListener('click', pick);
        li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      });
    },

    /* ---------- Curva ABC chips ---------- */
    abc(a) {
      $('abcChips').innerHTML =
        `<span class="chip">A <b>${a.classe.A}</b> produtos · 80%</span>
         <span class="chip">B <b>${a.classe.B}</b> · 15%</span>
         <span class="chip">C <b>${a.classe.C}</b> · 5%</span>`;
    },

    /* ---------- Listas ---------- */
    topProdutos(a) {
      const top = a.produtos.slice(0, 6);
      $('topProdCount').textContent = `${a.produtos.length} produtos vendidos`;
      $('topProdutos').innerHTML = top.length ? top.map((p, i) => `
        <li style="--i:${i}">
          <span class="avatar" style="--av:${D.colorForCategoria(p.categoria)}">${D.initials(p.produto)}</span>
          <div><div class="name" title="${D.esc(p.produto)}">${D.esc(p.produto)}</div>
               <div class="sub">${D.esc(p.categoria)} · ${D.fmt.int(p.itens)} un.</div></div>
          <div class="val">${D.fmt.compact(p.liquido)}<small>${p.vendas} vendas</small></div>
        </li>`).join('') : '<li class="empty">Sem vendas para os filtros.</li>';
    },

    topClientes(a) {
      const top = a.clientes.slice(0, 6);
      $('topClientes').innerHTML = top.length ? top.map((c, i) => `
        <li style="--i:${i}">
          <span class="avatar">${D.esc(c.cliente.replace(/\D/g, '').slice(-3) || D.initials(c.cliente))}</span>
          <div><div class="name">${D.esc(c.cliente)}</div>
               <div class="sub">${c.compras} compras · ${D.fmt.int(c.itens)} itens</div></div>
          <div class="val">${D.fmt.compact(c.liquido)}</div>
        </li>`).join('') : '<li class="empty">Sem vendas para os filtros.</li>';
    },

    estoque(a) {
      const e = a.estoque;
      $('estoqueList').innerHTML = e.criticos.length ? e.criticos.map((p, i) => {
        const st = p.estoque < 30 ? ['critical', ICON.alert, 'Crítico'] : p.estoque < 60 ? ['warn', ICON.warn, 'Atenção'] : ['ok', ICON.ok, 'OK'];
        return `
        <li style="--i:${i}">
          <span class="avatar" style="--av:${D.colorForCategoria(p.categoria)}">${D.initials(p.produto)}</span>
          <div><div class="name" title="${D.esc(p.produto)}">${D.esc(p.produto)}</div>
               <div class="bar"><i data-w="${(p.estoque / e.max) * 100}" style="background:var(--${st[0] === 'ok' ? 'good' : st[0]})"></i></div></div>
          <div class="val">${D.fmt.int(p.estoque)} un.<small class="status ${st[0]}">${st[1]}${st[2]}</small></div>
        </li>`;
      }).join('') : '<li class="empty">Sem produtos para os filtros.</li>';
      growBars($('estoqueList'));
    },

    /* ---------- Tabela ---------- */
    table(a, f, sort, onSort, onRow) {
      const tbl = $('tblFiliais');
      const rows = [...a.filiais].sort((x, y) => {
        const r = typeof x[sort.key] === 'string' ? D.natural(x[sort.key], y[sort.key]) : x[sort.key] - y[sort.key];
        return sort.asc ? r : -r;
      });
      tbl.tBodies[0].innerHTML = rows.map(r => `
        <tr data-filial="${D.esc(r.filial)}" class="${f.filial === r.filial ? 'on' : ''}">
          <td>${D.esc(r.filial)}</td><td>${D.esc(r.cidade)}</td>
          <td class="num">${D.fmt.int(r.vendas)}</td><td class="num">${D.fmt.int(r.itens)}</td>
          <td class="num">${D.fmt.brl(r.bruto)}</td><td class="num neg">− ${D.fmt.brl(r.desconto)}</td>
          <td class="num"><b>${D.fmt.brl(r.liquido)}</b></td><td class="num">${D.fmt.brl2(r.ticket)}</td>
        </tr>`).join('');
      const k = a.kpis;
      tbl.tFoot.innerHTML = `<tr><td>Total</td><td></td>
        <td class="num">${D.fmt.int(k.vendas)}</td><td class="num">${D.fmt.int(k.itens)}</td>
        <td class="num">${D.fmt.brl(k.bruto)}</td><td class="num neg">− ${D.fmt.brl(k.desconto)}</td>
        <td class="num">${D.fmt.brl(k.liquido)}</td><td class="num">${D.fmt.brl2(k.ticket)}</td></tr>`;

      tbl.querySelectorAll('th').forEach(th => {
        th.classList.toggle('sorted', th.dataset.key === sort.key);
        th.classList.toggle('asc', th.dataset.key === sort.key && sort.asc);
        th.onclick = () => onSort(th.dataset.key);
      });
      tbl.tBodies[0].querySelectorAll('tr').forEach(tr => { tr.onclick = () => onRow(tr.dataset.filial); });
    },

    /* ---------- Navegação: destaca a seção visível ---------- */
    bindNav() {
      const links = [...document.querySelectorAll('#nav a')];
      const targets = links.map(l => document.querySelector(l.getAttribute('href'))).filter(Boolean);
      let ticking = false;
      const update = () => {
        ticking = false;
        const line = window.innerHeight * 0.35;
        let current = targets[0];
        if (window.scrollY > 40) targets.forEach(t => { if (t.getBoundingClientRect().top <= line) current = t; });
        // No fim da página, destaca a última seção
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = targets[targets.length - 1];
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + current.id));
      };
      window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
      update();
    }
  };

  /* Barras de progresso crescem a partir do zero */
  function growBars(root) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.querySelectorAll('.bar > i').forEach(i => { i.style.width = i.dataset.w + '%'; });
    }));
  }
})(window.Dash);
