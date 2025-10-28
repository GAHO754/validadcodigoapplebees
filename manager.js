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
  if (text) el.style.display = 'block';
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
const cameraSel   = $('cameraSelect');
const btnStart    = $('btnStartScan');
const btnStop     = $('btnStopScan');
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
let currentDetect = null;   // { code, uid, userPath, globalPath, snapGlobal, snapUser }
let torchOn = false;

/************* Utils *************/
const fmt = (ms) => ms ? new Date(ms).toLocaleString('es-MX',{dateStyle:'medium', timeStyle:'short'}) : '—';
const ymd = (ms) => ms ? new Date(ms).toLocaleDateString('es-MX',{year:'numeric',month:'2-digit',day:'2-digit'}) : '—';

function parseQrText(text){
  // 1) JSON payload
  try {
    const obj = JSON.parse(text);
    if (obj && obj.code) return { type:'json', ...obj };
  } catch(e){}
  // 2) Solo código (alfanumérico 8-12 típico)
  const s = String(text||'').trim();
  if (/^[A-Z0-9]{8,14}$/.test(s)) return { type:'code', code:s };
  return null;
}

async function ensureCameras(){
  try{
    const devices = await Html5Qrcode.getCameras();
    cameraSel.innerHTML = '';
    devices.forEach((d,i)=>{
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.label || 'Camera '+(i+1)}`;
      cameraSel.appendChild(opt);
    });
  }catch(e){
    console.warn('No cameras', e);
  }
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

/************* Autenticación *************/
auth.onAuthStateChanged(async (user)=>{
  if(!user){ setLoggedOut(); return; }
  // Verifica permiso de gerente
  showMsg(loginMsg, '', 'info');
  $('btnLogin')?.setAttribute('disabled', 'disabled');

  console.log('UID:', user.uid);
  try{
    const snap = await db.ref('managers/'+user.uid).once('value');
    console.log('managers read ok:', snap.exists(), snap.val());
    if (!snap.exists()) {
      showMsg(loginMsg, 'Tu usuario no está autorizado como gerente.', 'err');
      // Te dejamos en pantalla de login pero con sesión abierta por si deseas salir
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

  await ensureCameras();
  loadAudit();
});

loginForm?.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  showMsg(loginMsg, 'Ingresando…', 'info');
  try{
    await auth.signInWithEmailAndPassword(loginEmail.value.trim(), loginPass.value);
    // El flujo continúa en onAuthStateChanged
  }catch(e){
    console.error(e);
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
  if (html5Scanner) return;
  const id = cameraSel.value || undefined;
  html5Scanner = new Html5Qrcode(qrRegionEl.id);
  const cfg = {
    fps: 10,
    qrbox: { width: 280, height: 280 },
    formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  };
  await html5Scanner.start(
    { deviceId: { exact: id }},
    cfg,
    onScanSuccess,
    onScanError
  );
}

async function stopScanner(){
  try{
    if (html5Scanner) {
      await html5Scanner.stop();
      await html5Scanner.clear();
      html5Scanner = null;
    }
  }catch{}
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
torchSwitch?.addEventListener('change', (e)=> toggleTorch(e.target.checked));

function onScanError(err){ /* opcional: silenciar */ }

async function onScanSuccess(decodedText){
  console.log('SCAN OK:', decodedText);
  await processInput(decodedText);
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
    return;
  }

  try{
    // Estrategia:
    // 1) Si traemos uid (payload JSON), usamos uid+code directo.
    // 2) Si no, buscamos /redeems/{code} para obtener userId y reward info.
    let uid=null, code=null;

    if (parsed.type === 'json' && parsed.uid && parsed.code) {
      uid  = parsed.uid;
      code = parsed.code;
      console.log('LOOKUP via payload uid+code', uid, code);
    } else {
      code = parsed.code;
      const snapG = await db.ref('redeems/'+code).once('value');
      if (!snapG.exists()){
        showMsg(redeemMsg, 'No existe este cupón en el sistema.', 'err');
        return;
      }
      uid = String(snapG.val().userId || '');
      if (!uid) {
        showMsg(redeemMsg, 'El cupón no tiene usuario asociado.', 'err');
        return;
      }
      console.log('LOOKUP via global redeems => uid', uid);
    }

    // Lee global y espejo usuario
    const [snapGlobal, snapUser] = await Promise.all([
      db.ref('redeems/'+code).once('value'),
      db.ref(`users/${uid}/redemptions/${code}`).once('value')
    ]);

    if (!snapGlobal.exists() && !snapUser.exists()) {
      showMsg(redeemMsg, 'Cupón no encontrado.', 'err');
      return;
    }

    const g = snapGlobal.val() || {};
    const u = snapUser.val()   || {};

    // Preferimos datos del espejo de usuario (más completos para UI)
    const rewardName = u.rewardName || u.rewardId || g.rewardId || '—';
    const cost       = Number(u.cost || g.cost || 0);
    const status     = (u.status || g.status || 'pendiente').toLowerCase();
    const createdAt  = Number(u.createdAt || g.createdAt || 0);
    const expiresAt  = Number(u.expiresAt || g.expiresAt || 0);
    const stateTxt   = status === 'canjeado' ? 'Canjeado' : 'Pendiente';

    // Pinta UI
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
    // Habilitar/Deshabilitar canje según estado
    btnRedeem.disabled = (status !== 'pendiente');

    // Guarda contexto para canjear
    currentDetect = {
      code, uid,
      globalPath: 'redeems/'+code,
      userPath:   `users/${uid}/redemptions/${code}`,
      snapGlobal, snapUser,
      cost, expiresAt, rewardId: (u.rewardId || g.rewardId || '')
    };

    showMsg(redeemMsg, status === 'pendiente'
      ? 'Cupón listo para canjear.'
      : 'Este cupón ya fue canjeado.', status === 'pendiente' ? 'ok':'warn');

  }catch(e){
    console.error(e);
    showMsg(redeemMsg, 'Error al consultar el cupón: ' + e.message, 'err');
  }
}

/************* Canjear *************/
btnRedeem?.addEventListener('click', async ()=>{
  if (!currentDetect) return;
  const user = auth.currentUser;
  if (!user) { alert('Sesión caducada.'); return; }

  const { code, uid, globalPath, userPath, cost, expiresAt, rewardId } = currentDetect;
  const note = (rNote.value || '').trim();

  // Seguridad mínima en cliente
  if (!code || !uid) { showMsg(redeemMsg, 'Contexto incompleto.', 'err'); return; }

  btnRedeem.disabled = true;
  showMsg(redeemMsg, 'Canjeando…', 'info');

  // Multi-path update: redeems + user/redemptions + log
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
    loadAudit(); // refrescar tabla
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
