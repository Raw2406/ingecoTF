const API =
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "localhost"
    ? "http://127.0.0.1:5000"
    : "https://autofinanzas-backend.redwave-e7e23e62.canadacentral.azurecontainerapps.io";

console.log("API ACTUAL USADA POR EL FRONTEND:", API);

const CURRENT_USER_KEY = "autofinanzas_current_user_normalizada";

const MARKET_DATA = {
  BCP: {
    teaMin: 8.5,
    teaMax: 15.0,
    initialMin: 10.0,
    initialMax: 20.0,
    initialLabel: "10% - 20%",
    balloonMin: 40.0,
    balloonMax: 50.0,
    balloonLabel: "40% - 50%",
    terms: [24, 36],
    graceMax: 3,
    graceLabel: "Hasta 3 meses (parcial/total)",
  },
  BBVA: {
    teaMin: 8.5,
    teaMax: 15.0,
    initialMin: 10.0,
    initialMax: 10.0,
    initialLabel: "10%",
    balloonMin: 40.0,
    balloonMax: 50.0,
    balloonLabel: "40% - 50%",
    terms: [24, 36],
    graceMax: 2,
    graceLabel: "1 a 2 meses",
  },
  Interbank: {
    teaMin: 8.99,
    teaMax: 16.0,
    initialMin: 20.0,
    initialMax: 20.0,
    initialLabel: "20%",
    balloonMin: 40.0,
    balloonMax: 40.0,
    balloonLabel: "Hasta 40%",
    terms: [24, 36],
    graceMax: 2,
    graceLabel: "Hasta 2 meses",
  },
  Scotiabank: {
    teaMin: 9.0,
    teaMax: 16.5,
    initialMin: 15.0,
    initialMax: 20.0,
    initialLabel: "15% - 20%",
    balloonMin: 40.0,
    balloonMax: 40.0,
    balloonLabel: "Hasta 40%",
    terms: [24, 36],
    graceMax: 2,
    graceLabel: "Hasta 2 meses",
  },
  BanBif: {
    teaMin: 9.0,
    teaMax: 15.0,
    initialMin: 20.0,
    initialMax: 20.0,
    initialLabel: "20%",
    balloonMin: 40.0,
    balloonMax: 40.0,
    balloonLabel: "Hasta 40%",
    terms: [24, 36],
    graceMax: 1,
    graceLabel: "1 mes",
  },
};

let currentUser = null;
let currentPlans = [];
let selectedPlanId = null;
let editingPlanId = null;

document.addEventListener("DOMContentLoaded", async () => {
  setDefaultDate();
  fillMarketTable();
  fillEntityOptions();
  bindEvents();

  const savedUser = localStorage.getItem(CURRENT_USER_KEY);
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    await showApp();
  } else {
    showAuth();
  }
});

function bindEvents() {
  byId("loginTab")?.addEventListener("click", () => switchAuthTab("login"));
  byId("registerTab")?.addEventListener("click", () =>
    switchAuthTab("register"),
  );
  byId("goRegister")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchAuthTab("register");
  });
  byId("goLogin")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchAuthTab("login");
  });

  byId("loginForm")?.addEventListener("submit", handleLogin);
  byId("registerForm")?.addEventListener("submit", handleRegister);
  byId("logoutBtn")?.addEventListener("click", logout);

  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) =>
      btn.addEventListener("click", () => goPage(btn.dataset.page)),
    );
  document
    .querySelectorAll(".quick-card")
    .forEach((card) =>
      card.addEventListener("click", () => goPage(card.dataset.go)),
    );

  byId("entitySelect")?.addEventListener("change", updateBankInputs);
  byId("vehiclePrice")?.addEventListener("input", () => {
    byId("priceLabel").textContent = money(Number(byId("vehiclePrice").value));
  });

  byId("newPlanForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveCalculatedPlan("Guardado");
  });
  byId("saveDraft")?.addEventListener("click", () =>
    saveCalculatedPlan("Borrador"),
  );
  byId("cancelPlan")?.addEventListener("click", () => {
  resetPlanFormMode();
  goPage("dashboard");
});

  byId("planSearch")?.addEventListener("input", renderPlans);
  byId("planTermFilter")?.addEventListener("change", renderPlans);
  byId("planStatusFilter")?.addEventListener("change", renderPlans);

  byId("profileForm")?.addEventListener("submit", handleProfileUpdate);
}

async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => "");

    if (!response.ok) {
      const message =
        typeof data === "object"
          ? data.error || data.message || `Error HTTP ${response.status}`
          : data || `Error HTTP ${response.status}`;

      throw new Error(message);
    }

    return data;
  } catch (err) {
    if (String(err.message || "").includes("Failed to fetch")) {
      throw new Error(
        "No se pudo conectar con el backend local. Verifica que Flask esté corriendo en http://127.0.0.1:5000.",
      );
    }

    throw new Error(err.message || "Error al conectar con la base de datos.");
  }
}

function showAuth() {
  byId("authScreen").classList.remove("hidden");
  byId("appScreen").classList.add("hidden");
}

async function showApp() {
  byId("authScreen").classList.add("hidden");
  byId("appScreen").classList.remove("hidden");
  refreshUserLabels();
  loadProfileForm();
  await loadPlansFromDb();
  updateDashboard();
  renderPlans();
  goPage("dashboard");
}

function switchAuthTab(tab) {
  const isLogin = tab === "login";
  byId("loginTab").classList.toggle("active", isLogin);
  byId("registerTab").classList.toggle("active", !isLogin);
  byId("loginForm").classList.toggle("hidden", !isLogin);
  byId("registerForm").classList.toggle("hidden", isLogin);
  hideMessage("authMessage");
}

async function handleLogin(e) {
  e.preventDefault();
  const emailInput = byId("loginEmail") || byId("loginDocNumber");
  try {
    const data = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: byId("loginPassword").value,
      }),
    });
    currentUser = data.user;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
    await showApp();
  } catch (err) {
    showMessage("authMessage", err.message, "error");
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const payload = {
    fullName: byId("regFullName").value.trim(),
    password: byId("regPassword").value,
    email: byId("regEmail").value.trim(),
  };

  if (!payload.fullName || !payload.password || !payload.email) {
    showMessage(
      "authMessage",
      "Completa nombres, correo y contraseña.",
      "error",
    );
    return;
  }

  try {
    const data = await apiRequest("/api/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    currentUser = data.user;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
    await showApp();
  } catch (err) {
    showMessage("authMessage", err.message, "error");
  }
}

function logout() {
  currentUser = null;
  currentPlans = [];
  localStorage.removeItem(CURRENT_USER_KEY);
  showAuth();
}

function refreshUserLabels() {
  if (!currentUser) return;
  const firstName = currentUser.fullName
    ? currentUser.fullName.split(" ")[0]
    : "Usuario";
  byId("sideUserName").textContent = currentUser.fullName || "Usuario";
  byId("dashboardName").textContent = firstName;
}

function goPage(page) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  byId(`${page}Page`)?.classList.add("active");
  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.page === page),
    );
  if (page === "dashboard") updateDashboard();
  if (page === "plans") renderPlans();
  if (page === "settings") loadProfileForm();
}

function loadProfileForm() {
  if (!currentUser) return;
  byId("profileName").value = currentUser.fullName || "";
  byId("profileEmail").value = currentUser.email || "";
  if (byId("profilePassword")) byId("profilePassword").value = "";
  if (byId("profileDocType")) byId("profileDocType").value = "DNI";
  if (byId("profileDocNumber")) byId("profileDocNumber").value = "";
  if (byId("profilePhone")) byId("profilePhone").value = "";
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  if (!currentUser) return;
  const payload = {
    fullName: byId("profileName").value.trim(),
    email: byId("profileEmail").value.trim(),
    password: byId("profilePassword")?.value || "",
  };

  try {
    const data = await apiRequest(`/api/users/${currentUser.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    currentUser = data.user;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
    showMessage("profileMessage", "Perfil actualizado correctamente.", "ok");
    refreshUserLabels();
  } catch (err) {
    showMessage("profileMessage", err.message, "error");
  }
}

function fillEntityOptions() {
  if (!byId("entitySelect")) return;
  byId("entitySelect").innerHTML = Object.keys(MARKET_DATA)
    .map((bank) => `<option>${bank}</option>`)
    .join("");
  updateBankInputs();
}

function updateBankInputs() {
  const entity = byId("entitySelect").value;
  const bank = MARKET_DATA[entity];

  byId("bankInfo").textContent =
    `Referencia ${entity}: TEA ${bank.teaMin.toFixed(2)}% - ${bank.teaMax.toFixed(2)}%, cuota inicial ${bank.initialLabel}, cuota balón ${bank.balloonLabel} y gracia ${bank.graceLabel}.`;

  const teaInput = byId("teaPct");
  teaInput.min = bank.teaMin;
  teaInput.max = bank.teaMax;
  teaInput.step = "0.05";
  teaInput.value = clampNumber(
    Number(teaInput.value || (bank.teaMin + bank.teaMax) / 2),
    bank.teaMin,
    bank.teaMax,
  ).toFixed(2);

  const initialInput = byId("initialPct");
  initialInput.min = bank.initialMin;
  initialInput.max = bank.initialMax;
  initialInput.step = "0.05";
  initialInput.value = clampNumber(
    Number(initialInput.value || bank.initialMin),
    bank.initialMin,
    bank.initialMax,
  ).toFixed(2);

  const balloonInput = byId("balloonPct");
  balloonInput.min = bank.balloonMin;
  balloonInput.max = bank.balloonMax;
  balloonInput.step = "0.05";
  balloonInput.value = clampNumber(
    Number(balloonInput.value || bank.balloonMin),
    bank.balloonMin,
    bank.balloonMax,
  ).toFixed(2);

  byId("graceMonths").innerHTML = "";
  for (let i = 0; i <= bank.graceMax; i++) {
    byId("graceMonths").insertAdjacentHTML(
      "beforeend",
      `<option value="${i}">${i}</option>`,
    );
  }

  byId("termMonths").innerHTML = bank.terms
    .map((t) => `<option value="${t}">${t} meses</option>`)
    .join("");
}

async function saveCalculatedPlan(status) {
  if (!currentUser) return;

  const values = collectPlanInputs();
  const validation = validatePlanInputs(values);

  if (!validation.ok) {
    alert(validation.message);
    if (validation.inputId) {
      byId(validation.inputId)?.focus();
    }
    return;
  }

  if (values.graceMonths > 0 && values.graceType === "Sin gracia") {
    values.graceMonths = 0;
  }

  const { summary, schedule } = calculatePlan(values);

  const planIdToEdit = editingPlanId;
  const wasEditing = Boolean(planIdToEdit);

  try {
    const payload = {
      userId: currentUser.id,
      status,
      summary,
      schedule,
    };

    const data = wasEditing
      ? await apiRequest(`/api/plans/${planIdToEdit}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })
      : await apiRequest("/api/plans", {
          method: "POST",
          body: JSON.stringify(payload),
        });

    if (!data || !data.plan) {
      throw new Error("El backend no devolvió el plan actualizado.");
    }

    const normalizedPlan = normalizePlanForDisplay(data.plan);

    if (wasEditing) {
      currentPlans = currentPlans.map((p) =>
        Number(p.id) === Number(planIdToEdit) ? normalizedPlan : p,
      );
    } else {
      currentPlans.unshift(normalizedPlan);
    }

    selectedPlanId = normalizedPlan.id;
    editingPlanId = null;
    resetPlanFormMode();

    displayResult(summary, schedule);
    updateDashboard();
    renderPlans();

    if (wasEditing) {
      alert("Plan actualizado correctamente.");
    } else if (status === "Borrador") {
      alert("Borrador guardado correctamente.");
    } else {
      alert("Plan guardado correctamente.");
    }
  } catch (err) {
    alert(err.message);
  }
}

function collectPlanInputs() {
  return {
    entity: byId("entitySelect").value,
    vehiclePrice: Number(byId("vehiclePrice").value),
    initialPct: Number(byId("initialPct").value),
    teaPct: Number(byId("teaPct").value),
    termMonths: Number(byId("termMonths").value),
    graceMonths: Number(byId("graceMonths").value),
    graceType: byId("graceType").value,
    balloonPct: Number(byId("balloonPct").value),
    start: byId("startDate").value,
    includeSd: byId("includeSd").value === "yes",
    includeVehicleInsurance: byId("includeVehicleInsurance").value === "yes",
    sdRatePctMonthly: Number(byId("sdRate").value),
    vehicleInsurancePctMonthly: Number(byId("vehicleInsuranceRate").value),
  };
}

function calculatePlan(values) {
  const monthlyRate = teaToTem(values.teaPct);

  const initialAmount = (values.vehiclePrice * values.initialPct) / 100;
  const principal = values.vehiclePrice - initialAmount;
  const balloonAmount = (values.vehiclePrice * values.balloonPct) / 100;

  let balance = principal;
  const rows = [];
  const lenderCashflows = [-principal];

  let totalInterest = 0;
  let totalPayment = 0;
  const EPS = 0.01;

  let graceMonths = Math.min(values.graceMonths, values.termMonths);
  if (values.graceType === "Sin gracia") graceMonths = 0;

  const formatToMySQLDate = (localDateStr) => {
    const [day, month, year] = localDateStr.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  // 1. Periodos de gracia.
  for (let k = 1; k <= graceMonths; k++) {
    const opening = balance;
    const interest = opening * monthlyRate;

    let cuotaFinanciera = 0;
    let amort = 0;

    if (values.graceType === "Total") {
      cuotaFinanciera = 0;
      amort = 0;
      balance = opening + interest;
    } else if (values.graceType === "Parcial") {
      cuotaFinanciera = interest;
      amort = 0;
      balance = opening;
    }

    // Lógica de seguros adaptada a las especificaciones
    let sd = 0;
    let veh = 0;

    if (values.graceType === "Total") {
      // El desgravamen varía según el saldo inicial de cada mes y el seguro vehicular se mantiene activo
      sd = values.includeSd ? opening * (values.sdRatePctMonthly / 100) : 0;
      veh = values.includeVehicleInsurance ? values.vehiclePrice * (values.vehicleInsurancePctMonthly / 100) : 0;
    } else if (values.graceType === "Parcial") {
      // Modificación: En periodo de gracia parcial, tanto desgravamen como seguro vehicular son 0
      sd = 0;
      veh = 0;
    }

    const totalRowPayment = cuotaFinanciera + sd + veh;

    totalInterest += interest;
    totalPayment += totalRowPayment;
    lenderCashflows.push(totalRowPayment);

    const mysqlDate = formatToMySQLDate(addMonths(values.start, k - 1));

    rows.push({
      cuota: k,
      fecha: mysqlDate,
      saldoInicial: opening,
      interes: interest,
      cuotaFinanciera,
      amortizacion: amort,
      seguroDesgravamen: sd,
      seguroVehicular: veh,
      cuotaBalonPagada: 0,
      cuotaTotal: totalRowPayment,
      saldoFinal: Math.abs(balance) < EPS ? 0 : balance,
      tipo: `Gracia ${values.graceType}`,
    });
  }

  // Guardamos el saldo base al salir de la gracia para calcular el desgravamen FIJO posterior
  const regularSdBaseBalance = balance;

  // 2. Cuota regular con Compra Inteligente.
  const remainingTerm = values.termMonths - rows.length;
  const regularMonths = Math.max(remainingTerm, 0);

  const cuotaBase = paymentWithBalloon(
    balance,
    monthlyRate,
    regularMonths,
    balloonAmount,
  );

  // 3. Periodos ordinarios.
  for (let i = 0; i < regularMonths; i++) {
    const k = rows.length + 1;
    const isLast = i === regularMonths - 1;

    const opening = balance;
    const interest = opening * monthlyRate;
    const amort = cuotaBase - interest;
    const balloonPaid = isLast ? balloonAmount : 0;

    let closing = opening - amort - balloonPaid;
    if (Math.abs(closing) < EPS) closing = 0;

    // Desgravamen calculado sobre el saldo base constante; seguro vehicular regular activo en ordinarios
    const sd = values.includeSd ? regularSdBaseBalance * (values.sdRatePctMonthly / 100) : 0;
    const veh = values.includeVehicleInsurance ? values.vehiclePrice * (values.vehicleInsurancePctMonthly / 100) : 0;

    const totalRowPayment = cuotaBase + balloonPaid + sd + veh;

    totalInterest += interest;
    totalPayment += totalRowPayment;
    lenderCashflows.push(totalRowPayment);

    const mysqlDate = formatToMySQLDate(addMonths(values.start, k - 1));

    rows.push({
      cuota: k,
      fecha: mysqlDate,
      saldoInicial: opening,
      interes: interest,
      cuotaFinanciera: cuotaBase,
      amortizacion: amort,
      seguroDesgravamen: sd,
      seguroVehicular: veh,
      cuotaBalonPagada: balloonPaid,
      cuotaTotal: totalRowPayment,
      saldoFinal: closing,
      tipo: isLast && balloonPaid > 0 ? "Cuota balón" : "Cuota regular",
    });

    balance = closing;
  }

  // 4. Indicadores.
  let monthlyIrr = irrBisection(lenderCashflows);
  if (monthlyIrr === null) monthlyIrr = monthlyRate;

  const tcea = (Math.pow(1 + monthlyIrr, 12) - 1) * 100;

  // Corrección del VAN según la vista del deudor (Costo Actual Positivo)
  const vanCostoDeudor = lenderCashflows.reduce(
    (acc, flow, idx) => acc + flow / Math.pow(1 + monthlyRate, idx),
    0,
  );

  return {
    summary: {
      name: `Plan ${values.entity} - USD ${values.vehiclePrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      entity: values.entity,
      vehiclePrice: values.vehiclePrice,
      initialPct: values.initialPct,
      teaPct: values.teaPct,
      temPct: monthlyRate * 100,
      termMonths: values.termMonths,
      graceMonths,
      graceType: graceMonths ? values.graceType : "Sin gracia",
      balloonPct: values.balloonPct,
      startDate: values.start,
      loanAmount: principal,
      monthlyPayment: cuotaBase,
      totalPayment,
      totalInterest,
      tceaPct: tcea,
      van: Math.abs(vanCostoDeudor) < 0.01 ? 0 : vanCostoDeudor,
      tirMonthlyPct: monthlyIrr * 100,
      initialAmount,
      balloonAmount,
    },
    schedule: rows,
  };
}

function regularPaymentWithFinalBalloon(
  principal,
  monthlyRate,
  regularMonths,
  finalBalloonPayment,
) {
  return paymentWithBalloon(
    principal,
    monthlyRate,
    regularMonths,
    finalBalloonPayment,
  );
}

function paymentWithBalloon(principal, monthlyRate, months, balloon) {
  if (months <= 0) return 0;

  if (monthlyRate === 0) {
    return Math.max((principal - balloon) / months, 0);
  }

  const presentBalloon = balloon / Math.pow(1 + monthlyRate, months);

  const annuityBase = principal - presentBalloon;

  const annuityFactor =
    (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;

  return Math.max(annuityBase / annuityFactor, 0);
}

function teaToTem(teaPct) {
  return Math.pow(1 + teaPct / 100, 1 / 12) - 1;
}
function npv(rate, cashflows) {
  return cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i), 0);
}

function irrBisection(cashflows, low = -0.95, high = 1.0) {
  let fLow = npv(low, cashflows);
  let fHigh = npv(high, cashflows);
  let expandCount = 0;
  while (fLow * fHigh > 0 && high < 10 && expandCount < 20) {
    high *= 1.5;
    fHigh = npv(high, cashflows);
    expandCount++;
  }
  if (fLow * fHigh > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, cashflows);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

async function loadPlansFromDb() {
  if (!currentUser) return;

  try {
    const data = await apiRequest(`/api/plans?userId=${currentUser.id}`);

    currentPlans = (data.plans || []).map((plan) =>
      normalizePlanForDisplay(plan),
    );
  } catch (err) {
    console.error("Error cargando planes:", err);
    currentPlans = [];
  }
}

function updateDashboard() {
  const plans = currentPlans.filter((p) => p.status === "Guardado");
  byId("metricPlans").textContent = plans.length;
  let saving = 0;
  plans.forEach((p) => {
    const r = teaToTem(p.teaPct);
    const regularWithoutBalloon = paymentWithBalloon(
      p.loanAmount,
      r,
      p.termMonths,
      0,
    );
    saving += Math.max(regularWithoutBalloon - p.monthlyPayment, 0);
  });
  byId("metricSaving").textContent = money(saving);
}

function renderPlans() {
  const list = byId("plansList");
  if (!list) return;

  const search = byId("planSearch").value.trim().toLowerCase();
  const term = byId("planTermFilter").value;
  const status = byId("planStatusFilter").value;

  const filtered = currentPlans.filter((p) => {
    if (search && !`${p.name} ${p.entity}`.toLowerCase().includes(search))
      return false;
    if (term !== "Todos" && Number(term) !== p.termMonths) return false;
    if (status !== "Todos" && p.status !== status) return false;
    return true;
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="plan-card"><p>No se encontraron planes registrados.</p></div>`;
    byId("selectedPlanSection").classList.add("hidden");
    return;
  }

  if (!selectedPlanId || !filtered.some((p) => p.id === selectedPlanId)) {
    selectedPlanId = filtered[0].id;
  }

  list.innerHTML = filtered
    .map((p) => {
      const selected = p.id === selectedPlanId ? " selected" : "";
      const pillClass = p.status === "Borrador" ? "pill draft" : "pill";

      return `
      <article class="plan-card${selected}">
        <div class="plan-head">
          <div>
            <h3>📄 ${escapeHtml(p.name)}</h3>
            <div class="plan-meta">
              Precio vehículo: ${money(p.vehiclePrice)} | TEA: ${pct(p.teaPct)} |
              Plazo: ${p.termMonths} meses | Cuota Inicial: ${pct(p.initialPct)} |
              Cuota Balón: ${pct(p.balloonPct)} | Meses de Gracia: ${p.graceMonths}
            </div>
          </div>
          <span class="${pillClass}">${p.status}</span>
        </div>
        <div class="plan-actions">
          <button type="button" onclick="selectPlan(${p.id})">Ver Detalle</button>
          <button type="button" onclick="editPlan(${p.id})">Modificar</button>
          <button type="button" onclick="deletePlan(${p.id})">Eliminar</button>
        </div>
      </article>
    `;
    })
    .join("");

  const selected = filtered.find((p) => p.id === selectedPlanId);
  if (selected) displaySelectedPlan(selected);
}

function selectPlan(planId) {
  selectedPlanId = Number(planId);
  renderPlans();
}

function editPlan(planId) {
  const plan = currentPlans.find((p) => p.id === Number(planId));

  if (!plan) {
    alert("No se encontró el plan seleccionado.");
    return;
  }

  editingPlanId = Number(planId);
  selectedPlanId = Number(planId);

  fillPlanFormFromPlan(plan);

  byId("resultSection")?.classList.add("hidden");
  goPage("newPlan");
}

function fillPlanFormFromPlan(plan) {
  byId("entitySelect").value = plan.entity;
  updateBankInputs();

  byId("vehiclePrice").value = Number(plan.vehiclePrice || 0);
  byId("priceLabel").textContent = money(Number(plan.vehiclePrice || 0));

  byId("initialPct").value = Number(plan.initialPct || 0).toFixed(2);
  byId("teaPct").value = Number(plan.teaPct || 0).toFixed(2);
  byId("termMonths").value = String(plan.termMonths || 24);
  byId("graceMonths").value = String(plan.graceMonths || 0);
  byId("graceType").value = plan.graceType || "Sin gracia";
  byId("balloonPct").value = Number(plan.balloonPct || 0).toFixed(2);
  byId("startDate").value = String(plan.startDate || "").slice(0, 10);

  const derived = deriveInsuranceRatesFromPlan(plan);

  byId("includeSd").value = derived.hasSd ? "yes" : "no";
  byId("includeVehicleInsurance").value = derived.hasVeh ? "yes" : "no";
  byId("sdRate").value = derived.sdRatePctMonthly.toFixed(4);
  byId("vehicleInsuranceRate").value =
    derived.vehicleInsurancePctMonthly.toFixed(4);

  const submitBtn = byId("newPlanForm")?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Actualizar plan";

  const draftBtn = byId("saveDraft");
  if (draftBtn) draftBtn.textContent = "Actualizar borrador";
}

function deriveInsuranceRatesFromPlan(plan) {
  const rows = plan.schedule || [];

  const sdRow = rows.find(
    (r) =>
      Number(r.seguroDesgravamen || 0) > 0 &&
      Number(r.saldoInicial || 0) > 0,
  );

  const vehRow = rows.find((r) => Number(r.seguroVehicular || 0) > 0);

  const sdRatePctMonthly = sdRow
    ? (Number(sdRow.seguroDesgravamen) / Number(sdRow.saldoInicial)) * 100
    : 0.08;

  const vehicleInsurancePctMonthly = vehRow
    ? (Number(vehRow.seguroVehicular) / Number(plan.vehiclePrice || 1)) * 100
    : 0.12;

  return {
    hasSd: Boolean(sdRow),
    hasVeh: Boolean(vehRow),
    sdRatePctMonthly,
    vehicleInsurancePctMonthly,
  };
}

function resetPlanFormMode() {
  editingPlanId = null;

  const submitBtn = byId("newPlanForm")?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Continuar";

  const draftBtn = byId("saveDraft");
  if (draftBtn) draftBtn.textContent = "Guardar borrador";
}

async function deletePlan(planId) {
  if (!currentUser) return;
  try {
    await apiRequest(`/api/plans/${planId}?userId=${currentUser.id}`, {
      method: "DELETE",
    });
    currentPlans = currentPlans.filter((p) => p.id !== Number(planId));
    if (selectedPlanId === Number(planId)) selectedPlanId = null;
    renderPlans();
    updateDashboard();
  } catch (err) {
    alert(err.message);
  }
}

function displaySelectedPlan(plan) {
  const normalizedPlan = normalizePlanForDisplay(plan);

  byId("selectedPlanSection").classList.remove("hidden");

  byId("selectedPlanTitle").textContent =
    `Cronograma del plan seleccionado: ${normalizedPlan.name}`;

  byId("selPayment").textContent = money(normalizedPlan.monthlyPayment);
  byId("selTcea").textContent = pct(normalizedPlan.tceaPct);
  byId("selTir").textContent = pct(normalizedPlan.tirMonthlyPct, 4);
  byId("selVan").textContent = money(normalizedPlan.van);
  byId("selInterest").textContent = money(normalizedPlan.totalInterest);
  byId("selTEM").textContent = pct(normalizedPlan.temPct, 4);
  byId("selTotalLoan").textContent = money(normalizedPlan.loanAmount);

  renderScheduleTable("selectedSchedule", normalizedPlan.schedule);
}

function displayResult(summary, schedule) {
  byId("resultSection").classList.remove("hidden");
  byId("resLoan").textContent = money(summary.loanAmount);
  byId("resPayment").textContent = money(summary.monthlyPayment);
  byId("resTem").textContent = pct(summary.temPct, 4);
  byId("resTcea").textContent = pct(summary.tceaPct);
  renderScheduleTable("resultSchedule", schedule, summary);
}

function normalizePlanForDisplay(plan) {
  const normalizedSchedule = normalizeScheduleRows(plan.schedule || [], plan);

  const fixedPayment = getFixedFinancialPayment(normalizedSchedule);

  const totalInterest = normalizedSchedule.reduce(
    (acc, r) => acc + Number(r.interes || 0),
    0,
  );

  const totalPayment = normalizedSchedule.reduce(
    (acc, r) => acc + Number(r.cuotaTotal || 0),
    0,
  );

  return {
    ...plan,
    schedule: normalizedSchedule,
    monthlyPayment: fixedPayment,
    totalInterest,
    totalPayment,
  };
}

function normalizeScheduleRows(rows = [], plan = {}) {
  const vehiclePrice = Number(plan.vehiclePrice || 0);
  const balloonPct = Number(plan.balloonPct || 0);
  const expectedBalloon = vehiclePrice * balloonPct / 100;

  return rows.map((r) => {
    const tipo = String(r.tipo || "").toLowerCase();

    const interes = Number(r.interes || 0);
    const seguroDesgravamen = Number(r.seguroDesgravamen || 0);
    const seguroVehicular = Number(r.seguroVehicular || 0);
    const cuotaTotal = Number(r.cuotaTotal || 0);
    const saldoInicial = Number(r.saldoInicial || 0);
    const saldoFinal = Number(r.saldoFinal || 0);

    let cuotaFinanciera = 0;
    let cuotaBalonPagada = 0;
    let amortizacion = Number(r.amortizacion || 0);

    if (tipo.includes("gracia total")) {
      cuotaFinanciera = 0;
      cuotaBalonPagada = 0;
      amortizacion = 0;
    } else if (tipo.includes("gracia parcial")) {
      cuotaFinanciera = interes;
      cuotaBalonPagada = 0;
      amortizacion = 0;
    } else if (tipo.includes("balón") || tipo.includes("balon")) {
      // Última cuota:
      // cuota total = cuota financiera + cuota balón + seguros.
      cuotaBalonPagada = expectedBalloon > 0 ? expectedBalloon : Number(r.cuotaBalonPagada || 0);

      cuotaFinanciera = Math.max(
        cuotaTotal - seguroDesgravamen - seguroVehicular - cuotaBalonPagada,
        0,
      );

      amortizacion = Math.max(cuotaFinanciera - interes, 0);

      // Fallback por si el plan no trae precio/balón o vino de una versión antigua.
      if (cuotaBalonPagada <= 0) {
        cuotaBalonPagada = Math.max(
          cuotaTotal - seguroDesgravamen - seguroVehicular - cuotaFinanciera,
          0,
        );
      }

      // Fallback adicional por saldo.
      if (cuotaBalonPagada <= 0 && saldoInicial > 0) {
        cuotaBalonPagada = Math.max(saldoInicial - amortizacion - saldoFinal, 0);
      }
    } else {
      // Cuota regular ordinaria:
      // cuota total = cuota financiera + seguros.
      cuotaFinanciera = Math.max(
        cuotaTotal - seguroDesgravamen - seguroVehicular,
        0,
      );

      amortizacion = Math.max(cuotaFinanciera - interes, 0);
      cuotaBalonPagada = 0;
    }

    return {
      ...r,
      interes,
      saldoInicial,
      saldoFinal,
      cuotaFinanciera,
      amortizacion,
      seguroDesgravamen,
      seguroVehicular,
      cuotaBalonPagada,
      cuotaTotal,
    };
  });
}

function getFixedFinancialPayment(rows = []) {
  const regularRow = rows.find((r) =>
    String(r.tipo || "").toLowerCase().includes("cuota regular"),
  );

  if (regularRow) {
    return Number(regularRow.cuotaFinanciera || 0);
  }

  const balloonRow = rows.find((r) => {
    const tipo = String(r.tipo || "").toLowerCase();
    return tipo.includes("balón") || tipo.includes("balon");
  });

  if (balloonRow) {
    return Number(balloonRow.cuotaFinanciera || 0);
  }

  return 0;
}

function renderScheduleTable(tableId, rows, plan = {}) {
  const table = byId(tableId);
  const normalizedRows = normalizeScheduleRows(rows || [], plan);

  table.innerHTML = `
    <thead>
      <tr>
        <th>N° Cuota</th>
        <th>Fecha</th>
        <th>Saldo Inicial</th>
        <th>Interés</th>
        <th>Cuota Financiera</th>
        <th>Amortización</th>
        <th>Seguro Desgravamen</th>
        <th>Seguro Vehicular</th>
        <th>Cuota Balón</th>
        <th>Cuota Total</th>
        <th>Saldo Final</th>
        <th>Tipo</th>
      </tr>
    </thead>
    <tbody>
      ${normalizedRows
        .map(
          (r) => `
        <tr>
          <td>${r.cuota}</td>
          <td>${r.fecha}</td>
          <td>${money(r.saldoInicial)}</td>
          <td>${money(r.interes)}</td>
          <td>${money(r.cuotaFinanciera)}</td>
          <td>${money(r.amortizacion)}</td>
          <td>${money(r.seguroDesgravamen)}</td>
          <td>${money(r.seguroVehicular)}</td>
          <td>${money(r.cuotaBalonPagada)}</td>
          <td>${money(r.cuotaTotal)}</td>
          <td>${money(r.saldoFinal)}</td>
          <td>${r.tipo}</td>
        </tr>`,
        )
        .join("")}
    </tbody>`;
}

function fillMarketTable() {
  const table = byId("marketTable");
  if (!table) return;
  table.innerHTML = `
    <thead>
      <tr><th>Entidad Financiera</th><th>Rango TEA Aprox.</th><th>Cuota inicial mínima</th><th>Cuota balón final</th><th>Plazo máximo</th><th>Periodo de gracia</th></tr>
    </thead>
    <tbody>
      ${Object.entries(MARKET_DATA)
        .map(
          ([bank, d]) => `
        <tr><td>${bank}</td><td>${d.teaMin.toFixed(2)}% - ${d.teaMax.toFixed(2)}%</td><td>${d.initialLabel}</td><td>${d.balloonLabel}</td><td>24 a 36 meses</td><td>${d.graceLabel}</td></tr>
      `,
        )
        .join("")}
    </tbody>`;
}

function setDefaultDate() {
  const input = byId("startDate");
  if (!input) return;
  const today = new Date().toISOString().slice(0, 10);
  input.min = today;
  input.value = today;
}

function validatePlanInputs(values) {
  const bank = MARKET_DATA[values.entity];

  if (!bank) {
    return {
      ok: false,
      message: "Selecciona una entidad financiera válida.",
      inputId: "entitySelect",
    };
  }

  if (values.vehiclePrice < 10000 || values.vehiclePrice > 75000) {
    return {
      ok: false,
      message: "El precio del vehículo debe estar entre USD 10,000 y USD 75,000.",
      inputId: "vehiclePrice",
    };
  }

  if (values.teaPct < bank.teaMin || values.teaPct > bank.teaMax) {
    return {
      ok: false,
      message: `La TEA para ${values.entity} debe estar entre ${bank.teaMin.toFixed(2)}% y ${bank.teaMax.toFixed(2)}%.`,
      inputId: "teaPct",
    };
  }

  if (values.initialPct < bank.initialMin || values.initialPct > bank.initialMax) {
    return {
      ok: false,
      message: `La cuota inicial para ${values.entity} debe estar entre ${bank.initialMin.toFixed(2)}% y ${bank.initialMax.toFixed(2)}%.`,
      inputId: "initialPct",
    };
  }

  if (values.balloonPct < bank.balloonMin || values.balloonPct > bank.balloonMax) {
    return {
      ok: false,
      message: `La cuota balón para ${values.entity} debe estar entre ${bank.balloonMin.toFixed(2)}% y ${bank.balloonMax.toFixed(2)}%.`,
      inputId: "balloonPct",
    };
  }

  if (!bank.terms.includes(values.termMonths)) {
    return {
      ok: false,
      message: `El plazo para ${values.entity} debe ser ${bank.terms.join(" o ")} meses.`,
      inputId: "termMonths",
    };
  }

  if (values.graceMonths < 0 || values.graceMonths > bank.graceMax) {
    return {
      ok: false,
      message: `Los meses de gracia para ${values.entity} deben estar entre 0 y ${bank.graceMax}.`,
      inputId: "graceMonths",
    };
  }

  if (values.graceType === "Sin gracia" && values.graceMonths > 0) {
    return {
      ok: false,
      message: "Si eliges 'Sin gracia', los meses de gracia deben ser 0.",
      inputId: "graceMonths",
    };
  }

  if (values.sdRatePctMonthly < 0 || values.vehicleInsurancePctMonthly < 0) {
    return {
      ok: false,
      message: "Las tasas de seguro no pueden ser negativas.",
    };
  }

  return { ok: true };
}

function clearInputError(id) {
  const input = byId(id);
  if (input) input.setCustomValidity("");
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function byId(id) {
  return document.getElementById(id);
}
function money(value) {
  return `USD ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(value, decimals = 2) {
  return `${Number(value || 0).toFixed(decimals)}%`;
}
function addMonths(dateString, months) {
  const d = new Date(`${dateString}T00:00:00`);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function showMessage(id, text, type = "error") {
  const box = byId(id);
  box.textContent = text;
  box.className = `message ${type}`;
}
function hideMessage(id) {
  const box = byId(id);
  box.textContent = "";
  box.className = "message hidden";
}
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
