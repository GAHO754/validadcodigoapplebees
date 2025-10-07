// manager.js — Portal de Gerentes (login + scan + canje + auditoría)
(() => {
  // ===== Helpers DOM =====
  const $ = (id) => document.getElementById(id);
  const loginCard = $("loginCard");
  const loginForm = $("loginForm");
  const loginMsg  = $("loginMsg");
  const btnLogin  = $("btnLogin");
  const dash      = $("dashboard");
  const mgrEmail  = $("mgrEmail");
  const sessionActions = $("sessionActions");

  const qrRegion  = $("qrRegion");
  const cameraSel = $("cameraSelect");
  const btnStart  = $("btnStartScan");
  const btnStop   = $("btnStopScan");
  const switchTorch = $("switchTorch");

  const codeInput = $("codeInput");
  const btnLookup = $("btnLookup");

  const redeemCard = $("redeemCard");
  const rRewardName = $("rRewardName");
  const rCost = $("rCost");
  const rExpires = $("rExpires");
  const rStatus = $("rStatus");
  const rCode = $("rCode");
  const rUser = $("rUser");
  const rRewardId = $("rRewardId");
  const rCreated = $("rCreated");
  const rState = $("rState");
  const rNote  = $("rNote");
  const btnRedeem = $("btnRedeem");
  const redeemMsg = $("redeemMsg");

  const auditTableBody = $("auditTable").querySelector("tbody");
  const btnReloadAudit = $("btnReloadAudit");
  const btnLogout = $("btnLogout");

  // ===== Firebase =====
  const auth = firebase.auth();
  const db   = firebase.database();

  // ===== UI feedback =====
  function showMsg(el, text, type="") {
    if (!el) return;
    el.textContent = text || "";
    el.className = "msg" + (type ? " " + type : "");
  }
  function toast(text, kind="ok") {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText = `
      position:fixed;left:50%;bottom:32px;transform:translateX(-50%);
      background:${kind==="err"?"#3a0d0d":"#0d3a1a"};color:#fff;padding:10px 14px;
      border:1px solid rgba(255,255,255,.12);border-radius:10px;z-index:9999;
      box-shadow:0 8px 24px rgba(0,0,0,.35);font-weight:700;letter-spacing:.2px;
    `;
    document.body.appendChild(t);
    setTimeout(()=>{ t.style.opacity="0"; t.style.transition="opacity .35s"; }, 1800);
    setTimeout(()=> t.remove(), 2200);
  }

  function fmtDate(ms){
    if(!ms) return "—";
    return new Date(ms).toLocaleString("es-MX", { dateStyle:"short", timeStyle:"short" });
  }
  function mapAuthError(code){
    switch(code){
      case "auth/invalid-email": return "Correo inválido.";
      case "auth/user-disabled": return "Usuario deshabilitado.";
      case "auth/user-not-found": return "El usuario no existe.";
      case "auth/wrong-password": return "Contraseña incorrecta.";
      case "auth/too-many-requests": return "Demasiados intentos. Intenta más tarde.";
      case "auth/network-request-failed": return "Problema de red. Revisa tu conexión.";
      default: return "No se pudo iniciar sesión.";
    }
  }

  // ===== Estado app =====
  let html5qr = null;
  let currentCameraId = null;
  let torchAvailable = false;
  let lastLookup = null;

  // ====== LOGIN ======
  loginForm?.addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    showMsg(loginMsg, "");
    btnLogin.disabled = true;
    const email = $("loginEmail").value.trim();
    const pass  = $("loginPass").value;
    try {
      const cred = await auth.signInWithEmailAndPassword(email, pass);
      const user = cred.user;
      console.log("UID:", user.uid);

      // Verificación con logs (depuración UID)
      db.ref("managers/" + user.uid).once("value")
        .then(snap => {
          console.log("managers read ok:", snap.exists(), snap.val());
          if (!snap.exists()) {
            showMsg(loginMsg, "Tu usuario no está autorizado como gerente.", "err");
            btnLogin.disabled = false;
            auth.signOut();
            return;
          }
          // Si pasa, Firebase onAuthStateChanged manejará el resto
        })
        .catch(err => {
          console.error("Error leyendo /managers:", err);
          showMsg(loginMsg, "No se pudo verificar permiso de gerente: " + err.message, "err");
          btnLogin.disabled = false;
        });

    } catch (e) {
      showMsg(loginMsg, mapAuthError(e.code||""), "err");
      btnLogin.disabled = false;
    }
  });

  btnLogout?.addEventListener("click", async ()=>{ try{ await auth.signOut(); }catch{} });

  auth.onAuthStateChanged(async (user)=>{
    if (!user) {
      loginCard.hidden = false;
      dash.hidden = true;
      sessionActions.hidden = true;
      showMsg(loginMsg, "");
      btnLogin.disabled = false;
      stopScan();
      return;
    }

    const isManager = (await db.ref("managers/" + user.uid).once("value")).val();
    if (!isManager) {
      await auth.signOut();
      showMsg(loginMsg, "Tu usuario no está autorizado como gerente.", "err");
      return;
    }

    mgrEmail.textContent = user.email || user.uid;
    sessionActions.hidden = false;
    loginCard.hidden = true;
    dash.hidden = false;
    showMsg(loginMsg, "");
    toast(`¡Bienvenido, ${user.email||"gerente"}!`, "ok");

    await loadCameras();
    await loadAudit();
  });

  // ====== Cámara / QR ======
  async function loadCameras() {
    cameraSel.innerHTML = "";
    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices.length) {
        cameraSel.innerHTML = `<option value="">(No hay cámaras)</option>`;
        return;
      }
      devices.forEach((d, i)=>{
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = d.label || `Cámara ${i+1}`;
        cameraSel.appendChild(opt);
      });
      const env = devices.find(d => /back|rear|environment/i.test(d.label));
      currentCameraId = (env || devices[0]).id;
      cameraSel.value = currentCameraId;
    } catch (e) {
      console.warn("No se pudieron listar cámaras:", e);
      cameraSel.innerHTML = `<option value="">(Sin permisos de cámara aún)</option>`;
    }
  }

  async function startScan() {
    if (html5qr) return;
    const camId = cameraSel.value || currentCameraId;
    if (!camId) { toast("Selecciona una cámara.", "err"); return; }

    html5qr = new Html5Qrcode("qrRegion");
    const config = { fps: 12, qrbox: { width: 260, height: 260 } };
    try {
      await html5qr.start({ deviceId: { exact: camId } }, config, onScanSuccess, ()=>{});
      btnStart.disabled = true;
      btnStop.disabled = false;
    } catch (e) {
      console.error(e);
      toast("No se pudo iniciar el escáner.", "err");
      await stopScan();
    }
  }
  async function stopScan() {
    if (!html5qr) { btnStart.disabled = false; btnStop.disabled = true; return; }
    try { await html5qr.stop(); html5qr.clear(); } catch {}
    html5qr = null;
    btnStart.disabled = false;
    btnStop.disabled = true;
  }
  btnStart?.addEventListener("click", startScan);
  btnStop?.addEventListener("click", stopScan);

  function onScanSuccess(text) {
    try {
      const obj = JSON.parse(text);
      if (obj && obj.code) {
        codeInput.value = obj.code;
        lookupCode();
      }
    } catch {
      if (/^[A-Z0-9]{8,14}$/.test(String(text).trim().toUpperCase())) {
        codeInput.value = String(text).trim().toUpperCase();
        lookupCode();
      }
    }
  }

  // ====== Buscar / Mostrar canje ======
  btnLookup?.addEventListener("click", lookupCode);
  codeInput?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); lookupCode(); } });

  async function lookupCode() {
    showMsg(redeemMsg, "");
    const code = (codeInput.value || "").trim().toUpperCase();
    if (!code) { showMsg(redeemMsg, "Escribe un código.", "warn"); return; }
    try {
      const snap = await db.ref(`redeems/${code}`).once("value");
      if (!snap.exists()) {
        showMsg(redeemMsg, "No existe ese cupón.", "err");
        redeemCard.hidden = true; return;
      }
      const d = snap.val();
      lastLookup = { code, ...d };
      fillRedeemCard(lastLookup);
      redeemCard.hidden = false;
    } catch (e) {
      console.error(e);
      showMsg(redeemMsg, "No fue posible consultar el cupón.", "err");
      redeemCard.hidden = true;
    }
  }

  function fillRedeemCard(d){
    rRewardName.textContent = d.rewardName || d.rewardId || "Cortesía";
    rCost.textContent = Number(d.cost||0);
    rExpires.textContent = d.expiresAt ? fmtDate(d.expiresAt) : "—";
    rStatus.textContent = (d.status||"").toUpperCase();

    rCode.textContent = d.code || "—";
    rUser.textContent = d.userId || "—";
    rRewardId.textContent = d.rewardId || "—";
    rCreated.textContent = fmtDate(d.createdAt);
    rState.textContent = d.status || "—";

    const canRedeem = d.status === "pending" || d.status === "pendiente";
    btnRedeem.disabled = !canRedeem;
  }

  // ====== Canjear ======
  btnRedeem?.addEventListener("click", doRedeem);

  async function doRedeem(){
    showMsg(redeemMsg, "");
    const data = lastLookup;
    if (!data || !data.code) return;
    const user = auth.currentUser;
    if (!user) { showMsg(redeemMsg, "Sesión expirada.", "err"); return; }

    if (data.expiresAt && Date.now() > Number(data.expiresAt)) {
      showMsg(redeemMsg, "Cupón vencido.", "err"); return;
    }
    if (String(data.status).toLowerCase() !== "pending" &&
        String(data.status).toLowerCase() !== "pendiente") {
      showMsg(redeemMsg, "El cupón ya fue canjeado.", "err"); return;
    }

    const note = (rNote.value || "").trim();
    const updates = {};
    const now = Date.now();

    updates[`/redeems/${data.code}/status`]     = "redeemed";
    updates[`/redeems/${data.code}/redeemedAt`] = now;
    updates[`/redeems/${data.code}/redeemedBy`] = user.uid;
    if (note) updates[`/redeems/${data.code}/note`] = note;

    if (data.userId) {
      updates[`/users/${data.userId}/redemptions/${data.code}/status`]     = "canjeado";
      updates[`/users/${data.userId}/redemptions/${data.code}/redeemedAt`] = now;
      updates[`/users/${data.userId}/redemptions/${data.code}/redeemedBy`] = user.uid;
      if (note) updates[`/users/${data.userId}/redemptions/${data.code}/note`] = note;
    }

    const logKey = db.ref("redeemLogs").push().key;
    updates[`/redeemLogs/${logKey}`] = {
      code: data.code,
      rewardId: data.rewardId || null,
      rewardName: data.rewardName || null,
      cost: Number(data.cost||0),
      userId: data.userId || null,
      redeemedBy: user.uid,
      redeemedByEmail: user.email || null,
      note: note || null,
      ts: now,
      status: "canjeado"
    };

    btnRedeem.disabled = true;
    try {
      await db.ref().update(updates);
      toast("¡Canje realizado!", "ok");
      showMsg(redeemMsg, "Canje exitoso.", "ok");
      const snap = await db.ref(`redeems/${data.code}`).once("value");
      lastLookup = { code: data.code, ...snap.val() };
      fillRedeemCard(lastLookup);
      await loadAudit();
    } catch (e) {
      console.error(e);
      showMsg(redeemMsg, "No se pudo canjear. Revisa permisos / conexión.", "err");
      btnRedeem.disabled = false;
    }
  }

  // ====== Auditoría ======
  async function loadAudit(){
    try {
      const snap = await db.ref("redeemLogs").orderByChild("ts").limitToLast(30).once("value");
      const rows = [];
      const val = snap.val() || {};
      const items = Object.values(val).sort((a,b)=> (b.ts||0)-(a.ts||0));
      items.forEach(x=>{
        rows.push(`
          <tr>
            <td>${fmtDate(x.ts)}</td>
            <td class="mono">${x.code||""}</td>
            <td>${x.rewardName||x.rewardId||""}</td>
            <td>${Number(x.cost||0)}</td>
            <td class="mono">${x.userId||""}</td>
            <td class="mono">${x.redeemedByEmail||x.redeemedBy||""}</td>
            <td>${(x.status||"").toUpperCase()}</td>
            <td>${x.note?escapeHtml(x.note):""}</td>
          </tr>
        `);
      });
      auditTableBody.innerHTML = rows.join("") || `<tr><td colspan="8" class="muted">Sin canjes aún.</td></tr>`;
    } catch (e) {
      console.error(e);
      auditTableBody.innerHTML = `<tr><td colspan="8" class="err">No se pudo cargar la bitácora.</td></tr>`;
    }
  }
  btnReloadAudit?.addEventListener("click", loadAudit);

  function escapeHtml(s){
    return String(s||"").replace(/[&<>"']/g, m=>({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[m]));
  }
})();
