/* app.js — orquestra carregamento, estado dos filtros e renderização */
(function (D) {
  const DATA_URL = '../Base_Consolidada.xlsx';

  const state = {
    db: null,
    filters: { filial: '', categoria: '', fornecedor: '' },
    sort: { key: 'liquido', asc: false },
    chartsReady: false
  };

  function setFilters(f) {
    state.filters = { ...state.filters, ...f };
    D.ui.syncFilters(state.filters);
    render();
  }
  const toggle = (key, value) => setFilters({ [key]: state.filters[key] === value ? '' : value });

  function render() {
    const a = D.aggregate(state.db, state.filters);
    D.ui.kpis(a);
    D.ui.categorias(a, state.filters, cat => toggle('categoria', cat));
    D.ui.abc(a);
    D.ui.topProdutos(a);
    D.ui.topClientes(a);
    D.ui.estoque(a);
    D.ui.table(a, state.filters, state.sort,
      key => {
        state.sort = state.sort.key === key ? { key, asc: !state.sort.asc } : { key, asc: key === 'filial' || key === 'cidade' };
        render();
      },
      filial => toggle('filial', filial));
    D.charts.update(a, state.filters);
  }

  function start(db) {
    state.db = db;
    state.filters = { filial: '', categoria: '', fornecedor: '' };
    D.ui.fillFilters(db.dims);
    D.ui.syncFilters(state.filters);
    D.ui.header(db);
    if (!state.chartsReady) {
      D.charts.init(db.dims, {
        onFilial: f => toggle('filial', f),
        onCategoria: c => toggle('categoria', c),
        onFornecedor: label => toggle('fornecedor', D.charts.fornecedorFromLabel(label))
      });
      state.chartsReady = true;
    }
    D.ui.hideOverlay();
    render();
  }

  async function fromFile(file) {
    D.ui.loading(`Lendo ${file.name}`);
    try {
      start(await D.loadFromFile(file));
    } catch (err) {
      console.error(err);
      D.ui.askFile(`Não foi possível ler <b>${D.esc(file.name)}</b>: ${D.esc(err.message)}`);
    }
  }

  async function boot() {
    D.ui.bindFileInputs(fromFile);
    D.ui.bindFilters(f => setFilters(f));
    D.ui.bindNav();

    if (typeof XLSX === 'undefined' || typeof Chart === 'undefined') {
      D.ui.askFile('As bibliotecas (SheetJS e Chart.js) não carregaram. Verifique a conexão com a internet e recarregue a página.');
      document.getElementById('dropzone').hidden = true;
      return;
    }

    D.ui.loading();
    try {
      start(await D.loadFromUrl(DATA_URL));
    } catch (err) {
      console.warn('Leitura automática falhou:', err);
      D.ui.askFile();
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.Dash);
