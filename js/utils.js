/* utils.js — formatação e helpers genéricos */
window.Dash = window.Dash || {};

(function (D) {
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const dec1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  D.fmt = {
    brl: v => brl.format(v),
    brl2: v => brl2.format(v),
    int: v => int.format(v),
    pct: (v, d = 1) => (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%',
    /* R$ 57,5 mi · R$ 840 mil */
    compact(v, prefix = 'R$ ') {
      const a = Math.abs(v);
      if (a >= 1e6) return prefix + dec1.format(v / 1e6) + ' mi';
      if (a >= 1e3) return prefix + int.format(v / 1e3) + ' mil';
      return prefix + int.format(v);
    },
    date: d => d.toLocaleDateString('pt-BR'),
    monthYear: d => {
      const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', '/');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
  };

  /* Ordenação natural: "Loja 2" < "Loja 10" */
  D.natural = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });

  D.initials = s => String(s).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  D.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Anima um número de "from" até "to" escrevendo no elemento */
  D.countUp = function (el, to, format, duration = 1100) {
    if (!el) return;
    const from = Number(el.dataset.value || 0);
    el.dataset.value = to;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = format(to); return; }
    const start = performance.now();
    cancelAnimationFrame(el._raf);
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = format(from + (to - from) * e);
      if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  };
})(window.Dash);
