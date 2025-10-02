// ===== Firebase =====
const auth = firebase.auth();
const db   = firebase.database();

const $ = (id)=>document.getElementById(id);

// UI refs
const loginCard = $('loginCard');
const loginForm = $('loginForm');
const loginEmail= $('loginEmail');
const loginPass = $('loginPass');
const loginMsg  = $('loginMsg');

const dashboard = $('dashboard');
const mgrEmail  = $('mgrEmail');
const sessionActions = $('sessionActions');
const btnLogout = $('btnLogout');

const qrRegion  = $('qrRegion');
const cameraSelect = $('cameraSelect');
const switchTorch  = $('switchTorch');
const btnStartScan = $('btnStartScan');
const btnStopScan  = $('btnStopScan');

const codeInput = $('codeInput');
const btnLookup = $('btnLookup');

const redeemCard= $('redeemCard');
const rRewardName=$('rRewardName');
const rCost     =$('rCost');
const rExpires  =$('rExpires');
const rCode     =$('rCode');
const rUser     =$('rUser');
const rRewardId =$('rRewardId');
const rCreated  =$('rCreated');
const rState    =$('rState');
const rStatus   =$('rStatus');
const rNote     =$('rNote');
const btnRedeem =$('btnRedeem');
const redeemMsg =$('redeemMsg');

const auditTable = $('auditTable').querySelector('tbody');
const btnReloadAudit = $('btnReloadAudit');

let html5Qr;         // scanner instance
let currentCode = null;
let currentData = null;
let torchOn = false;

// ===== Helpers =====
const fmtDateTime = (ms)=> new Date(ms).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
const fmtDate = (ms)=> new Date(ms).toLocaleDateString('es-MX', { year:'numeric', month:'2-digit', day:'2-digit' });

function showLogin(on){ loginCard.hidden = !on; dashboard.hidden = on; sessionActions.hidden = on; }
function showDash(on){  loginCard.hidden = on;  dashboard.hidden = !on; sessionActions.hidden = !on; }

async function isManager(uid){
  if(!uid) return false;
  try{
    const snap = await db.ref(`managers/${uid}`).once('value');
    return !!snap.val();
  }catch(e){ console.error('isManager error:', e); return false; }
}

function setRedeemStatus(state, expiresAt){
  rState.textContent = state;
  rStatus.className = 'status';
  if (state === 'pending'){
    const exp = expiresAt ? Number(expiresAt) : null;
    rStatus.classList.add(exp && exp < Date.now() ? 'expired' : 'pending');
    rStatus.textContent = exp && exp < Date.now() ? 'Vencido' : 'Pendiente';
  } else if (state === 'redeemed'){
    rStatus.classList.add('redeemed');
    rStatus.textContent = 'Canjeado';
  } else {
    rStatus.textContent = '—';
  }
}

function clearRedeemView(){
  redeemCard.hidden = true;
  currentCode = null;
  currentData = null;
  rRewardName.textContent = '—';
  [rCost,rExpires,rCode,rUser,rRewardId,rCreated,rState].forEach(el=> el.textContent='—');
  rStatus.className='status';
  redeemMsg.textContent = '';
  rNote.value = '';
}

function fillRedeemView(code, obj){
  currentCode = code;
  currentData = obj;
  redeemCard.hidden = false;

  rCode.textContent = code;
  rRewardId.textContent = obj.rewardId || '—';
  rRewardName.textContent = obj.rewardName || obj.rewardId || '—';
  rCost.textContent  = Number(obj.cost||0);
  rUser.textContent  = obj.userId || obj.user || '—';
  rCreated.textContent = obj.createdAt ? fmtDateTime(Number(obj.createdAt)) : '—';
  rExpires.textContent = obj.expiresAt ? fmtDate(Number(obj.expiresAt)) : '—';

  const state = obj.status || obj.state || 'pending';
  setRedeemStatus(state, obj.expiresAt);

  // Botón canjear visible sólo si pendiente y no vencido
  const canRedeem = (state === 'pending') && (!obj.expiresAt || Number(obj.expiresAt) > Date.now());
  btnRedeem.disabled = !canRedeem;
}

async function loadCode(code){
  clearRedeemView();
  if (!code) return;
  try{
    const snap = await db.ref(`redeems/${code}`).once('value');
    if (!snap.exists()){
      redeemMsg.textContent = 'No existe ese código.';
      return;
    }
    fillRedeemView(code, snap.val());
  }catch(e){
    console.error(e);
    redeemMsg.textContent = 'Error al consultar el código.';
  }
}

async function redeemNow(source='manual'){
  if (!currentCode || !currentData) return;
  redeemMsg.textContent = 'Procesando canje…';

  // revalidar estado
  const code = currentCode;
  const refRedeem = db.ref(`redeems/${code}`);
  try{
    const tx = await refRedeem.transaction(curr => {
      if (!curr) return;                 // no existe
      if (curr.status !== 'pending') return; // ya canjeado o inválido
      if (curr.expiresAt && curr.expiresAt < Date.now()) return; // vencido
      // marcar como canjeado
      return { ...curr, status:'redeemed', redeemedAt: Date.now() };
    });

    if (!tx.committed || !tx.snapshot.val() || tx.snapshot.val().status !== 'redeemed'){
      redeemMsg.textContent = 'No se pudo canjear (quizá ya estaba canjeado o vencido).';
      await loadCode(code);
      return;
    }

    // espejo del usuario
    const r = tx.snapshot.val();
    const userId = r.userId;
    const updates = {};
    updates[`/users/${userId}/redemptions/${code}/status`] = 'canjeado';
    updates[`/users/${userId}/redemptions/${code}/redeemedAt`] = r.redeemedAt || Date.now();

    // AUDITORÍA
    const mgr = auth.currentUser;
    const managerUid = mgr?.uid || 'anonymous';
    const managerEmail = mgr?.email || 'anonymous';
    const logId = db.ref('redeemLogs').push().key;
    updates[`/redeemLogs/${logId}`] = {
      code,
      userId,
      rewardId: r.rewardId || null,
      rewardName: r.rewardName || null,
      cost: Number(r.cost||0),
      status: 'canjeado',
      redeemedAt: Date.now(),
      source,                 // 'qr' | 'manual'
      managerUid,
      managerEmail,
      note: (rNote.value||'').slice(0,200)
    };

    await db.ref().update(updates);

    redeemMsg.textContent = '✅ Canjeo realizado con éxito.';
    await loadCode(code);
    await loadAudit();
  }catch(e){
    console.error(e);
    redeemMsg.textContent = 'Error al canjear. Intenta de nuevo.';
  }
}

async function loadAudit(limit=20){
  try{
    const snap = await db.ref('redeemLogs').orderByChild('redeemedAt').limitToLast(limit).once('value');
    const rows = [];
    const val = snap.val() || {};
    const list = Object.values(val).sort((a,b)=> (b.redeemedAt||0)-(a.redeemedAt||0));
    list.forEach(x=>{
      rows.push(`
        <tr>
          <td>${x.redeemedAt?fmtDateTime(x.redeemedAt):'-'}</td>
          <td class="mono">${x.code||'-'}</td>
          <td>${x.rewardName||x.rewardId||'-'}</td>
          <td>${Number(x.cost||0)}</td>
          <td class="mono">${x.userId||'-'}</td>
          <td>${x.managerEmail||x.managerUid||'-'}</td>
          <td>${x.status||'-'}</td>
          <td>${(x.note||'').replace(/</g,'&lt;')}</td>
        </tr>
      `);
    });
    auditTable.innerHTML = rows.join('') || `<tr><td colspan="8" class="muted">Sin canjes aún.</td></tr>`;
  }catch(e){
    console.error(e);
    auditTable.innerHTML = `<tr><td colspan="8" class="muted">No se pudo cargar la auditoría.</td></tr>`;
  }
}

// ===== QR Scanner =====
async function listCameras(){
  const devices = await Html5Qrcode.getCameras();
  cameraSelect.innerHTML = devices.map(d => `<option value="${d.id}">${d.label||d.id}</option>`).join('');
}
async function startScan(){
  if (html5Qr) await stopScan();
  if (!cameraSelect.value) await listCameras();

  html5Qr = new Html5Qrcode("qrRegion", { formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ] });

  const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.777, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
  const camId = cameraSelect.value || (await Html5Qrcode.getCameras())[0]?.id;

  await html5Qr.start(camId, config, onScanSuccess, onScanError);

  // Torch toggle (best-effort)
  switchTorch.onchange = async () => {
    try{
      torchOn = switchTorch.checked;
      await html5Qr.applyVideoConstraints({ advanced:[{ torch: torchOn }] });
    }catch(_){ /* algunos navegadores no soportan torch */ }
  };
}
async function stopScan(){
  try{
    if (html5Qr) await html5Qr.stop();
  }catch(_){}
  html5Qr = null;
}
function onScanSuccess(decodedText){
  // Esperamos un JSON del QR
  try{
    const obj = JSON.parse(decodedText);
    if (!obj || !obj.code){ throw new Error('payload inválido'); }
    codeInput.value = obj.code;
    stopScan();
    btnLookup.click();
  }catch(_){
    // También soporta: QR con texto simple del código
    if (/^[A-Z0-9]{8,14}$/.test(decodedText.trim())){
      codeInput.value = decodedText.trim().toUpperCase();
      stopScan();
      btnLookup.click();
    }
  }
}
function onScanError(_e){ /* noop visual */ }

// ===== Auth Flow =====
loginForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  loginMsg.textContent = 'Ingresando…';
  try{
    const { user } = await auth.signInWithEmailAndPassword(loginEmail.value.trim(), loginPass.value);
    const ok = await isManager(user.uid);
    if (!ok){
      await auth.signOut();
      loginMsg.textContent = 'No autorizado. Consulta a sistemas.';
      return;
    }
    mgrEmail.textContent = user.email || user.uid;
    showDash(true);
    await listCameras();
    await loadAudit();
  }catch(err){
    console.error(err);
    loginMsg.textContent = 'No se pudo iniciar sesión.';
  }
});

btnLogout?.addEventListener('click', async ()=>{
  try{ await auth.signOut(); }catch(_){}
  showLogin(true);
});

auth.onAuthStateChanged(async (user)=>{
  if (!user){ showLogin(true); return; }
  const ok = await isManager(user.uid);
  if (!ok){ showLogin(true); return; }
  mgrEmail.textContent = user.email || user.uid;
  showDash(true);
  await listCameras();
  await loadAudit();
});

// ===== Eventos UI =====
btnStartScan?.addEventListener('click', startScan);
btnStopScan?.addEventListener('click', stopScan);
btnLookup?.addEventListener('click', ()=> loadCode((codeInput.value||'').trim().toUpperCase()));
btnRedeem?.addEventListener('click', ()=> redeemNow(html5Qr ? 'qr' : 'manual'));
btnReloadAudit?.addEventListener('click', loadAudit);
