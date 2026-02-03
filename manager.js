/* ===============================
   Portal Gerentes — Canje (completo)
   =============================== */

// Asegura que firebase-config.js se cargó y tiene databaseURL
if (!firebase.apps.length) {
  throw new Error("Firebase no está inicializado. Revisa firebase-config.js");
}
const auth = firebase.auth();
const db   = firebase.database();

/* ===============================
   ✅ LIVE PANEL CONFIG (NUEVO)
   =============================== */
const STORE_ID   = "APB_PASEO";                 // 👈 CAMBIA por sucursal real
const STORE_NAME = "Applebee’s Paseo Central";  // 👈 CAMBIA por sucursal real

async function pushLiveEvent(payload){
  try{
    const u = auth.currentUser;
    const eventRef = db.ref("liveEvents").push();
    const eventId = eventRef.key;

    const now = Date.now();
    const day = new Date(now);
    const ymd = `${day.getFullYear()}${String(day.getMonth()+1).padStart(2,'0')}${String(day.getDate()).padStart(2,'0')}`;

    const base = {
      createdAt: now,
      uid: u?.uid || "",
      userEmail: u?.email || "",
      brand: "Applebees",
      storeId: STORE_ID,
      storeName: STORE_NAME,
      meta: {
        source: "manager",
        page: location.pathname || "",
        ua: navigator.userAgent || ""
      }
    };

    await eventRef.set({ ...base, ...payload });
    await db.ref(`liveEventsByDay/${ymd}/${eventId}`).set(true);

    return eventId;
  }catch(e){
    console.warn("pushLiveEvent error:", e);
    return "";
  }
}

/* ---------- Referencias UI ---------- */
const loginCard = document.getElementById("loginCard");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginMsg  = document.getElementById("loginMsg");
const btnLogout = document.getElementById("btnLogout");
const mgrEmail  = document.getElementById("mgrEmail");
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

/* Mini QR + modal */
const miniQRWrap = document.getElementById("miniQRWrap");
const miniQR     = document.getElementById("miniQR");
const qrModal    = document.getElementById("qrModal");
const qrFull     = document.getElementById("qrFull");

/* Auditoría + KPIs */
const auditTableBody = document.getElementById("auditTable").querySelector("tbody");
const mTotal    = document.getElementById("mTotal");
const mToday    = document.getElementById("mToday");
const mWeek     = document.getElementById("mWeek");
const mManagers = document.getElementById("mManagers");
const mValidToday  = document.getElementById("mValidToday");
const mFailedToday = document.getElementById("mFailedToday");
const btnReloadAudit = document.getElementById("btnReloadAudit");
const fFrom   = document.getElementById("fFrom");
const fTo     = document.getElementById("fTo");
const fStatus = document.getElementById("fStatus");
const fManager= document.getElementById("fManager");
const fApply  = document.getElementById("fApply");

/* Modal de alerta */
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

/* ---------- Modal ---------- */
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

  if (resume){
    resetRedeemState();   // ✅ LIMPIA TODO
    startScan();
  }
}

alertClose?.addEventListener("click",()=>hideAlert(false));
alertResume?.addEventListener("click",()=>hideAlert(true));
alertOverlay?.addEventListener("click",(e)=>{ if(e.target===alertOverlay)hideAlert(false); });
document.addEventListener("keydown",(e)=>{ if(!alertOverlay.hidden && e.key==="Escape")hideAlert(false); });

/* ---------- Sesión ---------- */
auth.onAuthStateChanged(async (user)=>{
  if (user) {
    loginCard.hidden = true;
    dashboard.hidden = false;
    sessionActions.hidden = false;
    mgrEmail.textContent = user.email || user.uid;
    await loadCameras();
    await loadAudit();
    watchRealtimeKpisToday();

    // ✅ Live Panel: sesión gerente activa
    pushLiveEvent({
      type: "manager_session",
      status: "ok",
      manager: { uid: user.uid, email: user.email || "" }
    }).catch(()=>{});
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

/* Registrar intentos (ok/fail) para KPIs de fallidos/validos */
function logAttempt({ code, userId=null, outcome="fail", reason="", extra=null }){
  try{
    const u = auth.currentUser;
    if (!u) return;
    const now = Date.now();
    const key = db.ref("redeemAttempts").push().key;
    const payload = {
      code: code || null,
      userId: userId || null,
      managerUid: u.uid,
      managerEmail: u.email || null,
      outcome,                 // "ok" | "fail"
      reason: reason || null,  // not_found | expired | already_redeemed | payload_expired | redeemed
      ts: now,
      extra: extra || null
    };
    db.ref("redeemAttempts/" + key).set(payload).catch(()=>{});
  }catch(_){}
}

/* Lee QR en JSON o código plano y busca en /redeems */
function onScanSuccess(decodedText){
  stopScan(); // evita dobles lecturas

  let code = null;
  let payloadObj = null;

  try {
    const obj = JSON.parse(decodedText);
    if (obj && obj.code) {
      payloadObj = obj;
      code = String(obj.code).trim().toUpperCase();
      if (obj.exp && Date.now() > Number(obj.exp)) {
        logAttempt({ code: obj.code, userId: obj.uid || null, outcome:"fail", reason:"payload_expired" });

        // ✅ Live Panel: QR expirado (payload)
        pushLiveEvent({
          type: "redeem_failed",
          status: "err",
          reason: "payload_expired",
          redeem: { code, customerUid: obj.uid || "", exp: obj.exp || null }
        }).catch(()=>{});

        showAlert({ title:"Cupón vencido", text:"El QR está expirado.", toneType:"err", canResume:true });
        return;
      }
    }
  } catch(_) {}

  if (!code) {
    const raw = String(decodedText||"").trim().toUpperCase();
    if (/^[A-Z0-9]{8,14}$/.test(raw)) code = raw;
  }

  if (!code) {
    // ✅ Live Panel: formato inválido
    pushLiveEvent({
      type: "scan_invalid_format",
      status: "err",
      raw: String(decodedText||"").slice(0,180)
    }).catch(()=>{});

    showAlert({ title:"Formato no válido", text:"El QR no contiene un código válido.", toneType:"err", canResume:true });
    return;
  }

  // ✅ Live Panel: scan recibido (solo info)
  pushLiveEvent({
    type: "redeem_scan",
    status: "ok",
    redeem: {
      code,
      customerUid: (payloadObj && payloadObj.uid) ? String(payloadObj.uid) : ""
    }
  }).catch(()=>{});

  codeInput.value = code;
  lookupCode(code);
}

btnStart?.addEventListener("click", startScan);
btnStop?.addEventListener("click", stopScan);

/* ---------- Lookup en /redeems ---------- */
btnLookup?.addEventListener("click", ()=>{
  const code = (codeInput.value||"").trim().toUpperCase();
  if (!code) return toast("Ingresa un código.", "warn");
  lookupCode(code);
});

codeInput?.addEventListener("keydown",(e)=>{
  if(e.key==="Enter"){
    e.preventDefault();
    btnLookup.click();
  }
});

/* ---------- LOOKUP (CORRECTO) ---------- */
async function lookupCode(code){
  resetRedeemState();

  try{
    const snap = await db.ref(`redeems/${code}`).get();

    if(!snap.exists()){
      pushLiveEvent({
        type:"redeem_lookup",
        status:"not_found",
        redeem:{ code }
      }).catch(()=>{});

      showAlert({
        title:"No encontrado",
        text:"Código no registrado.",
        toneType:"err",
        canResume:true
      });
      return;
    }

    const d = { code, ...snap.val() };

    pushLiveEvent({
      type:"redeem_lookup_ok",
      status:"ok",
      redeem:{
        code,
        rewardId:d.rewardId || "",
        rewardName:d.rewardName || "",
        cost:Number(d.cost||0),
        status:d.status || ""
      }
    }).catch(()=>{});

    fillRedeemCard(d);

    if(!["pending","pendiente"].includes(String(d.status).toLowerCase())){
      showAlert({
        title:"Cupón ya canjeado",
        text:"Este cupón ya fue utilizado.",
        toneType:"warn",
        canResume:true
      });
    }

  }catch(e){
    console.error(e);

    pushLiveEvent({
      type:"redeem_lookup_fail",
      status:"err",
      reason:"lookup_error",
      redeem:{ code },
      error:String(e?.message || e || "")
    }).catch(()=>{});

    showAlert({
      title:"Error",
      text:"No fue posible consultar el cupón.",
      toneType:"err",
      canResume:true
    });
  }
}

/* ---------- Utils ---------- */
/* ---------- Utils ---------- */
function fmtDate(ms){
  if(!ms) return "—";
  return new Date(ms).toLocaleString(
    "es-MX",
    { dateStyle:"short", timeStyle:"short" }
  );
}

function fillRedeemCard(d){
  redeemCard.hidden = false;

  rRewardName.textContent = d.rewardName || d.rewardId || "Cortesía";
  rCost.textContent       = Number(d.cost || 0);
  rExpires.textContent    = d.expiresAt ? fmtDate(d.expiresAt) : "—";

  // AGREGA ESTO AQUÍ (Es la forma segura):
  const rCreated = document.getElementById("rCreated");
  if (rCreated) {
    rCreated.textContent = d.createdAt ? fmtDate(d.createdAt) : "—";
  }

  rStatus.textContent = (d.status || "—").toUpperCase();
  rStatus.className   = "status " + String(d.status || "").toLowerCase();

  rCode.textContent = d.code || "—";
  rUser.textContent = d.userId || "—";

  const canRedeem = ["pending","pendiente"].includes(
    String(d.status || "").toLowerCase()
  );
  if (btnRedeem) btnRedeem.disabled = !canRedeem;
}

function safe(id){
  const el = document.getElementById(id);
  if(!el) console.warn("Elemento faltante:", id);
  return el;
}


/* ---------- Mini QR + Modal ---------- */
async function renderMiniQR(d){
  try{
    // Primero intenta obtener el payload del espejo del usuario
    let payload = null;
    if (d.userId) {
      const p = await db.ref(`users/${d.userId}/redemptions/${d.code}/qrPayload`).get();
      if (p.exists()) payload = p.val();
    }
    // Si no hay payload, crea uno mínimo para verificación
    if (!payload) {
      payload = JSON.stringify({ v: 1, code: d.code, rewardId: d.rewardId || null });
    }

    if (miniQR) {
      miniQR.innerHTML = "";
      new QRCode(miniQR, { text: payload, width: 130, height: 130 });
      miniQRWrap.hidden = false;
    }
  }catch(e){
    console.warn("No se pudo renderizar mini QR:", e);
    miniQRWrap.hidden = true;
  }
}

// Abrir modal con QR grande al tocar el mini
if (miniQR && qrModal && qrFull) {
  miniQR.addEventListener("click", () => {
    try {
      const canvas = miniQR.querySelector("canvas");
      if (canvas) {
        qrFull.src = canvas.toDataURL("image/png");
        qrModal.hidden = false;
      }
    } catch (err) {
      console.error("Error al ampliar QR:", err);
    }
  });
  qrModal.addEventListener("click", () => { qrModal.hidden = true; });
}

/* ---------- Canjear ---------- */
btnRedeem?.addEventListener("click", doRedeem);

async function doRedeem(){
  redeemMsg.textContent = "";
  const user = auth.currentUser;
  const dataCode = rCode.textContent;
  if (!user || !dataCode) return;

  const snap = await db.ref(`redeems/${dataCode}`).get();
  if (!snap.exists()){
    // ✅ Live Panel
    pushLiveEvent({
      type: "redeem_failed",
      status: "err",
      reason: "not_found",
      redeem: { code: dataCode }
    }).catch(()=>{});

    showAlert({title:"No encontrado", text:"El cupón ya no existe.", toneType:"err", canResume:true});
    return;
  }
  const d = snap.val();

  if (d.expiresAt && Date.now() > Number(d.expiresAt)){
    logAttempt({ code: dataCode, userId: d.userId || null, outcome:"fail", reason:"expired" });

    // ✅ Live Panel
    pushLiveEvent({
      type: "redeem_failed",
      status: "err",
      reason: "expired",
      redeem: {
        code: dataCode,
        customerUid: d.userId || "",
        rewardId: d.rewardId || "",
        rewardName: d.rewardName || "",
        cost: Number(d.cost||0),
        expiresAt: d.expiresAt || null
      }
    }).catch(()=>{});

    showAlert({title:"Cupón vencido", text:"La cortesía ya expiró.", toneType:"err", canResume:true});
    redeemMsg.textContent = "Cupón vencido."; return;
  }

  const st = String(d.status||"").toLowerCase();
  if (st !== "pending" && st !== "pendiente"){
    logAttempt({ code: dataCode, userId: d.userId || null, outcome:"fail", reason:"already_redeemed" });

    // ✅ Live Panel
    pushLiveEvent({
      type: "redeem_failed",
      status: "warn",
      reason: "already_redeemed",
      redeem: {
        code: dataCode,
        customerUid: d.userId || "",
        rewardId: d.rewardId || "",
        rewardName: d.rewardName || "",
        cost: Number(d.cost||0),
        status: d.status || ""
      }
    }).catch(()=>{});

    showAlert({title:"Cupón ya canjeado", text:"Este código ya fue canjeado.", toneType:"warn", canResume:true});
    redeemMsg.textContent = "El cupón ya fue canjeado."; return;
  }

  const note = (rNote.value||"").trim();
  const now = Date.now();
  const updates = {};

  updates[`/redeems/${dataCode}/status`]     = "redeemed";
  updates[`/redeems/${dataCode}/redeemedAt`] = now;
  updates[`/redeems/${dataCode}/redeemedBy`] = user.uid;
  if (note) updates[`/redeems/${dataCode}/note`] = note;

  if (d.userId) {
    updates[`/users/${d.userId}/redemptions/${dataCode}/status`]     = "canjeado";
    updates[`/users/${d.userId}/redemptions/${dataCode}/redeemedAt`] = now;
    updates[`/users/${d.userId}/redemptions/${dataCode}/redeemedBy`] = user.uid;
    if (note) updates[`/users/${d.userId}/redemptions/${dataCode}/note`] = note;
  }

  const logKey = db.ref("redeemLogs").push().key;
  updates[`/redeemLogs/${logKey}`] = {
    code: dataCode,
    rewardId: d.rewardId || null,
    rewardName: d.rewardName || null,
    cost: Number(d.cost||0),
    userId: d.userId || null,
    redeemedBy: user.uid,
    redeemedByEmail: user.email || null,
    note: note || null,
    ts: now,
    status: "canjeado"
  };

  btnRedeem.disabled = true;
  try {
    await db.ref().update(updates);
    logAttempt({ code: dataCode, userId: d.userId || null, outcome:"ok", reason:"redeemed" });

    // ✅ Live Panel: CANJE OK (lo principal)
    await pushLiveEvent({
      type: "redeem_validated",
      status: "ok",
      manager: { uid: user.uid, email: user.email || "" },
      redeem: {
        code: dataCode,
        customerUid: d.userId || "",
        rewardId: d.rewardId || "",
        rewardName: d.rewardName || "",
        cost: Number(d.cost||0),
        expiresAt: d.expiresAt || null,
        note: note || ""
      }
    });

    toast("¡Canje realizado!", "ok");
    redeemMsg.textContent = "Canje exitoso.";

    const fresh = await db.ref(`redeems/${dataCode}`).get();
    const merged = { code: dataCode, ...fresh.val() };
    fillRedeemCard(merged);
    await renderMiniQR(merged);
    await loadAudit();

  } catch (e) {
    console.error(e);

    // ✅ Live Panel: fallo update
    pushLiveEvent({
      type: "redeem_failed",
      status: "err",
      reason: "update_failed",
      manager: { uid: user.uid, email: user.email || "" },
      redeem: {
        code: dataCode,
        customerUid: d.userId || "",
        rewardId: d.rewardId || "",
        rewardName: d.rewardName || "",
        cost: Number(d.cost||0)
      },
      error: String(e?.message || e || "")
    }).catch(()=>{});

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
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const weekAgo = now - 7*24*60*60*1000;
    const todayCount = items.filter(x=> (x.ts||0) >= startOfDay.getTime()).length;
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
        <td>${(x.status||"").toUpperCase()}</td>
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

/* ---------- KPIs en tiempo real ---------- */
function watchRealtimeKpisToday(){
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const from = startOfDay.getTime();

  db.ref("redeemLogs").orderByChild("ts").startAt(from).on("value", (snap)=>{
    const val = snap.val() || {};
    let validToday = 0;
    Object.values(val).forEach(x=>{
      if (String(x.status||"").toLowerCase() === "canjeado") validToday++;
    });
    if (mValidToday) mValidToday.textContent = String(validToday);
  });

  db.ref("redeemAttempts").orderByChild("ts").startAt(from).on("value", (snap)=>{
    const val = snap.val() || {};
    let failedToday = 0;
    Object.values(val).forEach(x=>{
      if (String(x.outcome||"") === "fail") failedToday++;
    });
    if (mFailedToday) mFailedToday.textContent = String(failedToday);
  });
}

/* ---------- Exporta funciones globales ---------- */
window.startScan = startScan;
window.stopScan  = stopScan;
// Añade estas dos líneas para que el código sepa de dónde sacar el correo y la clave
const loginEmail = document.getElementById("loginEmail");
const loginPass  = document.getElementById("loginPass");

function resetRedeemState(){
  redeemCard.hidden = true;

  rRewardName.textContent = "—";
  rCost.textContent = "0";
  rExpires.textContent = "—";
  rStatus.textContent = "—";
  rStatus.className = "status";
  rCode.textContent = "—";
  rUser.textContent = "—";

  rNote.value = "";
  redeemMsg.textContent = "";

  btnRedeem.disabled = true;

  miniQRWrap.hidden = true;
  if (miniQR) miniQR.innerHTML = "";
}

