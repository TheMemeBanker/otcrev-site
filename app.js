/* OTC REV — the revenue desk. No backend, no signing. Figures come from ./data/live.json,
   a scheduled snapshot of the public otcdesks.cash revenue feed (the feed sends no CORS
   header, so the browser cannot read it directly). SOL price is fetched live for USD. */

const $ = (id) => document.getElementById(id);
const OTC_MINT = "MukLDtJ8Cx9DxLbeyLRSWPSposTMWuwHANbuaudpump";
const REV_MINT = ""; // set on the operator's explicit link, after on-chain verification

let D = null, solUsd = null, series = "earned", range = 30;

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtSol = (n) => n >= 1000 ? nf0.format(Math.round(n)) : n >= 100 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(4);
const fmtInt = (n) => nf0.format(Math.round(n));
const fmtUsd = (n) => "$" + (n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1000 ? nf0.format(Math.round(n)) : n.toFixed(2));
const fmtPx = (n) => "$" + (n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6));
const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(1) + "%" : "—";
const ago = (ts) => { const s = Math.max(0, Math.floor(Date.now() / 1000 - ts)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
const utc = (ts) => new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dayLabel = (d) => { const [y, m, dd] = d.split("-"); return new Date(Date.UTC(+y, +m - 1, +dd)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); };

async function solPrice() {
  try {
    const res = await fetch("https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112", { signal: AbortSignal.timeout(8000) });
    const pairs = (await res.json()).filter((p) => (p.volume?.h24 ?? 0) >= 100 && p.quoteToken?.symbol === "USDC");
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    return pairs.length ? Number(pairs[0].priceUsd) : null;
  } catch { return null; }
}

/* ---------- the card ---------- */
function renderCard() {
  const s = D.sol, b = D.buyback, k = D.desks, o = D.otc;
  $("bigN").textContent = fmtInt(s.earned);
  $("bigUsd").textContent = solUsd ? `${fmtUsd(s.earned * solUsd)} at today's SOL price.` : "";
  $("tHold").textContent = fmtInt(s.distributed);
  $("tHoldPct").textContent = pct(s.distributed, s.earned);
  $("tProto").textContent = fmtInt(s.toProtocol);
  $("tBuy").textContent = fmtInt(s.toBuyback);
  $("tBuySpent").textContent = fmtInt(b.spent);
  $("tPot").textContent = fmtInt(s.toPot);
  $("tBurned").textContent = fmtInt(b.burned);
  $("tBurns").textContent = fmtInt(b.burns);
  $("tDeskBurn").textContent = fmtInt(k.burned);
  $("tDesks").textContent = fmtInt(k.count);
  $("tMcap").textContent = o.marketCap ? fmtUsd(o.marketCap) : "—";
  $("tPrice").textContent = o.usdPrice ? fmtPx(o.usdPrice) : "—";
  const c = o.change24h;
  const chg = $("otcChg");
  if (typeof c === "number") { chg.textContent = `OTC ${c >= 0 ? "+" : ""}${c.toFixed(1)}% today`; chg.classList.toggle("is-up", c >= 0); chg.classList.toggle("is-down", c < 0); }
  else chg.textContent = "";
  $("stAgo").textContent = ago(D.at); $("stAgo").title = utc(D.at);
  $("led").classList.toggle("is-stale", Date.now() / 1000 - D.at > 3600);
  $("footSync").textContent = utc(D.at);
}

/* ---------- split ---------- */
function renderSplit() {
  const s = D.sol, tot = s.earned || 1;
  const parts = [
    { k: "Holders", v: s.distributed, c: 1, note: "reward stock, paid out pro-rata" },
    { k: "Desk pot", v: s.toPot, c: 2, note: "held against coins still owed" },
    { k: "Buyback", v: s.toBuyback, c: 3, note: "buys OTC on the open market and burns it" },
    { k: "Protocol", v: s.toProtocol, c: 4, note: "operating the desks" },
  ];
  $("splitBar").innerHTML = parts.map((p) => `<div class="rv-seg rv-seg-${p.c}" style="flex:${Math.max(p.v, 0)}" title="${p.k} ${pct(p.v, tot)}"><span>${p.k} ${pct(p.v, tot)}</span></div>`).join("");
  $("splitLegend").innerHTML = parts.map((p) => `<li><span class="rv-sw rv-seg-${p.c}"></span>${p.k} <b>${fmtSol(p.v)} SOL</b> · ${pct(p.v, tot)} — ${p.note}</li>`).join("");
  const unalloc = s.earned - (s.distributed + s.toPot + s.toBuyback + s.toProtocol);
  $("splitFine").innerHTML = `${fmtSol(s.earned)} SOL claimed all time. Claim costs so far: ${fmtSol(s.costs)} SOL${Math.abs(unalloc) > 1 ? ` · ${fmtSol(Math.abs(unalloc))} SOL ${unalloc > 0 ? "claimed and not yet split" : "over-allocated vs claims"}` : ""}. The exact split rule is in the <a href="https://otcdesks.cash/docs" target="_blank" rel="noopener">docs</a>; these shares are what the ledger shows.`;
}

/* ---------- chart ---------- */
const SERIES = { earned: ["Claimed", "SOL claimed in creator fees"], toHolders: ["To holders", "SOL sent on to holders"], spent: ["Buyback spent", "SOL deployed buying OTC"] };
function chartData() { const all = D.daily.slice(); return range ? all.slice(-range) : all; }
function renderChart() {
  const rows = chartData(), host = $("chart"), W = host.clientWidth || 800, H = 230, pl = 46, pr = 10, pt = 14, pb = 28;
  const vals = rows.map((r) => r[series] || 0), max = Math.max(...vals, 1), sum = vals.reduce((a, b) => a + b, 0);
  $("chTitle").textContent = `${SERIES[series][1]} · ${rows.length} day${rows.length === 1 ? "" : "s"}`;
  $("chSum").textContent = `${fmtSol(sum)} SOL · avg ${fmtSol(sum / Math.max(rows.length, 1))}/day`;
  const x = (i) => pl + (i + 0.5) * (W - pl - pr) / rows.length, y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const bw = Math.max(2, (W - pl - pr) / rows.length * 0.68);
  const ticks = [0, 0.5, 1].map((f) => f * max);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(SERIES[series][1])} by day">`;
  for (const t of ticks) svg += `<line class="rv-grid" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="rv-axis" x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${fmtSol(t)}</text>`;
  rows.forEach((r, i) => { svg += `<rect class="rv-bar" data-i="${i}" x="${x(i) - bw / 2}" y="${y(vals[i])}" width="${bw}" height="${Math.max(0, H - pb - y(vals[i]))}" rx="2"/>`; });
  const step = Math.ceil(rows.length / 6);
  rows.forEach((r, i) => { const last = i === rows.length - 1, onStep = i % step === 0; if (onStep || (last && (i % step) >= step / 2)) svg += `<text class="rv-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${dayLabel(r.day)}</text>`; });
  svg += `<line id="cross" class="rv-cross" x1="0" x2="0" y1="${pt}" y2="${H - pb}" style="display:none"/></svg>`;
  host.innerHTML = svg;
  const tip = $("tip"), cross = host.querySelector("#cross"), bars = [...host.querySelectorAll(".rv-bar")];
  const show = (i, cx) => {
    const r = rows[i]; if (!r) return;
    bars.forEach((b, j) => b.classList.toggle("is-dim", j !== i));
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.style.display = "";
    tip.innerHTML = `<span>${esc(dayLabel(r.day))} · ${esc(r.day)}</span><span>claimed <b>${fmtSol(r.earned)} SOL</b></span><span>to holders <b>${fmtSol(r.toHolders)}</b></span><span>pot <b>${fmtSol(r.toPot)}</b> · buyback <b>${fmtSol(r.toBuyback)}</b></span><span>protocol <b>${fmtSol(r.toProtocol)}</b></span><span>bought <b>${fmtInt(r.bought)} OTC</b> for <b>${fmtSol(r.spent)} SOL</b></span>`;
    tip.hidden = false; tip.style.left = Math.min(Math.max(cx - 86, 0), W - 172) + "px";
  };
  const hide = () => { tip.hidden = true; cross.style.display = "none"; bars.forEach((b) => b.classList.remove("is-dim")); };
  const pick = (ev) => { const rect = host.getBoundingClientRect(); const px = (ev.clientX - rect.left) * (W / rect.width); const i = Math.round((px - pl) / ((W - pl - pr) / rows.length) - 0.5); if (i >= 0 && i < rows.length) show(i, px); else hide(); };
  host.onpointermove = pick; host.onpointerleave = hide;
  $("chTable").innerHTML = `<thead><tr><th>Day</th><th class="num">Claimed</th><th class="num">To holders</th><th class="num">Pot</th><th class="num">Buyback</th><th class="num">Protocol</th><th class="num">Spent</th><th class="num">OTC burned</th></tr></thead><tbody>` +
    rows.slice().reverse().map((r) => `<tr><td>${esc(r.day)}</td><td class="num">${fmtSol(r.earned)}</td><td class="num">${fmtSol(r.toHolders)}</td><td class="num">${fmtSol(r.toPot)}</td><td class="num">${fmtSol(r.toBuyback)}</td><td class="num">${fmtSol(r.toProtocol)}</td><td class="num">${fmtSol(r.spent)}</td><td class="num">${fmtInt(r.burned)}</td></tr>`).join("") + "</tbody>";
}

/* ---------- ledger + supply ---------- */
function renderLedger() {
  const rows = D.recent.slice().sort((a, b) => b.at - a.at);
  const buys = rows.filter((r) => r.kind === "buy").length, burns = rows.length - buys;
  $("tapeCount").textContent = `${buys} buys · ${burns} burns`;
  $("tape").innerHTML = rows.map((r) => `<li><span class="rv-kind rv-kind-${r.kind === "buy" ? "buy" : "burn"}">${esc(r.kind)}</span><span class="rv-tape-when" title="${utc(r.at)}">${ago(r.at)}</span><span class="rv-tape-what">${r.kind === "buy" ? `bought <b>${fmtInt(r.otc)} OTC</b>` : `burned <b>${fmtInt(r.otc)} OTC</b>`}</span><span class="rv-tape-amt">${r.kind === "buy" ? fmtSol(r.sol) + " SOL" : ""}</span><a class="rv-tape-tx" href="https://solscan.io/tx/${esc(r.sig)}" target="_blank" rel="noopener">${esc((r.sig || "").slice(0, 6))}…</a></li>`).join("") || `<li><span class="rv-tape-what">Nothing yet.</span></li>`;
  const b = D.buyback, k = D.desks, tot = b.burned + k.burned, w = (v) => (tot ? (v / tot * 100) : 0).toFixed(1);
  const usd = D.otc.usdPrice ? ` · ${fmtUsd(tot * D.otc.usdPrice)} at today's price` : "";
  $("stack").innerHTML = `
    <div class="rv-stack-row"><span>By buybacks</span><div class="rv-stack-bar"><i style="width:${w(b.burned)}%"></i></div><span class="rv-stack-n">${fmtInt(b.burned)} OTC</span></div>
    <div class="rv-stack-row"><span>By desk deposits</span><div class="rv-stack-bar"><i class="is-desk" style="width:${w(k.burned)}%"></i></div><span class="rv-stack-n">${fmtInt(k.burned)} OTC</span></div>
    <div class="rv-stack-total"><span>Total destroyed${usd}</span><b>${fmtInt(tot)} OTC</b></div>`;
}

/* ---------- engine + volume ---------- */
function renderEngine() {
  const b = D.buyback, v = D.volume;
  const kv = (l, val, small) => `<li><span class="rv-lab">${l}</span><span class="rv-val">${val}${small ? ` <small>${small}</small>` : ""}</span></li>`;
  $("engineKv").innerHTML = kv("SOL deployed", fmtSol(b.spent), "SOL") + kv("OTC bought", fmtInt(b.bought), "OTC") + kv("Swaps", fmtInt(b.buys), `${fmtInt(b.burns)} burns`) + kv("Still held, unburned", fmtInt(b.holding), "OTC") + kv("Running since", b.firstAt ? utc(b.firstAt).slice(0, 10) : "—", b.firstAt ? ago(b.firstAt).replace(" ago", "") : "") + kv("Avg buy", b.buys ? fmtSol(b.spent / b.buys) : "—", "SOL");
  $("volume").innerHTML = kv("24 hours", fmtUsd(v.d1 || 0)) + kv("7 days", fmtUsd(v.d7 || 0)) + kv("All time", fmtUsd(v.all || 0)) + kv("Fees ÷ volume", v.all && solUsd ? (D.sol.earned * solUsd / v.all * 100).toFixed(2) + "%" : "—", "all-time take");
}

/* ---------- $REV ---------- */
function renderRev() {
  if (!REV_MINT) return;
  const url = `https://pump.fun/coin/${REV_MINT}`;
  for (const id of ["revBuy", "revBuy2"]) { const a = $(id); a.href = url; a.hidden = false; }
  const link = $("revTokenLink"); link.href = url; link.target = "_blank"; link.rel = "noopener"; link.removeAttribute("aria-disabled"); link.title = "$REV on pump.fun";
  $("revCa").innerHTML = `<a href="https://solscan.io/token/${REV_MINT}" target="_blank" rel="noopener">${REV_MINT}</a>`;
}

/* ---------- chrome ---------- */
function wireChrome() {
  $("themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", cur);
    try { localStorage.setItem("rev-theme", cur); } catch {}
  });
  const side = $("sidebar"), scrim = $("sideScrim"), tog = $("sideToggle");
  const open = (on) => { side.classList.toggle("open", on); scrim.hidden = !on; tog.setAttribute("aria-label", on ? "Close menu" : "Open menu"); };
  tog.addEventListener("click", () => open(!side.classList.contains("open")));
  scrim.addEventListener("click", () => open(false));
  side.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => open(false)));
  document.querySelectorAll(".rv-chip[data-series]").forEach((b) => b.addEventListener("click", () => { series = b.dataset.series; document.querySelectorAll(".rv-chip[data-series]").forEach((x) => x.classList.toggle("is-on", x === b)); renderChart(); }));
  document.querySelectorAll(".rv-chip[data-range]").forEach((b) => b.addEventListener("click", () => { range = Number(b.dataset.range); document.querySelectorAll(".rv-chip[data-range]").forEach((x) => x.classList.toggle("is-on", x === b)); renderChart(); }));
  let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => D && renderChart(), 120); });
}

async function main() {
  wireChrome();
  const [snap, px] = await Promise.all([fetch("./data/live.json?t=" + Math.floor(Date.now() / 60000)).then((r) => r.json()), solPrice()]);
  D = snap; solUsd = px;
  renderCard(); renderSplit(); renderChart(); renderLedger(); renderEngine(); renderRev();
  setInterval(() => { $("stAgo").textContent = ago(D.at); }, 30000);
}
main().catch((e) => { console.error(e); $("stAgo").textContent = "failed"; $("led").classList.add("is-stale"); });
