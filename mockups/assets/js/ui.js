// ui.js — presentational helpers for mockups only.
document.addEventListener('click', function (e) {
  // Tabs: <button data-tab="#panelId"> toggles sibling .tab-panel visibility
  var tab = e.target.closest('[data-tab]');
  if (tab) {
    var group = tab.closest('[data-tabs]');
    group.querySelectorAll('[data-tab]').forEach(function (t) { t.classList.toggle('active', t === tab); });
    group.querySelectorAll('.tab-panel').forEach(function (p) {
      p.hidden = ('#' + p.id) !== tab.getAttribute('data-tab');
    });
  }
  // Modal open/close: [data-open="#modalId"] and [data-close]
  var opener = e.target.closest('[data-open]');
  if (opener) { document.querySelector(opener.getAttribute('data-open')).hidden = false; }
  if (e.target.closest('[data-close]') || e.target.classList.contains('modal-backdrop')) {
    var m = e.target.closest('.modal-backdrop'); if (m) m.hidden = true;
  }
  // Mobile drawer
  var drawer = e.target.closest('[data-drawer]');
  if (drawer) { document.querySelector('.sidebar').classList.toggle('open'); }
});
