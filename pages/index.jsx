import { useState, useRef } from "react";

// ─── Helpers ───
const num = (v) => { const n = parseFloat(String(v).replace(/[,$]/g, "")); return isNaN(n) ? 0 : n; };
const fmt = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt2 = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const API = "/api/anthropic";

const COLORS = [
  { bg: "#1B3A2D", fg: "#EDF5F0", accent: "#C9A84C", grad: "linear-gradient(135deg, #1B3A2D, #2D5A45)" },
  { bg: "#7B3614", fg: "#FFF8F0", accent: "#E8944A", grad: "linear-gradient(135deg, #7B3614, #B85420)" },
  { bg: "#1A3652", fg: "#EEF4FA", accent: "#5B9BD5", grad: "linear-gradient(135deg, #1A3652, #2A5A8C)" },
  { bg: "#4A1D80", fg: "#F5F0FF", accent: "#A678E0", grad: "linear-gradient(135deg, #4A1D80, #6B38B0)" },
];

const EMPTY_QUOTE = () => ({
  lenderName: "", loanOfficer: "", loanProgram: "Conventional",
  loanAmount: "", rate: "", term: 30, purchasePrice: "", cashToClose: "",
  processingFee: "", underwritingFee: "", adminFee: "", docPrepFee: "",
  loanOriginationFee: "", techBundleFee: "", otherLenderFees: "",
  discountPoints: "", originationFeePoints: "", lenderCredit: "", unknownCredit: "", earnestMoney: "",
  appraisalFee: "", creditReport: "", titleFees: "", closingFee: "",
  closingCoordFee: "", ownersTitleIns: "", lendersTitleIns: "",
  titleServices: "", otherThirdParty: "",
  homeownersInsAnnual: "", homeownersInsEscrow: "", propertyTaxEscrow: "",
  prepaidInterest: "", mortgageInsurance: "", otherEscrows: "",
  mipUpfront: "", fundingFee: "", sellerCredit: "",
});

const calcPI = (amt, rate, term) => { const r = rate / 100 / 12, n = term * 12; if (r === 0) return amt / n; return (amt * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1); };

const bucket = (q, b) => {
  if (b === 1) return num(q.processingFee) + num(q.underwritingFee) + num(q.adminFee) + num(q.docPrepFee);
  if (b === 4) return num(q.discountPoints) + num(q.originationFeePoints) + num(q.loanOriginationFee) - num(q.lenderCredit);
  if (b === 2) return num(q.appraisalFee) + num(q.creditReport) + num(q.titleFees) + num(q.closingFee) + num(q.closingCoordFee) + num(q.ownersTitleIns) + num(q.lendersTitleIns) + num(q.titleServices) + num(q.otherThirdParty) + num(q.techBundleFee) + num(q.otherLenderFees);
  if (b === 3) return num(q.homeownersInsAnnual) + num(q.homeownersInsEscrow) + num(q.propertyTaxEscrow) + num(q.prepaidInterest) + num(q.mortgageInsurance) + num(q.otherEscrows) + num(q.mipUpfront) + num(q.fundingFee);
  return 0;
};

const bucketBreakdown = (q, b) => {
  const items = []; const add = (l, f) => { const v = num(q[f]); if (v !== 0) items.push({ label: l, value: v }); };
  if (b === 1) { add("Processing", "processingFee"); add("Underwriting", "underwritingFee"); add("Admin/Doc Prep", "adminFee"); add("Doc Prep", "docPrepFee"); }
  else if (b === 4) { add("Discount Points", "discountPoints"); add("Orig Fee Points", "originationFeePoints"); add("Origination Fee", "loanOriginationFee"); if (num(q.lenderCredit) > 0) items.push({ label: "Lender Credit", value: -num(q.lenderCredit) }); }
  else if (b === 2) { add("Appraisal", "appraisalFee"); add("Credit Report", "creditReport"); add("Closing Fee", "closingFee"); add("Closing Coord", "closingCoordFee"); add("Owner's Title", "ownersTitleIns"); add("Lender's Title", "lendersTitleIns"); add("Title Svcs", "titleServices"); add("Tech Bundle", "techBundleFee"); add("VOE/Other", "otherLenderFees"); add("Other 3rd Party", "otherThirdParty"); }
  return items;
};

function detectAlerts(quotes) {
  const alerts = [], valid = quotes.filter(q => num(q.loanAmount) > 0);
  if (valid.length < 2) return alerts;
  // Loan amount mismatch
  const la = [...new Set(valid.map(q => num(q.loanAmount)))];
  if (la.length > 1) alerts.push({ type: "critical", title: "Loan Amounts Don't Match", detail: `Quotes show different loan amounts (${la.map(fmt).join(" vs ")}). Direct comparison may be misleading — make sure each quote is for the same scenario.` });
  // Hazard insurance difference
  const hv = valid.map(q => ({ name: q.lenderName, val: num(q.homeownersInsAnnual) })).filter(h => h.val > 0);
  if (hv.length >= 2) { const s = [...hv].sort((a, b) => a.val - b.val); if ((s[s.length - 1].val - s[0].val) / s[s.length - 1].val > 0.2) alerts.push({ type: "warning", title: "Hazard Insurance Estimates Differ", detail: `${s[0].name} estimates ${fmt(s[0].val)}/yr vs ${s[s.length - 1].name} at ${fmt(s[s.length - 1].val)}/yr. The actual cost depends on the policy you choose — not the lender. This can make one quote's total payment look lower, but it's not a real savings.` }); }
  // Credit detection - the key new feature
  valid.forEach(q => {
    const lc = num(q.lenderCredit), sc = num(q.sellerCredit), name = q.lenderName || "A lender";
    // Lender credit detected
    if (lc > 0) alerts.push({ type: "info", title: `${name} — Lender Credit of ${fmt(lc)} Detected`, detail: `This lender credit has been subtracted from their points/origination costs, reducing their lender-controlled total. This is a genuine cost reduction from the lender.` });
    // Seller credit detected
    if (sc > 0) alerts.push({ type: "info", title: `${name} — Seller Credit of ${fmt(sc)} Noted`, detail: `A seller credit of ${fmt(sc)} was found on this quote. Seller credits reduce your cash to close but are not a lender cost — they come from the home seller. This credit is excluded from the lender comparison.` });
    // Ambiguous/unclassified credit - if there's a credit in cashToClose that's unusually low relative to costs
    const uc = num(q.unknownCredit), em = num(q.earnestMoney);
    if (uc > 0) alerts.push({ type: "warning", title: `${name} — Unidentified Credit of ${fmt(uc)}`, detail: `A credit of ${fmt(uc)} was found but the source wasn't clear from the document. We're treating it as a seller credit (excluded from the lender comparison). If this is actually a lender credit, please move it to the "Lender Credit" field in the Detail tab — this will reduce that lender's costs and may change the recommendation.` });
    if (em > 0) alerts.push({ type: "info", title: `${name} — Earnest Money of ${fmt(em)} Noted`, detail: `Earnest money of ${fmt(em)} is your deposit toward the home purchase. It reduces your cash needed at closing but is not a lender fee — it's excluded from the comparison.` });
    // Also flag if origination fee exists alongside points
    if (num(q.loanOriginationFee) > 0 && num(q.discountPoints) > 0)
      alerts.push({ type: "info", title: `${name} charges both origination fee and points`, detail: `Their origination fee (${fmt(num(q.loanOriginationFee))}) is grouped with discount points (${fmt(num(q.discountPoints))}) since both function as upfront costs to reduce the rate. Combined: ${fmt(num(q.loanOriginationFee) + num(q.discountPoints))}.` });
  });
  return alerts;
}

const EXTRACTION_PROMPT = `Extract mortgage fees into JSON. Numbers only, no $ or commas. "" if not found. Return ONLY JSON:
{"lenderName":"","loanOfficer":"","loanAmount":"","rate":"","term":30,"purchasePrice":"","cashToClose":"","sellerCredit":"","lenderCredit":"","unknownCredit":"","earnestMoney":"","processingFee":"","underwritingFee":"","adminFee":"","docPrepFee":"","loanOriginationFee":"","techBundleFee":"","otherLenderFees":"","discountPoints":"","originationFeePoints":"","appraisalFee":"","creditReport":"","closingFee":"","closingCoordFee":"","ownersTitleIns":"","lendersTitleIns":"","titleServices":"","otherThirdParty":"","homeownersInsAnnual":"","homeownersInsEscrow":"","propertyTaxEscrow":"","prepaidInterest":"","mortgageInsurance":"","otherEscrows":""}
RULES:
- Processing→processingFee, Underwriting→underwritingFee, Admin→adminFee (LENDER FEES)
- Discount Points→discountPoints, Origination Fee/1%→loanOriginationFee (POINTS)
- Tech Bundle→techBundleFee, VOE→otherLenderFees (THIRD PARTY)
- Rate: number only e.g. "5.125"
CRITICAL CREDIT RULES:
- "Seller Credit" or "Seller Paid" or "Seller Contribution"→sellerCredit (from seller, excluded from lender comparison)
- "Lender Credit" or "Lender Paid Costs"→lenderCredit (from lender, reduces lender costs)
- "Earnest Money" or "Earnest Money Deposit"→earnestMoney (buyer's deposit, not a lender cost)
- Any other credit/adjustment where the source is unclear→unknownCredit (we will flag this for review)
- If a credit just says "Credit" or "Adjustment" without specifying seller or lender, put it in unknownCredit`;

async function extractFromDocument(file) {
  const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
  const isPdf = file.type === "application/pdf";
  const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: EXTRACTION_PROMPT, messages: [{ role: "user", content: [{ type: isPdf ? "document" : "image", source: { type: "base64", media_type: isPdf ? "application/pdf" : file.type, data: base64 } }, { type: "text", text: "Extract all mortgage fees from this document." }] }] }) });
  const data = await response.json();
  return JSON.parse((data.content?.map(b => b.text || "").join("") || "").replace(/```json|```/g, "").trim());
}

async function lookupReputation(officer, lender) {
  const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000,
      system: `Research this loan officer. Return ONLY JSON: {"rating":0.0,"reviewCount":0,"summary":"","highlights":[],"concerns":[],"sources":[]}`,
      messages: [{ role: "user", content: `Find reviews for ${officer} at ${lender}. Star ratings, counts, themes.` }],
      tools: [{ type: "web_search_20250305", name: "web_search" }] }) });
  const data = await response.json();
  try { return JSON.parse((data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "").replace(/```json|```/g, "").trim()); } catch { return null; }
}

const SCENARIOS = [
  { id: "balanced", label: "Balanced", desc: "Best overall", icon: "⚖️", w: { c: 5, p: 3, k: 3, r: 4 } },
  { id: "cost", label: "Lowest Cost", desc: "Long-term savings", icon: "💰", w: { c: 10, p: 0, k: 0, r: 2 } },
  { id: "payment", label: "Lowest Payment", desc: "Monthly budget", icon: "📅", w: { c: 2, p: 10, k: 0, r: 2 } },
  { id: "cash", label: "Least Cash", desc: "Keep cash in bank", icon: "🏦", w: { c: 2, p: 2, k: 10, r: 2 } },
  { id: "rep", label: "Best Reputation", desc: "Trust & reliability", icon: "⭐", w: { c: 2, p: 2, k: 2, r: 10 } },
];

function scoreAll(analysis, w, reps) {
  if (!analysis.length) return [];
  const t = w.c + w.p + w.k + w.r; if (!t) return analysis.map(a => ({ ...a, score: 50 }));
  const norm = vs => { const mn = Math.min(...vs), mx = Math.max(...vs); if (mx === mn) return vs.map(() => 100); return vs.map(v => 100 - ((v - mn) / (mx - mn)) * 100); };
  const tc = norm(analysis.map(a => a.tc)), pi = norm(analysis.map(a => a.pi)), ca = norm(analysis.map(a => a.cash > 0 ? a.cash : a.lc));
  const rp = analysis.map(a => { const r = reps[`${a.officer}|${a.name}`]; return r ? (r.rating / 5) * 100 : 50; });
  return analysis.map((a, i) => ({ ...a, score: Math.round((tc[i] * w.c + pi[i] * w.p + ca[i] * w.k + rp[i] * w.r) / t) }));
}

// ─── Shared UI ───
function Input({ label, value, onChange, prefix, suffix, placeholder, wide }) {
  return (
    <div style={{ flex: wide ? "1 1 100%" : "1 1 120px" }}>
      {label && <label style={{ display: "block", fontSize: 10, color: "#71717a", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</label>}
      <div style={{ display: "flex", alignItems: "center", background: "#fafafa", border: "1px solid #E8E4DC", borderRadius: 8, padding: "6px 10px" }}>
        {prefix && <span style={{ color: "#71717a", fontSize: 12, marginRight: 4, fontFamily: "var(--mono)" }}>{prefix}</span>}
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ""} style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: 13, fontFamily: "var(--mono)", color: "#1a1a1a" }} />
        {suffix && <span style={{ color: "#71717a", fontSize: 11, marginLeft: 4 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ExpandBucket({ label, total, items, bg, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={() => setOpen(!open)} style={{ padding: "6px 8px", background: bg, borderRadius: 6, cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 8, color: text, textTransform: "uppercase", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 7, color: text, opacity: 0.5 }}>{open ? "▲" : "▼"}</span>
      </div>
      <div style={{ fontSize: 13, fontFamily: "var(--mono)", color: text, fontWeight: 600 }}>{fmt(total)}</div>
      {open && items.length > 0 && <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${text}22` }}>
        {items.map((it, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: text, opacity: 0.85, padding: "1px 0" }}><span>{it.label}</span><span style={{ fontFamily: "var(--mono)" }}>{it.value < 0 ? `(${fmt(Math.abs(it.value))})` : fmt(it.value)}</span></div>)}
      </div>}
    </div>
  );
}

function AlertBanner({ alerts }) {
  if (!alerts.length) return null;
  const cfg = { critical: { i: "🚨", bg: "#FEF2F2", bd: "#FECACA", tx: "#991B1B" }, warning: { i: "⚠️", bg: "#FFFBEB", bd: "#FDE68A", tx: "#92400E" }, info: { i: "💡", bg: "#EFF6FF", bd: "#BFDBFE", tx: "#1E40AF" } };
  return <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>{alerts.map((a, j) => { const s = cfg[a.type]; return <div key={j} style={{ padding: "10px 14px", background: s.bg, border: `1px solid ${s.bd}`, borderRadius: 10, display: "flex", gap: 10 }}><span>{s.i}</span><div><div style={{ fontSize: 12, fontWeight: 700, color: s.tx }}>{a.title}</div><div style={{ fontSize: 11, color: s.tx, opacity: 0.85, lineHeight: 1.5 }}>{a.detail}</div></div></div>; })}</div>;
}

function DocumentUpload({ quoteIndex, onExtracted }) {
  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const ref = useRef();
  const handle = async (file) => {
    if (!file || !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type)) { setStatus("error"); setErr("Upload a PDF or image"); return; }
    setStatus("uploading"); setErr("");
    try { const ex = await extractFromDocument(file); onExtracted(quoteIndex, { ...EMPTY_QUOTE(), ...ex, loanProgram: "Conventional", term: ex.term || 30 }); setStatus("success"); setTimeout(() => setStatus("idle"), 3000); }
    catch (e) { setStatus("error"); setErr(e.message?.includes("API") || e.message?.includes("fetch") ? "AI features unavailable. You can still enter data manually below." : "Could not extract: " + e.message); }
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <input ref={ref} type="file" accept=".pdf,image/*" capture="environment" onChange={e => handle(e.target.files?.[0])} style={{ display: "none" }} />
      <button onClick={() => ref.current?.click()} disabled={status === "uploading"} style={{ width: "100%", padding: "10px", borderRadius: 10, border: status === "success" ? "2px solid #059669" : status === "error" ? "2px solid #DC2626" : "2px dashed #CBD5E1", background: status === "success" ? "#ECFDF5" : "#fff", cursor: status === "uploading" ? "wait" : "pointer", fontSize: 12, color: status === "success" ? "#059669" : status === "error" ? "#DC2626" : "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {status === "idle" && "📄 Upload Loan Estimate (PDF / Photo)"}
        {status === "uploading" && <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> Extracting with AI...</>}
        {status === "success" && "✅ Data extracted!"}
        {status === "error" && `❌ ${err}`}
      </button>
    </div>
  );
}

function AIChat({ analysis, horizon, alerts, reps, fullPage }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(), inputRef = useRef();
  const ctx = `You are a mortgage comparison advisor. 4-bucket framework: Bucket 1=Lender Fees (processing+UW), Bucket 4=Points & Origination (minus lender credits), Bucket 2=Third-Party, Bucket 3=Escrows.
CREDIT RULES: Seller credits are excluded from lender comparison (they come from the seller). Lender credits are subtracted from points/origination (genuine lender cost reduction). Earnest money is the buyer's deposit, not a lender fee. Unknown/ambiguous credits are treated as seller credits by default.
Horizon: ${horizon}yr.\nQUOTES:\n${analysis.map(a => `${a.name} (${a.rate}%) Officer:${a.officer||"?"} P&I:${fmt2(a.pi)}/mo LenderFees:${fmt(a.lf)} Points:${fmt(a.pts)} LC:${fmt(a.lc)} Cash:${a.cash > 0 ? fmt(a.cash) : "N/A"} Total${horizon}yr:${fmt(a.tc)}`).join("\n")}\nBe warm, specific with dollars. 2-3 paragraphs max. Help borrowers understand their options clearly.`;
  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim(); setInput("");
    const hist = [...msgs, { role: "user", content: msg }]; setMsgs(hist); setLoading(true);
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system: ctx, messages: hist.map(m => ({ role: m.role, content: m.content })) }) });
      const data = await res.json();
      setMsgs(prev => [...prev, { role: "assistant", content: data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "Sorry, try again." }]);
    } catch { setMsgs(prev => [...prev, { role: "assistant", content: "Unable to connect to the AI service. This may mean the API key needs to be configured or has run out of credits. The comparison tool still works — you can view all the analysis above without AI." }]); }
    setLoading(false); setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };
  const tips = ["Which option saves most over 5 years?", "Is buying down the rate worth it?", "Explain the fee differences", "What should I ask each lender?"];
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E4DC", overflow: "hidden", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, #1B3A2D, #2D5A45)", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>💬</span>
        <div><div style={{ fontSize: 14, fontWeight: 600 }}>Ask About Your Quotes</div><div style={{ fontSize: 11, opacity: 0.7 }}>AI advisor with full context of your quotes</div></div>
      </div>
      <div style={{ height: fullPage ? 480 : (msgs.length ? 320 : "auto"), overflowY: "auto", padding: 16 }}>
        {!msgs.length && <div style={{ textAlign: "center", padding: "16px 0" }}><div style={{ fontSize: 12, color: "#71717a", marginBottom: 10 }}>Try a question:</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {tips.map((t, i) => <button key={i} onClick={() => { setInput(t); setTimeout(() => inputRef.current?.focus(), 50); }} style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid #E8E4DC", background: "#F9FAFB", cursor: "pointer", fontSize: 11, color: "#1a1a1a" }}>{t}</button>)}
        </div></div>}
        {msgs.map((m, i) => <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}><div style={{ maxWidth: "82%", padding: "10px 14px", borderRadius: 14, background: m.role === "user" ? "#1B3A2D" : "#F3F4F6", color: m.role === "user" ? "#fff" : "#1a1a1a", fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.content}</div></div>)}
        {loading && <div style={{ padding: 8, fontSize: 12, color: "#71717a" }}>Thinking...</div>}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #E8E4DC", display: "flex", gap: 8 }}>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask about your mortgage options..." style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #E8E4DC", fontSize: 13, outline: "none", background: "#fafafa" }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: !input.trim() ? "#D1D5DB" : "#1B3A2D", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Send</button>
      </div>
    </div>
  );
}

function BucketGroup({ title, bucketNum, controlled, children }) {
  const colors = { 1: "#2563EB", 4: "#D97706", 2: "#6B7280", 3: "#059669" };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: colors[bucketNum], color: "#fff", fontSize: 10, fontWeight: 700 }}>{bucketNum}</span>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 8, background: controlled ? "#DBEAFE" : "#F3F4F6", color: controlled ? "#1E40AF" : "#6B7280" }}>{controlled ? "Lender" : "Market"}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", paddingLeft: 26 }}>{children}</div>
    </div>
  );
}

function QuoteCard({ quote, index, onChange, onRemove, canRemove }) {
  const c = COLORS[index % 4]; const up = f => v => onChange(index, { ...quote, [f]: v });
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E4DC", borderTop: `4px solid ${c.bg}`, padding: "16px 18px", flex: "1 1 280px", minWidth: 280, position: "relative" }}>
      {canRemove && <button onClick={() => onRemove(index)} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", color: "#71717a", fontSize: 18 }}>×</button>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.bg }} /><span style={{ fontSize: 11, color: "#71717a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Quote {index + 1}</span>
        {quote.lenderName && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: c.bg, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{quote.lenderName}</span>}
        {quote.rate && <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#71717a", background: "#F3F4F6", padding: "1px 6px", borderRadius: 4 }}>{quote.rate}%</span>}
      </div>
      <DocumentUpload quoteIndex={index} onExtracted={onChange} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginBottom: 8 }}>
        <Input label="Lender" value={quote.lenderName} onChange={up("lenderName")} />
        <Input label="Loan Officer" value={quote.loanOfficer} onChange={up("loanOfficer")} />
        <div style={{ flex: "1 1 120px" }}>
          <label style={{ display: "block", fontSize: 10, color: "#71717a", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Program</label>
          <select value={quote.loanProgram} onChange={e => onChange(index, { ...quote, loanProgram: e.target.value })} style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #E8E4DC", fontSize: 12, background: "#fafafa" }}>
            <option value="Conventional">Conventional</option><option value="FHA">FHA</option><option value="VA">VA</option><option value="USDA">USDA</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginBottom: 8 }}>
        <Input label="Purchase Price" value={quote.purchasePrice} onChange={up("purchasePrice")} prefix="$" />
        <Input label="Loan Amount" value={quote.loanAmount} onChange={up("loanAmount")} prefix="$" />
        <Input label="Rate" value={quote.rate} onChange={up("rate")} suffix="%" />
        <Input label="Term" value={quote.term} onChange={v => onChange(index, { ...quote, term: parseInt(v) || 30 })} suffix="yr" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginBottom: 8 }}>
        <Input label="Cash to Close" value={quote.cashToClose} onChange={up("cashToClose")} prefix="$" />
        <Input label="Seller Credit" value={quote.sellerCredit} onChange={up("sellerCredit")} prefix="$" />
        <Input label="Lender Credit" value={quote.lenderCredit} onChange={up("lenderCredit")} prefix="$" />
        <Input label="Unknown Credit" value={quote.unknownCredit} onChange={up("unknownCredit")} prefix="$" />
        <Input label="Earnest Money" value={quote.earnestMoney} onChange={up("earnestMoney")} prefix="$" />
      </div>
      <BucketGroup title="Lender Fees" bucketNum={1} controlled>
        <Input label="Processing" value={quote.processingFee} onChange={up("processingFee")} prefix="$" />
        <Input label="Underwriting" value={quote.underwritingFee} onChange={up("underwritingFee")} prefix="$" />
        <Input label="Admin" value={quote.adminFee} onChange={up("adminFee")} prefix="$" />
      </BucketGroup>
      <BucketGroup title="Points & Origination" bucketNum={4} controlled>
        <Input label="Discount Pts" value={quote.discountPoints} onChange={up("discountPoints")} prefix="$" />
        <Input label="Origination" value={quote.loanOriginationFee} onChange={up("loanOriginationFee")} prefix="$" />
        <Input label="Other Pts" value={quote.originationFeePoints} onChange={up("originationFeePoints")} prefix="$" />
      </BucketGroup>
      <BucketGroup title="Third-Party Fees" bucketNum={2}>
        <Input label="Appraisal" value={quote.appraisalFee} onChange={up("appraisalFee")} prefix="$" />
        <Input label="Credit Report" value={quote.creditReport} onChange={up("creditReport")} prefix="$" />
        <Input label="Closing" value={quote.closingFee} onChange={up("closingFee")} prefix="$" />
        <Input label="Owner's Title" value={quote.ownersTitleIns} onChange={up("ownersTitleIns")} prefix="$" />
        <Input label="Lender's Title" value={quote.lendersTitleIns} onChange={up("lendersTitleIns")} prefix="$" />
        <Input label="Title Svcs" value={quote.titleServices} onChange={up("titleServices")} prefix="$" />
        <Input label="Tech Bundle" value={quote.techBundleFee} onChange={up("techBundleFee")} prefix="$" />
        <Input label="VOE/Other" value={quote.otherLenderFees} onChange={up("otherLenderFees")} prefix="$" />
        <Input label="Other" value={quote.otherThirdParty} onChange={up("otherThirdParty")} prefix="$" />
      </BucketGroup>
      <BucketGroup title="Escrows & Prepaids" bucketNum={3}>
        <Input label="Hazard Ins (yr)" value={quote.homeownersInsAnnual} onChange={up("homeownersInsAnnual")} prefix="$" />
        <Input label="Hazard Escrow" value={quote.homeownersInsEscrow} onChange={up("homeownersInsEscrow")} prefix="$" />
        <Input label="Tax Escrow" value={quote.propertyTaxEscrow} onChange={up("propertyTaxEscrow")} prefix="$" />
        <Input label="Prepaid Int" value={quote.prepaidInterest} onChange={up("prepaidInterest")} prefix="$" />
        <Input label="MI/Other" value={quote.mortgageInsurance} onChange={up("mortgageInsurance")} prefix="$" />
      </BucketGroup>
    </div>
  );
}
// ─── Multi-Program View ───
function MultiProgramView({ analysis, programs, horizon }) {
  const [sel, setSel] = useState(null);
  const groups = {}; programs.forEach(p => { groups[p] = analysis.filter(a => a.program === p); });
  const best = {}; Object.entries(groups).forEach(([p, qs]) => { if (qs.length) best[p] = qs.reduce((a, b) => a.tc < b.tc ? a : b); });
  const pColor = { Conventional: "#2563EB", FHA: "#D97706", VA: "#059669", USDA: "#7C3AED" };
  const pIcon = { Conventional: "🏠", FHA: "🏛️", VA: "🎖️", USDA: "🌾" };
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "2px solid #7C3AED", marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, #5B21B6, #7C3AED)", color: "#fff" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>📋 Multiple Loan Programs Detected</div>
        <div style={{ fontSize: 11, opacity: 0.8 }}>Your quotes include {programs.join(" & ")}. Pick a program, then compare lenders within it.</div>
      </div>
      <div style={{ padding: 18 }}>
        <div className="grid-programs" style={{ display: "grid", gridTemplateColumns: `repeat(${programs.length}, 1fr)`, gap: 8, marginBottom: 14 }}>
          {programs.map(p => { const qs = groups[p], b = best[p], col = pColor[p] || "#374151", isSel = sel === p;
            return <button key={p} onClick={() => setSel(isSel ? null : p)} style={{ padding: 14, borderRadius: 12, cursor: "pointer", textAlign: "left", border: isSel ? `2px solid ${col}` : "2px solid #E8E4DC", background: isSel ? col + "08" : "#fff" }}>
              <div style={{ fontSize: 16 }}>{pIcon[p]}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: col }}>{p}</div>
              <div style={{ fontSize: 10, color: "#71717a" }}>{qs.length} quote{qs.length > 1 ? "s" : ""}</div>
              {b && <div style={{ fontSize: 12, fontFamily: "var(--mono)", marginTop: 4 }}>Best: {b.rate}% — {fmt(b.lc)}</div>}
              <div style={{ fontSize: 10, color: col, fontWeight: 600, marginTop: 6 }}>{isSel ? "▲ Hide" : "▼ Details"}</div>
            </button>;
          })}
        </div>
        {sel && groups[sel] && <div style={{ padding: 14, background: "#F9FAFB", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: "2px solid #E8E4DC" }}><th style={{ textAlign: "left", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "#71717a" }}>Lender</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, color: "#71717a" }}>Rate</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, color: "#71717a" }}>P&I</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, color: "#71717a" }}>Lender-Ctrl</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, color: "#71717a" }}>Total ({horizon}yr)</th></tr></thead>
            <tbody>{groups[sel].sort((a, b) => a.tc - b.tc).map((a, j) => <tr key={a.i} style={{ borderBottom: "1px solid #eee", background: j === 0 ? "#ECFDF5" : "transparent" }}><td style={{ padding: 8, fontWeight: 600, color: a.color.bg }}>{a.name}</td><td style={{ textAlign: "right", padding: 8, fontFamily: "var(--mono)" }}>{a.rate}%</td><td style={{ textAlign: "right", padding: 8, fontFamily: "var(--mono)" }}>{fmt2(a.pi)}</td><td style={{ textAlign: "right", padding: 8, fontFamily: "var(--mono)", fontWeight: 600 }}>{fmt(a.lc)}</td><td style={{ textAlign: "right", padding: 8, fontFamily: "var(--mono)", color: j === 0 ? "#059669" : "#1a1a1a", fontWeight: j === 0 ? 700 : 400 }}>{fmt(a.tc)}{j === 0 ? " ✓" : ""}</td></tr>)}</tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}

// ─── Main App ───
export default function MortgageCompare() {
  const [quotes, setQuotes] = useState([EMPTY_QUOTE(), EMPTY_QUOTE()]);
  const [constraints, setConstraints] = useState({ timeHorizon: "7" });
  const [tab, setTab] = useState("summary");
  const [weights, setWeights] = useState(SCENARIOS[0].w);
  const [reps, setReps] = useState({});
  const [repLoading, setRepLoading] = useState(false);

  const alerts = detectAlerts(quotes);

  const handleQuoteChange = (i, data) => { const q = [...quotes]; q[i] = data; setQuotes(q); };
  const handleRemove = (i) => { if (quotes.length > 2) setQuotes(quotes.filter((_, j) => j !== i)); };
  const handleAdd = () => { if (quotes.length < 4) setQuotes([...quotes, EMPTY_QUOTE()]); };
  const handleEditOfficer = (quoteAnalysisIndex, name) => {
    const valid = quotes.filter(q => num(q.loanAmount) > 0 && num(q.rate) > 0);
    const qi = valid[quoteAnalysisIndex];
    if (!qi) return;
    const realIndex = quotes.indexOf(qi);
    if (realIndex >= 0) { const q = [...quotes]; q[realIndex] = { ...q[realIndex], loanOfficer: name }; setQuotes(q); }
  };
  const handleLookupRep = async (officer, lender) => {
    const key = `${officer}|${lender}`;
    if (reps[key]) return;
    setRepLoading(true);
    try { const r = await lookupReputation(officer, lender); if (r) setReps(prev => ({ ...prev, [key]: r })); } catch {}
    setRepLoading(false);
  };

  // Analysis
  const horizon = num(constraints.timeHorizon) || 7, months = horizon * 12;
  const analysis = quotes.filter(q => num(q.loanAmount) > 0 && num(q.rate) > 0).map((q, i) => {
    const la = num(q.loanAmount), r = num(q.rate), pi = calcPI(la, r, q.term || 30);
    const lf = bucket(q, 1), pts = bucket(q, 4), lc = lf + pts, tc = lc + pi * months, cash = num(q.cashToClose);
    const b1 = bucketBreakdown(q, 1), b4 = bucketBreakdown(q, 4);
    return { i, name: q.lenderName || `Quote ${i + 1}`, officer: q.loanOfficer, rate: r, pi, lf, pts, lc, tc, la, cash, color: COLORS[i % 4], b1, b4, program: q.loanProgram || "Conventional" };
  });
  const uniqueProgs = [...new Set(analysis.map(a => a.program))];
  const hasMultiProg = uniqueProgs.length > 1;
  const scored = scoreAll(analysis, weights, reps);
  const best = scored.length ? scored.reduce((a, b) => a.score > b.score ? a : b) : null;
  const baseRate = analysis.length ? Math.max(...analysis.map(a => a.rate)) : 0;
  const baseline = analysis.find(a => a.rate === baseRate);

  // Welcome state
  const hasData = analysis.length >= 2;

  return (
    <div style={{ minHeight: "100vh", background: "#F7F5F0", "--mono": "'JetBrains Mono', 'SF Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .fade-up { animation: fadeUp 0.5s ease-out both; }
        @media (max-width: 640px) {
          .grid-cards { grid-template-columns: 1fr 1fr !important; }
          .grid-scores { grid-template-columns: 1fr 1fr !important; }
          .grid-scenarios { grid-template-columns: repeat(3, 1fr) !important; }
          .grid-winner { grid-template-columns: repeat(2, 1fr) !important; }
          .grid-rep { grid-template-columns: 1fr !important; }
          .grid-breakeven { flex-direction: column !important; }
          .grid-programs { grid-template-columns: 1fr 1fr !important; }
          .nav-tabs { font-size: 10px !important; }
          .nav-tabs button { padding: 6px 8px !important; font-size: 10px !important; }
          .header-inner { flex-direction: column; gap: 10px !important; align-items: flex-start !important; }
          .detail-cards { flex-direction: column !important; }
          .detail-cards > div { min-width: 100% !important; }
          .how-it-works { flex-direction: column !important; align-items: center !important; }
          .how-it-works > div { max-width: 100% !important; }
        }
        @media (max-width: 420px) {
          .grid-cards { grid-template-columns: 1fr !important; }
          .grid-scenarios { grid-template-columns: repeat(2, 1fr) !important; }
          .grid-scores { grid-template-columns: 1fr !important; }
          .grid-programs { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1B3A2D 0%, #2D5A45 40%, #1B3A2D 100%)", padding: 0, position: "relative", overflow: "hidden", borderBottom: "3px solid #C9A84C" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.08) 0%, transparent 60%)" }} />
        <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "rgba(201,168,76,0.04)" }} />
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 24px 16px", position: "relative" }}>
          <div className="header-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚖️</div>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0, fontFamily: "'Playfair Display', Georgia, serif", color: "#fff", letterSpacing: "-0.01em" }}>MortgageCompare</h1>
                <p style={{ fontSize: 11, color: "rgba(201,168,76,0.7)", margin: 0, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Source Sans 3', sans-serif", fontWeight: 500 }}>Clarity · Transparency · Confidence</p>
              </div>
            </div>
            <div className="nav-tabs" style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
              {[["summary", "📊 Summary"], ["ask", "💬 Ask AI"], ["detailed", "📝 Detail"]].map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Source Sans 3', sans-serif", background: tab === t ? "#fff" : "transparent", color: tab === t ? "#1B3A2D" : "rgba(255,255,255,0.65)", transition: "all 0.2s" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 24px 60px", fontFamily: "'Source Sans 3', sans-serif" }}>
        {/* Time Horizon */}
        <div style={{ background: "#fff", borderRadius: 10, padding: "10px 16px", marginBottom: 16, border: "1px solid #E8E4DC", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
          <span style={{ fontSize: 10, color: "#71717a", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em" }}>Time Horizon</span>
          <input type="range" min="1" max="15" value={num(constraints.timeHorizon) || 7} onChange={e => setConstraints({ ...constraints, timeHorizon: e.target.value })} style={{ width: 140, accentColor: "#C9A84C" }} />
          <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--mono)", color: "#1B3A2D" }}>{num(constraints.timeHorizon) || 7} years</span>
        </div>

        {/* ─── ASK TAB ─── */}
        {tab === "ask" && (hasData ? <AIChat analysis={analysis} horizon={horizon} alerts={alerts} reps={reps} fullPage /> : <div style={{ textAlign: "center", padding: 60, color: "#71717a" }}>Enter at least two quotes in the Detail tab first.</div>)}

        {/* ─── DETAIL TAB ─── */}
        {tab === "detailed" && (
          <div>
            <div className="detail-cards" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {quotes.map((q, i) => <QuoteCard key={i} quote={q} index={i} onChange={handleQuoteChange} onRemove={handleRemove} canRemove={quotes.length > 2} />)}
            </div>
            {quotes.length < 4 && <button onClick={handleAdd} style={{ marginTop: 12, padding: "12px 24px", borderRadius: 10, border: "2px dashed #CBD5E1", background: "#fff", cursor: "pointer", width: "100%", fontSize: 13, fontWeight: 600, color: "#71717a" }}>+ Add Another Quote</button>}
          </div>
        )}

        {/* ─── SUMMARY TAB ─── */}
        {tab === "summary" && !hasData && (
          <div className="fade-up" style={{ maxWidth: 680, margin: "0 auto", textAlign: "center", padding: "48px 20px" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⚖️</div>
            <h2 style={{ fontSize: 32, fontFamily: "'Playfair Display', Georgia, serif", color: "#1B3A2D", marginBottom: 14, letterSpacing: "-0.01em", fontWeight: 500 }}>Welcome to MortgageCompare</h2>
            <div style={{ width: 60, height: 3, background: "linear-gradient(90deg, #C9A84C, #E8C860)", borderRadius: 2, margin: "0 auto 20px" }} />
            <p style={{ fontSize: 15, color: "#4B5563", lineHeight: 1.85, marginBottom: 20 }}>
              Choosing the right mortgage can be confusing. Different fees. Different rates. Fees estimated differently. Plus there's reputation and experience — the trust factor. It can be overwhelming to know what's truly best.
            </p>
            <p style={{ fontSize: 15, color: "#4B5563", lineHeight: 1.85, marginBottom: 32 }}>
              This tool strips away the noise and gives you a clear answer — focusing on lender fees, points, and origination in relationship to the interest rate. Compare time horizons, see breakeven math, and use our AI advisor for personalized guidance.
            </p>
            <button onClick={() => setTab("detailed")} style={{ padding: "16px 40px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #1B3A2D, #2D5A45)", color: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 600, fontFamily: "'Source Sans 3', sans-serif", boxShadow: "0 4px 16px rgba(27,58,45,0.3)", transition: "transform 0.2s", letterSpacing: "0.02em" }} onMouseEnter={e => e.target.style.transform = "translateY(-2px)"} onMouseLeave={e => e.target.style.transform = ""}>
              Get Started — Upload or Enter Quotes
            </button>

            {/* How it works */}
            <div className="how-it-works" style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 40, flexWrap: "wrap" }}>
              {[
                ["1", "📄", "Upload or Enter Quotes", "Upload a PDF, snap a photo, or type in your loan estimates from each lender."],
                ["2", "📊", "See the Real Comparison", "We break down fees into what matters: lender fees, points, and your rate — cutting through the noise."],
                ["3", "💬", "Get AI Guidance", "Ask questions, compare time horizons, check loan officer reputations, and see the breakeven math."],
              ].map(([n, icon, title, desc]) => (
                <div key={n} style={{ flex: "1 1 180px", maxWidth: 220, textAlign: "center", padding: "24px 16px", background: "#fff", borderRadius: 14, border: "1px solid #E8E4DC", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #C9A84C, #E8C860)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10, boxShadow: "0 2px 6px rgba(201,168,76,0.3)" }}>{n}</div>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1B3A2D", marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 11, color: "#71717a", lineHeight: 1.6 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "summary" && hasData && best && (
          <div>
            <AlertBanner alerts={alerts} />

            {/* Export */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button onClick={() => { const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MortgageCompare Report</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#F8F7F4;color:#1a1a1a;padding:20px}
.container{max-width:800px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
h1{font-size:24px;margin-bottom:4px}h2{font-size:18px;margin:24px 0 12px;padding-top:16px;border-top:1px solid #E8E4DC}
.subtitle{color:#71717a;font-size:12px;margin-bottom:20px}
.winner{background:${best.color.grad};color:#fff;border-radius:12px;padding:20px;margin:16px 0}
.winner h3{font-size:20px;font-weight:400;margin:4px 0}
.winner .stats{display:flex;gap:20px;margin-top:12px;flex-wrap:wrap}
.winner .stat-label{font-size:9px;text-transform:uppercase;opacity:0.6}
.winner .stat-value{font-size:16px;font-family:'Courier New',monospace;margin-top:2px}
.quote{border:1px solid #E8E4DC;border-radius:10px;padding:14px;margin:8px 0;border-left:4px solid #ccc}
.quote-name{font-weight:700;font-size:14px;margin-bottom:4px}
.quote-details{display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:#4B5563}
.quote-details span{font-family:'Courier New',monospace}
.note{font-size:11px;color:#71717a;margin-top:20px;padding-top:12px;border-top:1px solid #E8E4DC}
table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}th{text-align:left;padding:6px 8px;border-bottom:2px solid #E8E4DC;font-size:10px;text-transform:uppercase;color:#71717a}td{padding:6px 8px;border-bottom:1px solid #f3f4f6}
.best td{font-weight:700;color:#059669}</style></head>
<body><div class="container">
<h1>⚖️ MortgageCompare Report</h1>
<div class="subtitle">Generated ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${horizon}-year time horizon</div>
<div class="winner"><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;opacity:0.6">Best Overall — ${horizon} Year Horizon</div><h3>${best.name}</h3>${best.officer ? `<div style="font-size:13px;opacity:0.7">with ${best.officer}</div>` : ""}
<div class="stats">${[["Rate", best.rate + "%"], ["Monthly P&I", fmt2(best.pi)], ["Lender-Controlled", fmt(best.lc)], ["Total (" + horizon + "yr)", fmt(best.tc)]].map(([l, v]) => `<div><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`).join("")}</div></div>
<h2>Quote Comparison</h2>
${analysis.map(a => `<div class="quote" style="border-left-color:${a.color.bg}"><div class="quote-name" style="color:${a.color.bg}">${a.name} — ${a.rate}%</div>${a.officer ? `<div style="font-size:12px;color:#71717a;margin-bottom:6px">Loan Officer: ${a.officer}</div>` : ""}
<div class="quote-details"><div>P&I: <span>${fmt2(a.pi)}/mo</span></div><div>Lender Fees: <span>${fmt(a.lf)}</span></div><div>Points/Orig: <span>${fmt(a.pts)}</span></div><div>Lender-Controlled: <span style="font-weight:700">${fmt(a.lc)}</span></div>${a.cash > 0 ? `<div>Cash to Close: <span>${fmt(a.cash)}</span></div>` : ""}<div>Total (${horizon}yr): <span style="font-weight:700">${fmt(a.tc)}</span></div></div></div>`).join("")}
<h2>Total Cost Over Time</h2>
<table><thead><tr><th>Horizon</th>${analysis.map(a => `<th style="text-align:right;color:${a.color.bg}">${a.name} ${a.rate}%</th>`).join("")}</tr></thead>
<tbody>${[3, 5, 7, 10, 15].map(yr => { const costs = analysis.map(a => a.lc + a.pi * yr * 12); const minC = Math.min(...costs); return `<tr${yr === horizon ? ' style="background:#FEF9EF;font-weight:700"' : ""}><td>${yr} yr${yr === horizon ? " ←" : ""}</td>${costs.map((c, j) => `<td style="text-align:right;font-family:monospace;${c === minC ? "color:#059669;font-weight:700" : ""}">${fmt(c)}${c === minC ? " ✓" : ""}</td>`).join("")}</tr>`; }).join("")}</tbody></table>
<h2>How We Compare</h2>
<p style="font-size:13px;line-height:1.7;color:#4B5563;margin-bottom:8px">This report focuses on the costs the lender controls: <strong>processing/underwriting fees</strong> and <strong>points/origination fees</strong>. Third-party fees (appraisal, title) and escrows (insurance, taxes) are similar across lenders and excluded from the core comparison.</p>
<p style="font-size:13px;line-height:1.7;color:#4B5563">Note: A 1% origination fee is functionally the same as paying 1 discount point. They are grouped together in this analysis for transparency.</p>
<div class="note">This report is an estimate for comparison purposes only. Always obtain official Loan Estimates from each lender before making a decision. Generated by MortgageCompare.</div>
</div></body></html>`; const b = new Blob([html], { type: "text/html" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "MortgageCompare_Report.html"; a.click(); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E8E4DC", background: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>📄 Export Report</button>
            </div>

            {/* Scenarios */}
            <div className="fade-up" style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E4DC", padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 20, fontFamily: "'Playfair Display', serif", marginBottom: 3 }}>What Matters Most to You?</div>
              <div style={{ fontSize: 11, color: "#71717a", marginBottom: 14 }}>Pick a priority — the recommendation updates instantly</div>
              <div className="grid-scenarios" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {SCENARIOS.map(s => { const active = JSON.stringify(weights) === JSON.stringify(s.w); return (
                  <button key={s.id} onClick={() => setWeights(s.w)} style={{ flex: "1 1 90px", padding: "12px 8px", borderRadius: 12, cursor: "pointer", border: active ? "2px solid #1B3A2D" : "2px solid #E8E4DC", background: active ? "#E8F5EE" : "#fff", textAlign: "center", transition: "all 0.15s" }}>
                    <div style={{ fontSize: 22, marginBottom: 2 }}>{s.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: active ? "#1B3A2D" : "#1a1a1a" }}>{s.label}</div>
                    <div style={{ fontSize: 9, color: "#71717a" }}>{s.desc}</div>
                  </button>);
                })}
              </div>
              <div className="grid-scores" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[...scored].sort((a, b) => b.score - a.score).map((a, rank) => (
                  <div key={a.i} style={{ flex: 1, minWidth: 110, padding: "10px 12px", borderRadius: 12, textAlign: "center", background: rank === 0 ? a.color.fg : "#F9FAFB", border: rank === 0 ? `2px solid ${a.color.bg}` : "1px solid #E8E4DC" }}>
                    {rank === 0 && <div style={{ fontSize: 8, fontWeight: 700, color: a.color.bg, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Recommended</div>}
                    <div style={{ fontSize: 12, fontWeight: 700, color: a.color.bg }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: "#71717a" }}>{a.rate}%</div>
                    <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--mono)", color: rank === 0 ? a.color.bg : "#1a1a1a" }}>{a.score}</div>
                    <div style={{ fontSize: 8, color: "#71717a" }}>out of 100</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reputation with editable loan officer */}
            <div className="fade-up" style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E4DC", padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 20, fontFamily: "'Playfair Display', serif", marginBottom: 3 }}>Loan Officer Reputation</div>
              <div style={{ fontSize: 11, color: "#71717a", marginBottom: 12 }}>Add or edit loan officer names, then look up their reviews</div>
              <div className="grid-rep" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(analysis.length, 2)}, 1fr)`, gap: 10 }}>
                {analysis.map(a => { const key = `${a.officer}|${a.name}`; return (
                  <div key={a.i} style={{ padding: 12, background: "#F9FAFB", borderRadius: 12, borderLeft: `3px solid ${a.color.bg}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: a.color.bg, marginBottom: 6 }}>{a.name}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                      <input type="text" value={a.officer} onChange={e => handleEditOfficer(a.i, e.target.value)} placeholder="Enter loan officer name..." style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid #E8E4DC", fontSize: 12, outline: "none", background: "#fff" }} />
                      {a.officer && !reps[key] && <button onClick={() => handleLookupRep(a.officer, a.name)} disabled={repLoading} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E8E4DC", background: "#fff", cursor: "pointer", fontSize: 10, whiteSpace: "nowrap", fontWeight: 600 }}>{repLoading ? "..." : "⭐ Look up"}</button>}
                    </div>
                    {reps[key] && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)" }}>{reps[key].rating.toFixed(1)}</span>
                          <div><div style={{ fontSize: 13, color: "#F59E0B" }}>{"★".repeat(Math.floor(reps[key].rating))}{"☆".repeat(5 - Math.floor(reps[key].rating))}</div><div style={{ fontSize: 10, color: "#71717a" }}>{reps[key].reviewCount} reviews</div></div>
                        </div>
                        <div style={{ fontSize: 11, color: "#4B5563", lineHeight: 1.6, marginBottom: 4 }}>{reps[key].summary}</div>
                        {reps[key].highlights?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{reps[key].highlights.map((h, j) => <span key={j} style={{ fontSize: 9, padding: "2px 8px", background: "#ECFDF5", color: "#065F46", borderRadius: 10 }}>✓ {h}</span>)}</div>}
                      </div>
                    )}
                  </div>);
                })}
              </div>
            </div>

            {/* AI Chat */}
            <AIChat analysis={analysis} horizon={horizon} alerts={alerts} reps={reps} />

            {/* Winner */}
            <div className="fade-up" style={{ background: best.color.grad, borderRadius: 16, padding: "24px 28px", color: "#fff", marginBottom: 16, position: "relative", overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
              <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", opacity: 0.6 }}>Best Overall — {horizon} Year Horizon</div>
              <div style={{ fontSize: 28, fontFamily: "'Playfair Display', serif", marginTop: 4 }}>{best.name}</div>
              {best.officer && <div style={{ fontSize: 13, opacity: 0.7 }}>with {best.officer}</div>}
              <div className="grid-winner" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 16 }}>
                {[["Rate", best.rate + "%"], ["Monthly P&I", fmt2(best.pi)], ["Lender-Controlled", fmt(best.lc)], [`Total (${horizon}yr)`, fmt(best.tc)]].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 17, fontFamily: "var(--mono)", marginTop: 2 }}>{v}</div></div>
                ))}
              </div>
            </div>

            {/* Quick Cards */}
            <div className="grid-cards" style={{ display: "grid", gridTemplateColumns: `repeat(${analysis.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
              {analysis.map(a => (
                <div key={a.i} className="fade-up" style={{ background: a.i === best.i ? a.color.fg : "#fff", border: `2px solid ${a.i === best.i ? a.color.bg : "#E8E4DC"}`, borderRadius: 14, padding: 14, position: "relative", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  {a.i === best.i && <div style={{ position: "absolute", top: -1, right: 10, background: a.color.bg, color: "#fff", fontSize: 8, fontWeight: 700, padding: "3px 8px", borderRadius: "0 0 6px 6px" }}>BEST</div>}
                  <div style={{ fontSize: 13, fontWeight: 700, color: a.color.bg, marginBottom: 6 }}>{a.name}</div>
                  <div style={{ fontSize: 20, fontFamily: "var(--mono)" }}>{a.rate}%</div>
                  <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8 }}>{fmt2(a.pi)}/mo</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    <ExpandBucket label="Lender Fees" total={a.lf} items={a.b1} bg="#DBEAFE" text="#1E40AF" />
                    <ExpandBucket label="Points & Orig" total={a.pts} items={a.b4} bg="#FEF3C7" text="#92400E" />
                  </div>
                  <div style={{ marginTop: 5, padding: "5px 8px", background: "#F9FAFB", borderRadius: 6, textAlign: "center" }}>
                    <div style={{ fontSize: 8, color: "#71717a", textTransform: "uppercase" }}>Lender-Controlled</div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--mono)", color: a.color.bg }}>{fmt(a.lc)}</div>
                  </div>
                  {a.cash > 0 && <div style={{ marginTop: 3, textAlign: "center" }}><div style={{ fontSize: 8, color: "#71717a", textTransform: "uppercase" }}>Cash to Close</div><div style={{ fontSize: 12, fontFamily: "var(--mono)" }}>{fmt(a.cash)}</div></div>}
                </div>
              ))}
            </div>

            {/* Multi-Program */}
            {hasMultiProg && <MultiProgramView analysis={analysis} programs={uniqueProgs} horizon={horizon} />}

            {/* Breakeven */}
            <div className="fade-up" style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E4DC", padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 20, fontFamily: "'Playfair Display', serif", marginBottom: 12 }}>Breakeven Analysis</div>
              <div className="grid-breakeven" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {analysis.map(a => {
                  if (!baseline || a.rate === baseRate) return <div key={a.i} style={{ flex: 1, padding: 12, background: "#F9FAFB", borderRadius: 10, textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 600, color: a.color.bg }}>{a.rate}%</div><div style={{ fontSize: 10, color: "#71717a" }}>Baseline</div></div>;
                  const sav = baseline.pi - a.pi, extra = a.lc - baseline.lc;
                  const mo = sav > 0 && extra > 0 ? Math.ceil(extra / sav) : null;
                  return <div key={a.i} style={{ flex: 1, padding: 12, background: "#F9FAFB", borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: a.color.bg }}>{a.rate}%</div>
                    {mo ? <><div style={{ fontSize: 10, color: "#71717a" }}>Save {fmt2(sav)}/mo · {fmt(extra)} upfront</div><div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)", color: mo <= horizon * 12 ? "#059669" : "#DC2626", marginTop: 4 }}>{(mo / 12).toFixed(1)} yrs</div><div style={{ fontSize: 9, color: mo <= horizon * 12 ? "#059669" : "#DC2626" }}>{mo <= horizon * 12 ? "✓ Recovers in time" : "✗ Doesn't recover"}</div></> : <div style={{ fontSize: 10, color: "#71717a" }}>Higher cost & payment</div>}
                  </div>;
                })}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "2px solid #E8E4DC" }}><th style={{ textAlign: "left", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "#71717a" }}>Horizon</th>{analysis.map(a => <th key={a.i} style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, color: a.color.bg, textTransform: "uppercase" }}>{a.rate}%</th>)}</tr></thead>
                <tbody>{[3, 5, 7, 10, 15].map(yr => { const costs = analysis.map(a => a.lc + a.pi * yr * 12); const minC = Math.min(...costs); return <tr key={yr} style={{ borderBottom: "1px solid #F3F4F6", background: yr === horizon ? "#FEF9EF" : "transparent", fontWeight: yr === horizon ? 700 : 400 }}><td style={{ padding: "6px 8px" }}>{yr} yr{yr === horizon ? " ←" : ""}</td>{costs.map((c, j) => <td key={j} style={{ textAlign: "right", padding: "6px 8px", fontFamily: "var(--mono)", color: c === minC ? "#059669" : "#1a1a1a", fontWeight: c === minC ? 700 : 400 }}>{fmt(c)}{c === minC ? " ✓" : ""}</td>)}</tr>; })}</tbody>
              </table>
            </div>

            {/* Bottom Line */}
            <div className="fade-up" style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E4DC", padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", fontSize: 14, lineHeight: 1.85, color: "#4B5563" }}>
              <div style={{ fontSize: 20, fontFamily: "'Playfair Display', serif", marginBottom: 10, color: "#1a1a1a" }}>The Bottom Line</div>
              {(() => {
                const lines = [];
                const sameRate = analysis.filter(a => a.rate === analysis[0].rate);
                if (sameRate.length >= 2) { const sorted = [...sameRate].sort((a, b) => a.lc - b.lc); const diff = sorted[sorted.length - 1].lc - sorted[0].lc; lines.push(`At ${sameRate[0].rate}%, ${sorted[0].name} has ${fmt(diff)} less in lender-controlled costs than ${sorted[sorted.length - 1].name}. ${diff < 500 ? "That's essentially a wash." : diff < 2000 ? "A modest difference." : "A meaningful difference."}`); }
                if (baseline && analysis.some(a => a.rate < baseline.rate)) { const lr = Math.min(...analysis.map(a => a.rate)); const lrq = analysis.find(a => a.rate === lr); const s = baseline.pi - lrq.pi, e = lrq.lc - baseline.lc; if (s > 0 && e > 0) lines.push(`Buying down from ${baseline.rate}% to ${lr}% saves ${fmt2(s)}/month but costs ${fmt(e)} more upfront. Breakeven is about ${(Math.ceil(e / s) / 12).toFixed(1)} years.`); }
                lines.push(`Over your ${horizon}-year horizon, ${best.name} at ${best.rate}% gives the best value at ${fmt(best.tc)} total cost.`);
                return lines.map((l, i) => <p key={i} style={{ margin: "0 0 8px" }}>{l}</p>);
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #E8E4DC", padding: "20px 24px", textAlign: "center", background: "#fff" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ fontSize: 13, fontFamily: "'Playfair Display', serif", color: "#1B3A2D", marginBottom: 4 }}>⚖️ MortgageCompare</div>
          <div style={{ fontSize: 10, color: "#9CA3AF", lineHeight: 1.6 }}>This tool provides estimates for comparison purposes only. Always obtain official Loan Estimates from each lender before making a decision. Not affiliated with any lender.</div>
        </div>
      </div>
    </div>
  );
}
