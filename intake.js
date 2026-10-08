/* ============================================================
   Upwield intake wizard — vanilla JS, no deps.
   Submit path:
   • If a Formspree form id is set below (replace YOUR_FORM_ID),
     answers POST straight to the inbox — seamless, server-side.
   • Until then it falls back to a prefilled mailto: to
     hello@upwield.com, so a real submission is NEVER lost — it
     opens the visitor's email with every answer filled in.
   ============================================================ */
const ENDPOINT = "https://formspree.io/f/mzdaldva"; // Ian's Formspree form → iswaindev@proton.me
const DEMO = ENDPOINT.includes("YOUR_FORM_ID");

const form   = document.getElementById('intake');
const steps  = [...form.querySelectorAll('.step')];
const segs   = [...document.querySelectorAll('.seg')];
const card   = document.getElementById('card');
const back   = document.getElementById('back');
const next   = document.getElementById('next');
const count  = document.getElementById('count');
const werr   = document.getElementById('werr');
const ptag   = document.getElementById('pillarTag');
let i = 0;

const ACCENT = {sharp:'var(--ember)', lean:'var(--teal)', both:'var(--ink)'};
const PNAME  = {sharp:'Look sharp', lean:'Run lean', both:'Both'};

function setAccent(need){
  card.style.setProperty('--accent', ACCENT[need] || 'var(--ember)');
  if(PNAME[need]){ ptag.textContent = PNAME[need]; ptag.classList.add('show'); }
  else { ptag.classList.remove('show'); }
}

function show(n){
  steps.forEach((s,k)=>s.classList.toggle('active', k===n));
  segs.forEach((s,k)=>s.classList.toggle('on', k<=n));
  count.textContent = String(n+1).padStart(2,'0') + ' / 05';
  back.hidden = n===0;
  next.innerHTML = n===steps.length-1
    ? 'Send it <span class="arr">&rarr;</span>'
    : 'Continue <span class="arr">&rarr;</span>';
  werr.classList.remove('show');
  const h = steps[n].querySelector('.q'); if(h){ h.setAttribute('tabindex','-1'); h.focus({preventScroll:true}); }
  card.scrollIntoView({behavior:'smooth', block:'start'});
}

function fail(msg){ werr.textContent = msg; werr.classList.add('show'); }

function validStep(){
  const req = (steps[i].dataset.req || '').split(',').filter(Boolean);
  for(const field of req){
    const els = form.elements[field];
    if(!els){ continue; }
    // radio group → RadioNodeList
    if(els.length && els[0] && els[0].type==='radio'){
      if(![...els].some(r=>r.checked)){ fail('Pick one to keep going.'); return false; }
      continue;
    }
    const val = (els.value||'').trim();
    if(!val){ fail('Just this one before we move on.'); els.focus(); return false; }
    if(field==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)){ fail('That email looks off — mind checking it?'); els.focus(); return false; }
  }
  return true;
}

function buildMailto(){
  const g = n => (((form.elements[n]||{}).value)||'').trim();
  const pick = n => ((form.querySelector('input[name="'+n+'"]:checked')||{}).value||'—');
  const needL = PNAME[pick('need')] || '—';
  const body = [
    'New project inquiry via the Upwield site.','',
    'What they need: '+needL,
    'The situation: '+(g('trigger')||'—'),
    'Organization: '+(g('org_name')||'—'),
    'What they do: '+(g('org_what')||'—'),
    'Team size: '+pick('team_size'),
    'Timeline: '+pick('timeline'),
    'Budget: '+(g('budget')||'—'),'',
    'Name: '+(g('name')||'—'),
    'Email: '+(g('email')||'—')
  ].join('\n');
  const subj = 'Upwield project — '+(g('name')||'inquiry')+' ('+needL+')';
  return 'mailto:hello@upwield.com?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
}

function showSuccess(mode){
  const name = ((((form.elements['name']||{}).value))||'').trim().split(' ')[0];
  const need = (form.querySelector('input[name="need"]:checked')||{}).value;
  document.getElementById('progress').style.display='none';
  form.style.display='none';
  const ttl = document.getElementById('doneTtl');
  const msg = document.getElementById('doneMsg');
  const row = document.getElementById('doneRow');
  if(mode==='mailto'){
    ttl.textContent = name ? `Last step, ${name} —` : 'One last step —';
    msg.textContent = "Your answers are ready. Open your email (everything's filled in already) and hit send — you'll hear back within a business day. Or write hello@upwield.com.";
    row.innerHTML = '<a class="btn btn-accent" id="mailtoBtn" href="#">Open email &amp; send <span class="arr">&rarr;</span></a><a class="btn btn-ghost" href="index.html">Back to home</a>';
    document.getElementById('mailtoBtn').href = buildMailto();
  } else {
    ttl.textContent = name ? `Got it — thanks, ${name}.` : 'Got it.';
    msg.textContent = need==='sharp'
      ? "We'll reply by email within one business day with the fastest way to sharpen how you show up — a real scope, not a sales call."
      : need==='lean'
      ? "We'll reply by email within one business day with the fastest busywork to kill first — a real scope, not a sales call."
      : "Expect a reply by email within one business day with the fastest next step.";
    row.innerHTML = '<a class="btn btn-ink" href="index.html#work">See the work <span class="arr">&rarr;</span></a><a class="btn btn-ghost" href="index.html">Back to home</a>';
  }
  document.getElementById('done').classList.add('show');
  card.scrollIntoView({behavior:'smooth', block:'start'});
}

async function send(){
  const data = new FormData(form);
  data.set('_subject', `New Upwield intake — ${data.get('name')||'someone'} (${PNAME[data.get('need')]||'—'})`);
  data.set('_replyto', data.get('email')||'');   // reply goes straight to the lead
  if(new URLSearchParams(location.search).get('from')==='audit'){   // came from audit.html's CTA
    data.set('entry', 'audit');
    data.set('_subject', data.get('_subject')+' · Automation Audit');
  }
  if(DEMO){ showSuccess('mailto'); return; }   // no Formspree id yet → prefilled email, nothing lost
  next.disabled = true; next.textContent = 'Sending…';
  try{
    const res = await fetch(ENDPOINT, {method:'POST', body:data, headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error('bad');
    showSuccess('sent');
  }catch(e){
    next.disabled = false; next.innerHTML = 'Send it <span class="arr">&rarr;</span>';
    fail("Something hiccuped and your answers didn't send. Nothing you typed is lost — give it a minute and hit Send again.");
  }
}

// submit handles both "Continue" and final "Send it"
form.addEventListener('submit', e=>{
  e.preventDefault();
  if(!validStep()) return;
  if(i === steps.length-1) send();
  else { i++; show(i); }
});
back.addEventListener('click', ()=>{ if(i>0){ i--; show(i); } });

// recolor as soon as a pillar is chosen
form.querySelectorAll('input[name="need"]').forEach(r=>{
  r.addEventListener('change', ()=>setAccent(r.value));
});

// Enter advances (but not inside the textarea)
form.addEventListener('keydown', e=>{
  if(e.key==='Enter' && e.target.tagName!=='TEXTAREA'){ e.preventDefault(); next.click(); }
});

// deep-link: intake.html?need=sharp|lean|both pre-selects Q1
const need = new URLSearchParams(location.search).get('need');
if(need){
  const r = form.querySelector(`input[name="need"][value="${need}"]`);
  if(r){ r.checked = true; setAccent(need); }
}
