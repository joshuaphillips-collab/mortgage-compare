import { useState, useRef, useEffect, useCallback } from "react";

// ─── Config ───
const API = "/api/anthropic";
const num = (v) => { const n = parseFloat(String(v).replace(/[,$]/g, "")); return isNaN(n) ? 0 : n; };
const fmt = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt2 = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Churchill-inspired palette: deep forest green, warm gold, cream
const T = {
  green: "#1B4332", greenLight: "#2D6A4F", greenPale: "#D8F3DC",
  gold: "#C9A227", goldLight: "#E9D58B", goldPale: "#FDF8E8",
  cream: "#FDFCF7", warmGray: "#F5F1EA", border: "#E8E0D0",
  text: "#1A1A1A", textMid: "#5C5C5C", textLight: "#8C8C8C",
  white: "#FFFFFF", danger: "#C0392B", success: "#27AE60", info: "#2980B9",
};

const COLORS = [
  { bg: T.green, fg: T.greenPale, accent: T.gold, grad: `linear-gradient(135deg, ${T.green}, ${T.greenLight})` },
  { bg: "#6B3410", fg: "#FFF4EB", accent: "#E8944A", grad: "linear-gradient(135deg, #6B3410, #A85218)" },
  { bg: "#1A3550", fg: "#EBF3FA", accent: "#5B9BD5", grad: "linear-gradient(135deg, #1A3550, #2A5A8C)" },
  { bg: "#3D1A6B", fg: "#F3EBff", accent: "#9B6ED0", grad: "linear-gradient(135deg, #3D1A6B, #5B30A0)" },
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

// ─── Calculations ───
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
  if (b === 1) { add("Processing", "processingFee"); add("Underwriting", "underwritingFee"); add("Admin", "adminFee"); add("Doc Prep", "docPrepFee"); }
  else if (b === 4) { add("Discount Points", "discountPoints"); add("Orig Fee Points", "originationFeePoints"); add("Origination Fee", "loanOriginationFee"); if (num(q.lenderCredit) > 0) items.push({ label: "Lender Credit", value: -num(q.lenderCredit) }); }
  else if (b === 2) { add("Appraisal", "appraisalFee"); add("Credit Report", "creditReport"); add("Closing Fee", "closingFee"); add("Closing Coord", "closingCoordFee"); add("Owner's Title", "ownersTitleIns"); add("Lender's Title", "lendersTitleIns"); add("Title Svcs", "titleServices"); add("Tech Bundle", "techBundleFee"); add("VOE/Other", "otherLenderFees"); add("Other", "otherThirdParty"); }
  return items;
};

// ─── Alerts ───
function detectAlerts(quotes) {
  const alerts = [], valid = quotes.filter(q => num(q.loanAmount) > 0);
  if (valid.length < 2) return alerts;
  const la = [...new Set(valid.map(q => num(q.loanAmount)))];
  if (la.length > 1) alerts.push({ type: "critical", title: "Loan Amounts Don't Match", detail: `Quotes show different loan amounts (${la.map(fmt).join(" vs ")}). Direct comparison may be misleading.` });
  const hv = valid.map(q => ({ name: q.lenderName, val: num(q.homeownersInsAnnual) })).filter(h => h.val > 0);
  if (hv.length >= 2) { const s = [...hv].sort((a, b) => a.val - b.val); if ((s[s.length - 1].val - s[0].val) / s[s.length - 1].val > 0.2) alerts.push({ type: "warning", title: "Hazard Insurance Estimates Differ", detail: `${s[0].name} estimates ${fmt(s[0].val)}/yr vs ${s[s.length - 1].name} at ${fmt(s[s.length - 1].val)}/yr. The actual cost depends on the policy you choose — not the lender.` }); }
  valid.forEach(q => {
    const name = q.lenderName || "A lender";
    if (num(q.lenderCredit) > 0) alerts.push({ type: "info", title: `${name} — Lender Credit of ${fmt(num(q.lenderCredit))}`, detail: `This lender credit has been subtracted from their points/origination, reducing their lender-controlled total.` });
    if (num(q.sellerCredit) > 0) alerts.push({ type: "info", title: `${name} — Seller Credit of ${fmt(num(q.sellerCredit))} Noted`, detail: `Seller credits reduce cash to close but are not a lender cost. Excluded from the comparison.` });
    if (num(q.unknownCredit) > 0) alerts.push({ type: "warning", title: `${name} — Unidentified Credit of ${fmt(num(q.unknownCredit))}`, detail: `A credit was found but the source wasn't clear. We're treating it as a seller credit. If it's a lender credit, move it to "Lender Credit" in the Detail tab.` });
    if (num(q.earnestMoney) > 0) alerts.push({ type: "info", title: `${name} — Earnest Money of ${fmt(num(q.earnestMoney))}`, detail: `Your deposit toward the purchase. Reduces cash at closing but is not a lender fee.` });
    if (num(q.loanOriginationFee) > 0 && num(q.discountPoints) > 0) alerts.push({ type: "info", title: `${name} charges origination fee + points`, detail: `Origination (${fmt(num(q.loanOriginationFee))}) grouped with discount points (${fmt(num(q.discountPoints))}). Combined: ${fmt(num(q.loanOriginationFee) + num(q.discountPoints))}.` });
  });
  return alerts;
}

// ─── AI Extraction ───
const EXTRACTION_PROMPT = `Extract mortgage fees into JSON. Numbers only, no $ or commas. "" if not found. Return ONLY valid JSON.
{"lenderName":"","loanOfficer":"","loanAmount":"","rate":"","term":30,"purchasePrice":"","cashToClose":"","sellerCredit":"","lenderCredit":"","unknownCredit":"","earnestMoney":"","processingFee":"","underwritingFee":"","adminFee":"","docPrepFee":"","loanOriginationFee":"","techBundleFee":"","otherLenderFees":"","discountPoints":"","originationFeePoints":"","appraisalFee":"","creditReport":"","closingFee":"","closingCoordFee":"","ownersTitleIns":"","lendersTitleIns":"","titleServices":"","otherThirdParty":"","homeownersInsAnnual":"","homeownersInsEscrow":"","propertyTaxEscrow":"","prepaidInterest":"","mortgageInsurance":"","otherEscrows":""}
CLASSIFICATION:
- Processing/Underwriting/Admin→lender fees. Discount Points/Loan Discount→discountPoints (BORROWER pays to reduce rate, NOT a credit). Loan Origination 1%→loanOriginationFee.
- "Seller Credit"/"SellerCredit"/"Other Credits" in summary→sellerCredit. "Lender Credit"/"Lender Paid"→lenderCredit. "Earnest Money"→earnestMoney. Unclear credits→unknownCredit.
- "Loan Credit 1/2" at $0→ignore. "Loan Discount/Credits/Adjustments"→discountPoints (this is points, not a credit).
- Rate: number only. "Cash TO/FROM Borrower"→cashToClose.`;

async function extractFromDocument(file) {
  const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
  const isPdf = file.type === "application/pdf";
  const resp = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system: EXTRACTION_PROMPT, messages: [{ role: "user", content: [{ type: isPdf ? "document" : "image", source: { type: "base64", media_type: isPdf ? "application/pdf" : file.type, data: base64 } }, { type: "text", text: "Extract all mortgage fees from this document." }] }] }) });
  if (!resp.ok) throw new Error("API request failed (" + resp.status + ")");
  const data = await resp.json();
  const text = (data.content?.map(b => b.text || "").join("") || "").replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

// ─── Reputation Lookup (with better error handling) ───
async function lookupReputation(officer, lender) {
  try {
    const resp = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500,
        system: `You are researching a loan officer's reputation. Search the web for reviews and information about this person. Then return ONLY a JSON object (no markdown, no backticks): {"rating":4.5,"reviewCount":10,"summary":"Brief summary of what you found","highlights":["positive thing 1","positive thing 2"],"concerns":[],"sources":["source names"]}. If you cannot find information, return: {"rating":0,"reviewCount":0,"summary":"No reviews found online for this loan officer.","highlights":[],"concerns":[],"sources":[]}`,
        messages: [{ role: "user", content: `Search for reviews and reputation information about loan officer ${officer} at ${lender}. Look for Google reviews, Zillow reviews, social profiles, or any online presence.` }],
        tools: [{ type: "web_search_20250305", name: "web_search" }] }) });
    if (!resp.ok) return { rating: 0, reviewCount: 0, summary: "Could not connect to search. The reputation feature requires an active API connection.", highlights: [], concerns: [], sources: [] };
    const data = await resp.json();
    const textParts = data.content?.filter(b => b.type === "text").map(b => b.text) || [];
    const fullText = textParts.join("\n");
    const jsonMatch = fullText.match(/\{[\s\S]*"rating"[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { rating: 0, reviewCount: 0, summary: "Search completed but could not parse results. Try a different name or check spelling.", highlights: [], concerns: [], sources: [] };
  } catch (e) {
    return { rating: 0, reviewCount: 0, summary: "Error: " + (e.message || "Unknown error. The reputation feature requires an active API key."), highlights: [], concerns: [], sources: [] };
  }
}

const SCENARIOS = [
  { id: "balanced", label: "Balanced", desc: "Best overall value", icon: "⚖️", w: { c: 5, p: 3, k: 3, r: 4 } },
  { id: "cost", label: "Lowest Cost", desc: "Long-term savings", icon: "💰", w: { c: 10, p: 0, k: 0, r: 2 } },
  { id: "payment", label: "Lowest Payment", desc: "Monthly budget", icon: "📅", w: { c: 2, p: 10, k: 0, r: 2 } },
  { id: "cash", label: "Least Cash", desc: "Preserve savings", icon: "🏦", w: { c: 2, p: 2, k: 10, r: 2 } },
  { id: "rep", label: "Reputation", desc: "Trust matters", icon: "⭐", w: { c: 2, p: 2, k: 2, r: 10 } },
];

function scoreAll(analysis, w, reps) {
  if (!analysis.length) return [];
  const t = w.c + w.p + w.k + w.r; if (!t) return analysis.map(a => ({ ...a, score: 50 }));
  const norm = vs => { const mn = Math.min(...vs), mx = Math.max(...vs); if (mx === mn) return vs.map(() => 100); return vs.map(v => 100 - ((v - mn) / (mx - mn)) * 100); };
  const tc = norm(analysis.map(a => a.tc)), pi = norm(analysis.map(a => a.pi)), ca = norm(analysis.map(a => a.cash > 0 ? a.cash : a.lc));
  const rp = analysis.map(a => { const r = reps[`${a.officer}|${a.name}`]; return r && r.rating > 0 ? (r.rating / 5) * 100 : 50; });
  return analysis.map((a, i) => ({ ...a, score: Math.round((tc[i] * w.c + pi[i] * w.p + ca[i] * w.k + rp[i] * w.r) / t) }));
}
// ─── UI Components ───
function Input({ label, value, onChange, prefix, suffix, placeholder }) {
  return (
    <div style={{ flex: "1 1 110px", minWidth: 90 }}>
      {label && <label style={{ display: "block", fontSize: 10, color: T.textLight, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</label>}
      <div style={{ display: "flex", alignItems: "center", background: T.cream, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 8px" }}>
        {prefix && <span style={{ color: T.textLight, fontSize: 11, marginRight: 3, fontFamily: "var(--mono)" }}>{prefix}</span>}
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ""} style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: 12, fontFamily: "var(--mono)", color: T.text }} />
        {suffix && <span style={{ color: T.textLight, fontSize: 10, marginLeft: 3 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function DropZone({ onFile, status, message }) {
  const [over, setOver] = useState(false);
  const ref = useRef();
  const handle = (file) => { if (file && (file.type === "application/pdf" || file.type.startsWith("image/"))) onFile(file); };
  return (
    <div ref={ref}
      onClick={() => { const i = document.createElement("input"); i.type = "file"; i.accept = ".pdf,image/*"; i.onchange = e => handle(e.target.files?.[0]); i.click(); }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setOver(false); }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); handle(e.dataTransfer?.files?.[0]); }}
      style={{
        padding: status === "idle" ? "28px 20px" : "16px 20px", borderRadius: 14, textAlign: "center", cursor: status === "loading" ? "wait" : "pointer", transition: "all 0.25s ease",
        border: over ? `3px solid ${T.gold}` : status === "success" ? `3px solid ${T.success}` : status === "error" ? `3px solid ${T.danger}` : `3px dashed ${T.border}`,
        background: over ? T.goldPale : status === "success" ? "#ECFDF5" : status === "error" ? "#FEF2F2" : T.white,
        boxShadow: over ? `0 0 20px ${T.gold}33` : "none",
      }}>
      {status === "idle" && <>
        <div style={{ fontSize: 28, marginBottom: 6, opacity: over ? 1 : 0.6 }}>{over ? "📥" : "📄"}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: over ? T.gold : T.text, fontFamily: "var(--heading)" }}>{over ? "Drop it here!" : "Drag & Drop Your Loan Estimate"}</div>
        <div style={{ fontSize: 11, color: T.textLight, marginTop: 4 }}>or click to browse · PDF, PNG, JPG supported</div>
      </>}
      {status === "loading" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: T.green, fontSize: 13 }}><span className="spin">⏳</span> Extracting fees with AI...</div>}
      {status === "success" && <div style={{ color: T.success, fontSize: 13, fontWeight: 600 }}>✅ {message || "Data extracted!"}</div>}
      {status === "error" && <div style={{ color: T.danger, fontSize: 12 }}>❌ {message}</div>}
    </div>
  );
}

function AlertBanner({ alerts }) {
  if (!alerts.length) return null;
  const cfg = { critical: { bg: "#FEF2F2", bd: "#FCA5A5", tx: "#991B1B", icon: "🚨" }, warning: { bg: "#FFFBEB", bd: "#FDE68A", tx: "#92400E", icon: "⚠️" }, info: { bg: "#EFF6FF", bd: "#BFDBFE", tx: "#1E40AF", icon: "💡" } };
  return <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>{alerts.map((a, j) => { const s = cfg[a.type] || cfg.info; return <div key={j} style={{ padding: "12px 16px", background: s.bg, border: `1px solid ${s.bd}`, borderRadius: 12, display: "flex", gap: 10, alignItems: "flex-start" }}><span style={{ fontSize: 16, lineHeight: 1 }}>{s.icon}</span><div><div style={{ fontSize: 12, fontWeight: 700, color: s.tx, fontFamily: "var(--heading)" }}>{a.title}</div><div style={{ fontSize: 11, color: s.tx, opacity: 0.85, lineHeight: 1.5, marginTop: 2 }}>{a.detail}</div></div></div>; })}</div>;
}

function AIChat({ analysis, horizon }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();
  const ctx = `You are a mortgage comparison advisor. 4-bucket framework: Bucket 1=Lender Fees (processing+UW), Bucket 4=Points & Origination (minus lender credits), Bucket 2=Third-Party, Bucket 3=Escrows.\nCREDIT RULES: Seller credits excluded. Lender credits subtract from points/origination. Earnest money excluded. Unknown credits treated as seller.\nHorizon: ${horizon}yr.\n${analysis.map(a => `${a.name} (${a.rate}%) Officer:${a.officer||"?"} P&I:${fmt2(a.pi)}/mo LenderFees:${fmt(a.lf)} Points:${fmt(a.pts)} Lender-Ctrl:${fmt(a.lc)} Cash:${a.cash > 0 ? fmt(a.cash) : "N/A"} Total${horizon}yr:${fmt(a.tc)}`).join("\n")}\nBe warm and specific with dollar amounts. 2-3 paragraphs max.`;
  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim(); setInput("");
    const hist = [...msgs, { role: "user", content: msg }]; setMsgs(hist); setLoading(true);
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system: ctx, messages: hist.map(m => ({ role: m.role, content: m.content })) }) });
      if (!res.ok) throw new Error("API " + res.status);
      const data = await res.json();
      setMsgs(prev => [...prev, { role: "assistant", content: data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "Sorry, try again." }]);
    } catch (e) { setMsgs(prev => [...prev, { role: "assistant", content: "Unable to connect. The AI chat requires an active API connection. All the comparison data above still works without it." }]); }
    setLoading(false); setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };
  const tips = ["Which option saves most over 5 years?", "Is buying down the rate worth it?", "Explain the fee differences", "What should I ask each lender?"];
  return (
    <div style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
      <div style={{ padding: "16px 24px", background: `linear-gradient(135deg, ${T.green}, ${T.greenLight})`, color: "#fff" }}>
        <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--heading)" }}>💬 Ask About Your Quotes</div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>AI advisor with full context of your comparison</div>
      </div>
      <div style={{ height: msgs.length ? 300 : "auto", overflowY: "auto", padding: 16 }}>
        {!msgs.length && <div style={{ textAlign: "center", padding: "12px 0" }}><div style={{ fontSize: 12, color: T.textLight, marginBottom: 10 }}>Try a question:</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {tips.map((t, i) => <button key={i} onClick={() => setInput(t)} style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${T.border}`, background: T.cream, cursor: "pointer", fontSize: 11, color: T.text, fontFamily: "var(--body)" }}>{t}</button>)}
        </div></div>}
        {msgs.map((m, i) => <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}><div style={{ maxWidth: "82%", padding: "10px 14px", borderRadius: 14, background: m.role === "user" ? T.green : T.warmGray, color: m.role === "user" ? "#fff" : T.text, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.content}</div></div>)}
        {loading && <div style={{ padding: 8, fontSize: 12, color: T.textLight }}>Thinking...</div>}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask about your mortgage options..." style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 13, outline: "none", background: T.cream, fontFamily: "var(--body)" }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: !input.trim() ? "#D1D5DB" : T.green, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Send</button>
      </div>
    </div>
  );
}

function QuoteCard({ quote, index, onChange, onRemove, canRemove }) {
  const c = COLORS[index % 4];
  const up = (f) => (v) => onChange(index, { ...quote, [f]: v, _ui: true });
  const hasData = num(quote.loanAmount) > 0;
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [uploadMsg, setUploadMsg] = useState("");
  const handleFile = async (file) => {
    setUploadStatus("loading"); setUploadMsg("");
    try {
      const ex = await extractFromDocument(file);
      onChange(index, ex); // Will merge in handleQuoteChange
      setUploadStatus("success"); setUploadMsg(`${ex.lenderName || "Quote"} — ${ex.rate || "?"}%`);
      setTimeout(() => setUploadStatus("idle"), 4000);
    } catch (e) { setUploadStatus("error"); setUploadMsg(e.message?.includes("API") || e.message?.includes("fetch") || e.message?.includes("Failed") ? "AI extraction unavailable. Enter data manually below." : "Could not extract: " + e.message); setTimeout(() => setUploadStatus("idle"), 5000); }
  };
  return (
    <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, borderTop: `4px solid ${c.bg}`, padding: "18px 20px", flex: "1 1 300px", minWidth: 300, position: "relative", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
      {canRemove && <button onClick={() => onRemove(index)} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", color: T.textLight, fontSize: 18 }}>×</button>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>{index + 1}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: hasData ? c.bg : T.textLight, fontFamily: "var(--heading)" }}>{quote.lenderName || `Quote ${index + 1}`}</div>
          {hasData && <div style={{ fontSize: 11, color: T.textMid }}>{quote.rate}% · {quote.loanOfficer || "No officer"}</div>}
        </div>
      </div>
      <DropZone onFile={handleFile} status={uploadStatus} message={uploadMsg} />
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
        <Input label="Lender" value={quote.lenderName} onChange={up("lenderName")} />
        <Input label="Loan Officer" value={quote.loanOfficer} onChange={up("loanOfficer")} />
        <div style={{ flex: "1 1 110px", minWidth: 90 }}>
          <label style={{ display: "block", fontSize: 10, color: T.textLight, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Program</label>
          <select value={quote.loanProgram} onChange={e => onChange(index, { ...quote, loanProgram: e.target.value, _ui: true })} style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12, background: T.cream }}>
            <option>Conventional</option><option>FHA</option><option>VA</option><option>USDA</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginTop: 6 }}>
        <Input label="Purchase Price" value={quote.purchasePrice} onChange={up("purchasePrice")} prefix="$" />
        <Input label="Loan Amount" value={quote.loanAmount} onChange={up("loanAmount")} prefix="$" />
        <Input label="Rate" value={quote.rate} onChange={up("rate")} suffix="%" />
        <Input label="Term" value={quote.term} onChange={v => onChange(index, { ...quote, term: parseInt(v) || 30, _ui: true })} suffix="yr" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginTop: 6 }}>
        <Input label="Cash to Close" value={quote.cashToClose} onChange={up("cashToClose")} prefix="$" />
        <Input label="Seller Credit" value={quote.sellerCredit} onChange={up("sellerCredit")} prefix="$" />
        <Input label="Lender Credit" value={quote.lenderCredit} onChange={up("lenderCredit")} prefix="$" />
        <Input label="Unknown Credit" value={quote.unknownCredit} onChange={up("unknownCredit")} prefix="$" />
      </div>
      {[{ t: "Lender Fees", n: 1, fields: [["Processing", "processingFee"], ["Underwriting", "underwritingFee"], ["Admin", "adminFee"]] },
        { t: "Points & Origination", n: 4, fields: [["Discount Pts", "discountPoints"], ["Origination", "loanOriginationFee"], ["Other Pts", "originationFeePoints"]] },
        { t: "Third-Party", n: 2, fields: [["Appraisal", "appraisalFee"], ["Credit Report", "creditReport"], ["Closing", "closingFee"], ["Owner's Title", "ownersTitleIns"], ["Lender's Title", "lendersTitleIns"], ["Title Svcs", "titleServices"], ["Tech Bundle", "techBundleFee"], ["VOE/Other", "otherLenderFees"], ["Other", "otherThirdParty"]] },
        { t: "Escrows & Prepaids", n: 3, fields: [["Hazard Ins (yr)", "homeownersInsAnnual"], ["Hazard Escrow", "homeownersInsEscrow"], ["Tax Escrow", "propertyTaxEscrow"], ["Prepaid Int", "prepaidInterest"], ["MI/Other", "mortgageInsurance"]] },
      ].map(g => (
        <div key={g.n} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: [,"#2563EB","#6B7280","#059669","#D97706"][g.n], color: "#fff", fontSize: 8, fontWeight: 700 }}>{g.n}</span>
            {g.t} <span style={{ fontSize: 8, color: g.n <= 1 || g.n === 4 ? T.info : T.textLight }}>{ g.n <= 1 || g.n === 4 ? "Lender" : "Market"}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px" }}>
            {g.fields.map(([l, f]) => <Input key={f} label={l} value={quote[f]} onChange={up(f)} prefix="$" />)}
          </div>
        </div>
      ))}
    </div>
  );
}
// ─── Main App ───
export default function MortgageCompare() {
  const [quotes, setQuotes] = useState([EMPTY_QUOTE(), EMPTY_QUOTE()]);
  const [horizon, setHorizon] = useState(7);
  const [tab, setTab] = useState("summary");
  const [weights, setWeights] = useState(SCENARIOS[0].w);
  const [reps, setReps] = useState({});
  const [repLoading, setRepLoading] = useState({});

  const alerts = detectAlerts(quotes);

  const handleQuoteChange = useCallback((i, data) => {
    setQuotes(prev => {
      const q = [...prev];
      if (data._ui) { const clean = { ...data }; delete clean._ui; q[i] = clean; }
      else { q[i] = { ...EMPTY_QUOTE(), ...data, loanProgram: data.loanProgram || "Conventional", term: data.term || 30 }; }
      return q;
    });
  }, []);
  const handleRemove = (i) => { if (quotes.length > 2) setQuotes(prev => prev.filter((_, j) => j !== i)); };
  const handleAdd = () => { if (quotes.length < 4) setQuotes(prev => [...prev, EMPTY_QUOTE()]); };

  // Welcome page upload handler
  const [welcomeUpload, setWelcomeUpload] = useState({ status: "idle", msg: "", slot: 0 });
  const handleWelcomeFile = async (file) => {
    setWelcomeUpload({ status: "loading", msg: "", slot: welcomeUpload.slot });
    try {
      const ex = await extractFromDocument(file);
      const slot = welcomeUpload.slot;
      setQuotes(prev => {
        const q = [...prev];
        q[slot] = { ...EMPTY_QUOTE(), ...ex, loanProgram: ex.loanProgram || "Conventional", term: ex.term || 30 };
        return q;
      });
      const nextSlot = slot + 1;
      setWelcomeUpload({ status: "success", msg: `✅ ${ex.lenderName || "Quote"} at ${ex.rate || "?"}% loaded!`, slot: nextSlot < quotes.length ? nextSlot : slot });
      setTimeout(() => setWelcomeUpload(prev => ({ ...prev, status: "idle", msg: "" })), 3000);
    } catch (e) { setWelcomeUpload({ status: "error", msg: e.message || "Extraction failed", slot: welcomeUpload.slot }); setTimeout(() => setWelcomeUpload(prev => ({ ...prev, status: "idle" })), 4000); }
  };

  // Analysis
  const months = horizon * 12;
  const analysis = quotes.filter(q => num(q.loanAmount) > 0 && num(q.rate) > 0).map((q, i) => {
    const la = num(q.loanAmount), r = num(q.rate), pi = calcPI(la, r, q.term || 30);
    const lf = bucket(q, 1), pts = bucket(q, 4), lc = lf + pts, tc = lc + pi * months, cash = num(q.cashToClose);
    return { i, name: q.lenderName || `Quote ${i + 1}`, officer: q.loanOfficer, rate: r, pi, lf, pts, lc, tc, la, cash, color: COLORS[i % 4], b1: bucketBreakdown(q, 1), b4: bucketBreakdown(q, 4), program: q.loanProgram || "Conventional" };
  });
  const hasData = analysis.length >= 2;
  const scored = scoreAll(analysis, weights, reps);
  const best = scored.length ? scored.reduce((a, b) => a.score > b.score ? a : b) : null;
  const baseRate = analysis.length ? Math.max(...analysis.map(a => a.rate)) : 0;
  const baseline = analysis.find(a => a.rate === baseRate);

  const handleLookupRep = async (officer, lender) => {
    const key = `${officer}|${lender}`;
    if (reps[key] || repLoading[key]) return;
    setRepLoading(prev => ({ ...prev, [key]: true }));
    const r = await lookupReputation(officer, lender);
    setReps(prev => ({ ...prev, [key]: r }));
    setRepLoading(prev => ({ ...prev, [key]: false }));
  };

  const handleEditOfficer = (analysisIdx, name) => {
    const valid = quotes.filter(q => num(q.loanAmount) > 0 && num(q.rate) > 0);
    const qi = valid[analysisIdx];
    if (!qi) return;
    const realIdx = quotes.indexOf(qi);
    if (realIdx >= 0) setQuotes(prev => { const q = [...prev]; q[realIdx] = { ...q[realIdx], loanOfficer: name }; return q; });
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.cream} 0%, ${T.warmGray} 100%)`, "--mono": "'JetBrains Mono', monospace", "--heading": "'Playfair Display', Georgia, serif", "--body": "'Source Sans 3', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Source+Sans+3:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Source Sans 3', -apple-system, sans-serif; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fade-up { animation: fadeUp 0.6s ease-out both; }
        .spin { animation: spin 1s linear infinite; display: inline-block; }
        @media (max-width: 700px) {
          .resp-grid { grid-template-columns: 1fr !important; }
          .resp-grid-2 { grid-template-columns: 1fr 1fr !important; }
          .resp-flex { flex-direction: column !important; }
          .resp-header { flex-direction: column !important; gap: 10px !important; align-items: flex-start !important; }
          .resp-nav button { padding: 6px 10px !important; font-size: 10px !important; }
        }
      `}</style>

      {/* ━━ HEADER ━━ */}
      <header style={{ background: `linear-gradient(135deg, ${T.green} 0%, ${T.greenLight} 50%, ${T.green} 100%)`, borderBottom: `3px solid ${T.gold}`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 30% 0%, ${T.gold}12 0%, transparent 50%)` }} />
        <div style={{ position: "absolute", top: -80, right: -80, width: 260, height: 260, borderRadius: "50%", border: `1px solid ${T.gold}15` }} />
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 24px 14px", position: "relative" }}>
          <div className="resp-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${T.gold}22`, border: `1.5px solid ${T.gold}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>⚖️</div>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 500, fontFamily: "var(--heading)", color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.1 }}>MortgageCompare</h1>
                <p style={{ fontSize: 10, color: `${T.gold}BB`, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500 }}>Clarity · Transparency · Confidence</p>
              </div>
            </div>
            <nav className="resp-nav" style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 3, border: "1px solid rgba(255,255,255,0.1)" }}>
              {[["summary", "Summary"], ["ask", "Ask AI"], ["detailed", "Detail"]].map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: "9px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--body)", background: tab === t ? T.white : "transparent", color: tab === t ? T.green : "rgba(255,255,255,0.6)", transition: "all 0.2s" }}>{l}</button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "20px 24px 80px", fontFamily: "var(--body)" }}>
        {/* Time Horizon */}
        <div style={{ background: T.white, borderRadius: 12, padding: "12px 20px", marginBottom: 20, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <span style={{ fontSize: 10, color: T.textLight, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.08em" }}>Time Horizon</span>
          <input type="range" min="1" max="15" value={horizon} onChange={e => setHorizon(parseInt(e.target.value))} style={{ width: 160, accentColor: T.gold }} />
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: T.green }}>{horizon} years</span>
        </div>

        {/* ━━ SUMMARY - WELCOME ━━ */}
        {tab === "summary" && !hasData && (
          <div className="fade-up" style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ textAlign: "center", padding: "40px 20px 32px" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚖️</div>
              <h2 style={{ fontSize: 34, fontFamily: "var(--heading)", color: T.green, fontWeight: 500, letterSpacing: "-0.02em", marginBottom: 8 }}>Welcome to MortgageCompare</h2>
              <div style={{ width: 60, height: 3, background: `linear-gradient(90deg, ${T.gold}, ${T.goldLight})`, borderRadius: 2, margin: "0 auto 20px" }} />
              <p style={{ fontSize: 16, color: T.textMid, lineHeight: 1.9, maxWidth: 560, margin: "0 auto 12px" }}>Different fees. Different rates. Different formats. It's overwhelming to know what's truly best. This tool strips away the noise — focusing on the costs each lender actually controls.</p>
              <p style={{ fontSize: 16, color: T.textMid, lineHeight: 1.9, maxWidth: 560, margin: "0 auto 28px" }}>Upload your loan estimates below, or switch to the Detail tab to enter numbers manually.</p>
            </div>
            {/* DRAG AND DROP RIGHT ON WELCOME PAGE */}
            <div style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.06)", marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.green, fontFamily: "var(--heading)", marginBottom: 4 }}>Upload Quote {welcomeUpload.slot + 1} of {quotes.length}</div>
              <div style={{ fontSize: 11, color: T.textLight, marginBottom: 12 }}>Drop each lender's loan estimate here — we'll extract the fees automatically</div>
              <DropZone onFile={handleWelcomeFile} status={welcomeUpload.status} message={welcomeUpload.msg} />
              {analysis.length > 0 && <div style={{ marginTop: 14, padding: 12, background: T.greenPale, borderRadius: 10, fontSize: 12 }}>
                {analysis.map((a, j) => <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: T.green, fontWeight: 600 }}><span>{a.name}</span><span style={{ fontFamily: "var(--mono)" }}>{a.rate}%</span></div>)}
                {analysis.length < 2 && <div style={{ color: T.textLight, marginTop: 4, fontSize: 11 }}>Upload at least one more quote to see the comparison</div>}
              </div>}
            </div>
            {/* How it works */}
            <div className="resp-flex" style={{ display: "flex", gap: 14, marginBottom: 20 }}>
              {[["1", "📄", "Upload Estimates", "PDF or photo from each lender"], ["2", "📊", "See What Matters", "Lender fees & points vs. rate"], ["3", "💬", "Ask AI Anything", "Breakeven, time horizon, advice"]].map(([n, ic, t, d]) => (
                <div key={n} style={{ flex: 1, textAlign: "center", padding: "22px 14px", background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg, ${T.gold}, ${T.goldLight})`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 8, boxShadow: `0 2px 8px ${T.gold}44` }}>{n}</div>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{ic}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.green }}>{t}</div>
                  <div style={{ fontSize: 11, color: T.textLight }}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center" }}>
              <button onClick={() => setTab("detailed")} style={{ padding: "14px 32px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.green}, ${T.greenLight})`, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "var(--body)", boxShadow: `0 4px 16px ${T.green}44` }}>Or Enter Data Manually →</button>
            </div>
          </div>
        )}

        {/* ━━ SUMMARY - WITH DATA ━━ */}
        {tab === "summary" && hasData && best && (
          <div>
            <AlertBanner alerts={alerts} />

            {/* Export */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button onClick={() => { const w = window.open("", "_blank"); w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>MortgageCompare Report</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,serif;background:#FDFCF7;color:#1A1A1A;padding:24px}.c{max-width:800px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;box-shadow:0 2px 12px rgba(0,0,0,0.08)}h1{font-size:26px;color:${T.green}}h2{font-size:18px;margin:28px 0 12px;color:${T.green};border-bottom:2px solid ${T.gold};padding-bottom:6px}.sub{color:${T.textLight};font-size:12px;margin-bottom:24px}.w{background:${best.color.grad};color:#fff;border-radius:14px;padding:24px;margin:20px 0}.w h3{font-size:22px;font-weight:400;margin:4px 0}.w .s{display:flex;gap:24px;margin-top:14px;flex-wrap:wrap}.w .sl{font-size:9px;text-transform:uppercase;opacity:0.6}.w .sv{font-size:17px;font-family:monospace;margin-top:2px}.q{border:1px solid ${T.border};border-radius:12px;padding:16px;margin:10px 0}.q b{font-size:14px}table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}th{text-align:left;padding:8px;border-bottom:2px solid ${T.border};font-size:10px;text-transform:uppercase;color:${T.textLight}}td{padding:8px;border-bottom:1px solid #f3f4f6}.ft{font-size:11px;color:${T.textLight};margin-top:24px;padding-top:12px;border-top:1px solid ${T.border}}</style></head><body><div class="c"><h1>⚖️ MortgageCompare Report</h1><div class="sub">${new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})} · ${horizon}-year horizon</div><div class="w"><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;opacity:0.6">★ Best Value — ${horizon} Year Horizon</div><h3>${best.name}</h3>${best.officer?`<div style="font-size:13px;opacity:0.7">with ${best.officer}</div>`:""}<div class="s">${[["Rate",best.rate+"%"],["P&I",fmt2(best.pi)+"/mo"],["Lender-Controlled",fmt(best.lc)],["Total ("+horizon+"yr)",fmt(best.tc)]].map(([l,v])=>`<div><div class="sl">${l}</div><div class="sv">${v}</div></div>`).join("")}</div></div><h2>All Quotes</h2>${analysis.map(a=>`<div class="q" style="border-left:4px solid ${a.color.bg}"><b style="color:${a.color.bg}">${a.name} — ${a.rate}%</b>${a.officer?`<div style="font-size:12px;color:${T.textLight}">Officer: ${a.officer}</div>`:""}<div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:8px;font-size:13px;color:${T.textMid}"><div>P&I: <span style="font-family:monospace">${fmt2(a.pi)}/mo</span></div><div>Lender Fees: <span style="font-family:monospace">${fmt(a.lf)}</span></div><div>Points: <span style="font-family:monospace">${fmt(a.pts)}</span></div><div>Lender Total: <b style="font-family:monospace">${fmt(a.lc)}</b></div><div>Total ${horizon}yr: <b style="font-family:monospace">${fmt(a.tc)}</b></div></div></div>`).join("")}<h2>Cost Over Time</h2><table><thead><tr><th>Horizon</th>${analysis.map(a=>`<th style="text-align:right;color:${a.color.bg}">${a.rate}%</th>`).join("")}</tr></thead><tbody>${[3,5,7,10,15].map(yr=>{const costs=analysis.map(a=>a.lc+a.pi*yr*12);const mn=Math.min(...costs);return`<tr${yr===horizon?' style="background:#FEF9EF;font-weight:700"':""}><td>${yr} yr${yr===horizon?" ←":""}</td>${costs.map((c,j)=>`<td style="text-align:right;font-family:monospace;${c===mn?"color:#059669;font-weight:700":""}">${fmt(c)}${c===mn?" ✓":""}</td>`).join("")}</tr>`}).join("")}</tbody></table><div class="ft">Estimates for comparison only. Obtain official Loan Estimates before choosing a loan. Not affiliated with any lender.</div></div></body></html>`); w.document.close(); }} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: T.textMid }}>📄 Export Report</button>
            </div>

            {/* Winner */}
            <div className="fade-up" style={{ background: best.color.grad, borderRadius: 16, padding: "28px 32px", color: "#fff", marginBottom: 20, position: "relative", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
              <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
              <div style={{ position: "absolute", top: 14, right: 18, background: `${T.gold}44`, border: `1px solid ${T.gold}88`, padding: "4px 14px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}>★ BEST VALUE</div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", opacity: 0.6 }}>Best Overall — {horizon} Year Horizon</div>
              <div style={{ fontSize: 30, fontFamily: "var(--heading)", marginTop: 4, fontWeight: 500 }}>{best.name}</div>
              {best.officer && <div style={{ fontSize: 13, opacity: 0.7 }}>with {best.officer}</div>}
              <div className="resp-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 18 }}>
                {[["Rate", best.rate + "%"], ["Monthly P&I", fmt2(best.pi)], ["Lender-Controlled", fmt(best.lc)], [`Total (${horizon}yr)`, fmt(best.tc)]].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div><div style={{ fontSize: 18, fontFamily: "var(--mono)", marginTop: 2 }}>{v}</div></div>
                ))}
              </div>
            </div>

            {/* Scenarios */}
            <div className="fade-up" style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, padding: "24px 28px", marginBottom: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 22, fontFamily: "var(--heading)", marginBottom: 4, color: T.green }}>What Matters Most?</div>
              <div style={{ fontSize: 12, color: T.textLight, marginBottom: 16 }}>Pick your priority — the recommendation updates instantly</div>
              <div className="resp-grid-2" style={{ display: "grid", gridTemplateColumns: `repeat(${SCENARIOS.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
                {SCENARIOS.map(s => { const on = JSON.stringify(weights) === JSON.stringify(s.w); return (
                  <button key={s.id} onClick={() => setWeights(s.w)} style={{ padding: "14px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center", border: on ? `2px solid ${T.green}` : `2px solid ${T.border}`, background: on ? T.greenPale : T.white, transition: "all 0.15s", fontFamily: "var(--body)" }}>
                    <div style={{ fontSize: 22, marginBottom: 2 }}>{s.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: on ? T.green : T.text }}>{s.label}</div>
                    <div style={{ fontSize: 9, color: T.textLight }}>{s.desc}</div>
                  </button>);
                })}
              </div>
              <div className="resp-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${scored.length}, 1fr)`, gap: 10 }}>
                {[...scored].sort((a, b) => b.score - a.score).map((a, rank) => (
                  <div key={a.i} style={{ padding: "12px 14px", borderRadius: 12, textAlign: "center", background: rank === 0 ? a.color.fg : T.warmGray, border: rank === 0 ? `2px solid ${a.color.bg}` : `1px solid ${T.border}` }}>
                    {rank === 0 && <div style={{ fontSize: 8, fontWeight: 700, color: a.color.bg, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Recommended</div>}
                    <div style={{ fontSize: 13, fontWeight: 700, color: a.color.bg }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: T.textLight }}>{a.rate}%</div>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--mono)", color: rank === 0 ? a.color.bg : T.text }}>{a.score}</div>
                    <div style={{ fontSize: 8, color: T.textLight }}>out of 100</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Cards */}
            <div className="resp-grid-2" style={{ display: "grid", gridTemplateColumns: `repeat(${analysis.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
              {analysis.map(a => (
                <div key={a.i} className="fade-up" style={{ background: a.i === best.i ? a.color.fg : T.white, border: `2px solid ${a.i === best.i ? a.color.bg : T.border}`, borderRadius: 14, padding: 16, position: "relative", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                  {a.i === best.i && <div style={{ position: "absolute", top: -1, right: 12, background: a.color.bg, color: "#fff", fontSize: 8, fontWeight: 700, padding: "3px 10px", borderRadius: "0 0 6px 6px", letterSpacing: "0.06em" }}>BEST</div>}
                  <div style={{ fontSize: 14, fontWeight: 700, color: a.color.bg, fontFamily: "var(--heading)" }}>{a.name}</div>
                  <div style={{ fontSize: 22, fontFamily: "var(--mono)", marginTop: 2 }}>{a.rate}%</div>
                  <div style={{ fontSize: 10, color: T.textLight, marginBottom: 8 }}>{fmt2(a.pi)}/mo</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    {[{ label: "Lender Fees", total: a.lf, items: a.b1, bg: "#DBEAFE", text: "#1E40AF" }, { label: "Points & Orig", total: a.pts, items: a.b4, bg: T.goldPale, text: "#92400E" }].map((bk, bi) => (
                      <div key={bi} style={{ padding: "6px 8px", background: bk.bg, borderRadius: 6 }}>
                        <div style={{ fontSize: 8, color: bk.text, textTransform: "uppercase", fontWeight: 600 }}>{bk.label}</div>
                        <div style={{ fontSize: 14, fontFamily: "var(--mono)", color: bk.text, fontWeight: 600 }}>{fmt(bk.total)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 6, padding: "6px 8px", background: T.warmGray, borderRadius: 6, textAlign: "center" }}>
                    <div style={{ fontSize: 8, color: T.textLight, textTransform: "uppercase" }}>Lender-Controlled Total</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: a.color.bg }}>{fmt(a.lc)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reputation */}
            <div className="fade-up" style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, padding: "24px 28px", marginBottom: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 22, fontFamily: "var(--heading)", marginBottom: 4, color: T.green }}>Loan Officer Reputation</div>
              <div style={{ fontSize: 12, color: T.textLight, marginBottom: 14 }}>Edit names below, then look up their online reviews</div>
              <div className="resp-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(analysis.length, 2)}, 1fr)`, gap: 12 }}>
                {analysis.map(a => { const key = `${a.officer}|${a.name}`; const rep = reps[key]; const isLoading = repLoading[key]; return (
                  <div key={a.i} style={{ padding: 14, background: T.warmGray, borderRadius: 12, borderLeft: `4px solid ${a.color.bg}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: a.color.bg, fontFamily: "var(--heading)", marginBottom: 8 }}>{a.name}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                      <input type="text" value={a.officer} onChange={e => handleEditOfficer(a.i, e.target.value)} placeholder="Enter loan officer name..." style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12, outline: "none", background: T.white, fontFamily: "var(--body)" }} />
                      {a.officer && !rep && <button onClick={() => handleLookupRep(a.officer, a.name)} disabled={isLoading} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: isLoading ? T.warmGray : T.white, cursor: isLoading ? "wait" : "pointer", fontSize: 10, whiteSpace: "nowrap", fontWeight: 600, color: T.green }}>{isLoading ? "Searching..." : "⭐ Look up"}</button>}
                    </div>
                    {rep && <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {rep.rating > 0 && <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--mono)" }}>{rep.rating.toFixed(1)}</span>}
                        {rep.rating > 0 && <div><div style={{ fontSize: 14, color: "#F59E0B" }}>{"★".repeat(Math.floor(rep.rating))}{"☆".repeat(5 - Math.floor(rep.rating))}</div><div style={{ fontSize: 10, color: T.textLight }}>{rep.reviewCount} reviews</div></div>}
                      </div>
                      <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.6, marginBottom: 6 }}>{rep.summary}</div>
                      {rep.highlights?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{rep.highlights.map((h, j) => <span key={j} style={{ fontSize: 9, padding: "2px 8px", background: T.greenPale, color: T.green, borderRadius: 10 }}>✓ {h}</span>)}</div>}
                    </div>}
                  </div>);
                })}
              </div>
            </div>

            {/* AI Chat */}
            <div style={{ marginBottom: 20 }}><AIChat analysis={analysis} horizon={horizon} /></div>

            {/* Breakeven */}
            <div className="fade-up" style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, padding: "24px 28px", marginBottom: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 22, fontFamily: "var(--heading)", marginBottom: 14, color: T.green }}>Breakeven Analysis</div>
              <div className="resp-flex" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {analysis.map(a => {
                  if (!baseline || a.rate === baseRate) return <div key={a.i} style={{ flex: 1, padding: 12, background: T.warmGray, borderRadius: 10, textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 600, color: a.color.bg }}>{a.rate}%</div><div style={{ fontSize: 10, color: T.textLight }}>Baseline</div></div>;
                  const sav = baseline.pi - a.pi, extra = a.lc - baseline.lc;
                  const mo = sav > 0 && extra > 0 ? Math.ceil(extra / sav) : null;
                  return <div key={a.i} style={{ flex: 1, padding: 12, background: T.warmGray, borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: a.color.bg }}>{a.rate}%</div>
                    {mo ? <><div style={{ fontSize: 10, color: T.textLight }}>Save {fmt2(sav)}/mo · {fmt(extra)} extra</div><div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)", color: mo <= horizon * 12 ? T.success : T.danger, marginTop: 4 }}>{(mo / 12).toFixed(1)} yrs</div><div style={{ fontSize: 9, color: mo <= horizon * 12 ? T.success : T.danger }}>{mo <= horizon * 12 ? "✓ Recovers" : "✗ Doesn't recover"}</div></> : <div style={{ fontSize: 10, color: T.textLight }}>Higher cost & payment</div>}
                  </div>;
                })}
              </div>
              <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}><th style={{ textAlign: "left", padding: "8px", fontSize: 10, textTransform: "uppercase", color: T.textLight }}>Horizon</th>{analysis.map(a => <th key={a.i} style={{ textAlign: "right", padding: "8px", fontSize: 10, color: a.color.bg }}>{a.rate}%</th>)}</tr></thead>
                <tbody>{[3, 5, 7, 10, 15].map(yr => { const costs = analysis.map(a => a.lc + a.pi * yr * 12); const mn = Math.min(...costs); return <tr key={yr} style={{ borderBottom: `1px solid ${T.warmGray}`, background: yr === horizon ? T.goldPale : "transparent", fontWeight: yr === horizon ? 700 : 400 }}><td style={{ padding: 8 }}>{yr} yr{yr === horizon ? " ←" : ""}</td>{costs.map((c, j) => <td key={j} style={{ textAlign: "right", padding: 8, fontFamily: "var(--mono)", color: c === mn ? T.success : T.text, fontWeight: c === mn ? 700 : 400 }}>{fmt(c)}{c === mn ? " ✓" : ""}</td>)}</tr>; })}</tbody>
              </table>
              </div>
            </div>

            {/* Bottom Line */}
            <div className="fade-up" style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, padding: "24px 28px", marginBottom: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.06)", fontSize: 14, lineHeight: 1.85, color: T.textMid }}>
              <div style={{ fontSize: 22, fontFamily: "var(--heading)", marginBottom: 12, color: T.green }}>The Bottom Line</div>
              {(() => {
                const lines = [];
                const sameRate = analysis.filter(a => a.rate === analysis[0].rate);
                if (sameRate.length >= 2) { const sorted = [...sameRate].sort((a, b) => a.lc - b.lc); const diff = sorted[sorted.length - 1].lc - sorted[0].lc; lines.push(`At ${sameRate[0].rate}%, ${sorted[0].name} has ${fmt(diff)} less in lender-controlled costs than ${sorted[sorted.length - 1].name}.`); }
                if (baseline && analysis.some(a => a.rate < baseline.rate)) { const lr = Math.min(...analysis.map(a => a.rate)); const lrq = analysis.find(a => a.rate === lr); const s = baseline.pi - lrq.pi, e = lrq.lc - baseline.lc; if (s > 0 && e > 0) lines.push(`Buying down from ${baseline.rate}% to ${lr}% saves ${fmt2(s)}/month but costs ${fmt(e)} more upfront. Breakeven: ~${(Math.ceil(e / s) / 12).toFixed(1)} years.`); }
                lines.push(`Over your ${horizon}-year horizon, ${best.name} at ${best.rate}% gives the best value at ${fmt(best.tc)} total cost.`);
                return lines.map((l, i) => <p key={i} style={{ margin: "0 0 8px" }}>{l}</p>);
              })()}
            </div>
          </div>
        )}

        {/* ━━ ASK TAB ━━ */}
        {tab === "ask" && (hasData ? <AIChat analysis={analysis} horizon={horizon} /> : <div style={{ textAlign: "center", padding: 60, color: T.textLight }}>Upload at least two quotes first to use the AI advisor.</div>)}

        {/* ━━ DETAIL TAB ━━ */}
        {tab === "detailed" && (
          <div>
            <div className="resp-flex" style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              {quotes.map((q, i) => <QuoteCard key={i} quote={q} index={i} onChange={handleQuoteChange} onRemove={handleRemove} canRemove={quotes.length > 2} />)}
            </div>
            {quotes.length < 4 && <button onClick={handleAdd} style={{ marginTop: 14, padding: "14px 24px", borderRadius: 12, border: `2px dashed ${T.border}`, background: T.white, cursor: "pointer", width: "100%", fontSize: 13, fontWeight: 600, color: T.textLight }}>+ Add Another Quote</button>}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${T.border}`, padding: "20px 24px", textAlign: "center", background: T.white }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ fontSize: 14, fontFamily: "var(--heading)", color: T.green, marginBottom: 4 }}>⚖️ MortgageCompare</div>
          <div style={{ fontSize: 10, color: T.textLight, lineHeight: 1.6 }}>Estimates for comparison only. Obtain official Loan Estimates before choosing a loan. Not affiliated with any lender.</div>
        </div>
      </footer>
    </div>
  );
}
