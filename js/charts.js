/* charts.js — criação e atualização animada dos gráficos (Chart.js) */
window.Dash = window.Dash || {};

(function (D) {
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const C = {};
  const charts = {};

  /* Cores categóricas (ordem fixa validada para fundo escuro) — a cor segue a categoria, não o ranking */
  const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
  const catColor = new Map();
  D.colorForCategoria = cat => catColor.get(cat) || '#8d847c';

  function setupDefaults() {
    Object.assign(C, {
      text: css('--text'), text2: css('--text-2'), muted: css('--muted'),
      accent: css('--accent'), accentSoft: css('--accent-soft'),
      track: css('--track'), grid: css('--grid'), card: css('--card'), card2: css('--card-2')
    });
    Chart.defaults.font.family = css('--font');
    Chart.defaults.font.size = 12;
    Chart.defaults.color = C.muted;
    Chart.defaults.borderColor = C.grid;
    Chart.defaults.animation.duration = 1100;
    Chart.defaults.animation.easing = 'easeOutQuart';
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.responsive = true;

    const tt = Chart.defaults.plugins.tooltip;
    tt.backgroundColor = '#0f0d0c';
    tt.titleColor = C.text;
    tt.bodyColor = C.text2;
    tt.borderColor = 'rgba(255,255,255,.1)';
    tt.borderWidth = 1;
    tt.padding = 10;
    tt.cornerRadius = 8;
    tt.titleFont = { weight: '600' };
    tt.boxPadding = 4;
    tt.usePointStyle = true;
  }

  /* Atraso escalonado: barras "crescem" uma após a outra na primeira carga */
  const stagger = {
    delay(ctx) {
      if (ctx.type !== 'data' || ctx.mode !== 'default' || ctx.chart._staggered) return 0;
      return ctx.dataIndex * 70;
    },
    onComplete(e) { e.chart._staggered = true; }
  };

  /* Linha vertical seguindo o mouse (crosshair) */
  const crosshair = {
    id: 'crosshair',
    afterDatasetsDraw(chart) {
      const a = chart.tooltip && chart.tooltip.getActiveElements();
      if (!a || !a.length) return;
      const x = a[0].element.x, { top, bottom } = chart.chartArea, g = chart.ctx;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.lineWidth = 1;
      g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke();
      g.restore();
    }
  };

  function barWithTrack(id, horizontal, onPick) {
    const valueAxis = {
      grid: { color: C.grid, drawTicks: false },
      border: { display: false },
      ticks: { callback: v => D.fmt.compact(v), padding: 8, maxTicksLimit: 6 },
      beginAtZero: true,
      // O máximo do eixo acompanha o trilho; esconde esse último rótulo se ficar "fora do passo" (evita sobreposição)
      afterBuildTicks: s => {
        const t = s.ticks;
        if (t.length > 2 && t[t.length - 1].value - t[t.length - 2].value < (t[1].value - t[0].value) * 0.999) t.pop();
      }
    };
    const catAxis = { grid: { display: false }, border: { display: false }, ticks: { color: C.text2, padding: 6 } };
    const chart = new Chart(document.getElementById(id), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Faturamento líquido', data: [], order: 0, grouped: false,
            backgroundColor: C.accent, hoverBackgroundColor: C.accentSoft,
            borderRadius: 6, borderSkipped: false,
            barPercentage: horizontal ? 0.62 : 0.55, categoryPercentage: 0.85
          },
          {
            label: 'trilho', data: [], order: 1, grouped: false,
            backgroundColor: C.track, hoverBackgroundColor: C.track,
            borderRadius: 6, borderSkipped: false,
            barPercentage: horizontal ? 0.62 : 0.55, categoryPercentage: 0.85
          }
        ]
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        animation: stagger,
        interaction: { mode: 'index', axis: horizontal ? 'y' : 'x', intersect: false },
        scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: i => i.datasetIndex === 0,
            callbacks: { label: i => ' ' + D.fmt.brl(i.raw) }
          }
        },
        onHover: (e, els) => { e.native.target.style.cursor = onPick && els.length ? 'pointer' : 'default'; }
      }
    });
    if (onPick) bindPick(chart, 'index', { intersect: false, axis: horizontal ? 'y' : 'x' }, onPick);
    return chart;
  }

  /* Clique num elemento do gráfico -> callback com o rótulo (listener nativo no canvas) */
  function bindPick(chart, mode, opts, onPick) {
    chart.canvas.addEventListener('click', ev => {
      const els = chart.getElementsAtEventForMode(ev, mode, opts, true);
      if (els.length) onPick(chart.data.labels[els[0].index]);
    });
  }

  function setBars(chart, labels, values, highlight) {
    const max = Math.max(1, ...values) * 1.06;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[1].data = values.map(() => max);
    chart.options.scales[chart.options.indexAxis === 'y' ? 'x' : 'y'].max = max;
    // Destaca a barra selecionada no filtro (as demais ficam mais apagadas)
    chart.data.datasets[0].backgroundColor = labels.map(l => (!highlight || l === highlight ? C.accent : 'rgba(255,106,0,.35)'));
    chart.update();
  }

  /* ---------- API ---------- */
  D.charts = {
    init(dims, handlers) {
      setupDefaults();
      dims.categorias.forEach((c, i) => catColor.set(c, SERIES[i % SERIES.length]));

      charts.filial = barWithTrack('chFilial', false, handlers.onFilial);
      charts.fornecedor = barWithTrack('chFornecedor', true, handlers.onFornecedor);

      charts.gauge = new Chart(document.getElementById('chGauge'), {
        type: 'doughnut',
        data: { labels: ['Com desconto', 'Sem desconto'], datasets: [{ data: [0, 1], backgroundColor: [C.accent, C.track], borderWidth: 0, borderRadius: 20 }] },
        options: {
          cutout: '76%',
          animation: { animateRotate: true, duration: 1400 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
      });

      charts.categoria = new Chart(document.getElementById('chCategoria'), {
        type: 'doughnut',
        data: {
          labels: dims.categorias,
          datasets: [{
            data: dims.categorias.map(() => 0),
            backgroundColor: dims.categorias.map(D.colorForCategoria),
            borderColor: C.card, borderWidth: 2, hoverOffset: 8
          }]
        },
        options: {
          cutout: '68%',
          layout: { padding: 8 },
          animation: { animateRotate: true, animateScale: true, duration: 1300 },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: i => {
                  const total = i.dataset.data.reduce((s, v) => s + v, 0) || 1;
                  return ` ${i.label}: ${D.fmt.brl(i.raw)} (${D.fmt.pct(i.raw / total)})`;
                }
              }
            }
          },
          onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
        }
      });
      bindPick(charts.categoria, 'nearest', { intersect: true }, handlers.onCategoria);

      const ctxAbc = document.getElementById('chAbc').getContext('2d');
      charts.abc = new Chart(ctxAbc, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Faturamento acumulado', data: [], borderColor: C.accent, borderWidth: 2,
              pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: C.accent,
              pointHoverBorderColor: C.card, pointHoverBorderWidth: 2,
              tension: 0.25, fill: 'start',
              backgroundColor: ctx => {
                const { chartArea } = ctx.chart;
                if (!chartArea) return 'rgba(255,106,0,.15)';
                const g = ctx.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                g.addColorStop(0, 'rgba(255,106,0,.35)');
                g.addColorStop(1, 'rgba(255,106,0,0)');
                return g;
              }
            },
            {
              label: 'Corte 80% (classe A)', data: [], borderColor: C.muted, borderWidth: 1,
              borderDash: [5, 5], pointRadius: 0, pointHoverRadius: 0, fill: false
            }
          ]
        },
        options: {
          animation: { duration: 1400 },
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              grid: { display: false }, border: { color: C.grid },
              title: { display: true, text: 'Produtos ordenados por faturamento (ranking)', color: C.muted },
              ticks: { maxTicksLimit: 10, autoSkip: true, maxRotation: 0 }
            },
            y: {
              min: 0, max: 1, grid: { color: C.grid, drawTicks: false }, border: { display: false },
              ticks: { callback: v => Math.round(v * 100) + '%', stepSize: 0.2, padding: 8 }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              filter: i => i.datasetIndex === 0,
              callbacks: {
                title: items => {
                  const p = charts.abc._abc[items[0].dataIndex];
                  return `#${p.rank} · ${p.produto} (classe ${p.classe})`;
                },
                label: i => ` Acumulado: ${D.fmt.pct(i.raw)}`,
                afterLabel: i => ` Faturamento: ${D.fmt.brl(charts.abc._abc[i.dataIndex].liquido)}`
              }
            }
          }
        },
        plugins: [crosshair]
      });
    },

    update(agg, f) {
      setBars(charts.filial, agg.filiais.map(x => x.filial), agg.filiais.map(x => x.liquido), f.filial);
      setBars(charts.fornecedor, agg.fornecedores.map(x => x.fornecedor.replace(' Brasil', '')), agg.fornecedores.map(x => x.liquido), null);
      charts.fornecedor._names = agg.fornecedores.map(x => x.fornecedor);

      const p = agg.kpis.pctComDesc;
      charts.gauge.data.datasets[0].data = [p, Math.max(0, 1 - p)];
      charts.gauge.update();

      const cat = charts.categoria;
      cat.data.datasets[0].data = agg.categorias.map(x => x.liquido);
      cat.data.datasets[0].backgroundColor = agg.categorias.map(x =>
        !f.categoria || x.categoria === f.categoria ? D.colorForCategoria(x.categoria) : D.colorForCategoria(x.categoria) + '40');
      cat.update();

      const abc = charts.abc;
      abc._abc = agg.abc;
      abc.data.labels = agg.abc.map(x => x.rank);
      abc.data.datasets[0].data = agg.abc.map(x => x.cum);
      abc.data.datasets[1].data = agg.abc.map(() => 0.8);
      abc.update();
    },

    /* Nome completo do fornecedor a partir do rótulo curto exibido no eixo */
    fornecedorFromLabel(label) {
      const names = charts.fornecedor._names || [];
      return names.find(n => n.replace(' Brasil', '') === label) || label;
    }
  };
})(window.Dash);
