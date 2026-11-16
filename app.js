/* ============================================================
   TradeForge — Trading journal & risk guard logic
   Vanilla JavaScript. No dependencies. Your data stays yours.
   ============================================================ */

"use strict";

/* ---------- Configuration ---------- */
const MARKETS = {
  crypto: { label: "Crypto", contract: 1, sizeUnit: "Units" },
  forex:  { label: "Forex",  contract: 100000, sizeUnit: "Lots" },
  stocks: { label: "Stocks", contract: 1, sizeUnit: "Shares" },
};

const EMOTIONS = {
  focused: "🎯",
  confident: "💪",
  neutral: "😐",
  stressed: "😰",
  impulsive: "🌀",
};

const MISTAKE_LIST = ["FOMO", "Revenge", "Oversized", "Early exit", "No plan", "Chased"];

const DEFAULT_SETTINGS = { balance: 10000, riskLimit: 2 };

/* ---------- State ---------- */
let trades = []; // newest first
let settings = { ...DEFAULT_SETTINGS };
let currentDir = "long";
let selectedMistakes = new Set();
let importMode = "json";

/* ---------- DOM handles ---------- */
const $ = (id) => document.getElementById(id);

const settingsModal = $("settings-modal");
const toastEl = $("toast");

/* ---------- Utilities ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmtMoney(v) {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtNum(v, digits = 2) {
  return Number(v).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function weekStart(d = new Date()) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // Monday = 0
  dt.setDate(dt.getDate() - day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

/* ---------- Trade math ---------- */
function tradePnl(t) {
  const dirMul = t.direction === "short" ? -1 : 1;
  return (t.exit - t.entry) * t.size * t.contract * dirMul;
}

function tradeRiskAmount(t) {
  if (!t.stop) return 0;
  return Math.abs(t.entry - t.stop) * t.size * t.contract;
}

function tradeRiskPct(t) {
  const risk = tradeRiskAmount(t);
  if (!risk || settings.balance <= 0) return null;
  return (risk / settings.balance) * 100;
}

function tradeR(t) {
  const risk = tradeRiskAmount(t);
  if (!risk) return null;
  return tradePnl(t) / risk;
}

function isTiltTrade(t) {
  const over = tradeRiskPct(t);
  return (
    (t.mistakes && t.mistakes.length > 0) ||
    (over !== null && over > settings.riskLimit)
  );
}

function tiltReason(t) {
  const reasons = [];
  if (t.mistakes && t.mistakes.length) reasons.push(t.mistakes.join(", "));
  const over = tradeRiskPct(t);
  if (over !== null && over > settings.riskLimit) {
    reasons.push(`risked ${fmtNum(over, 1)}% (limit ${settings.riskLimit}%)`);
  }
  return reasons.join(" · ");
}

/* ---------- Persistence ---------- */
function persist() {
  saveJSON("tradeforge.trades", trades);
  saveJSON("tradeforge.settings", settings);
}

function loadState() {
  const stored = loadJSON("tradeforge.trades", []);
  trades = Array.isArray(stored)
    ? stored.filter((t) => t && t.symbol && Number.isFinite(Number(t.entry)))
    : [];
  settings = Object.assign({}, DEFAULT_SETTINGS, loadJSON("tradeforge.settings", {}));
}

/* ---------- View switching ---------- */
function switchView(name) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const on = btn.dataset.view === name;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === `view-${name}`);
  });
  if (name === "dashboard") renderDashboard();
  if (name === "review") renderReview();
}

/* ---------- Journal form ---------- */
function updateMarketDefaults() {
  const m = MARKETS[$("t-market").value];
  $("t-size-label").childNodes[0].nodeValue = m.sizeUnit + " ";
  if (!$("t-contract").dataset.touched) {
    $("t-contract").value = m.contract;
  }
}

function renderMistakeChips() {
  const wrap = $("t-mistakes");
  wrap.innerHTML = "";
  for (const m of MISTAKE_LIST) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (selectedMistakes.has(m) ? " active" : "");
    b.textContent = m;
    b.addEventListener("click", () => {
      selectedMistakes.has(m) ? selectedMistakes.delete(m) : selectedMistakes.add(m);
      b.classList.toggle("active", selectedMistakes.has(m));
      updateLiveCalc();
    });
    wrap.appendChild(b);
  }
}

function readForm() {
  const market = $("t-market").value;
  const contract = Number($("t-contract").value) || MARKETS[market].contract;
  return {
    market,
    symbol: $("t-symbol").value.trim().toUpperCase(),
    direction: currentDir,
    entry: Number($("t-entry").value),
    stop: Number($("t-stop").value) || 0,
    exit: Number($("t-exit").value),
    size: Number($("t-size").value),
    contract,
    emotion: $("t-emotion").value,
    date: $("t-date").value || todayStr(),
    notes: $("t-notes").value.trim(),
    mistakes: [...selectedMistakes],
  };
}

function updateLiveCalc() {
  const f = readForm();
  const box = $("live-calc");
  const valid =
    f.entry > 0 && f.exit >= 0 && f.size > 0 && f.symbol && f.contract > 0;

  if (!valid || !f.entry) {
    box.innerHTML = `<span class="calc-pill">Fill symbol, entry, exit & size — math appears here ⚡</span>`;
    return;
  }

  const pnl = tradePnl(f);
  const risk = tradeRiskAmount(f);
  const riskPct = settings.balance > 0 ? (risk / settings.balance) * 100 : null;

  const pills = [`<span class="calc-pill">P&L <b>${fmtMoney(pnl)}</b></span>`];

  if (risk > 0) {
    pills.push(`<span class="calc-pill">Risk <b>${fmtMoney(risk)}</b>${riskPct !== null ? ` (${fmtNum(riskPct, 2)}%)` : ""}</span>`);
    const r = tradeR(f);
    if (r !== null) pills.push(`<span class="calc-pill">R <b>${fmtNum(r, 2)}R</b></span>`);
    if (riskPct !== null && riskPct > settings.riskLimit) {
      pills.push(
        `<span class="calc-pill warn">⚠ ${fmtNum(riskPct, 2)}% exceeds your ${settings.riskLimit}% limit</span>`
      );
    }
  }
  box.innerHTML = pills.join("");
}

function submitTrade(e) {
  e.preventDefault();
  const f = readForm();

  if (!f.symbol) return toast("Symbol is required 🏷");
  if (!(f.entry > 0)) return toast("Entry price is required ⚠");
  if (!(f.exit >= 0) || !(f.size > 0)) return toast("Exit and size are required ⚠");
  if (f.stop && f.stop === f.entry) return toast("Stop can't equal entry 🚦");

  const t = {
    id: uid(),
    ...f,
    pnl: Number(tradePnl(f).toFixed(2)),
  };

  trades.unshift(t);
  persist();
  renderAll();
  toast(`Logged ${t.symbol} — ${t.pnl >= 0 ? "+" : ""}${fmtMoney(t.pnl)} ${t.pnl >= 0 ? "✅" : "❌"}`);

  // Keep context, clear volatile fields for the next entry
  $("t-entry").value = "";
  $("t-stop").value = "";
  $("t-exit").value = "";
  $("t-size").value = "";
  $("t-notes").value = "";
  selectedMistakes = new Set();
  renderMistakeChips();
  updateLiveCalc();
}

/* ---------- Journal list ---------- */
function tradePassesFilters(t) {
  const m = $("f-market").value;
  const res = $("f-result").value;
  const sym = $("f-symbol").value.trim().toUpperCase();
  if (m && t.market !== m) return false;
  if (res === "win" && !(t.pnl > 0)) return false;
  if (res === "loss" && !(t.pnl < 0)) return false;
  if (sym && !t.symbol.includes(sym)) return false;
  return true;
}

function renderJournal() {
  const list = $("trade-list");
  list.innerHTML = "";
  const visible = trades.filter(tradePassesFilters);

  for (const t of visible) {
    const li = document.createElement("li");
    li.className = "trade-item";

    const date = document.createElement("span");
    date.className = "trade-date";
    date.textContent = t.date;

    const sym = document.createElement("span");
    sym.className = "trade-sym";
    sym.textContent = t.symbol;
    const chip = document.createElement("span");
    chip.className = "market-chip";
    chip.textContent = t.market;
    sym.appendChild(chip);

    const dir = document.createElement("span");
    dir.className = `dir-badge ${t.direction}`;
    dir.textContent = t.direction === "long" ? "▲" : "▼";

    const pnl = document.createElement("span");
    pnl.className = `trade-pnl ${t.pnl >= 0 ? "pos" : "neg"}`;
    pnl.textContent = `${t.pnl >= 0 ? "+" : ""}${fmtMoney(t.pnl)}`;

    const r = document.createElement("span");
    r.className = "trade-r";
    const rv = tradeR(t);
    r.textContent = rv !== null ? `${rv >= 0 ? "+" : ""}${fmtNum(rv, 2)}R` : "—";

    const emo = document.createElement("span");
    emo.className = "trade-emo";
    emo.textContent = EMOTIONS[t.emotion] || "😐";
    emo.title = t.emotion + ((t.mistakes || []).length ? ` · ${t.mistakes.join(", ")}` : "");

    const del = document.createElement("button");
    del.className = "trade-del";
    del.textContent = "✕";
    del.title = "Delete trade";
    del.setAttribute("aria-label", `Delete trade ${t.symbol}`);
    del.addEventListener("click", () => deleteTrade(t.id));

    li.append(date, sym, dir, pnl, r, emo, del);
    list.appendChild(li);
  }

  $("list-empty").hidden = visible.length > 0;
}

function deleteTrade(id) {
  if (!confirm("Delete this trade from the journal?")) return;
  trades = trades.filter((t) => t.id !== id);
  persist();
  renderAll();
  toast("Trade deleted 🗑");
}

/* ---------- Dashboard ---------- */
function computeStats(list) {
  const total = list.length;
  const wins = list.filter((t) => t.pnl > 0).length;
  const grossProfit = list.reduce((s, t) => s + (t.pnl > 0 ? t.pnl : 0), 0);
  const grossLoss = Math.abs(list.reduce((s, t) => s + (t.pnl < 0 ? t.pnl : 0), 0));
  const net = list.reduce((s, t) => s + t.pnl, 0);
  const rs = list.map(tradeR).filter((r) => r !== null);
  const totalR = rs.reduce((s, r) => s + r, 0);
  return {
    total,
    wins,
    winRate: total ? (wins / total) * 100 : null,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    net,
    totalR: rs.length ? totalR : null,
  };
}

function equityPoints() {
  // trades is newest-first; reverse BEFORE the stable date sort so same-day
  // trades accumulate in the order they were actually taken.
  const sorted = [...trades]
    .reverse()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let cum = 0;
  return sorted.map((t) => {
    cum += t.pnl;
    return { cum, date: t.date, symbol: t.symbol };
  });
}

function drawEquity() {
  const canvas = $("equity-canvas");
  const empty = $("equity-empty");
  const pts = equityPoints();

  if (!pts.length) {
    canvas.hidden = true;
    empty.hidden = false;
    return;
  }
  canvas.hidden = false;
  empty.hidden = true;

  const w = Math.max(300, canvas.parentElement.clientWidth - 36);
  canvas.width = w;
  canvas.height = 220;
  const x = canvas.getContext("2d");

  const padL = 10;
  const padR = 10;
  const padT = 16;
  const padB = 18;
  const values = [0, ...pts.map((p) => p.cum)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const X = (i) => padL + (i / Math.max(1, pts.length - 1)) * (w - padL - padR);
  const Y = (v) => padT + (1 - (v - min) / span) * (220 - padT - padB);

  // Zero line (gold dashed) when the range crosses zero
  if (min < 0 && max > 0) {
    x.beginPath();
    x.setLineDash([5, 5]);
    x.moveTo(padL, Y(0));
    x.lineTo(w - padR, Y(0));
    x.strokeStyle = "rgba(255, 201, 60, 0.5)";
    x.lineWidth = 1.5;
    x.stroke();
    x.setLineDash([]);
  }

  // Area fill
  x.beginPath();
  x.moveTo(X(0), Y(pts[0].cum));
  pts.forEach((p, i) => x.lineTo(X(i), Y(p.cum)));
  x.lineTo(X(pts.length - 1), 220 - padB);
  x.lineTo(X(0), 220 - padB);
  x.closePath();
  x.fillStyle = "rgba(229, 9, 20, 0.10)";
  x.fill();

  // Line
  x.beginPath();
  x.moveTo(X(0), Y(pts[0].cum));
  pts.forEach((p, i) => x.lineTo(X(i), Y(p.cum)));
  x.strokeStyle = "#FF1E3C";
  x.lineWidth = 2.5;
  x.lineJoin = "round";
  x.stroke();

  // Last point
  const last = pts[pts.length - 1];
  x.beginPath();
  x.arc(X(pts.length - 1), Y(last.cum), 5, 0, Math.PI * 2);
  x.fillStyle = "#F5F5F7";
  x.fill();
}

/* ---------- Tiltmeter ---------- */
function tiltScore() {
  const recent = trades.slice(0, 10);
  if (!recent.length) return { score: 0, violations: 0, n: 0 };
  const violations = recent.filter(isTiltTrade).length;
  return { score: violations / recent.length, violations, n: recent.length };
}

function drawTilt() {
  const canvas = $("tilt-canvas");
  const x = canvas.getContext("2d");
  x.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height - 20;
  const r = 100;

  const seg = (a0, a1, color) => {
    x.beginPath();
    x.arc(cx, cy, r, a0, a1);
    x.strokeStyle = color;
    x.lineWidth = 14;
    x.stroke();
  };

  // Segments aligned with the verdict thresholds:
  // disciplined ≤ 10%, watch ≤ 30%, tilting > 30% of the last 10 trades.
  seg(Math.PI, Math.PI * 0.9, "#2DD4A7");        // disciplined zone
  seg(Math.PI * 0.9, Math.PI * 0.7, "#FFC93C");  // watch-out zone
  seg(Math.PI * 0.7, 0, "#E50914");              // tilting zone

  const { score, n } = tiltScore();
  const ang = Math.PI * (1 - Math.min(1, score));
  x.beginPath();
  x.moveTo(cx, cy);
  x.lineTo(cx + Math.cos(ang) * (r - 22), cy + Math.sin(ang) * (r - 22));
  x.strokeStyle = "#F5F5F7";
  x.lineWidth = 3;
  x.stroke();
  x.beginPath();
  x.arc(cx, cy, 5, 0, Math.PI * 2);
  x.fillStyle = "#F5F5F7";
  x.fill();

  const verdictEl = $("tilt-verdict");
  const insightEl = $("tilt-insight");

  if (!n) {
    verdictEl.textContent = "No trades yet";
    verdictEl.style.color = "var(--text-2)";
    insightEl.textContent =
      "The needle watches your last 10 trades: rule breaks (mistake tags or over-risked sizes) push it toward red.";
    return;
  }

  const { violations } = tiltScore();
  if (score <= 0.1) {
    verdictEl.textContent = "Disciplined 🛡";
    verdictEl.style.color = "var(--success)";
    insightEl.textContent = `${violations} rule break${violations === 1 ? "" : "s"} in your last ${n} trades. This is what consistency looks like.`;
  } else if (score <= 0.3) {
    verdictEl.textContent = "Watch out ⚠";
    verdictEl.style.color = "var(--gold)";
    insightEl.textContent = `${violations} of your last ${n} trades broke a rule. Slow down, size down, and re-read your plan before the next entry.`;
  } else {
    verdictEl.textContent = "Tilting 🚨";
    verdictEl.style.color = "#FF4D57";
    insightEl.textContent = `${violations} of your last ${n} trades broke a rule. Consider stopping for today — the market will still be here tomorrow.`;
  }
}

function renderDashboard() {
  const s = computeStats(trades);
  $("d-trades").textContent = s.total;
  $("d-winrate").textContent = s.winRate === null ? "—" : `${fmtNum(s.winRate, 1)}%`;
  $("d-totalr").textContent = s.totalR === null ? "—" : `${s.totalR >= 0 ? "+" : ""}${fmtNum(s.totalR, 1)}R`;
  $("d-pf").textContent =
    s.profitFactor === null ? "—" : s.profitFactor === Infinity ? "∞" : fmtNum(s.profitFactor, 2);
  const netEl = $("d-net");
  netEl.textContent = s.total ? `${s.net >= 0 ? "+" : ""}${fmtMoney(s.net)}` : "—";
  netEl.classList.toggle("negative", s.net < 0);
  drawEquity();
  drawTilt();
}

/* ---------- Risk Gate ---------- */
function updateRiskGate() {
  const out = $("risk-output");
  const balance = settings.balance;
  const riskPct = Number($("r-risk").value);
  const market = $("r-market").value;
  const m = MARKETS[market];
  const entry = Number($("r-entry").value);
  const stop = Number($("r-stop").value);
  const target = Number($("r-target").value) || 0;

  if (!(balance > 0) || !(riskPct > 0) || !(entry > 0) || !(stop > 0) || entry === stop) {
    out.innerHTML = `<p class="risk-hint">Fill entry + stop to forge your position size.</p>`;
    return;
  }

  const riskUsd = (balance * riskPct) / 100;
  const perUnit = Math.abs(entry - stop) * m.contract;
  const size = perUnit > 0 ? riskUsd / perUnit : 0;
  const rr =
    target > 0 ? Math.abs(target - entry) / Math.abs(entry - stop) : null;

  const over = riskPct > settings.riskLimit;

  out.innerHTML = `
    <div class="risk-cards">
      <div class="risk-card gold"><span class="rv">${fmtNum(size, market === "forex" ? 2 : 6)}</span><span class="rl">${m.sizeUnit}</span></div>
      <div class="risk-card"><span class="rv">${fmtMoney(riskUsd)}</span><span class="rl">Risk if stopped (${fmtNum(riskPct, 2)}%)</span></div>
      <div class="risk-card"><span class="rv">${rr !== null ? `1 : ${fmtNum(rr, 2)}` : "—"}</span><span class="rl">Reward : Risk</span></div>
    </div>
    ${over
      ? `<p class="risk-warning">🚨 ${fmtNum(riskPct, 2)}% exceeds your ${settings.riskLimit}% limit. Shrink the risk or update the limit consciously.</p>`
      : `<p class="risk-ok">✅ Within your ${settings.riskLimit}% limit. Plan respected — now execute it.</p>`}
  `;
}

/* ---------- Review ---------- */
function renderReview() {
  const ws = weekStart();
  const weekTrades = trades.filter((t) => {
    const d = new Date(t.date + "T00:00:00");
    return d >= ws;
  });
  const w = computeStats(weekTrades);
  $("w-trades").textContent = w.total;
  $("w-winrate").textContent = w.winRate === null ? "—" : `${fmtNum(w.winRate, 1)}%`;
  $("w-net").textContent = w.total ? `${w.net >= 0 ? "+" : ""}${fmtMoney(w.net)}` : "—";

  // Tilt events (latest 10 violations) — DOM-built so user input is never raw HTML
  const events = trades.filter(isTiltTrade).slice(0, 10);
  const evList = $("tilt-events");
  evList.innerHTML = "";
  for (const t of events) {
    const li = document.createElement("li");
    li.className = "event-item";
    const d = document.createElement("span");
    d.className = "ev-date";
    d.textContent = t.date;
    const sym = document.createElement("b");
    sym.textContent = t.symbol;
    const why = document.createElement("span");
    why.className = "ev-why";
    why.textContent = tiltReason(t);
    li.append(d, sym, why);
    evList.appendChild(li);
  }
  $("tilt-empty").hidden = events.length > 0;

  // Emotion × performance
  const emoStats = {};
  for (const t of trades) {
    const e = t.emotion || "neutral";
    emoStats[e] = emoStats[e] || { net: 0, count: 0 };
    emoStats[e].net += t.pnl;
    emoStats[e].count += 1;
  }
  const emoList = $("emotion-insights");
  emoList.innerHTML = "";
  const emoSorted = Object.entries(emoStats).sort((a, b) => b[1].net - a[1].net);
  for (const [emo, st] of emoSorted) {
    const li = document.createElement("li");
    li.className = "insight-item";
    const valClass = st.net >= 0 ? "pos" : "neg";
    li.innerHTML = `<span>${EMOTIONS[emo] || "😐"} ${emo[0].toUpperCase() + emo.slice(1)} <span style="color:var(--text-2)">(${st.count} trades)</span></span><span class="in-val ${valClass}">${st.net >= 0 ? "+" : ""}${fmtMoney(st.net)}</span>`;
    emoList.appendChild(li);
  }
  emoList.hidden = emoSorted.length === 0;

  // Most frequent mistakes
  const misCount = {};
  for (const t of trades) {
    for (const m of t.mistakes || []) misCount[m] = (misCount[m] || 0) + 1;
  }
  const misList = $("mistake-insights");
  misList.innerHTML = "";
  const misSorted = Object.entries(misCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [name, count] of misSorted) {
    const li = document.createElement("li");
    li.className = "insight-item";
    li.innerHTML = `<span>🏷 ${name}</span><span class="in-val neg">×${count}</span>`;
    misList.appendChild(li);
  }
  misList.hidden = misSorted.length === 0;
  $("mistake-empty").hidden = misSorted.length > 0;
}

/* ---------- Settings & data ownership ---------- */
function openSettings() {
  $("s-balance").value = settings.balance;
  $("s-risklimit").value = settings.riskLimit;
  settingsModal.hidden = false;
}

function closeSettings() {
  settingsModal.hidden = true;
}

function saveSettings() {
  settings.balance = Math.max(0, Number($("s-balance").value) || DEFAULT_SETTINGS.balance);
  settings.riskLimit = Math.max(0, Number($("s-risklimit").value) || DEFAULT_SETTINGS.riskLimit);
  persist();
  closeSettings();
  renderAll();
  updateLiveCalc();
  toast("Settings saved ⚙️");
}

function download(filename, text, type) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportJSON() {
  const payload = { app: "TradeForge", exportedAt: new Date().toISOString(), settings, trades };
  download(`tradeforge-backup-${todayStr()}.json`, JSON.stringify(payload, null, 2), "application/json");
  toast("Backup exported — your data, your file 📁");
}

function exportCSV() {
  const head = "date,market,symbol,direction,entry,stop,target,exit,size,contract,pnl,r,emotion,mistakes,notes";
  const rows = [...trades]
    .reverse()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) =>
      [
        t.date, t.market, t.symbol, t.direction, t.entry, t.stop || "", t.target || "",
        t.exit, t.size, t.contract, t.pnl, tradeR(t) === null ? "" : Number(tradeR(t).toFixed(3)),
        t.emotion, (t.mistakes || []).join("|"), (t.notes || "").replace(/[\r\n,]/g, " "),
      ].join(",")
    );
  download(`tradeforge-trades-${todayStr()}.csv`, [head, ...rows].join("\n"), "text/csv");
  toast("CSV exported 📤");
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const incoming = Array.isArray(data) ? data : data.trades;
      if (!Array.isArray(incoming)) throw new Error("bad format");
      const clean = incoming.filter(
        (t) => t && t.symbol && Number.isFinite(Number(t.entry)) && Number.isFinite(Number(t.exit))
      );
      if (!clean.length) throw new Error("no valid trades");
      if (!confirm(`Replace current journal with ${clean.length} imported trades?`)) return;
      trades = clean;
      if (data.settings && typeof data.settings === "object") {
        settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
      }
      persist();
      renderAll();
      toast(`Restored ${clean.length} trades ✓`);
    } catch {
      toast("Invalid backup file ⚠️");
    }
  };
  reader.readAsText(file);
}

/* ---------- Share card (viral loop) ---------- */
function shareWeekly() {
  const ws = weekStart();
  const weekTrades = trades.filter((t) => new Date(t.date + "T00:00:00") >= ws);
  const w = computeStats(weekTrades);

  const wd = 900;
  const ht = 500;
  const c = document.createElement("canvas");
  c.width = wd;
  c.height = ht;
  const x = c.getContext("2d");
  const font = (weight, size) => `${weight} ${size}px 'Segoe UI', system-ui, sans-serif`;

  x.fillStyle = "#0A0A0C";
  x.fillRect(0, 0, wd, ht);
  const vignette = x.createRadialGradient(wd / 2, ht / 2, 80, wd / 2, ht / 2, 540);
  vignette.addColorStop(0, "rgba(229, 9, 20, 0.12)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0)");
  x.fillStyle = vignette;
  x.fillRect(0, 0, wd, ht);

  const frame = x.createLinearGradient(0, 0, wd, ht);
  frame.addColorStop(0, "#FFD75E");
  frame.addColorStop(1, "#C9962C");
  x.strokeStyle = frame;
  x.lineWidth = 4;
  x.strokeRect(24, 24, wd - 48, ht - 48);

  x.textAlign = "left";
  x.font = font(700, 44);
  x.fillStyle = "#F5F5F7";
  x.fillText("⚡ Trade", 56, 96);
  x.fillStyle = "#E50914";
  x.fillText("Forge", 56 + x.measureText("⚡ Trade").width, 96);

  x.fillStyle = "#9A9AA8";
  x.font = font(700, 16);
  x.fillText("W E E K L Y   D I S C I P L I N E   R E P O R T", 56, 132);

  const items = [
    { v: w.total, label: "TRADES THIS WEEK", gold: false },
    { v: w.winRate === null ? "—" : `${fmtNum(w.winRate, 0)}%`, label: "WIN RATE", gold: false },
    { v: w.total ? `${w.net >= 0 ? "+" : ""}${fmtMoney(w.net)}` : "—", label: "NET P&L", gold: true },
  ];
  const bw = (wd - 112) / 3;
  items.forEach((it, i) => {
    const cx = 56 + i * bw;
    if (it.gold) {
      const g = x.createLinearGradient(cx, 210, cx + 200, 210);
      g.addColorStop(0, "#FFD75E");
      g.addColorStop(1, "#C9962C");
      x.fillStyle = g;
    } else {
      x.fillStyle = "#F5F5F7";
    }
    x.font = font(800, it.v && String(it.v).length > 8 ? 54 : 76);
    x.fillText(String(it.v), cx, 300);
    x.fillStyle = "#9A9AA8";
    x.font = font(700, 15);
    x.fillText(it.label, cx, 340);
  });

  x.fillStyle = "#9A9AA8";
  x.font = font(600, 16);
  x.fillText("arj-codex.github.io/tradeforge", 56, ht - 70);
  const ember = x.createLinearGradient(0, ht - 52, 330, ht - 52);
  ember.addColorStop(0, "#FF1E3C");
  ember.addColorStop(1, "#FFC93C");
  x.fillStyle = ember;
  x.font = font(700, 16);
  x.fillText("Forged with ⚡ by ARJ-CODEX", 56, ht - 44);

  const a = document.createElement("a");
  a.download = "tradeforge-week.png";
  a.href = c.toDataURL("image/png");
  a.click();
}

/* ---------- Events ---------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

$("t-market").addEventListener("change", () => {
  $("t-contract").dataset.touched = "";
  updateMarketDefaults();
  updateLiveCalc();
});

$("t-contract").addEventListener("input", (e) => {
  e.target.dataset.touched = "1";
  updateLiveCalc();
});

document.querySelectorAll("#t-direction .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentDir = btn.dataset.dir;
    document.querySelectorAll("#t-direction .seg-btn").forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.classList.toggle(b.dataset.dir, b === btn && currentDir === b.dataset.dir);
    });
  });
});

["t-symbol", "t-entry", "t-stop", "t-exit", "t-size", "t-contract"].forEach((id) => {
  $(id).addEventListener("input", updateLiveCalc);
});

$("trade-form").addEventListener("submit", submitTrade);

["f-market", "f-result"].forEach((id) => $(id).addEventListener("change", renderJournal));
$("f-symbol").addEventListener("input", renderJournal);

["r-risk", "r-entry", "r-stop", "r-target"].forEach((id) => {
  $(id).addEventListener("input", updateRiskGate);
});
$("r-market").addEventListener("change", updateRiskGate);

$("share-btn").addEventListener("click", shareWeekly);
$("settings-btn").addEventListener("click", openSettings);
$("settings-close").addEventListener("click", closeSettings);
$("settings-cancel").addEventListener("click", closeSettings);
$("settings-save").addEventListener("click", saveSettings);
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettings();
});

$("export-json").addEventListener("click", exportJSON);
$("import-json").addEventListener("click", () => {
  importMode = "json";
  $("import-file").click();
});
$("export-csv").addEventListener("click", exportCSV);
$("import-file").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) importFile(file);
  e.target.value = "";
});

document.addEventListener("keydown", (e) => {
  if (!settingsModal.hidden) {
    if (e.key === "Escape") closeSettings();
    return;
  }
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
  const k = e.key.toLowerCase();
  if (k === "1") switchView("dashboard");
  else if (k === "2") switchView("journal");
  else if (k === "3") switchView("risk");
  else if (k === "4") switchView("review");
});

window.addEventListener("resize", () => {
  if ($("view-dashboard").classList.contains("active")) drawEquity();
});

/* ---------- Boot ---------- */
function renderAll() {
  renderDashboard();
  renderJournal();
  renderReview();
}

function init() {
  loadState();
  $("t-date").value = todayStr();
  $("t-market").value = "crypto";
  updateMarketDefaults();
  renderMistakeChips();
  $("r-risk").value = settings.riskLimit;
  updateLiveCalc();
  updateRiskGate();
  renderAll();
}

init();
