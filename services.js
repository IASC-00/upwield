(function(){
  var opts = Array.prototype.slice.call(document.querySelectorAll('.opt'));
  var els = {
    ghost:document.getElementById('p-ghost'), mark:document.getElementById('p-mark'),
    lbl:document.getElementById('p-lbl'), name:document.getElementById('p-name'),
    desc:document.getElementById('p-desc'), caps:document.getElementById('p-caps'),
    price:document.getElementById('p-price'), term:document.getElementById('p-term'),
    count:document.getElementById('p-count'), panel:document.getElementById('panel')
  };

  function render(btn){
    var d = btn.dataset, p = d.pillar;
    opts.forEach(function(o){ o.setAttribute('aria-selected', o===btn ? 'true':'false'); });

    els.ghost.className = 'ghost ' + p;
    els.mark.className  = p;
    els.lbl.className   = 'plbl ' + p;
    els.lbl.textContent = d.lbl;
    els.name.innerHTML  = d.name;
    els.desc.textContent = d.desc;

    var caps = d.caps.split('|');
    els.caps.innerHTML = caps.map(function(c){
      return '<div class="cap"><span class="ck">✓</span>' + c + '</div>';
    }).join('');
    els.count.textContent = caps.length + ' capabilities';
    els.price.firstChild.nodeValue = d.price;
    els.term.textContent = d.term;
  }

  opts.forEach(function(btn){
    btn.addEventListener('click', function(){ render(btn); });
    btn.addEventListener('mouseenter', function(){ render(btn); });
    btn.addEventListener('focus', function(){ render(btn); });
  });

  render(opts[0]);
})();
