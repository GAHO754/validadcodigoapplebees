// ====== Helpers UI ======
const $  = (id) => document.getElementById(id);
const by = (sel) => document.querySelector(sel);

function showMsg(el, text, kind='info') {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'msg ' + (kind || 'info');
  if (text) el.style.display = 'block';
}

function setScanOverlay(text, kind=''){
  const ov = $('scanOverlay');
  if (!ov) return;
  ov.dataset.text = text || '';
  ov.className = 'scan-overlay ' + (kind || '');
}

// ====== Firebase ======
const auth = firebase.auth();
const db   = firebase.database();

// ====== DOM refs ======
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
const btnPickFile = $('btnPickFile');
const qrFileInput = $('qrFile');

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

// ====== Estado ======
let html5Scanner = null;
let currentDetect = null;
let torchOn = false;
let lastScanTs = 0;

// ====== Utils ======
const fmt = (ms) => ms ? new Date(ms).toLocaleString('es-MX',{dateStyle:'medium', timeStyle:'short'}) : '—';
const ymd = (ms) => ms ? new Date(ms).toLocaleDateString('es-MX',{year:'numeric',month:'2-digit',day:'2-digit'}) : '—';

function parseQrText(text){
  try {
    const obj = JSON.parse(text);
    if (obj && obj.code) return { type:'json', ...obj };
  } catch(e){}
  const s = String(text||'').trim();
  if (/^[A-Z0-9]{8,14}$/.test(s)) return { type:'code', code:s };
  return null;
}

async function ensureCameras(){
  try{
    const devices = await Html5Qrcode.getCameras();
    cameraSel.innerHTML = '';
    // Heurística: intentar poner primero la trasera
    devices.sort((a,b)=>{
      const ab = /back|rear|environment/i.test(a.label) ? -1 : 0;
      const bb = /back|rear|environment/i.test(b.label) ? -1 : 0;
      return ab - bb;
    });
    devices.forEach((d,i)=>{
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label || `Cámara ${i+1}`;
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

// ====== Auth ======
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

// ====== Scanner ======
function calcQrBox(){
  // Un cuadro amplio mejora la detección
  const w = Math.max(280, Math.min(qrRegionEl.clientWidth - 24, 420));
  return { width: w, height: w };
}

async function startScanner(){
  if (html5Scanner) return;
  setScanOverlay('Enfoca el QR', '');
  const deviceId = cameraSel.value || undefined;
  html5Scanner = new Html5Qrcode(qrRegionEl.id, { verbose: false });

  const cfg = {
    fps: 18,
    qrbox: calcQrBox(),
    disableFlip: true,
    formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  };

  // Prefer environment camera si no hay id
  const cameraConfig = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" };

  try{
    await html5Scanner.start(
      cameraConfig,
      cfg,
      onScanSuccess,
      onScanError
    );
  }catch(e){
    console.error('startScanner error', e);
    setScanOverlay('No se pudo iniciar la cámara', 'err');
  }
}

async function stopScanner(){
  try{
    if (html5Scanner) {
      await html5Scanner.stop();
      await html5Scanner.clear();
      html5Scanner = null;
      setScanOverlay('Escáner detenido', 'warn');
    }
  }catch(e){
    console.warn(e);
  }
}

async function toggleTorch(on){
  torchOn = !!on;
  if (!html5Scanner) return;
  try{
    await html5Scanner.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
  }catch(e){ /* algunos navegadores no soportan torch */ }
}

btnStart?.addEventListener('click', startScanner);
btnStop?.addEventListener('click', stopScanner);
torchSwitch?.addEventListener('change', (e)=> toggleTorch(e.target.checked));
window.addEventListener('resize', ()=>{
  // si cambia tamaño, el próximo start usará el nuevo qrbox
  if (!html5Scanner) setScanOverlay('Enfoca el QR', '');
});

function onScanError(err){
  // silenciado
}

async function onScanSuccess(decodedText){
  const now = Date.now();
  // debouncer para evitar dobles lecturas
  if (now - lastScanTs < 1200) return;
  lastScanTs = now;

  setScanOverlay('QR detectado ✓', 'ok');
  await processInput(decodedText);
}

// ====== Fallback: archivo ======
btnPickFile?.addEventListener('click', ()=> qrFileInput.click());
qrFileInput?.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    setScanOverlay('Procesando imagen…', 'warn');
    const result = await Html5Qrcode.scanFileV2(file, true);
    if (result?.text){
      setScanOverlay('QR detectado ✓', 'ok');
      await processInput(result.text);
    } else {
      setScanOverlay('No se reconoció un QR en la imagen', 'err');
      showMsg(redeemMsg, 'No se reconoció un QR en la imagen.', 'err');
    }
  }catch(e){
    console.error(e);
    setScanOverlay('No se pudo leer la imagen', 'err');
    showMsg(redeemMsg, 'No se pudo leer la imagen: ' + e.message, 'err');
  } finally {
    qrFileInput.value = '';
  }
});

// ====== Lookup (QR o Código) ======
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
    setScanOverlay('QR / código no reconocido', 'err');
    showMsg(redeemMsg, 'QR/código no reconocido.', 'err');
    return;
  }

  try{
    let uid=null, code=null;

    if (parsed.type === 'json' && parsed.uid && parsed.code) {
      uid  = parsed.uid;
      code = parsed.code;
    } else {
      code = parsed.code;
      const snapG = await db.ref('redeems/'+code).once('value');
      if (!snapG.exists()){
        setScanOverlay('Cupón inexistente', 'err');
        showMsg(redeemMsg, 'No existe este cupón en el sistema.', 'err');
        return;
      }
      uid = String(snapG.val().userId || '');
      if (!uid) {
        setScanOverlay('Cupón sin usuario', 'err');
        showMsg(redeemMsg, 'El cupón no tiene usuario asociado.', 'err');
        return;
      }
    }

    const [snapGlobal, snapUser] = await Promise.all([
      db.ref('redeems/'+code).once('value'),
      db.ref(`users/${uid}/redemptions/${code}`).once('value')
    ]);

    if (!snapGlobal.exists() && !snapUser.exists()) {
      setScanOverlay('Cupón no encontrado', 'err');
      showMsg(redeemMsg, 'Cupón no encontrado.', 'err');
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
      snapGlobal, snapUser,
      cost, expiresAt, rewardId: (u.rewardId || g.rewardId || '')
    };

    setScanOverlay(
      status === 'pendiente' ? 'Cupón listo para canjear' : 'Este cupón ya fue canjeado',
      status === 'pendiente' ? 'ok' : 'warn'
    );
    showMsg(redeemMsg, status === 'pendiente'
      ? 'Cupón listo para canjear.'
      : 'Este cupón ya fue canjeado.', status === 'pendiente' ? 'ok':'warn');

  }catch(e){
    console.error(e);
    setScanOverlay('Error al consultar el cupón', 'err');
    showMsg(redeemMsg, 'Error al consultar el cupón: ' + e.message, 'err');
  }
}

// ====== Canjear ======
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
    setScanOverlay('¡Canjeado!', 'ok');
    rStatus.textContent = 'Canjeado';
    rState.textContent  = 'Canjeado';
    btnRedeem.disabled  = true;
    loadAudit();
  }catch(e){
    console.error(e);
    setScanOverlay('No se pudo canjear', 'err');
    showMsg(redeemMsg, 'No se pudo canjear: ' + e.message, 'err');
    btnRedeem.disabled = false;
  }
});

// ====== Auditoría ======
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
