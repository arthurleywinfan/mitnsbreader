const $ = (s) => document.querySelector(s);
const PAGE_SIZE = 40;

let DB = { rounds: [], questions: [] };
let results = [];
let shown = 0;

// ---------- helpers ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function roundName(r) { return `${r.year} · ${r.label}`; }

function highlight(text, tokens) {
  let html = esc(text);
  if (!tokens.length) return html;
  const re = new RegExp("(" + tokens.map(reEsc).sort((a, b) => b.length - a.length).join("|") + ")", "gi");
  // only touch text outside tags
  return html.replace(/(^|>)([^<]*)/g, (m, a, b) => a + b.replace(re, "<mark>$1</mark>"));
}

function cardHTML(q, { tokens = [], hide = false, withRound = true, actions = true } = {}) {
  const r = DB.rounds[q.r];
  return `<div class="card" data-i="${q.i}">
    <div class="meta">${withRound ? `<span class="tag">${esc(roundName(r))}</span>` : ""}
      <span>${q.part} ${q.num}</span><span>·</span><span>${esc(q.cat)}</span><span>·</span><span>${q.fmt === "MC" ? "Multiple choice" : "Short answer"}</span></div>
    <div class="qtext">${highlight(q.q, tokens)}</div>
    <div class="ans${hide ? " covered" : ""}">ANSWER: ${highlight(q.a, tokens)}</div>
    ${actions ? `<div class="actions">
      <button class="pill" data-act="round" data-i="${q.i}">See whole round</button>
      <button class="pill ghost" data-act="pdf" data-i="${q.i}">Open PDF</button>
    </div>` : ""}
  </div>`;
}

// ---------- filters ----------
function fillSelect(sel, first, values) {
  const cur = sel.value;
  sel.innerHTML = `<option value="">${first}</option>` + values.map((v) => `<option value="${esc(String(v))}">${esc(String(v))}</option>`).join("");
  if (values.map(String).includes(cur)) sel.value = cur;
}
const CATS = () => [...new Set(DB.questions.map((q) => q.cat))].sort();
const YEARS = () => [...new Set(DB.rounds.map((r) => r.year))].sort((a, b) => b - a);

function fillRoundSelect() {
  const y = $("#f-year").value;
  const labels = [...new Set(DB.rounds.filter((r) => !y || r.year == y).map((r) => r.label))];
  const order = (l) => (l.startsWith("Round") ? 0 : l.startsWith("Wildcard") ? 1 : 2) * 100 + parseInt(l.match(/\d+/));
  labels.sort((a, b) => order(a) - order(b));
  fillSelect($("#f-round"), "All rounds", labels);
}

// ---------- search ----------
function search() {
  const raw = $("#q").value;
  const tokens = norm(raw).split(" ").filter(Boolean);
  const phrase = norm(raw);
  const cat = $("#f-cat").value, year = $("#f-year").value, rlabel = $("#f-round").value, part = $("#f-part").value;
  const out = [];
  for (const q of DB.questions) {
    const r = DB.rounds[q.r];
    if (cat && q.cat !== cat) continue;
    if (year && r.year != year) continue;
    if (rlabel && r.label !== rlabel) continue;
    if (part && q.part !== part) continue;
    let score = 0;
    if (tokens.length) {
      let ok = true;
      for (const t of tokens) {
        if (!q.hay.includes(t)) { ok = false; break; }
        if (q.hayW.includes(" " + t + " ")) score += 2; else score += 1;
      }
      if (!ok) continue;
      if (tokens.length > 1 && q.hay.includes(phrase)) score += 10;
    }
    out.push({ q, score });
  }
  out.sort((a, b) => b.score - a.score || a.q.i - b.q.i);
  results = out.map((x) => x.q);
  shown = 0;
  const anyFilter = tokens.length || cat || year || rlabel || part;
  $("#count").textContent = anyFilter
    ? `${results.length.toLocaleString()} question${results.length === 1 ? "" : "s"}`
    : `${DB.questions.length.toLocaleString()} questions from ${DB.rounds.length} rounds. Type a few words to search.`;
  $("#results").innerHTML = "";
  if (!anyFilter) return;
  if (!results.length) { $("#results").innerHTML = `<div class="empty">No matches. Try fewer or shorter words.</div>`; return; }
  showMore();
}

function showMore() {
  const tokens = norm($("#q").value).split(" ").filter(Boolean);
  const hide = $("#f-hide").checked;
  const slice = results.slice(shown, shown + PAGE_SIZE);
  shown += slice.length;
  $("#results .more")?.remove();
  $("#results").insertAdjacentHTML("beforeend", slice.map((q) => cardHTML(q, { tokens, hide })).join("") +
    (shown < results.length ? `<button class="pill ghost more">Show more (${results.length - shown} left)</button>` : ""));
}

// ---------- round view ----------
function openRound(ri, hitIndex) {
  const r = DB.rounds[ri];
  $("#rv-title").textContent = roundName(r);
  $("#rv-pdf").onclick = () => openPdf(r.key, roundName(r), hitIndex != null ? DB.questions[hitIndex].page : 1);
  const qs = DB.questions.filter((q) => q.r === ri);
  const tokens = norm($("#q").value).split(" ").filter(Boolean);
  let top = `<div class="actions" style="margin-top:12px">
    <button class="pill" data-act="pdfkey" data-key="${r.key}" data-title="${esc(roundName(r))}">Open original PDF</button>
    ${r.visual ? `<button class="pill ghost" data-act="pdfkey" data-key="${r.visual}" data-title="${esc(roundName(r))} visuals">Visual bonuses</button>` : ""}
  </div>`;
  $("#rv-body").innerHTML = top + qs.map((q) => cardHTML(q, { tokens: q.i === hitIndex ? tokens : [], withRound: false, actions: false })).join("");
  show("roundview");
  const body = $("#rv-body");
  body.scrollTop = 0;
  if (hitIndex != null) {
    const el = body.querySelector(`[data-i="${hitIndex}"]`);
    if (el) { el.classList.add("hit"); requestAnimationFrame(() => (body.scrollTop = el.offsetTop - 70)); }
  }
}

// ---------- pdf view ----------
let pdfjs = null;
let pdfToken = 0;
async function openPdf(key, title, page = 1) {
  $("#pv-title").textContent = title;
  $("#pv-page").textContent = "";
  const body = $("#pv-body");
  body.innerHTML = `<div class="empty" style="color:#ddd">Loading…</div>`;
  show("pdfview");
  const token = ++pdfToken;
  try {
    if (!pdfjs) {
      pdfjs = await import("./vendor/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";
    }
    const doc = await pdfjs.getDocument({ url: `pdf/${key}.pdf`, isEvalSupported: false }).promise;
    if (token !== pdfToken) return;
    body.innerHTML = "";
    const width = body.clientWidth - 8;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const base = p.getViewport({ scale: 1 });
      const scale = width / base.width;
      const c = document.createElement("canvas");
      c.className = "pdf-page";
      c.style.width = width + "px";
      c.style.height = base.height * scale + "px";
      c.dataset.n = n;
      body.appendChild(c);
      pages.push({ p, c, vp: p.getViewport({ scale: scale * dpr }), done: false });
    }
    $("#pv-page").textContent = `${doc.numPages} pages`;
    const target = Math.min(Math.max(page, 1), doc.numPages);
    body.scrollTop = pages[target - 1].c.offsetTop - 8;
    const render = async (pg) => {
      if (pg.done) return; pg.done = true;
      pg.c.width = pg.vp.width; pg.c.height = pg.vp.height;
      await pg.p.render({ canvasContext: pg.c.getContext("2d"), viewport: pg.vp }).promise;
    };
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) render(pages[e.target.dataset.n - 1]);
    }, { root: body, rootMargin: "800px 0px" });
    pages.forEach((pg) => io.observe(pg.c));
  } catch (e) {
    if (token === pdfToken) body.innerHTML = `<div class="empty" style="color:#ddd">Couldn't open this PDF. ${esc(String(e.message || e))}</div>`;
  }
}

// ---------- sheets / navigation ----------
function show(id) {
  if ($("#" + id).classList.contains("hidden")) {
    $("#" + id).classList.remove("hidden");
    history.pushState({ sheet: id }, "");
  }
}
function closeTop() {
  for (const id of ["pdfview", "roundview"]) {
    if (!$("#" + id).classList.contains("hidden")) {
      $("#" + id).classList.add("hidden");
      if (id === "pdfview") { pdfToken++; $("#pv-body").innerHTML = ""; }
      return true;
    }
  }
  return false;
}
window.addEventListener("popstate", () => closeTop());

// ---------- practice ----------
let pq = null;
let score = store.get("score", { right: 0, miss: 0 });
function renderScore() { $("#s-right").textContent = score.right; $("#s-miss").textContent = score.miss; }
function nextPractice() {
  const cat = $("#p-cat").value, year = $("#p-year").value, part = $("#p-part").value;
  const pool = DB.questions.filter((q) => (!cat || q.cat === cat) && (!year || DB.rounds[q.r].year == year) && (!part || q.part === part));
  if (!pool.length) { $("#pcard").innerHTML = `<div class="empty">No questions for these filters.</div>`; return; }
  pq = pool[Math.floor(Math.random() * pool.length)];
  $("#pcard").innerHTML = cardHTML(pq, { hide: true, actions: false }) +
    `<div class="pbtns" id="pb"><button class="pill" style="grid-column:1/3" data-act="reveal">Show answer</button></div>`;
}
function revealPractice() {
  $("#pcard .ans").classList.remove("covered");
  $("#pb").innerHTML = `<button class="pill good" data-act="right">I got it</button><button class="pill bad" data-act="miss">Missed it</button>
    <button class="pill ghost" data-act="round" data-i="${pq.i}">See whole round</button><button class="pill ghost" data-act="skip">Skip</button>`;
}

// ---------- rounds tab ----------
function renderRounds() {
  $("#roundlist").innerHTML = YEARS().map((y) => `<div class="year"><h3>${y}</h3><div class="rgrid">` +
    DB.rounds.map((r, i) => [r, i]).filter(([r]) => r.year === y)
      .map(([r, i]) => `<button class="rbtn" data-act="openround" data-r="${i}">${esc(r.label)}</button>`).join("") +
    `</div></div>`).join("");
}

// ---------- offline download ----------
async function setupOffline() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    const cache = await caches.open("nsb-pdf-v1");
    const files = [...DB.rounds.map((r) => r.key), ...DB.rounds.filter((r) => r.visual).map((r) => r.visual)].map((k) => `pdf/${k}.pdf`);
    const missing = [];
    for (const f of files) if (!(await cache.match(f))) missing.push(f);
    if (!missing.length) return;
    $("#offline").classList.remove("hidden");
    let done = files.length - missing.length;
    const tick = () => { $("#offline-n").textContent = `${done}/${files.length}`; $("#offline-bar").style.width = (100 * done / files.length) + "%"; };
    tick();
    const queue = missing.slice();
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift();
        try { await cache.add(f); } catch {}
        done++; tick();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    $("#offline .offline-text").textContent = "Ready to use offline.";
    $("#offline-bar").style.width = "100%";
    setTimeout(() => $("#offline").classList.add("hidden"), 2500);
  } catch (e) { console.warn("offline setup failed", e); }
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act], [data-close], .tab, .more, .ans.covered");
  if (!b) return;
  if (b.matches(".ans.covered")) { b.classList.remove("covered"); return; }
  if (b.matches(".more")) return showMore();
  if (b.matches(".tab")) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === b));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hidden", p.id !== b.dataset.tab));
    if (b.dataset.tab === "practice" && !pq) nextPractice();
    window.scrollTo(0, 0);
    return;
  }
  if (b.dataset.close) return history.back();
  const i = +b.dataset.i;
  switch (b.dataset.act) {
    case "round": return openRound(DB.questions[i].r, i);
    case "pdf": { const q = DB.questions[i]; return openPdf(DB.rounds[q.r].key, roundName(DB.rounds[q.r]), q.page); }
    case "pdfkey": return openPdf(b.dataset.key, b.dataset.title, 1);
    case "openround": return openRound(+b.dataset.r);
    case "reveal": return revealPractice();
    case "right": score.right++; store.set("score", score); renderScore(); return nextPractice();
    case "miss": score.miss++; store.set("score", score); renderScore(); return nextPractice();
    case "skip": return nextPractice();
  }
});
$("#s-reset").onclick = () => { score = { right: 0, miss: 0 }; store.set("score", score); renderScore(); };

let timer;
$("#q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 120); });
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });
["#f-cat", "#f-round", "#f-part", "#f-hide"].forEach((s) => $(s).addEventListener("change", search));
$("#f-year").addEventListener("change", () => { fillRoundSelect(); search(); });
["#p-cat", "#p-year", "#p-part"].forEach((s) => $(s).addEventListener("change", nextPractice));

// ---------- start ----------
(async function init() {
  DB = await (await fetch("data/questions.json")).json();
  DB.questions.forEach((q, i) => {
    q.i = i;
    q.hay = norm(q.q + " " + q.a);
    q.hayW = " " + q.hay + " ";
  });
  fillSelect($("#f-cat"), "All categories", CATS());
  fillSelect($("#f-year"), "All years", YEARS());
  fillSelect($("#p-cat"), "All categories", CATS());
  fillSelect($("#p-year"), "All years", YEARS());
  fillRoundSelect();
  renderRounds();
  renderScore();
  search();
  setupOffline();
})();
