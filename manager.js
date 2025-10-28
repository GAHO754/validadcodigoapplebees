// manager.js — Portal de gerentes (escaneo y canje)
// Requiere: firebase-app-compat, firebase-auth-compat, firebase-database-compat,
//           html5-qrcode y firebase-config.js cargados en manager.html

/************* Shortcuts UI *************/
const $  = (id) => document.getElementById(id);
const by = (sel) => document.querySelector(sel);

function showMsg(el, text, kind='info') {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'msg ' + (kind || 'info');
  el.style.display = text ? 'block' : 'none';
}

/************* Firebase *************/
const auth = firebase.auth();
const db   = firebase.database();

/************* DOM refs *************/
const loginCard   = $('loginCard');
const loginForm   = $('loginForm');
const loginEmail  = $('loginEmail');
const loginPass   = $('loginPass');
const loginMsg    = $('loginMsg');

const sessionActions = $('sessionActions');
const mgrEmailSpan   = $('mgrEmail');
const btnLogout      = $('btnLogout');

const dash        = $('dashboard');
const qrRegionEl  = $('qrRegion');
const scanOverlay = $('scanOverlay');
const cameraSel   = $('cameraSelect');
const btnStart    = $('btnStartScan');
const btnStop     = $('btnStopScan');
const btnResume   = $('btnResumeScan');
const torchSwitch = $('switchTorch');

const codeInput   = $('codeInput');
const btnLookup   = $('btnLookup');

const redeemCard  = $('redeemCard');
const rRewardName = $('rRewardName');
const rCost       = $('rCost');
const rExpires    = $('rExpires');
const rStatus     = $('rStatus');
const rCode       = $('rCode');
const rUser       = $('rUser');
const rRewardId   = $('rRewardId');
const rCreated    = $('rCreated');
const rState      = $('rState');
const rNote       = $('rNote');
const btnRedeem   = $('btnRedeem');
const redeemMsg   = $('redeemMsg');

const auditTableBody = by('#auditTable tbody');
const btnReloadAudit = $('btnReloadAudit');

/************* Estado *************/
let html5Scanner = null;
let scanningBusy = false;   // evita disparos múltiples
let torchOn = false;
let currentDetect = null;   // { code, uid, ... }

/************* Utils *************/
const fmt = (ms) => ms ? new Date(ms).toLocaleString('es-MX',{dateStyle:'medium', timeStyle:'short'}) : '—';
const ymd = (ms) => ms ? new Date(ms).toLocaleDateString('es-MX',{year:'numeric',month:'2-digit',day:'2-digit'}) : '—';

function parseQrText(text){
  // 1) JSON payload {v, brand, uid, code, rewardId, cost, exp}
  try {
    const obj = JSON.parse(text);
    if (obj && obj.code) return { type:'json', ...obj };
  } catch(e){}
  // 2) Solo código (alfanumérico 8-14)
  const s = String(text||'').trim().toUpperCase();
  if (/^[A-Z0-9]{8,14}$/.test(s)) return { type:'code', code:s };
  return null;
}

function uiOverlay(text, kind='hint') {
  if (!scanOverlay) return;
  scanOverlay.textContent = text || '';
  scanOverlay.className = 'scan-overlay ' + kind;
  scanOverlay.style.display = text ? 'block' : 'none';
}

function beepAndVibrate() {
  try { navigator.vibrate?.(80); } catch {}
  try {
    // beep muy corto (440Hz) con WebAudio si disponible
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type='sine'; o.frequency.value=880; g.gain.value=0.02;
    o.connect(g); g.connect(ctx.destination);
    o.start(); setTimeout(()=>{ o.stop(); ctx.close(); }, 120);
  } catch {}
}

function setWelcome(user){
  sessionActions.hidden = false;
  mgrEmailSpan.textContent = user.email || user.uid;
}

function setLoggedOut(){
  sessionActions.hidden = true;
  dash.hidden = true;
  loginCard.hidden = false;
}

async function ensureCamerasAndSelectBest() {
  try{
    const devices = await Html5Qrcode.getCameras();
    cameraSel.innerHTML = '';
    if (!devices || !devices.length) {
      uiOverlay('No se detectó cámara. Revisa permisos.', 'warn');
      return;
    }
    // llenar select
    devices.forEach((d,i)=>{
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label || `Cámara ${i+1}`;
      cameraSel.appendChild(opt);
    });
    // intentar seleccionar trasera
    const rear = devices.find(d => /back|rear|environment/i.test(d.label||''));
    if (rear) cameraSel.value = rear.id;
    else cameraSel.value = devices[devices.length-1].id;
  }catch(e){
    console.warn('getCameras error', e);
    uiOverlay('Permite el uso de la cámara en el navegador.', 'warn');
  }
}

/************* Autenticación *************/
auth.onAuthStateChanged(async (user)=>{
  if(!user){ setLoggedOut(); return; }

  showMsg(loginMsg, '', 'info');
  $('btnLogin')?.setAttribute('disabled', 'disabled');

  try{
    const snap = await db.ref('managers/'+user.uid).once('value');
    if (!snap.exists()) {
      showMsg(loginMsg, 'Tu usuario no está autorizado como gerente.', 'err');
      return;
    }
  }catch(err){
    console.error('Error leyendo /managers:', err);
    showMsg(loginMsg, 'No se pudo verificar permiso de gerente: ' + err.message, 'err');
    return;
  } finally {
    $('btnLogin')?.removeAttribute('disabled');
  }

  // Acceso OK
  showMsg(loginMsg, '¡Bienvenido! Acceso de gerente concedido.', 'ok');
  setWelcome(user);
  loginCard.hidden = true;
  dash.hidden = false;

  await ensureCamerasAndSelectBest();
  await startScanner();              // ⬅️ auto-inicio del escáner
  loadAudit();
});

loginForm?.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  showMsg(loginMsg, 'Ingresando…', 'info');
  try{
    await auth.signInWithEmailAndPassword(loginEmail.value.trim(), loginPass.value);
  }catch(e){
    const map = {
      'auth/invalid-email': 'Correo inválido.',
      'auth/user-not-found': 'Usuario no encontrado.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
    };
    showMsg(loginMsg, map[e.code] || ('Error: '+e.message), 'err');
  }
});

btnLogout?.addEventListener('click', async ()=>{
  try{ await auth.signOut(); }catch{}
});

/************* Escáner *************/
async function startScanner(){
  try{
    if (html5Scanner) return;

    // tamaño dinámico
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const size = isMobile ? 260 : 320;
    qrRegionEl.style.minHeight = (size+40)+'px';

    const id = cameraSel.value || undefined;
    html5Scanner = new Html5Qrcode(qrRegionEl.id);

    const cfg = {
      fps: 12,
      qrbox: { width: size, height: size },
      formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    await html5Scanner.start(
      { deviceId: { exact: id }},
      cfg,
      onScanSuccess,
      onScanError
    );

    uiOverlay('Apunta el QR dentro del recuadro', 'hint');
    torchSwitch.checked = false;
    torchOn = false;
  }catch(e){
    console.error('startScanner', e);
    uiOverlay('No se pudo iniciar la cámara: ' + (e?.message||e), 'err');
  }
}

async function stopScanner(){
  try{
    if (html5Scanner) {
      await html5Scanner.stop();
      await html5Scanner.clear();
      html5Scanner = null;
    }
    uiOverlay('Cámara detenida', 'warn');
  }catch(e){
    console.warn('stopScanner', e);
  }
}

async function toggleTorch(on){
  torchOn = !!on;
  if (!html5Scanner) return;
  try{
    await html5Scanner.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
  }catch(e){ console.warn('torch not supported', e); }
}

btnStart?.addEventListener('click', startScanner);
btnStop?.addEventListener('click', stopScanner);
btnResume?.addEventListener('click', async ()=>{
  redeemCard.hidden = true;
  showMsg(redeemMsg, '', 'info');
  currentDetect = null;
  scanningBusy = false;
  await startScanner();
  uiOverlay('Apunta el QR dentro del recuadro', 'hint');
});
torchSwitch?.addEventListener('change', (e)=> toggleTorch(e.target.checked));

function onScanError(err){ /* silencioso */ }

async function onScanSuccess(decodedText){
  if (scanningBusy) return;       // freno anti-doble
  scanningBusy = true;

  beepAndVibrate();
  uiOverlay('QR detectado ✓', 'ok');
  await stopScanner();            // pausa cámara para mostrar datos

  await processInput(decodedText);
  // Si el cupón ya estaba canjeado, habilitamos reanudar
  btnResume?.classList.remove('ghost');
}

/************* Lookup (QR o Código) *************/
btnLookup?.addEventListener('click', async ()=>{
  const s = codeInput.value.trim().toUpperCase();
  if (!s) { alert('Ingresa un código.'); return; }
  await processInput(s);
});

async function processInput(inputText){
  showMsg(redeemMsg, '', 'info');
  redeemCard.hidden = true;
  currentDetect = null;

  const parsed = parseQrText(inputText);
  if (!parsed) {
    showMsg(redeemMsg, 'QR/código no reconocido.', 'err');
    scanningBusy = false;
    return;
  }

  try{
    // 1) Determinar uid y code
    let uid=null, code=null;

    if (parsed.type === 'json' && parsed.uid && parsed.code) {
      uid  = parsed.uid;
      code = parsed.code;
    } else {
      code = parsed.code;
      const snapG = await db.ref('redeems/'+code).once('value');
      if (!snapG.exists()){
        showMsg(redeemMsg, 'No existe este cupón en el sistema.', 'err');
        scanningBusy = false;
        return;
      }
      uid = String(snapG.val().userId || '');
      if (!uid) {
        showMsg(redeemMsg, 'El cupón no tiene usuario asociado.', 'err');
        scanningBusy = false;
        return;
      }
    }

    // 2) Leer ambos nodos
    const [snapGlobal, snapUser] = await Promise.all([
      db.ref('redeems/'+code).once('value'),
      db.ref(`users/${uid}/redemptions/${code}`).once('value')
    ]);

    if (!snapGlobal.exists() && !snapUser.exists()) {
      showMsg(redeemMsg, 'Cupón no encontrado.', 'err');
      scanningBusy = false;
      return;
    }

    const g = snapGlobal.val() || {};
    const u = snapUser.val()   || {};

    const rewardName = u.rewardName || u.rewardId || g.rewardId || '—';
    const cost       = Number(u.cost || g.cost || 0);
    const status     = (u.status || g.status || 'pendiente').toLowerCase();
    const createdAt  = Number(u.createdAt || g.createdAt || 0);
    const expiresAt  = Number(u.expiresAt || g.expiresAt || 0);
    const stateTxt   = status === 'canjeado' ? 'Canjeado' : 'Pendiente';

    // 3) Pintar info
    rRewardName.textContent = rewardName;
    rCost.textContent       = String(cost);
    rExpires.textContent    = ymd(expiresAt);
    rStatus.textContent     = stateTxt;

    rCode.textContent       = code;
    rUser.textContent       = uid;
    rRewardId.textContent   = String(u.rewardId || g.rewardId || '—');
    rCreated.textContent    = fmt(createdAt);
    rState.textContent      = stateTxt;

    redeemCard.hidden = false;
    btnRedeem.disabled = (status !== 'pendiente');

    currentDetect = {
      code, uid,
      globalPath: 'redeems/'+code,
      userPath:   `users/${uid}/redemptions/${code}`,
      cost, expiresAt, rewardId: (u.rewardId || g.rewardId || '')
    };

    showMsg(redeemMsg, status === 'pendiente'
      ? 'Cupón listo para canjear.'
      : 'Este cupón ya fue canjeado.', status === 'pendiente' ? 'ok':'warn');

  }catch(e){
    console.error(e);
    showMsg(redeemMsg, 'Error al consultar el cupón: ' + e.message, 'err');
  } finally {
    // Permitimos reanudar si se desea seguir escaneando
    scanningBusy = false;
  }
}

/************* Canjear *************/
btnRedeem?.addEventListener('click', async ()=>{
  if (!currentDetect) return;
  const user = auth.currentUser;
  if (!user) { alert('Sesión caducada.'); return; }

  const { code, uid, globalPath, userPath, cost, expiresAt, rewardId } = currentDetect;
  const note = (rNote.value || '').trim();

  btnRedeem.disabled = true;
  showMsg(redeemMsg, 'Canjeando…', 'info');

  const now = Date.now();
  const logKey = db.ref('redeemLogs').push().key;

  const updates = {};
  updates[`/${globalPath}/status`]      = 'canjeado';
  updates[`/${globalPath}/redeemedAt`]  = now;
  updates[`/${globalPath}/redeemedBy`]  = user.uid;
  if (note) updates[`/${globalPath}/note`] = note;

  updates[`/${userPath}/status`]        = 'canjeado';
  updates[`/${userPath}/redeemedAt`]    = now;
  updates[`/${userPath}/redeemedBy`]    = user.uid;
  if (note) updates[`/${userPath}/note`] = note;

  updates[`/redeemLogs/${logKey}`] = {
    code,
    userId: uid,
    managerId: user.uid,
    rewardId: rewardId || null,
    cost: cost || 0,
    status: 'canjeado',
    redeemedAt: now,
    expiresAt: expiresAt || null,
    note: note || null
  };

  try{
    await db.ref().update(updates);
    showMsg(redeemMsg, '¡Canje exitoso!', 'ok');
    rStatus.textContent = 'Canjeado';
    rState.textContent  = 'Canjeado';
    btnRedeem.disabled  = true;

    // listo para seguir escaneando el siguiente
    btnResume?.classList.remove('ghost');
    uiOverlay('Listo. Pulsa “Reanudar cámara” para el siguiente QR', 'hint');
    loadAudit();
  }catch(e){
    console.error(e);
    showMsg(redeemMsg, 'No se pudo canjear: ' + e.message, 'err');
    btnRedeem.disabled = false;
  }
});

/************* Auditoría *************/
async function loadAudit(){
  try{
    const snap = await db.ref('redeemLogs').limitToLast(25).once('value');
    const val = snap.val() || {};
    const rows = Object.values(val)
      .sort((a,b)=> (b.redeemedAt||0) - (a.redeemedAt||0))
      .map(log => `
        <tr>
          <td>${fmt(log.redeemedAt)}</td>
          <td class="mono">${log.code||''}</td>
          <td>${log.rewardId||''}</td>
          <td>${Number(log.cost||0)}</td>
          <td class="mono">${log.userId||''}</td>
          <td class="mono">${log.managerId||''}</td>
          <td>${(log.status||'').toUpperCase()}</td>
          <td>${log.note ? log.note.replace(/[<>&]/g,'') : ''}</td>
        </tr>
      `).join('');
    auditTableBody.innerHTML = rows || `<tr><td colspan="8" class="muted">Sin registros.</td></tr>`;
  }catch(e){
    console.error('audit error', e);
    auditTableBody.innerHTML = `<tr><td colspan="8" class="err">Error cargando auditoría.</td></tr>`;
  }
}

btnReloadAudit?.addEventListener('click', loadAudit);
