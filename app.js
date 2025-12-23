(() => {
  const $ = (q)=>document.querySelector(q);
  const $$ = (q)=>Array.from(document.querySelectorAll(q));

  // Fullscreen (works when allowed)
  $('#btnFull').addEventListener('click', async () => {
    try{
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen();
      else if (document.exitFullscreen) await document.exitFullscreen();
    }catch(e){}
  });

  // Tabs
  $$('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.dataset.tab;
      ['cal','diag','track'].forEach(k=>{
        $('#panel-'+k).classList.toggle('hidden', k!==t);
      });
    });
  });

  // Try open Free Fire via URL scheme (may not work)
  $('#btnOpenFF').addEventListener('click', ()=>{
    // Known scheme is not official; iOS may block. Fallback is manual.
    window.location.href = 'freefire://';
  });

  // ===== Auto-Calibrate =====
  const arena = $('#arena');
  const startPad = $('#startPad');
  const target = $('#targetDot');
  const arrow = $('#arrow');
  const ghost = $('#ghostPath');
  const stepLabel = $('#calStepLabel');
  const hint = $('#calHint');
  const out = $('#outSettings');

  const steps = [
    {name:'Test 1: Vuốt NGẮN (control)', amp:'short', targetMs: 220},
    {name:'Test 2: Vuốt VỪA (balance)', amp:'mid', targetMs: 210},
    {name:'Test 3: Flick NHANH (speed)', amp:'long', targetMs: 190},
  ];
  const ampMap = { short: 72, mid: 104, long: 138 }; // px baseline (will scale with arena)
  let run = null;

  function arenaRect(){ return arena.getBoundingClientRect(); }

  function setTargetFromStart(angleDeg, distPx){
    const r = arenaRect();
    const sx = 22 + 42; // startPad center relative to arena
    const sy = r.height - (22 + 42);
    const ang = angleDeg * Math.PI/180;
    const tx = sx + Math.cos(ang)*distPx;
    const ty = sy - Math.sin(ang)*distPx;
    target.style.left = tx + 'px';
    target.style.top  = ty + 'px';

    arrow.style.left = sx + 'px';
    arrow.style.top  = sy + 'px';
    arrow.style.width = (distPx) + 'px';
    arrow.style.transform = `rotate(${-angleDeg}deg)`;

    ghost.style.left = sx + 'px';
    ghost.style.top  = sy + 'px';
    ghost.style.width = (distPx) + 'px';
    ghost.style.transform = `rotate(${-angleDeg}deg)`;
  }

  function chooseAngle(){
    // Favor slight diagonal for stability (12PM)
    const options = [10, 15, 20, 25];
    return options[Math.floor(Math.random()*options.length)];
  }

  function scoreAttempt(dtMs, endErrPx){
    // Speed score: best when close to targetMs
    const targetMs = run.current.targetMs;
    const speed = Math.max(0, 1 - Math.abs(dtMs - targetMs)/targetMs);
    // Accuracy score: within 18px is great
    const acc = Math.max(0, 1 - (endErrPx/60));
    const s = 0.55*speed + 0.45*acc;
    return { s, speed, acc };
  }

  function fmtPct(x){ return Math.round(x*100); }

  function computeRecommended(results, shakeSelf){
    // Base for iPhone 12 Pro Max (balanced)
    let base = { general: 92, reddot: 86, x2: 76, x4: 66, awm: 48, freelook: 70 };

    // Derive "speed index" and "control index"
    const avgS = results.reduce((a,r)=>a+r.s,0)/results.length;
    const avgSpeed = results.reduce((a,r)=>a+r.speed,0)/results.length;
    const avgAcc = results.reduce((a,r)=>a+r.acc,0)/results.length;

    // If user is slower than target -> raise general & reddot a bit
    const slow = avgSpeed < 0.55;
    const tooFast = avgSpeed > 0.82;

    if (slow){ base.general += 3; base.reddot += 3; }
    if (tooFast){ base.general -= 2; base.reddot -= 2; }

    // If accuracy is low -> reduce reddot & scopes a little (stability)
    if (avgAcc < 0.58){ base.reddot -= 4; base.x2 -= 3; base.x4 -= 3; }
    else if (avgAcc > 0.78){ base.reddot += 2; base.x2 += 1; }

    // Apply self shake adjustment
    if (shakeSelf === 'high'){ base.reddot -= 4; base.x2 -= 3; base.x4 -= 3; }
    if (shakeSelf === 'low'){ base.reddot += 2; }

    // Clamp
    function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
    base.general = clamp(base.general, 70, 100);
    base.reddot  = clamp(base.reddot, 60, 100);
    base.x2      = clamp(base.x2, 40, 95);
    base.x4      = clamp(base.x4, 30, 90);
    base.awm     = clamp(base.awm, 20, 80);
    base.freelook= clamp(base.freelook, 40, 100);

    return { base, avgS, avgSpeed, avgAcc };
  }

  function renderOut(reco, details){
    const { base, avgS, avgSpeed, avgAcc } = reco;
    const lines = [
      `✅ Setting gợi ý (nhập vào FF):`,
      ``,
      `• Tổng quát:  ${base.general}`,
      `• Red Dot:   ${base.reddot}`,
      `• Scope 2x:  ${base.x2}`,
      `• Scope 4x:  ${base.x4}`,
      `• AWM/Sniper:${base.awm}`,
      `• Free Look: ${base.freelook}`,
      ``,
      `📊 Chỉ số test:`,
      `• Tổng điểm:  ${fmtPct(avgS)}%`,
      `• Tốc độ:     ${fmtPct(avgSpeed)}%`,
      `• Ổn định:    ${fmtPct(avgAcc)}%`,
      ``,
      `🔧 Tinh chỉnh sau 3 trận:`,
      `• Nếu rung/over-kéo: giảm Red Dot 2–5`,
      `• Nếu thiếu lực lên đầu: tăng Tổng quát +2, Red Dot +2`,
      `• Nếu 2x/4x khó giữ tâm: giảm 2x/4x mỗi cái 3`,
    ];
    out.textContent = lines.join('\n');
  }

  function startCal(){
    const preset = $('#ampPreset').value;
    const shakeSelf = $('#shakeSelf').value;

    run = {
      idx: 0,
      angle: chooseAngle(),
      ampPreset: preset,
      shakeSelf,
      results: [],
      startedAt: null,
      startX: null,
      startY: null,
      active: false
    };

    // scale distances with arena width
    const r = arenaRect();
    const scale = Math.min(1.25, Math.max(0.85, r.width/420));
    run.distPx = ampMap[preset] * scale;

    const st = steps[0];
    run.current = st;
    stepLabel.textContent = st.name;
    hint.textContent = 'Chạm giữ ô Start → vuốt theo mũi tên → thả gần chấm đỏ';
    setTargetFromStart(run.angle, run.distPx);
  }

  function resetCal(){
    run = null;
    stepLabel.textContent = 'Chưa bắt đầu';
    hint.textContent = '—';
    out.textContent = 'Chưa có dữ liệu. Nhấn “Bắt đầu test”.';
    // reset visuals
    setTargetFromStart(15, 110);
  }

  $('#btnStartCal').addEventListener('click', startCal);
  $('#btnResetCal').addEventListener('click', resetCal);

  // pointer tracking in arena
  function getLocalPos(e){
    const r = arenaRect();
    const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top, t: performance.now() };
  }

  function padCenter(){
    const r = arenaRect();
    return { x: 22+42, y: r.height-(22+42) };
  }

  function targetPos(){
    return { x: parseFloat(target.style.left), y: parseFloat(target.style.top) };
  }

  function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }

  function onDown(e){
    if(!run) return;
    const p = getLocalPos(e);
    const sc = padCenter();
    if (dist(p, sc) > 60) return; // must start from pad area
    run.active = true;
    run.startedAt = p.t;
    run.startX = p.x;
    run.startY = p.y;
    hint.textContent = 'Đang kéo...';
  }
  function onMove(e){
    if(!run || !run.active) return;
    // No visual cursor needed; keep it lightweight
    e.preventDefault();
  }
  function onUp(e){
    if(!run || !run.active) return;
    const p = getLocalPos(e);
    run.active = false;
    const dt = p.t - run.startedAt;
    const tp = targetPos();
    const err = dist(p, tp);
    const { s, speed, acc } = scoreAttempt(dt, err);
    run.results.push({ dt, err, s, speed, acc, step: run.current.name });

    // move to next step or finish
    run.idx++;
    if (run.idx < steps.length){
      run.current = steps[run.idx];
      run.angle = chooseAngle();
      stepLabel.textContent = run.current.name;
      hint.textContent = `✅ Điểm: ${Math.round(s*100)}% • Tiếp tục bài tiếp theo`;
      // adjust distance a bit per step
      const r = arenaRect();
      const scale = Math.min(1.25, Math.max(0.85, r.width/420));
      const preset = run.ampPreset === 'short' ? 'short' : (run.ampPreset==='mid'?'mid':'long');
      const distBase = ampMap[preset] * scale;
      const stepBoost = (run.idx===0?0:(run.idx===1?12:22));
      setTargetFromStart(run.angle, distBase + stepBoost);
    }else{
      const reco = computeRecommended(run.results, run.shakeSelf);
      renderOut(reco, run.results);
      hint.textContent = '✅ Hoàn tất! Copy số và nhập vào Free Fire.';
      stepLabel.textContent = 'Hoàn tất Auto‑Calibrate';
    }
  }

  // Touch + mouse
  arena.addEventListener('touchstart', onDown, {passive:false});
  arena.addEventListener('touchmove', onMove, {passive:false});
  arena.addEventListener('touchend', onUp, {passive:false});
  arena.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  // init
  setTargetFromStart(15, 110);

  // ===== Diagonal trainer =====
  const diagArena = $('#diagArena');
  const diagStart = $('#diagStart');
  const diagTarget = $('#diagTarget');
  const diagPath = $('#diagPath');
  const diagScore = $('#diagScore');

  function diagRect(){ return diagArena.getBoundingClientRect(); }
  function diagPadCenter(){
    const r = diagRect();
    return { x: 22+42, y: r.height-(22+42) };
  }
  function setDiagTarget(){
    const r = diagRect();
    const sc = diagPadCenter();
    const angle = 15 * Math.PI/180;
    const distPx = Math.min(r.width, r.height) * 0.42;
    const tx = sc.x + Math.cos(angle)*distPx;
    const ty = sc.y - Math.sin(angle)*distPx;
    diagTarget.style.left = tx + 'px';
    diagTarget.style.top  = ty + 'px';

    diagPath.style.left = sc.x + 'px';
    diagPath.style.top  = sc.y + 'px';
    diagPath.style.width = distPx + 'px';
    diagPath.style.transform = 'rotate(-15deg)';
  }
  setDiagTarget();
  window.addEventListener('resize', setDiagTarget);

  let diagRun = {active:false, t0:0, sx:0, sy:0};
  function diagLocal(e){
    const r = diagRect();
    const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top, t: performance.now() };
  }
  function diagTargetPos(){ return { x: parseFloat(diagTarget.style.left), y: parseFloat(diagTarget.style.top) }; }
  function diagOnDown(e){
    const p = diagLocal(e);
    const sc = diagPadCenter();
    if (Math.hypot(p.x-sc.x, p.y-sc.y) > 60) return;
    diagRun = {active:true, t0:p.t, sx:p.x, sy:p.y};
    diagScore.textContent = 'Đang kéo...';
  }
  function diagOnUp(e){
    if(!diagRun.active) return;
    const p = diagLocal(e);
    diagRun.active = false;
    const dt = p.t - diagRun.t0;
    const err = Math.hypot(p.x-diagTargetPos().x, p.y-diagTargetPos().y);
    const speedScore = Math.max(0, 1 - Math.abs(dt-210)/210);
    const accScore = Math.max(0, 1 - (err/60));
    const s = 0.5*speedScore + 0.5*accScore;
    diagScore.textContent = `✅ Điểm: ${Math.round(s*100)}% • Sai số: ${Math.round(err)}px • Thời gian: ${Math.round(dt)}ms`;
  }
  diagArena.addEventListener('touchstart', diagOnDown, {passive:false});
  diagArena.addEventListener('touchend', diagOnUp, {passive:false});
  diagArena.addEventListener('mousedown', diagOnDown);
  window.addEventListener('mouseup', diagOnUp);
  $('#btnDiagNew').addEventListener('click', ()=>{
    setDiagTarget();
    diagScore.textContent = '—';
  });

  // ===== Tracking =====
  const trackArena = $('#trackArena');
  const circle = $('#trackCircle');
  const cursor = $('#trackCursor');
  const timer = $('#trackTimer');
  const trackScore = $('#trackScore');
  let track = {running:false, t0:0, total:0, inside:0};

  function trackRect(){ return trackArena.getBoundingClientRect(); }
  function center(){
    const r = trackRect();
    return { x: r.width/2, y: r.height/2 };
  }
  function insideCircle(p){
    const c = center();
    const dx = p.x-c.x, dy = p.y-c.y;
    return Math.hypot(dx,dy) <= 60;
  }
  function localTrack(e){
    const r = trackRect();
    const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top, t: performance.now() };
  }
  function fmtTime(ms){
    const s = Math.max(0, Math.floor(ms/1000));
    const cs = Math.floor((ms%1000)/10);
    return String(s).padStart(2,'0')+':'+String(cs).padStart(2,'0');
  }

  function renderCursor(p){
    cursor.style.left = p.x + 'px';
    cursor.style.top  = p.y + 'px';
  }

  let raf = null;
  function tick(){
    if(!track.running) return;
    const now = performance.now();
    const elapsed = now - track.t0;
    timer.textContent = fmtTime(elapsed);
    if (elapsed >= 5000){
      stopTrack(true);
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function startTrack(){
    track = {running:true, t0:performance.now(), total:0, inside:0};
    timer.textContent = '00:00';
    trackScore.textContent = 'Giữ con trỏ trong vòng tròn 5 giây...';
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function stopTrack(done=false){
    if(!track.running) return;
    track.running = false;
    if (raf) cancelAnimationFrame(raf);
    if (done){
      const pct = track.total ? Math.round((track.inside/track.total)*100) : 0;
      trackScore.textContent = `✅ Ổn định: ${pct}% thời gian trong vòng tròn`;
    }else{
      trackScore.textContent = 'Đã dừng.';
    }
  }

  $('#btnTrackStart').addEventListener('click', startTrack);
  $('#btnTrackStop').addEventListener('click', ()=>stopTrack(false));

  function onTrackMove(e){
    const p = localTrack(e);
    renderCursor(p);
    if (!track.running) return;
    track.total++;
    if (insideCircle(p)) track.inside++;
  }
  trackArena.addEventListener('touchmove', onTrackMove, {passive:false});
  trackArena.addEventListener('mousemove', onTrackMove);

})();