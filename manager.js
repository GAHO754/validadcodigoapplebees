/* ===============================
   Portal Gerentes — Canje (Versión estable con hotfix)
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
const sessionActions = document.getElementById("sessionActions");

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

/* ---------- Modal seguro (Hotfix) ---------- */
function showAlert({title="Aviso", text="", toneType="warn", canResume=true} = {}){
  alertTitle.textContent = title;
  alertText.textContent  = text;
  alertOverlay.hidden = false;
  const m = alertOverlay.querySelector(".modal");
  m.classList.remove("warn","err","ok");
  m.classList.add(toneType==="err"?"err":toneType==="ok"?"ok":"warn");
  alertResume.hidden = !canResume;
  stopScan();
  tone(toneType); vibrate(150);
}
function hideAlert(resume=false){
  alertOverlay.hidden = true;
  if (resume) startScan();
}
alertClose?.addEventListener("click",()=>hideAlert(false));
alertResume?.addEventListener("click",()=>hideAlert(true));
alertOverlay?.addEventListener("click",(e)=>{ if(e.target===alertOverlay)hideAlert(false); });
document.addEventListener("keydown",(e)=>{ if(!alertOverlay.hidden && e.key==="Escape")hideAlert(false); });

window.__hideAlert = hideAlert;
window.showAlert = showAlert;

/* ---------- Sesión ---------- */
auth.onAuthStateChanged(async (user)=>{
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
});
loginForm?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  loginMsg.textContent = "";
  try{
    await auth.signInWithEmailAndPassword(loginEmail.value, loginPass.value);
  }catch(err){ loginMsg.textContent = "Error: " + err.message; }
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
  }catch(e){ console.warn("No se pudieron listar cámaras:", e); }
}
async function startScan(){
  if (html5qr) return;
  if (!cameraSel.options.length) await loadCameras().catch(()=>{});
  const camId = cameraSel.value || currentCameraId;
  if (!camId){ toast("Selecciona una cámara.", "err"); return; }

  html5qr = new Html5Qrcode("qrRegion");
  const config = { fps: 12, qrbox: { width: 260, height: 260 } };
  try{
    await html5qr.start({ deviceId:{ exact: camId } }, config, onScanSuccess);
    btnStart.disabled = true; btnStop.disabled = false;
  }catch(e){ toast("No se pudo iniciar el escáner.", "err"); await stopScan(); }
}
async function stopScan(){
  if (!html5qr){ btnStart.disabled=false; btnStop.disabled=true; return; }
  try { await html5qr.stop(); html5qr.clear(); } catch {}
  html5qr = null;
  btnStart.disabled = false; btnStop.disabled = true;
}
function onScanSuccess(decodedText){
  stopScan();
  const code = decodedText.trim();
  codeInput.value = code;
  lookupCode(code);
}
btnStart?.addEventListener("click", startScan);
btnStop?.addEventListener("click", stopScan);

/* ---------- Lookup ---------- */
btnLookup?.addEventListener("click", ()=> {
  const code = (codeInput.value||"").trim();
  if (!code) return toast("Ingresa un código.", "warn");
  lookupCode(code);
});
async function lookupCode(code){
  redeemMsg.textContent = "";
  const snap = await db.ref("redemptions/"+code).get();
  if (!snap.exists()){
    showAlert({ title:"No encontrado", text:"Código no registrado.", toneType:"err", canResume:true });
    return;
  }
  const d = snap.val();
  fillRedeemCard(d);
  if (d.status === "canjeado") {
    showAlert({ title:"Cupón ya canjeado", text:"Este código ya fue canjeado anteriormente.", toneType:"warn", canResume:true });
  } else redeemCard.hidden = false;
}
function fillRedeemCard(d){
  redeemCard.hidden = false;
  rRewardName.textContent = d.rewardName || "—";
  rCost.textContent = d.points || 0;
  rExpires.textContent = d.expires || "—";
  rStatus.textContent = (d.status || "—").toUpperCase();
  rStatus.className = "status " + (d.status || "");
  rCode.textContent = d.code || "—";
  rUser.textContent = d.user || "—";
  rRewardId.textContent = d.rewardId || "—";
  rCreated.textContent = d.created || "—";
  rState.textContent = (d.status || "—").toUpperCase();
}

/* ---------- Canjear ---------- */
btnRedeem?.addEventListener("click", async ()=>{
  const code = rCode.textContent;
  const note = rNote.value.trim();
  const user = auth.currentUser?.email;
  if (!code || !user) return;
  redeemMsg.textContent = "Procesando...";

  const ref = db.ref("redemptions/"+code);
  const snap = await ref.get();
  if (!snap.exists()) return toast("Código inválido.", "err");
  const data = snap.val();
  if (data.status === "canjeado")
    return showAlert({ title:"Atención", text:"Este código ya fue canjeado.", toneType:"warn" });

  await ref.update({
    status:"canjeado", manager:user, note:note||"", redeemedAt:new Date().toISOString()
  });
  redeemMsg.textContent = "✅ Canje realizado correctamente.";
  showAlert({ title:"Éxito", text:"El canje se registró con éxito.", toneType:"ok", canResume:true });
  loadAudit();
});

/* ---------- Auditoría ---------- */
btnReloadAudit?.addEventListener("click", loadAudit);
fApply?.addEventListener("click", loadAudit);

async function loadAudit(){
  auditTableBody.innerHTML = "<tr><td colspan='8' class='muted'>Cargando...</td></tr>";
  const snap = await db.ref("redemptions").limitToLast(100).get();
  if (!snap.exists()){
    auditTableBody.innerHTML = "<tr><td colspan='8' class='muted'>Sin registros.</td></tr>";
    return;
  }
  const list = Object.values(snap.val());
  let filtered = list;

  const from = fFrom.value ? new Date(fFrom.value) : null;
  const to   = fTo.value ? new Date(fTo.value) : null;
  const status = fStatus.value.trim();
  const manager = fManager.value.trim();

  filtered = filtered.filter(r=>{
    const date = new Date(r.redeemedAt || r.created || 0);
    if (from && date < from) return false;
    if (to && date > to) return false;
    if (status && r.status !== status) return false;
    if (manager && !(r.manager||"").includes(manager)) return false;
    return true;
  });
  renderAudit(filtered);
}
function renderAudit(rows){
  if (!rows.length){
    auditTableBody.innerHTML = "<tr><td colspan='8' class='muted'>Sin registros.</td></tr>";
    return;
  }
  auditTableBody.innerHTML = rows.reverse().map(r=>`
    <tr>
      <td>${r.redeemedAt ? new Date(r.redeemedAt).toLocaleDateString() : "—"}</td>
      <td class="mono">${r.code||"—"}</td>
      <td>${r.rewardName||"—"}</td>
      <td>${r.points||0}</td>
      <td class="mono">${r.user||"—"}</td>
      <td>${r.manager||"—"}</td>
      <td>${r.status ? r.status.toUpperCase() : "—"}</td>
      <td>${r.note||""}</td>
    </tr>
  `).join("");
  mTotal.textContent = rows.length;
  const today = new Date().toLocaleDateString();
  const week = Date.now() - 7*24*60*60*1000;
  const tToday = rows.filter(r=>r.redeemedAt && new Date(r.redeemedAt).toLocaleDateString()===today).length;
  const tWeek = rows.filter(r=>r.redeemedAt && new Date(r.redeemedAt).getTime()>week).length;
  const managers = new Set(rows.map(r=>r.manager)).size;
  mToday.textContent = tToday; mWeek.textContent = tWeek; mManagers.textContent = managers;
}

/* ---------- Exporta funciones globales ---------- */
window.startScan = startScan;
window.stopScan  = stopScan;
