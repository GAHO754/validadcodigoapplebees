/* ===============================
   Portal Gerentes — Canje (FIX)
   =============================== */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

/* ---------- Referencias UI ---------- */
const loginCard = document.getElementById("loginCard");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginMsg  = document.getElementById("loginMsg");
const mgrEmail  = document.getElementById("mgrEmail");
const btnLogout = document.getElementById("btnLogout");
const sessionActions = document.getElementById("sessionActions"); // <--- FIX

/* Escáner y manual */
const qrRegion  = document.getElementById("qrRegion");
const cameraSel = document.getElementById("cameraSelect");
const btnStart  = document.getElementById("btnStartScan");
const btnStop   = document.getElementById("btnStopScan");
const btnLookup = document.getElementById("btnLookup");
const codeInput = document.getElementById("codeInput");

/* Redeem info */
const redeemCard  = document.getElementById("redeemCard");
const rRewardName = document.getElementById("rRewardName");
const rCost    = document.getElementById("rCost");
const rExpires = document.getElementById("rExpires");
const rStatus  = document.getElementById("rStatus");
const rCode    = document.getElementById("rCode");
const rUser    = document.getElementById("rUser");
const rRewardId= document.getElementById("rRewardId");
const rCreated = document.getElementById("rCreated");
const rState   = document.getElementById("rState");
const rNote    = document.getElementById("rNote");
const btnRedeem= document.getElementById("btnRedeem");
const redeemMsg= document.getElementById("redeemMsg");

/* Auditoría */
const auditTableBody = document.getElementById("auditTable").querySelector("tbody");
const mTotal    = document.getElementById("mTotal");
const mToday    = document.getElementById("mToday");
const mWeek     = document.getElementById("mWeek");
const mManagers = document.getElementById("mManagers");
const btnReloadAudit = document.getElementById("btnReloadAudit");
const fFrom   = document.getElementById("fFrom");
const fTo     = document.getElementById("fTo");
const fStatus = document.getElementById("fStatus");
const fManager= document.getElementById("fManager");
const fApply  = document.getElementById("fApply");

/* Modal */
const alertOverlay = document.getElementById("alertOverlay");
const alertTitle   = document.getElementById("alertTitle");
const alertText    = document.getElementById("alertText");
const alertClose   = document.getElementById("alertClose");
const alertResume  = document.getElementById("alertResume");

/* ---------- Utilidades ---------- */
function toast(msg, kind="ok"){
  const div = document.createElement("div");
  div.textContent = msg;
  div.style = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:#141821;padding:10px 18px;border-radius:12px;
    border:1px solid rgba(255,255,255,.1);color:#fff;font-weight:600;
    box-shadow:0 6px 20px rgba(0,0,0,.4);z-index:3000;transition:.3s ease;opacity:0;
  `;
  document.body.appendChild(div);
  setTimeout(()=>div.style.opacity=1,10);
  setTimeout(()=>{div.style.opacity=0;setTimeout(()=>div.remove(),300)},2400);
}

function vibrate(ms=120){ try{ navigator.vibrate?.(ms); }catch{} }
function tone(kind="warn"){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = kind==="err"?"square":"sine";
    o.frequency.value = kind==="err"?440:660;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.25);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+0.26);
  }catch{}
}

/* ---------- MODAL (definido temprano para que siempre funcione) ---------- */
function showAlert({title="Aviso", text="", toneType="warn", canResume=true} = {}){
  alertTitle.textContent = title;
  alertText.textContent  = text;
  alertOverlay.hidden = false;

  const m = alertOverlay.querySelector(".modal");
  m.classList.remove("warn","err","ok");
  m.classList.add(toneType==="err"?"err":toneType==="ok"?"ok":"warn");

  alertResume.hidden = !canResume;
  stopScan(); // pausar escáner
  tone(toneType); vibrate(140);
  try { m.focus(); } catch {}
}

function hideAlert(resume=false){
  alertOverlay.hidden = true;
  if (resume) startScan();
}
window.__hideAlert = hideAlert; // fallback para onClick inline

// Delegación de eventos + ESC + clic fuera
alertOverlay.addEventListener("click",(ev)=>{
  const t=ev.target;
  if(t.id==="alertClose") hideAlert(false);
  else if(t.id==="alertResume") hideAlert(true);
  else if(t===alertOverlay) hideAlert(false);
});
document.addEventListener("keydown",(ev)=>{
  if(!alertOverlay.hidden && ev.key==="Escape") hideAlert(false);
});

/* ---------- Sesión ---------- */
auth.onAuthStateChanged(async (user)=>{
  try{
    if (user) {
      loginCard.hidden = true;
      dashboard.hidden = false;
      sessionActions.hidden = false;
      mgrEmail.textContent = user.email || user.uid;
      await loadCameras();
      await loadAudit();
    } else {
      loginCard.hidden = false;
      dashboard.hidden = true;
      sessionActions.hidden = true;
    }
  }catch(err){
    console.error("onAuthStateChanged error:", err);
    toast("Error de sesión. Revisa consola.", "err");
  }
});

loginForm?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  loginMsg.textContent = "";
  try{
    await auth.signInWithEmailAndPassword(loginEmail.value, loginPass.value);
  }catch(err){
    loginMsg.textContent = "Error: " + (err.message||"");
  }
});

btnLogout?.addEventListener("click", ()=> auth.signOut());

/* ---------- Escáner QR ---------- */
let html5qr = null;
let currentCameraId = null;

async function loadCameras(){
  try{
    const devices = await Html5Qrcode.getCameras();
    cameraSel.innerHTML = "";
    devices.forEach(d=>{
      const opt = document.createElement("option");
      opt.value = d.id; opt.textContent = d.label || d.id;
      cameraSel.appendChild(opt);
    });
    if (devices.length){ currentCameraId = devices[0].id; cameraSel.value = currentCameraId; }
  }catch(e){
    console.warn("No se pudieron listar cámaras:", e);
  }
}

async function startScan(){
  if (html5qr) return;

  if (!cameraSel.options.length) await loadCameras().catch(()=>{});
  const camId = cameraSel.value || currentCameraId;
  if (!camId){ toast("Selecciona una cámara.", "err"); return; }

  html5qr = new Html5Qrcode("qrRegion");
  const config = { fps: 12, qrbox: { width: 260, height: 260 } };
  try{
    await html5qr.start({ deviceId:{ exact: camId } }, config, onScanSuccess, ()=>{});
    btnStart.disabled = true; btnStop.disabled = false;
  }catch(e){
    console.error(e);
    toast("No se pudo iniciar el escáner.", "err");
    await stopScan();
  }
}

async function stopScan(){
  if (!html5qr){ btnStart.disabled=false; btnStop.disabled=true; return; }
  try { await html5qr.stop(); html5qr.clear(); } catch {}
  html5qr = null;
  btnStart.disabled = false; btnStop.disabled = true;
}

btnStart?.addEventListener("click", startScan);
btnStop?.addEventListener("click", stopScan);

function onScanSuccess(text){
  let code = null;
  try{
    const obj = JSON.parse(text); if (obj && obj.code) code = String(obj.code).trim().toUpperCase();
  }catch{
    const raw = String(text||"").trim().toUpperCase();
    if (/^[A-Z0-9]{8,14}$/.test(raw)) code = raw;
  }
  if (!code) return;
  codeInput.value = code;
  lookupCode(code, true);
}

/* ---------- Lookup / Rellenar ---------- */
btnLookup?.addEventListener("click", ()=> {
  const code = (codeInput.value||"").trim().toUpperCase();
  if (!code) return toast("Ingresa un código.", "warn");
  lookupCode(code, false);
});
codeInput?.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); btnLookup.click(); } });

async function lookupCode(code, fromScanner=false){
  redeemMsg.textContent = "";
  try{
    const snap = await db.ref(`redeems/${code}`).get();
    if (!snap.exists()){
      showAlert({ title:"No encontrado", text:"No existe ese cupón en el sistema.", toneType:"err", canResume:true });
      return;
    }
    const d = { code, ...snap.val() };
    fillRedeemCard(d);

    const st = String(d.status||"").toLowerCase();
    if (st!=="pending" && st!=="pendiente"){
      showAlert({ title:"Cupón ya canjeado", text:"Este QR/código ya fue canjeado anteriormente.", toneType:"err", canResume:true });
    } else if (fromScanner){
      stopScan(); // evita doble disparo inmediato
    }
  }catch(e){
    console.error(e);
    showAlert({ title:"Error al consultar", text:"No fue posible consultar el cupón.", toneType:"err", canResume:true });
  }
}

function fillRedeemCard(d){
  redeemCard.hidden = false;
  rRewardName.textContent = d.rewardName || d.rewardId || "Cortesía";
  rCost.textContent    = Number(d.cost||0);
  rExpires.textContent = d.expiresAt ? new Date(d.expiresAt).toLocaleString("es-MX",{dateStyle:"short",timeStyle:"short"}) : "—";
  rStatus.textContent  = (d.status||"").toUpperCase();
  rStatus.className    = "status " + String(d.status||"").toLowerCase();

  rCode.textContent    = d.code || "—";
  rUser.textContent    = d.userId || "—";
  rRewardId.textContent= d.rewardId || "—";
  rCreated.textContent = d.createdAt ? new Date(d.createdAt).toLocaleString("es-MX",{dateStyle:"short",timeStyle:"short"}) : "—";
  rState.textContent   = d.status || "—";

  const canRedeem = ["pending","pendiente"].includes(String(d.status||"").toLowerCase());
  btnRedeem.disabled = !canRedeem;
}

/* ---------- Canjear ---------- */
btnRedeem?.addEventListener("click", doRedeem);

async function doRedeem(){
  redeemMsg.textContent = "";
  const user = auth.currentUser;
  const dataCode = rCode.textContent;
  if (!user || !dataCode) return;

  // Revalida estado
  const snap = await db.ref(`redeems/${dataCode}`).get();
  if (!snap.exists()){ showAlert({title:"No encontrado", text:"El cupón ya no existe.", toneType:"err"}); return; }
  const d = snap.val();

  if (d.expiresAt && Date.now() > Number(d.expiresAt)){
    showAlert({title:"Cupón vencido", text:"La cortesía ya expiró.", toneType:"err", canResume:false});
    redeemMsg.textContent = "Cupón vencido."; return;
  }
  const st = String(d.status||"").toLowerCase();
  if (st!=="pending" && st!=="pendiente"){
    showAlert({title:"Cupón ya canjeado", text:"Este código ya fue canjeado.", toneType:"err"}); 
    redeemMsg.textContent = "El cupón ya fue canjeado."; return;
  }

  const note = (rNote.value||"").trim();
  const now = Date.now();
  const updates = {};
  updates[`/redeems/${dataCode}/status`]     = "redeemed";
  updates[`/redeems/${dataCode}/redeemedAt`] = now;
  updates[`/redeems/${dataCode}/redeemedBy`] = user.uid;
  if (note) updates[`/redeems/${dataCode}/note`] = note;

  if (d.userId){
    updates[`/users/${d.userId}/redemptions/${dataCode}/status`]     = "canjeado";
    updates[`/users/${d.userId}/redemptions/${dataCode}/redeemedAt`] = now;
    updates[`/users/${d.userId}/redemptions/${dataCode}/redeemedBy`] = user.uid;
    if (note) updates[`/users/${d.userId}/redemptions/${dataCode}/note`] = note;
  }

  const logKey = db.ref("redeemLogs").push().key;
  updates[`/redeemLogs/${logKey}`] = {
    code: dataCode, rewardId: d.rewardId||null, rewardName: d.rewardName||null,
    cost: Number(d.cost||0), userId: d.userId||null,
    redeemedBy: user.uid, redeemedByEmail: user.email||null,
    note: note||null, ts: now, status: "canjeado"
  };

  btnRedeem.disabled = true;
  try{
    await db.ref().update(updates);
    toast("¡Canje realizado!", "ok");
    redeemMsg.textContent = "Canje exitoso.";
    const fresh = await db.ref(`redeems/${dataCode}`).get();
    fillRedeemCard({ code:dataCode, ...fresh.val() });
    await loadAudit();
  }catch(e){
    console.error(e);
    redeemMsg.textContent = "No se pudo canjear.";
    btnRedeem.disabled = false;
  }
}

/* ---------- Auditoría ---------- */
btnReloadAudit?.addEventListener("click", loadAudit);
fApply?.addEventListener("click", loadAudit);
[fFrom,fTo,fStatus,fManager].forEach(el=>{
  el?.addEventListener("change", ()=> loadAudit());
  el?.addEventListener("keyup",  (e)=>{ if(e.key==="Enter") loadAudit(); });
});

async function loadAudit(){
  try{
    const snap = await db.ref("redeemLogs").orderByChild("ts").limitToLast(300).get();
    const val = snap.val()||{};
    let items = Object.values(val).sort((a,b)=> (b.ts||0)-(a.ts||0));

    const fromMs = fFrom?.value ? new Date(fFrom.value+"T00:00:00").getTime() : null;
    const toMs   = fTo?.value   ? new Date(fTo.value+"T23:59:59").getTime() : null;
    const st     = (fStatus?.value||"").trim().toLowerCase();
    const mgr    = (fManager?.value||"").trim().toLowerCase();

    items = items.filter(x=>{
      const t = Number(x.ts||0);
      if (fromMs && t < fromMs) return false;
      if (toMs && t > toMs) return false;
      if (st && String(x.status||"").toLowerCase() !== st) return false;
      if (mgr && !String(x.redeemedByEmail||"").toLowerCase().includes(mgr)) return false;
      return true;
    });

    const now = Date.now();
    const startOfDay = new Date().setHours(0,0,0,0);
    const weekAgo = now - 7*24*60*60*1000;
    const todayCount = items.filter(x=> (x.ts||0) >= startOfDay).length;
    const weekCount  = items.filter(x=> (x.ts||0) >= weekAgo).length;
    const managers = new Set(items.map(x=> x.redeemedByEmail||x.redeemedBy).filter(Boolean));

    mTotal.textContent    = items.length;
    mToday.textContent    = todayCount;
    mWeek.textContent     = weekCount;
    mManagers.textContent = managers.size;

    const rows = items.map(x=> `
      <tr>
        <td>${x.ts ? new Date(x.ts).toLocaleString("es-MX",{dateStyle:"short",timeStyle:"short"}) : "—"}</td>
        <td class="mono">${x.code||""}</td>
        <td>${x.rewardName||x.rewardId||""}</td>
        <td>${Number(x.cost||0)}</td>
        <td class="mono">${x.userId||""}</td>
        <td class="mono">${x.redeemedByEmail||x.redeemedBy||""}</td>
        <td><span class="pill ${String(x.status).toLowerCase()==="canjeado"?"ok":"warn"}">${(x.status||"").toUpperCase()}</span></td>
        <td>${x.note?escapeHtml(x.note):""}</td>
      </tr>
    `);
    auditTableBody.innerHTML = rows.join("") || `<tr><td colspan="8" class="muted">Sin canjes con los filtros actuales.</td></tr>`;
  }catch(e){
    console.error(e);
    auditTableBody.innerHTML = `<tr><td colspan="8" class="err">No se pudo cargar la bitácora.</td></tr>`;
  }
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}

/* ---------- Captura global de errores para depurar ---------- */
window.addEventListener("error", (e)=>{
  console.error("Error global:", e.message, e.error);
});
