/* data.js — leitura da planilha (SheetJS) e agregações dos indicadores */
window.Dash = window.Dash || {};

(function (D) {
  const SHEET_MAIN = 'Base-Consolidada';
  const CATEGORIAS_PADRAO = ['Notebook', 'Monitor', 'Periférico', 'Armazenamento', 'Rede'];

  const txt = v => (v == null ? '' : String(v).normalize('NFC').trim());
  const num = v => (typeof v === 'number' ? v : Number(String(v).replace(',', '.')) || 0);

  function sheetRows(wb, name) {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    // Cabeçalhos podem vir com espaços (ex.: " Venda "): normaliza os nomes das colunas
    return XLSX.utils.sheet_to_json(ws, { defval: null }).map(r => {
      const o = {};
      for (const k in r) o[k.normalize('NFC').trim()] = r[k];
      return o;
    });
  }

  /* ---------- Leitura ---------- */
  function parseWorkbook(buffer) {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    if (!wb.Sheets[SHEET_MAIN]) {
      throw new Error(`A aba "${SHEET_MAIN}" não foi encontrada. Abas disponíveis: ${wb.SheetNames.join(', ')}`);
    }

    const vendas = sheetRows(wb, SHEET_MAIN)
      .filter(r => r.ID != null && r.Produto != null)
      .map(r => {
        const qtd = num(r.Qtd), valor = num(r.Valor), desc = num(r.Desc);
        const bruto = r.Venda != null ? num(r.Venda) : qtd * valor;
        const liquido = r['Venda + desconto'] != null ? num(r['Venda + desconto']) : bruto * (1 - desc / 100);
        return {
          id: r.ID,
          data: r.Data instanceof Date ? r.Data : null,
          cliente: txt(r.Cliente),
          produto: txt(r.Produto),
          qtd, valor, desc, bruto, liquido,
          filial: txt(r.Filial),
          cidade: txt(r.Cidade),
          estado: txt(r.Estado),
          categoria: txt(r.Categoria),
          fornecedor: txt(r.Fornecedor)
        };
      });

    // Cadastro de produtos (categoria/fornecedor) para cruzar com o estoque
    const cadastro = new Map();
    sheetRows(wb, 'Produtos').forEach(p => {
      cadastro.set(txt(p.Nome), { codigo: txt(p.Codigo), categoria: txt(p.Categoria), fornecedor: txt(p.Fornecedor) });
    });

    const estoque = sheetRows(wb, 'Estoque')
      .filter(r => r.Produto != null)
      .map(r => {
        const nome = txt(r.Produto);
        const c = cadastro.get(nome) || {};
        return { produto: nome, estoque: num(r.Estoque), categoria: c.categoria || '', fornecedor: c.fornecedor || '', codigo: c.codigo || '' };
      });

    const catSheet = sheetRows(wb, 'Categorias').map(r => txt(r.Categoria)).filter(Boolean);
    const categoriasVenda = [...new Set(vendas.map(v => v.categoria))];
    const categorias = (catSheet.length ? catSheet : CATEGORIAS_PADRAO)
      .filter(c => categoriasVenda.includes(c))
      .concat(categoriasVenda.filter(c => !catSheet.includes(c)).sort(D.natural));

    const datas = vendas.map(v => v.data).filter(Boolean);
    const periodo = datas.length
      ? { ini: new Date(Math.min(...datas)), fim: new Date(Math.max(...datas)) }
      : null;

    return {
      vendas,
      estoque,
      periodo,
      dims: {
        filiais: [...new Set(vendas.map(v => v.filial))].sort(D.natural),
        categorias,
        fornecedores: [...new Set(vendas.map(v => v.fornecedor))].sort(D.natural)
      },
      cidadeDaFilial: new Map(vendas.map(v => [v.filial, v.cidade]))
    };
  }

  D.loadFromUrl = async function (url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseWorkbook(await res.arrayBuffer());
  };

  D.loadFromFile = async function (file) {
    return parseWorkbook(await file.arrayBuffer());
  };

  /* ---------- Agregações ---------- */
  function groupBy(rows, key) {
    const m = new Map();
    for (const r of rows) {
      const k = r[key];
      let g = m.get(k);
      if (!g) { g = { key: k, vendas: 0, itens: 0, bruto: 0, liquido: 0, ref: r }; m.set(k, g); }
      g.vendas++;
      g.itens += r.qtd;
      g.bruto += r.bruto;
      g.liquido += r.liquido;
    }
    return m;
  }

  D.aggregate = function (db, f) {
    const rows = db.vendas.filter(v =>
      (!f.filial || v.filial === f.filial) &&
      (!f.categoria || v.categoria === f.categoria) &&
      (!f.fornecedor || v.fornecedor === f.fornecedor));

    const bruto = rows.reduce((s, r) => s + r.bruto, 0);
    const liquido = rows.reduce((s, r) => s + r.liquido, 0);
    const itens = rows.reduce((s, r) => s + r.qtd, 0);
    const comDesc = rows.filter(r => r.desc > 0);

    const kpis = {
      bruto, liquido, itens,
      desconto: bruto - liquido,
      vendas: rows.length,
      ticket: rows.length ? liquido / rows.length : 0,
      clientes: new Set(rows.map(r => r.cliente)).size,
      pctComDesc: rows.length ? comDesc.length / rows.length : 0,
      descMedio: comDesc.length ? comDesc.reduce((s, r) => s + r.desc, 0) / comDesc.length : 0
    };

    // Faixas de desconto (0%, 5%, 10%…)
    const faixasMap = new Map();
    rows.forEach(r => faixasMap.set(r.desc, (faixasMap.get(r.desc) || 0) + 1));
    const faixas = [...faixasMap.entries()].sort((a, b) => a[0] - b[0]).map(([desc, n]) => ({ desc, n }));

    // Filiais: mantém todas no eixo (zeradas quando filtradas) para o gráfico não "pular"
    const gFil = groupBy(rows, 'filial');
    const filiais = db.dims.filiais.map(fl => {
      const g = gFil.get(fl) || { vendas: 0, itens: 0, bruto: 0, liquido: 0 };
      return {
        filial: fl, cidade: db.cidadeDaFilial.get(fl) || '',
        vendas: g.vendas, itens: g.itens, bruto: g.bruto, liquido: g.liquido,
        desconto: g.bruto - g.liquido, ticket: g.vendas ? g.liquido / g.vendas : 0
      };
    });

    const gCat = groupBy(rows, 'categoria');
    const categorias = db.dims.categorias.map(c => ({ categoria: c, liquido: (gCat.get(c) || {}).liquido || 0 }));

    const fornecedores = [...groupBy(rows, 'fornecedor').values()]
      .map(g => ({ fornecedor: g.key, liquido: g.liquido }))
      .sort((a, b) => b.liquido - a.liquido);

    const produtos = [...groupBy(rows, 'produto').values()]
      .map(g => ({ produto: g.key, categoria: g.ref.categoria, fornecedor: g.ref.fornecedor, liquido: g.liquido, itens: g.itens, vendas: g.vendas }))
      .sort((a, b) => b.liquido - a.liquido);

    // Curva ABC (acumulado % do faturamento por produto)
    let acc = 0;
    const abc = produtos.map((p, i) => {
      acc += p.liquido;
      const cum = liquido ? acc / liquido : 0;
      return { rank: i + 1, produto: p.produto, liquido: p.liquido, cum };
    });
    // Classe pelo acumulado ANTES do produto entrar (o produto que cruza 80% ainda é A)
    const classe = { A: 0, B: 0, C: 0 };
    abc.forEach(p => {
      const antes = p.cum - (liquido ? p.liquido / liquido : 0);
      p.classe = antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C';
      classe[p.classe]++;
    });

    const clientes = [...groupBy(rows, 'cliente').values()]
      .map(g => ({ cliente: g.key, liquido: g.liquido, compras: g.vendas, itens: g.itens }))
      .sort((a, b) => b.liquido - a.liquido);

    // Estoque (geral — não depende de filial)
    const est = db.estoque.filter(e =>
      (!f.categoria || e.categoria === f.categoria) &&
      (!f.fornecedor || e.fornecedor === f.fornecedor));
    const estoque = {
      total: est.reduce((s, e) => s + e.estoque, 0),
      produtos: est.length,
      max: Math.max(1, ...db.estoque.map(e => e.estoque)),
      criticos: [...est].sort((a, b) => a.estoque - b.estoque).slice(0, 6),
      abaixo30: est.filter(e => e.estoque < 30).length
    };

    return { kpis, faixas, filiais, categorias, fornecedores, produtos, abc, classe, clientes, estoque };
  };
})(window.Dash);
