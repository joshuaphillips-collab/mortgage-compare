import { useState, useMemo, useCallback, useRef } from "react";

// ─── Helpers ───
const num = (v) => { const n = parseFloat(String(v).replace(/[,$]/g, "")); return isNaN(n) ? 0 : n; };
const fmt = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt2 = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLORS = [
  { bg: "#0C2E24", fg: "#E8F5EE", accent: "#34D399" },
  { bg: "#7C2D12", fg: "#FFF7ED", accent: "#FB923C" },
  { bg: "#1E3A5F", fg: "#EFF6FF", accent: "#60A5FA" },
  { bg: "#581C87", fg: "#FAF5FF", accent: "#C084FC" },
];

const EMPTY_QUOTE = () => ({
  lenderName: "", loanOfficer: "", loanProgram: "Conventional",
  loanAmount: "", rate: "", term: 30, purchasePrice: "", cashToClose: "",
  processingFee: "", underwritingFee: "", adminFee: "", docPrepFee: "",
  loanOriginationFee: "", techBundleFee: "", otherLenderFees: "",
  discountPoints: "", originationFeePoints: "",
  appraisalFee: "", creditReport: "", titleFees: "", closingFee: "",
  closingCoordFee: "", ownersTitleIns: "", lendersTitleIns: "",
  titleServices: "", otherThirdParty: "",
  homeownersInsAnnual: "", homeownersInsEscrow: "", propertyTaxEscrow: "",
  prepaidInterest: "", mortgageInsurance: "", otherEscrows: "",
  mipUpfront: "", fundingFee: "", sellerCredit: "",
});

const calcPI = (amt, ratePct, termYrs) => {
  const r = ratePct / 100 / 12, n = termYrs * 12;
  if (r === 0) return amt / n;
  return (amt * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
};

const bucket = (q, b) => {
  if (b === 1) return num(q.processingFee) + num(q.underwritingFee) + num(q.adminFee) + num(q.docPrepFee);
  if (b === 4) return num(q.discountPoints) + num(q.originationFeePoints) + num(q.loanOriginationFee);
  if (b === 2) return num(q.appraisalFee) + num(q.creditReport) + num(q.titleFees) + num(q.closingFee) + num(q.closingCoordFee) + num(q.ownersTitleIns) + num(q.lendersTitleIns) + num(q.titleServices) + num(q.otherThirdParty) + num(q.techBundleFee) + num(q.otherLenderFees);
  if (b === 3) return num(q.homeownersInsAnnual) + num(q.homeownersInsEscrow) + num(q.propertyTaxEscrow) + num(q.prepaidInterest) + num(q.mortgageInsurance) + num(q.otherEscrows) + num(q.mipUpfront) + num(q.fundingFee);
  return 0;
};

// Detailed breakdown for each bucket (for click-to-expand)
const bucketBreakdown = (q, b) => {
  const items = [];
  const add = (label, field) => { const v = num(q[field]); if (v > 0) items.push({ label, value: v }); };
  if (b === 1) {
    add("Processing Fee", "processingFee");
    add("Underwriting Fee", "underwritingFee");
    add("Admin Fee", "adminFee");
    add("Doc Prep Fee", "docPrepFee");
  } else if (b === 4) {
    add("Discount Points", "discountPoints");
    add("Origination Fee Points", "originationFeePoints");
    add("Loan Origination Fee", "loanOriginationFee");
  } else if (b === 2) {
    add("Appraisal Fee", "appraisalFee");
    add("Credit Report", "creditReport");
    add("Title Fees", "titleFees");
    add("Closing Fee", "closingFee");
    add("Closing Coord Fee", "closingCoordFee");
    add("Owner's Title Ins", "ownersTitleIns");
    add("Lender's Title Ins", "lendersTitleIns");
    add("Title Services", "titleServices");
    add("Tech Bundle Fee", "techBundleFee");
    add("Other (VOE, recording, etc.)", "otherLenderFees");
    add("Other Third Party", "otherThirdParty");
  } else if (b === 3) {
    add("Homeowner's Ins (annual)", "homeownersInsAnnual");
    add("Homeowner's Ins Escrow", "homeownersInsEscrow");
    add("Property Tax Escrow", "propertyTaxEscrow");
    add("Prepaid Interest", "prepaidInterest");
    add("Mortgage Insurance", "mortgageInsurance");
    add("Other Escrows", "otherEscrows");
    add("MIP Upfront", "mipUpfront");
    add("Funding Fee", "fundingFee");
  }
  return items;
};

const lenderControlled = (q) => bucket(q, 1) + bucket(q, 4);

// ─── Smart Alerts ───
function detectAlerts(quotes) {
  const alerts = [];
  const valid = quotes.filter(q => num(q.loanAmount) > 0);
  if (valid.length < 2) return alerts;
  const hazardVals = valid.map(q => ({ name: q.lenderName, val: num(q.homeownersInsAnnual) })).filter(h => h.val > 0);
  if (hazardVals.length >= 2) {
    const sorted = [...hazardVals].sort((a, b) => a.val - b.val);
    if ((sorted[sorted.length - 1].val - sorted[0].val) / sorted[sorted.length - 1].val > 0.2)
      alerts.push({ type: "warning", title: "Hazard Insurance Estimates Differ", detail: `${sorted[0].name} estimates ${fmt(sorted[0].val)}/yr vs ${sorted[sorted.length - 1].name} at ${fmt(sorted[sorted.length - 1].val)}/yr. The actual cost depends on the policy you choose, not the lender. This makes one total payment look cheaper but it's not a real savings.` });
  }
  const loanAmts = [...new Set(valid.map(q => num(q.loanAmount)))];
  if (loanAmts.length > 1)
    alerts.push({ type: "critical", title: "Loan Amounts Don't Match", detail: `Quotes show different loan amounts (${loanAmts.map(fmt).join(" vs ")}). This makes direct comparison misleading.` });
  valid.forEach(q => {
    if (num(q.loanOriginationFee) > 0 && num(q.underwritingFee) === 0)
      alerts.push({ type: "info", title: `${q.lenderName || "A lender"} bundles fees into Origination`, detail: `Their origination fee (${fmt(num(q.loanOriginationFee))}) covers what others itemize separately. Compare lender fee totals, not individual line items.` });
  });
  return alerts;
}

// ─── AI Document Extraction ───
const EXTRACTION_PROMPT = `You are analyzing a mortgage document (Loan Estimate, Itemization Worksheet, or similar closing cost estimate). Extract all fees and loan details into the following JSON structure. Use numbers only (no $ signs or commas). If a field is not found or is zero, use empty string "".

Return ONLY valid JSON, no markdown backticks, no explanation:
{
  "lenderName": "",
  "loanOfficer": "",
  "loanAmount": "",
  "rate": "",
  "term": 30,
  "purchasePrice": "",
  "cashToClose": "",
  "sellerCredit": "",
  "processingFee": "",
  "underwritingFee": "",
  "adminFee": "",
  "docPrepFee": "",
  "loanOriginationFee": "",
  "techBundleFee": "",
  "otherLenderFees": "",
  "discountPoints": "",
  "originationFeePoints": "",
  "appraisalFee": "",
  "creditReport": "",
  "closingFee": "",
  "closingCoordFee": "",
  "ownersTitleIns": "",
  "lendersTitleIns": "",
  "titleServices": "",
  "otherThirdParty": "",
  "homeownersInsAnnual": "",
  "homeownersInsEscrow": "",
  "propertyTaxEscrow": "",
  "prepaidInterest": "",
  "mortgageInsurance": "",
  "otherEscrows": ""
}

IMPORTANT MAPPING RULES:
- "Processing Fee" → processingFee (LENDER FEE)
- "Underwriting Fee" or "UW Fee" → underwritingFee (LENDER FEE)
- "Admin Fee" or "Doc Prep Fee" → adminFee (LENDER FEE)
- "Discount Points" or "Loan Discount/Credits/Adjustments" → discountPoints (POINTS)
- "Loan Origination Fee" or "Loan Origination 1.000%" → loanOriginationFee (POINTS — a 1% origination fee is functionally the same as 1 point)
- "Technology Bundle Fee" → techBundleFee (THIRD PARTY)
- "Verification of Employment" or "Tax Monitoring Service Fee" or other small service fees → otherLenderFees (THIRD PARTY)
- "Appraisal Fee" → appraisalFee
- "Credit Report" → creditReport
- "Closing Fee" or "Closing/Escrow" or "Settlement Fee" → closingFee
- "Closing Coordination Fee" → closingCoordFee
- "Owner's Title" or "Owner's Title Insurance" → ownersTitleIns
- "Lender's Title" or "Lender's Title Insurance" or just "Title Insurance" (if only one) → lendersTitleIns
- "Title Insurance Services" → titleServices
- All other third party fees (recording, transfer taxes, intangible tax, abstracting, doc prep, title exam, flood cert, inspection fees, closing protection letter) → sum into otherThirdParty
- "Homeowner's Insurance" annual premium → homeownersInsAnnual
- "Homeowner's Insurance" escrow months → homeownersInsEscrow
- "Property Taxes" escrow → propertyTaxEscrow
- "Prepaid Interest" or "Daily Interest" → prepaidInterest
- "Mortgage Insurance" or "MI" monthly/annual → mortgageInsurance
- For the interest rate, extract just the number (e.g., "5.125" not "5.125%")
- "Purchase Price" or "Purchase Price/Payoff" → purchasePrice
- "Cash From Borrower" or "Cash TO(-)/FROM Borrower" → cashToClose
- "Seller Credit" or "SellerCredit" or "Other Credits" → sellerCredit`;

async function extractFromDocument(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const isPdf = file.type === "application/pdf";
  const mediaType = isPdf ? "application/pdf" : file.type;

  const content = [
    {
      type: isPdf ? "document" : "image",
      source: { type: "base64", media_type: mediaType, data: base64 }
    },
    { type: "text", text: "Extract all mortgage fees and loan details from this document." }
  ];

  const response = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });

  const data = await response.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

// ─── Reputation Lookup ───
const REPUTATION_PROMPT = `You are researching a mortgage loan officer's reputation. Based on the search results, provide a JSON summary. Return ONLY valid JSON, no markdown, no explanation:
{
  "rating": 0.0,
  "reviewCount": 0,
  "summary": "Brief 2-3 sentence summary of their reputation",
  "highlights": ["positive highlight 1", "positive highlight 2"],
  "concerns": ["any concern if found"],
  "sources": ["source name 1", "source name 2"]
}
Rules:
- rating: average star rating found (out of 5.0). If multiple sources, weight by review count.
- reviewCount: total reviews found across all sources
- summary: professional, factual summary of what reviewers say
- highlights: 2-3 most common positive themes (e.g. "responsive communication", "smooth closing process")
- concerns: any negative themes. Empty array if none found.
- sources: where the reviews were found (e.g. "Google Reviews", "Zillow", "SocialSurvey")`;

async function lookupReputation(loanOfficer, lenderName) {
  const query = `${loanOfficer} ${lenderName} mortgage loan officer reviews`;
  const response = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: REPUTATION_PROMPT,
      messages: [{ role: "user", content: `Search for reviews and reputation information about this loan officer: ${loanOfficer} at ${lenderName}. Find their star ratings, review counts, and what customers say about them.` }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  const data = await response.json();
  const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

// ─── Priority Weighting ───
function computeWeightedScore(analysis, weights, reputations) {
  if (analysis.length === 0) return [];
  const { costWeight, paymentWeight, cashWeight, reputationWeight } = weights;
  const totalWeight = costWeight + paymentWeight + cashWeight + reputationWeight;
  if (totalWeight === 0) return analysis.map(a => ({ ...a, score: 50 }));

  const normalize = (vals) => {
    const min = Math.min(...vals), max = Math.max(...vals);
    if (max === min) return vals.map(() => 100);
    return vals.map(v => 100 - ((v - min) / (max - min)) * 100); // lower = better
  };

  const tcScores = normalize(analysis.map(a => a.tc));
  const piScores = normalize(analysis.map(a => a.pi));
  const cashScores = normalize(analysis.map(a => a.cash > 0 ? a.cash : a.lc)); // use actual cash if available, else lender-controlled

  const repScores = analysis.map(a => {
    const rep = reputations[`${a.officer}|${a.name}`];
    if (!rep) return 50; // neutral default
    return (rep.rating / 5) * 100;
  });

  return analysis.map((a, i) => ({
    ...a,
    score: Math.round(
      (tcScores[i] * costWeight +
        piScores[i] * paymentWeight +
        cashScores[i] * cashWeight +
        repScores[i] * reputationWeight) / totalWeight
    ),
    repScore: repScores[i],
    dimensionScores: { cost: Math.round(tcScores[i]), payment: Math.round(piScores[i]), cash: Math.round(cashScores[i]), reputation: Math.round(repScores[i]) },
  }));
}

// ─── Preloaded Data ───
const SANDERSON = [
  { ...EMPTY_QUOTE(), lenderName: "Churchill Mortgage", loanOfficer: "Joshua Phillips", purchasePrice: "408000", loanAmount: "326400", rate: "5.125", cashToClose: "93038.52", sellerCredit: "15000", processingFee: "749", underwritingFee: "849", techBundleFee: "340", otherLenderFees: "332", discountPoints: "13872", appraisalFee: "695", creditReport: "60", closingFee: "600", closingCoordFee: "125", ownersTitleIns: "1471", lendersTitleIns: "1150", titleServices: "590", otherThirdParty: "1557", homeownersInsAnnual: "1800", homeownersInsEscrow: "450", propertyTaxEscrow: "1625", prepaidInterest: "183.32" },
  { ...EMPTY_QUOTE(), lenderName: "Churchill Mortgage", loanOfficer: "Joshua Phillips", purchasePrice: "408000", loanAmount: "326400", rate: "5.375", cashToClose: "89783.46", sellerCredit: "15000", processingFee: "749", underwritingFee: "849", techBundleFee: "340", otherLenderFees: "332", discountPoints: "10608", appraisalFee: "695", creditReport: "60", closingFee: "600", closingCoordFee: "125", ownersTitleIns: "1471", lendersTitleIns: "1150", titleServices: "590", otherThirdParty: "1557", homeownersInsAnnual: "1800", homeownersInsEscrow: "450", propertyTaxEscrow: "1625", prepaidInterest: "192.26" },
  { ...EMPTY_QUOTE(), lenderName: "Churchill Mortgage", loanOfficer: "Joshua Phillips", purchasePrice: "408000", loanAmount: "326400", rate: "5.625", cashToClose: "86528.41", sellerCredit: "15000", processingFee: "749", underwritingFee: "849", techBundleFee: "340", otherLenderFees: "332", discountPoints: "7344", appraisalFee: "695", creditReport: "60", closingFee: "600", closingCoordFee: "125", ownersTitleIns: "1471", lendersTitleIns: "1150", titleServices: "590", otherThirdParty: "1557", homeownersInsAnnual: "1800", homeownersInsEscrow: "450", propertyTaxEscrow: "1625", prepaidInterest: "201.21" },
  { ...EMPTY_QUOTE(), lenderName: "Queensborough Natl Bank", loanOfficer: "Jennifer Neal", purchasePrice: "408000", loanAmount: "326400", rate: "5.125", cashToClose: "90677.32", sellerCredit: "15000", loanOriginationFee: "3264", processingFee: "1000", otherLenderFees: "83", discountPoints: "11424", appraisalFee: "550", creditReport: "250", closingFee: "740", ownersTitleIns: "1134", lendersTitleIns: "700", otherThirdParty: "2414", homeownersInsAnnual: "780", homeownersInsEscrow: "195", propertyTaxEscrow: "1360", prepaidInterest: "183.32" },
];

// ─── UI Components ───
function Input({ label, value, onChange, prefix, suffix, placeholder, wide }) {
  return (
    <div style={{ flex: wide ? "1 1 100%" : "1 1 120px" }}>
      {label && <label style={{ display: "block", fontSize: 10, fontFamily: "var(--body)", color: "var(--muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>}
      <div style={{ display: "flex", alignItems: "center", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 8px" }}>
        {prefix && <span style={{ color: "var(--muted)", fontSize: 12, marginRight: 3, fontFamily: "var(--mono)" }}>{prefix}</span>}
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ""} style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: 13, fontFamily: "var(--mono)", color: "var(--text)" }} />
        {suffix && <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 3 }}>{suffix}</span>}
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
        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "var(--body)", color: "var(--text)" }}>{title}</span>
        <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 8, background: controlled ? "#DBEAFE" : "#F3F4F6", color: controlled ? "#1E40AF" : "#6B7280" }}>{controlled ? "Lender" : "Market"}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", paddingLeft: 26 }}>{children}</div>
    </div>
  );
}

// ─── Upload Component ───
function DocumentUpload({ quoteIndex, onExtracted }) {
  const [status, setStatus] = useState("idle"); // idle | uploading | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      setStatus("error");
      setErrorMsg("Please upload a PDF or image file (PNG, JPG, WebP)");
      return;
    }
    setStatus("uploading");
    setErrorMsg("");
    try {
      const extracted = await extractFromDocument(file);
      onExtracted(quoteIndex, { ...EMPTY_QUOTE(), ...extracted, loanProgram: "Conventional", term: extracted.term || 30 });
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setErrorMsg("Could not extract data. Try a clearer image or different format. Error: " + err.message);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <input ref={fileRef} type="file" accept=".pdf,image/*" capture="environment" onChange={e => handleFile(e.target.files?.[0])} style={{ display: "none" }} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={status === "uploading"}
        style={{
          width: "100%", padding: "10px 16px", borderRadius: 8,
          border: status === "success" ? "2px solid #059669" : status === "error" ? "2px solid #DC2626" : "2px dashed #D1D5DB",
          background: status === "uploading" ? "#F3F4F6" : status === "success" ? "#ECFDF5" : "#fff",
          cursor: status === "uploading" ? "wait" : "pointer",
          fontSize: 13, fontFamily: "var(--body)", color: status === "success" ? "#059669" : status === "error" ? "#DC2626" : "var(--muted)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "all 0.3s",
        }}
      >
        {status === "idle" && <><span>📄</span> Upload Loan Estimate or Quote (PDF / Photo)</>}
        {status === "uploading" && <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> Extracting data with AI...</>}
        {status === "success" && <><span>✅</span> Data extracted successfully!</>}
        {status === "error" && <><span>❌</span> {errorMsg}</>}
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Quote Card ───
function QuoteCard({ quote, index, onChange, onRemove, canRemove }) {
  const c = COLORS[index % 4];
  const up = field => val => onChange(index, { ...quote, [field]: val });
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", borderTop: `4px solid ${c.bg}`, padding: "14px 16px", flex: "1 1 270px", minWidth: 270, position: "relative" }}>
      {canRemove && <button onClick={() => onRemove(index)} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18 }}>×</button>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.bg }} />
        <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--body)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Quote {index + 1}</span>
      </div>

      <DocumentUpload quoteIndex={index} onExtracted={onChange} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", marginBottom: 8 }}>
        <Input label="Lender" value={quote.lenderName} onChange={up("lenderName")} />
        <Input label="Loan Officer" value={quote.loanOfficer} onChange={up("loanOfficer")} />
        <div style={{ flex: "1 1 120px" }}>
          <label style={{ display: "block", fontSize: 10, fontFamily: "var(--body)", color: "var(--muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Loan Program</label>
          <select value={quote.loanProgram} onChange={e => onChange(index, { ...quote, loanProgram: e.target.value })}
            style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid var(--border)", fontSize: 12, fontFamily: "var(--body)", background: "var(--input-bg)", color: "var(--text)" }}>
            <option value="Conventional">Conventional</option>
            <option value="FHA">FHA</option>
            <option value="VA">VA</option>
            <option value="USDA">USDA</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", marginBottom: 8 }}>
        <Input label="Purchase Price" value={quote.purchasePrice} onChange={up("purchasePrice")} prefix="$" />
        <Input label="Loan Amount" value={quote.loanAmount} onChange={up("loanAmount")} prefix="$" />
        <Input label="Rate" value={quote.rate} onChange={up("rate")} suffix="%" />
        <Input label="Term" value={quote.term} onChange={v => onChange(index, { ...quote, term: parseInt(v) || 30 })} suffix="yr" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", marginBottom: 8 }}>
        <Input label="Cash to Close" value={quote.cashToClose} onChange={up("cashToClose")} prefix="$" />
        <Input label="Seller Credit" value={quote.sellerCredit} onChange={up("sellerCredit")} prefix="$" />
      </div>
      <BucketGroup title="Lender Fees" bucketNum={1} controlled>
        <Input label="Processing" value={quote.processingFee} onChange={up("processingFee")} prefix="$" />
        <Input label="Underwriting" value={quote.underwritingFee} onChange={up("underwritingFee")} prefix="$" />
        <Input label="Admin/Doc Prep" value={quote.adminFee} onChange={up("adminFee")} prefix="$" />
      </BucketGroup>
      <BucketGroup title="Points & Origination" bucketNum={4} controlled>
        <Input label="Discount Points" value={quote.discountPoints} onChange={up("discountPoints")} prefix="$" />
        <Input label="Origination Fee" value={quote.loanOriginationFee} onChange={up("loanOriginationFee")} prefix="$" />
        <Input label="Other Point Fees" value={quote.originationFeePoints} onChange={up("originationFeePoints")} prefix="$" />
      </BucketGroup>
      <BucketGroup title="Third-Party Fees" bucketNum={2}>
        <Input label="Appraisal" value={quote.appraisalFee} onChange={up("appraisalFee")} prefix="$" />
        <Input label="Credit Report" value={quote.creditReport} onChange={up("creditReport")} prefix="$" />
        <Input label="Closing Fee" value={quote.closingFee} onChange={up("closingFee")} prefix="$" />
        <Input label="Owner's Title" value={quote.ownersTitleIns} onChange={up("ownersTitleIns")} prefix="$" />
        <Input label="Lender's Title" value={quote.lendersTitleIns} onChange={up("lendersTitleIns")} prefix="$" />
        <Input label="Title Svcs" value={quote.titleServices} onChange={up("titleServices")} prefix="$" />
        <Input label="Tech Bundle" value={quote.techBundleFee} onChange={up("techBundleFee")} prefix="$" />
        <Input label="VOE/Other" value={quote.otherLenderFees} onChange={up("otherLenderFees")} prefix="$" />
        <Input label="Other 3rd Party" value={quote.otherThirdParty} onChange={up("otherThirdParty")} prefix="$" />
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

// ─── Alert Banner ───
function AlertBanner({ alerts }) {
  if (!alerts.length) return null;
  const cfg = { critical: { icon: "🚨", bg: "#FEF2F2", border: "#FECACA", text: "#991B1B" }, warning: { icon: "⚠️", bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" }, info: { icon: "💡", bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
      {alerts.map((a, i) => {
        const s = cfg[a.type];
        return (
          <div key={i} style={{ padding: "10px 14px", background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, display: "flex", gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.text, fontFamily: "var(--body)" }}>{a.title}</div>
              <div style={{ fontSize: 11, color: s.text, fontFamily: "var(--body)", opacity: 0.85, lineHeight: 1.5 }}>{a.detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PDF Export ───
function generatePDFHTML(quotes, constraints, alerts, analysis, bestTC, baseline, reputations, scored) {
  const horizon = num(constraints.timeHorizon) || 7;
  const months = horizon * 12;

  const alertsHTML = alerts.map(a => `<div style="padding:8px 12px;background:${a.type === 'warning' ? '#FFFBEB' : a.type === 'critical' ? '#FEF2F2' : '#EFF6FF'};border-radius:6px;margin-bottom:6px;font-size:11px;"><strong>${a.title}:</strong> ${a.detail}</div>`).join("");

  const compRows = analysis.map(a => `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:8px;font-weight:600;color:${a.color.bg}">${a.name}<br/><span style="font-weight:400;font-size:11px;color:#666">${a.officer || ""}</span></td>
      <td style="padding:8px;text-align:center;font-family:monospace">${a.rate}%</td>
      <td style="padding:8px;text-align:right;font-family:monospace">${fmt2(a.pi)}</td>
      <td style="padding:8px;text-align:right;font-family:monospace">${fmt(a.lf)}</td>
      <td style="padding:8px;text-align:right;font-family:monospace">${fmt(a.pts)}</td>
      <td style="padding:8px;text-align:right;font-family:monospace;font-weight:700">${fmt(a.lc)}</td>
      <td style="padding:8px;text-align:right;font-family:monospace">${a.cash > 0 ? fmt(a.cash) : "—"}</td>
      <td style="padding:8px;text-align:right;font-family:monospace;font-weight:700">${fmt(a.tc)}</td>
    </tr>`).join("");

  const horizonRows = [3, 5, 7, 10, 15].map(yr => {
    const costs = analysis.map(a => a.lc + a.pi * yr * 12);
    const minC = Math.min(...costs);
    return `<tr style="border-bottom:1px solid #eee;${yr === horizon ? 'background:#FEF2F2;font-weight:700' : ''}">
      <td style="padding:6px 8px">${yr} Years ${yr === horizon ? '← Your horizon' : ''}</td>
      ${costs.map((c, j) => `<td style="padding:6px 8px;text-align:right;font-family:monospace;${c === minC ? 'color:#059669;font-weight:700' : ''}">${fmt(c)}${c === minC ? ' ✓' : ''}</td>`).join("")}
    </tr>`;
  }).join("");

  const breakevenCards = analysis.map(a => {
    if (!baseline || a.i === baseline.i) return `<div style="flex:1;padding:12px;background:#f5f5f5;border-radius:8px;text-align:center"><div style="font-weight:600;color:${a.color.bg};margin-bottom:6px">${a.name} (${a.rate}%)</div><div style="color:#888">Baseline</div></div>`;
    const sav = baseline.pi - a.pi;
    const extra = a.lc - baseline.lc;
    const mo = sav > 0 && extra > 0 ? Math.ceil(extra / sav) : null;
    return `<div style="flex:1;padding:12px;background:#f5f5f5;border-radius:8px;text-align:center">
      <div style="font-weight:600;color:${a.color.bg};margin-bottom:6px">${a.name} (${a.rate}%)</div>
      ${mo ? `<div style="font-size:24px;font-weight:700;font-family:monospace">${(mo / 12).toFixed(1)}</div><div style="font-size:11px;color:#888">years to breakeven</div><div style="font-size:10px;color:#888;margin-top:4px">Saves ${fmt2(sav)}/mo · Costs ${fmt(extra)} more</div>` : `<div style="color:#059669;font-weight:600">Lower cost ✓</div>`}
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; font-size: 12px; }
    h1 { font-size: 22px; color: #0C2E24; margin: 0 0 4px; }
    h2 { font-size: 15px; color: #0C2E24; margin: 20px 0 8px; border-bottom: 2px solid #0C2E24; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #374151; color: #fff; padding: 8px; text-align: right; font-size: 10px; text-transform: uppercase; }
    th:first-child { text-align: left; }
    .winner { background: linear-gradient(135deg, #0C2E24, #1a5741); color: #fff; padding: 20px; border-radius: 10px; margin: 16px 0; }
    .winner h3 { margin: 0 0 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.7; }
    .winner .name { font-size: 24px; margin-bottom: 4px; }
    .winner .stats { display: flex; gap: 24px; margin-top: 12px; }
    .winner .stat-label { font-size: 9px; text-transform: uppercase; opacity: 0.6; }
    .winner .stat-val { font-size: 16px; font-family: monospace; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 9px; color: #999; }
  </style></head><body>
    <h1>⚖️ MortgageCompare Report</h1>
    <div style="color:#666;margin-bottom:16px">Generated ${new Date().toLocaleDateString()} · ${horizon}-year time horizon</div>

    ${alertsHTML ? `<h2>⚠️ Alerts</h2>${alertsHTML}` : ""}

    <div class="winner">
      <h3>Best Overall — ${horizon} Year Horizon</h3>
      <div class="name">${bestTC.name}</div>
      ${bestTC.officer ? `<div style="opacity:0.75">with ${bestTC.officer}</div>` : ""}
      <div class="stats">
        <div><div class="stat-label">Rate</div><div class="stat-val">${bestTC.rate}%</div></div>
        <div><div class="stat-label">Monthly P&I</div><div class="stat-val">${fmt2(bestTC.pi)}</div></div>
        <div><div class="stat-label">Lender-Controlled</div><div class="stat-val">${fmt(bestTC.lc)}</div></div>
        <div><div class="stat-label">Total Cost (${horizon}yr)</div><div class="stat-val">${fmt(bestTC.tc)}</div></div>
      </div>
    </div>

    <h2>Side-by-Side Comparison</h2>
    <table>
      <thead><tr><th style="text-align:left">Lender</th><th>Rate</th><th>Monthly P&I</th><th>Lender Fees</th><th>Points</th><th>Lender-Controlled</th><th>Cash to Close</th><th>Total (${horizon}yr)</th></tr></thead>
      <tbody>${compRows}</tbody>
    </table>

    ${Object.keys(reputations || {}).length > 0 ? `
    <h2>⭐ Loan Officer Reputation</h2>
    <div style="display:flex;gap:10px;margin:10px 0">
      ${analysis.filter(a => a.officer).map(a => {
        const rep = (reputations || {})[`${a.officer}|${a.name}`];
        if (!rep) return `<div style="flex:1;padding:12px;background:#f5f5f5;border-radius:8px;text-align:center"><div style="font-weight:600;color:${a.color.bg}">${a.officer}</div><div style="font-size:11px;color:#888">${a.name}</div><div style="color:#999;margin-top:6px">No data found</div></div>`;
        return `<div style="flex:1;padding:12px;background:#f5f5f5;border-radius:8px;border-left:4px solid ${a.color.bg}">
          <div style="font-weight:600;color:${a.color.bg};margin-bottom:4px">${a.officer} — ${a.name}</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace">${rep.rating.toFixed(1)} ${"★".repeat(Math.floor(rep.rating))}${"☆".repeat(5 - Math.floor(rep.rating))}</div>
          <div style="font-size:10px;color:#888;margin-bottom:6px">${rep.reviewCount} reviews · ${(rep.sources || []).join(", ")}</div>
          <div style="font-size:11px;color:#333;line-height:1.5">${rep.summary}</div>
          ${rep.highlights?.length ? `<div style="margin-top:6px">${rep.highlights.map(h => `<span style="display:inline-block;font-size:9px;padding:2px 8px;background:#ECFDF5;color:#065F46;border-radius:10px;margin:2px">✓ ${h}</span>`).join("")}</div>` : ""}
        </div>`;
      }).join("")}
    </div>` : ""}

    ${scored && scored.length > 0 ? `
    <h2>🎯 Weighted Score</h2>
    <div style="display:flex;gap:10px;margin:10px 0">
      ${[...scored].sort((a, b) => b.score - a.score).map((a, rank) => `
        <div style="flex:1;padding:12px;background:${rank === 0 ? '#ECFDF5' : '#f5f5f5'};border-radius:8px;text-align:center;border:${rank === 0 ? '2px solid #059669' : '1px solid #ddd'}">
          <div style="font-size:11px;font-weight:600;color:${a.color.bg}">#${rank + 1} ${a.name}</div>
          <div style="font-size:28px;font-weight:700;font-family:monospace;color:${rank === 0 ? '#059669' : '#333'}">${a.score}</div>
          <div style="font-size:9px;color:#888">out of 100</div>
        </div>`).join("")}
    </div>` : ""}

    <h2>Breakeven Analysis</h2>
    <div style="display:flex;gap:10px;margin:10px 0">${breakevenCards}</div>

    <h2>Total Cost at Different Time Horizons</h2>
    <table>
      <thead><tr><th style="text-align:left">Horizon</th>${analysis.map(a => `<th>${a.name}<br/>${a.rate}%</th>`).join("")}</tr></thead>
      <tbody>${horizonRows}</tbody>
    </table>

    <h2>Understanding the 4 Buckets</h2>
    <div style="display:flex;gap:10px;margin:10px 0">
      <div style="flex:1;padding:10px;background:#DBEAFE;border-radius:8px"><strong style="color:#1E40AF">① Lender Fees</strong><br/>Processing and underwriting — the lender's core fees</div>
      <div style="flex:1;padding:10px;background:#FEF3C7;border-radius:8px"><strong style="color:#92400E">④ Points & Origination</strong><br/>Discount points AND origination fees — a 1% origination fee is the same as 1 point</div>
      <div style="flex:1;padding:10px;background:#F3F4F6;border-radius:8px"><strong style="color:#374151">② Third-Party</strong><br/>Appraisal, title, tech services, recording — roughly similar across lenders</div>
      <div style="flex:1;padding:10px;background:#ECFDF5;border-radius:8px"><strong style="color:#059669">③ Escrows</strong><br/>Insurance, taxes, prepaid interest — market-driven, not lender-driven</div>
    </div>

    <div class="footer">
      This comparison is for educational purposes and based on estimates provided. Actual costs may vary. Rate, points, and fees can change daily.
      Always obtain official Loan Estimates before making a decision. Generated by MortgageCompare.
    </div>
  </body></html>`;
}

// ─── Reputation Card ───
function ReputationCard({ rep, name, color }) {
  if (!rep) return null;
  const starsFull = Math.floor(rep.rating);
  const starsHalf = rep.rating - starsFull >= 0.3;
  return (
    <div style={{ padding: 14, background: "#fff", borderRadius: 10, border: `1px solid var(--border)`, borderLeft: `4px solid ${color.bg}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: color.bg, fontFamily: "var(--body)", marginBottom: 8 }}>{name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text)" }}>{rep.rating.toFixed(1)}</div>
        <div>
          <div style={{ fontSize: 14, letterSpacing: 1 }}>
            {"★".repeat(starsFull)}{starsHalf ? "½" : ""}{"☆".repeat(5 - starsFull - (starsHalf ? 1 : 0))}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>{rep.reviewCount} reviews</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.6, marginBottom: 8 }}>{rep.summary}</div>
      {rep.highlights?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {rep.highlights.map((h, i) => (
            <span key={i} style={{ fontSize: 9, padding: "2px 8px", background: "#ECFDF5", color: "#065F46", borderRadius: 10 }}>✓ {h}</span>
          ))}
        </div>
      )}
      {rep.concerns?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {rep.concerns.map((c, i) => (
            <span key={i} style={{ fontSize: 9, padding: "2px 8px", background: "#FEF2F2", color: "#991B1B", borderRadius: 10 }}>⚠ {c}</span>
          ))}
        </div>
      )}
      {rep.sources?.length > 0 && (
        <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 6 }}>Sources: {rep.sources.join(", ")}</div>
      )}
    </div>
  );
}

// ─── Expandable Bucket Breakdown ───
function ExpandableBucket({ label, total, items, bgColor, textColor, borderColor }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ padding: "5px 6px", background: bgColor, borderRadius: 5, cursor: "pointer", position: "relative" }}
      onClick={() => setExpanded(!expanded)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 8, color: textColor, textTransform: "uppercase" }}>{label}</div>
        <span style={{ fontSize: 8, color: textColor, opacity: 0.6 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: borderColor || textColor }}>{fmt(total)}</div>
      {expanded && items.length > 0 && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${borderColor || textColor}22` }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: textColor, opacity: 0.85, padding: "1px 0" }}>
              <span>{item.label}</span>
              <span style={{ fontFamily: "var(--mono)" }}>{fmt(item.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Priority Scenarios (replaces confusing sliders) ───
const PRIORITY_SCENARIOS = [
  { id: "balanced", label: "Balanced", desc: "Best overall value", icon: "⚖️", weights: { costWeight: 5, paymentWeight: 3, cashWeight: 3, reputationWeight: 4 } },
  { id: "lowest_cost", label: "Lowest Total Cost", desc: "Best deal long-term", icon: "💰", weights: { costWeight: 10, paymentWeight: 0, cashWeight: 0, reputationWeight: 2 } },
  { id: "lowest_payment", label: "Lowest Payment", desc: "Easiest monthly budget", icon: "📅", weights: { costWeight: 2, paymentWeight: 10, cashWeight: 0, reputationWeight: 2 } },
  { id: "least_cash", label: "Least Cash Upfront", desc: "Keep money in the bank", icon: "🏦", weights: { costWeight: 2, paymentWeight: 2, cashWeight: 10, reputationWeight: 2 } },
  { id: "trust", label: "Best Reputation", desc: "Smooth, reliable closing", icon: "⭐", weights: { costWeight: 2, paymentWeight: 2, cashWeight: 2, reputationWeight: 10 } },
];

// ─── AI Chat Component ───
function AIChat({ quotes, constraints, analysis, alerts, reputations, fullPage }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const buildContext = () => {
    const horizon = num(constraints.timeHorizon) || 7;
    const quoteDetails = analysis.map(a => {
      const rep = reputations[`${a.officer}|${a.name}`];
      return `
QUOTE: ${a.name} (${a.rate}%) — Loan Officer: ${a.officer || "Unknown"}
  Monthly P&I: ${fmt2(a.pi)}
  Lender Fees (Bucket 1): ${fmt(a.lf)}
  Points (Bucket 4): ${fmt(a.pts)}
  Lender-Controlled Total: ${fmt(a.lc)}
  Cash to Close: ${a.cash > 0 ? fmt(a.cash) : "Not provided"}
  Total Cost over ${horizon} years: ${fmt(a.tc)}
  ${rep ? `Reputation: ${rep.rating}/5 stars (${rep.reviewCount} reviews). ${rep.summary}` : "Reputation: Not yet looked up"}`;
    }).join("\n");

    const alertText = alerts.map(a => `- ${a.title}: ${a.detail}`).join("\n");

    return `You are an AI mortgage comparison assistant. You help consumers understand their mortgage options using a simple 4-bucket framework:

Bucket 1 - LENDER FEES: Processing and underwriting fees. These are the core fees the lender controls.
Bucket 4 - POINTS & ORIGINATION: Discount points AND origination fees (like a 1% origination fee). IMPORTANT: A "1% origination fee" is functionally the same as paying 1 point. Some lenders charge this but claim "no points" — grouping them together exposes this.
Bucket 2 - THIRD-PARTY FEES: Appraisal, title, recording, tech bundle, VOE, and similar. Roughly similar across lenders — not where lenders compete.
Bucket 3 - ESCROWS & PREPAIDS: Insurance, taxes, prepaid interest. Market-driven, depends on the property, not the lender.

KEY INSIGHT: Buckets 1 & 4 are what lenders actually control and where they compete. Buckets 2 & 3 are noise for comparison purposes.

The borrower's time horizon is ${horizon} years.
${constraints.maxPayment ? `Max monthly payment budget: ${constraints.maxPayment}` : ""}
${constraints.maxCash ? `Max cash to close budget: ${constraints.maxCash}` : ""}

HERE ARE THE QUOTES BEING COMPARED:
${quoteDetails}

${alertText ? `IMPORTANT ALERTS:\n${alertText}` : ""}

RULES:
- Be conversational, warm, and clear. No jargon without explanation.
- Always explain WHY, not just WHAT. Help the borrower understand the tradeoffs.
- When comparing lenders at the same rate, focus on lender-controlled costs.
- When comparing different rates, explain the breakeven math simply.
- If asked about escrow/prepaid differences, explain these are estimates, not real savings.
- Be honest about what you don't know. If reputation data isn't available, say so.
- Keep answers concise — 2-4 short paragraphs max unless they ask for detail.
- Use dollar amounts and time frames. Be specific, not vague.`;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const history = [...messages, { role: "user", content: userMsg }];
      const response = await fetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildContext(),
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      const reply = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "I wasn't able to process that. Could you try rephrasing?";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong connecting to the AI. Please try again." }]);
    }
    setLoading(false);
  };

  // Auto-scroll
  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  const prevLen = useRef(0);
  if (messages.length !== prevLen.current) { prevLen.current = messages.length; setTimeout(scrollToBottom, 100); }

  const suggestions = [
    "Which option is best if I stay 5 years?",
    "Why are the lender fees so different?",
    "Is buying down the rate worth it?",
    "Explain the insurance estimate difference",
    "What should I ask each lender?",
    "Help me understand the breakeven math",
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", marginBottom: 20 }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, #0C2E24, #1a5741)", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>💬</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--body)" }}>Ask About Your Quotes</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>AI-powered — ask anything about your mortgage options</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ height: fullPage ? 520 : (messages.length > 0 ? 360 : "auto"), overflowY: "auto", padding: 16 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--body)", marginBottom: 14 }}>Ask a question about your mortgage quotes, or try one of these:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                  style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid var(--border)", background: "#F9FAFB", cursor: "pointer", fontSize: 12, fontFamily: "var(--body)", color: "var(--text)", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.target.style.background = "#E8F5EE"; e.target.style.borderColor = "#0C2E24"; }}
                  onMouseLeave={e => { e.target.style.background = "#F9FAFB"; e.target.style.borderColor = "var(--border)"; }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{
              maxWidth: "80%", padding: "10px 14px", borderRadius: 12,
              background: m.role === "user" ? "#0C2E24" : "#F3F4F6",
              color: m.role === "user" ? "#fff" : "var(--text)",
              fontSize: 13, fontFamily: "var(--body)", lineHeight: 1.65,
              borderBottomRightRadius: m.role === "user" ? 2 : 12,
              borderBottomLeftRadius: m.role === "user" ? 12 : 2,
              whiteSpace: "pre-wrap",
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "#F3F4F6", borderBottomLeftRadius: 2 }}>
              <span style={{ display: "inline-block", animation: "pulse 1.5s ease-in-out infinite", fontSize: 13, color: "var(--muted)" }}>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
          placeholder="Ask about your mortgage options..."
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, fontFamily: "var(--body)", color: "var(--text)", outline: "none", background: "var(--input-bg)" }} />
        <button onClick={sendMessage} disabled={loading || !input.trim()}
          style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: loading || !input.trim() ? "#D1D5DB" : "#0C2E24", color: "#fff", cursor: loading ? "wait" : "pointer", fontSize: 13, fontFamily: "var(--body)", fontWeight: 600 }}>
          Send
        </button>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

// ─── Multi-Program Grouping (reactive — only appears when multiple programs detected) ───
function MultiProgramView({ analysis, programs, horizon }) {
  const [selectedProgram, setSelectedProgram] = useState(null);

  const programGroups = {};
  programs.forEach(p => { programGroups[p] = analysis.filter(a => a.program === p); });

  const programColors = { "Conventional": "#2563EB", "FHA": "#D97706", "VA": "#059669", "USDA": "#7C3AED" };
  const programIcons = { "Conventional": "🏠", "FHA": "🏛️", "VA": "🎖️", "USDA": "🌾" };

  // For each program, find the best quote
  const programBest = {};
  Object.entries(programGroups).forEach(([prog, quotes]) => {
    if (quotes.length > 0) {
      const best = quotes.reduce((a, b) => a.tc < b.tc ? a : b);
      programBest[prog] = best;
    }
  });

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "2px solid #7C3AED", marginBottom: 20, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, #5B21B6, #7C3AED)", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--body)" }}>Multiple Loan Programs Detected</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Your quotes include {programs.join(", ")} options. Let's sort this out step by step.</div>
          </div>
        </div>
      </div>

      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 13, color: "var(--text)", fontFamily: "var(--body)", marginBottom: 14, lineHeight: 1.6 }}>
          <strong>Step 1:</strong> Which loan program fits your situation? This usually comes down to cash to close and monthly payment.
          <strong> Step 2:</strong> Once you pick a program, compare lenders within that program above.
        </div>

        {/* Program summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${programs.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
          {programs.map(prog => {
            const quotes = programGroups[prog];
            const best = programBest[prog];
            const color = programColors[prog] || "#374151";
            const icon = programIcons[prog] || "📄";
            const isSelected = selectedProgram === prog;
            const lowestCash = Math.min(...quotes.map(q => q.cash).filter(c => c > 0));
            const lowestPayment = Math.min(...quotes.map(q => q.pi));

            return (
              <button key={prog} onClick={() => setSelectedProgram(isSelected ? null : prog)}
                style={{
                  padding: 14, borderRadius: 10, cursor: "pointer", textAlign: "left",
                  border: isSelected ? `2px solid ${color}` : "2px solid var(--border)",
                  background: isSelected ? color + "08" : "#fff",
                  transition: "all 0.2s",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "var(--body)" }}>{prog}</div>
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>{quotes.length} quote{quotes.length > 1 ? "s" : ""} from {[...new Set(quotes.map(q => q.name))].join(", ")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <div style={{ padding: "4px 6px", background: "#F3F4F6", borderRadius: 4 }}>
                    <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase" }}>Best Rate</div>
                    <div style={{ fontSize: 13, fontFamily: "var(--mono)" }}>{Math.min(...quotes.map(q => q.rate))}%</div>
                  </div>
                  <div style={{ padding: "4px 6px", background: "#F3F4F6", borderRadius: 4 }}>
                    <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase" }}>Lowest P&I</div>
                    <div style={{ fontSize: 13, fontFamily: "var(--mono)" }}>{fmt2(lowestPayment)}</div>
                  </div>
                  {lowestCash > 0 && (
                    <div style={{ padding: "4px 6px", background: "#F3F4F6", borderRadius: 4, gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase" }}>Lowest Cash to Close</div>
                      <div style={{ fontSize: 13, fontFamily: "var(--mono)" }}>{fmt(lowestCash)}</div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color, fontWeight: 600 }}>{isSelected ? "▲ Hide details" : "▼ Show details"}</div>
              </button>
            );
          })}
        </div>

        {/* Expanded program detail */}
        {selectedProgram && (
          <div style={{ padding: 14, background: "#F9FAFB", borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: programColors[selectedProgram] || "#374151", fontFamily: "var(--body)", marginBottom: 10 }}>
              {programIcons[selectedProgram]} {selectedProgram} Options
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--body)" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Lender</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Rate</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>P&I</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Points & Orig</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Lender-Controlled</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Cash to Close</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Total ({horizon}yr)</th>
                </tr>
              </thead>
              <tbody>
                {programGroups[selectedProgram].sort((a, b) => a.tc - b.tc).map((a, j) => {
                  const isBest = j === 0;
                  return (
                    <tr key={a.i} style={{ borderBottom: "1px solid #eee", background: isBest ? "#ECFDF5" : "transparent" }}>
                      <td style={{ padding: "8px", fontWeight: 600, color: a.color.bg }}>{a.name}<br /><span style={{ fontWeight: 400, fontSize: 10, color: "var(--muted)" }}>{a.rate}% · {a.officer}</span></td>
                      <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)" }}>{a.rate}%</td>
                      <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)" }}>{fmt2(a.pi)}</td>
                      <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)" }}>{fmt(a.pts)}</td>
                      <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)", fontWeight: 600 }}>{fmt(a.lc)}</td>
                      <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)" }}>{a.cash > 0 ? fmt(a.cash) : "—"}</td>
                      <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)", fontWeight: 600, color: isBest ? "#059669" : "var(--text)" }}>{fmt(a.tc)}{isBest ? " ✓" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Cross-program comparison table */}
        <div style={{ padding: 14, background: "#F9FAFB", borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", fontFamily: "var(--body)", marginBottom: 10 }}>Best Option Per Program — Side by Side</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--body)" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Program</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Best Lender</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Rate</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Monthly P&I</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Cash to Close</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "var(--muted)" }}>Total ({horizon}yr)</th>
              </tr>
            </thead>
            <tbody>
              {programs.map(prog => {
                const best = programBest[prog];
                if (!best) return null;
                const color = programColors[prog] || "#374151";
                return (
                  <tr key={prog} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "8px", fontWeight: 700, color }}>{programIcons[prog]} {prog}</td>
                    <td style={{ padding: "8px" }}>{best.name}</td>
                    <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)" }}>{best.rate}%</td>
                    <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)" }}>{fmt2(best.pi)}</td>
                    <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)" }}>{best.cash > 0 ? fmt(best.cash) : "—"}</td>
                    <td style={{ textAlign: "right", padding: "8px", fontFamily: "var(--mono)", fontWeight: 600 }}>{fmt(best.tc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Summary View ───
function SummaryView({ quotes, constraints, alerts, reputations, onLookupReputation, repLoading, weights, onWeightsChange }) {
  const horizon = num(constraints.timeHorizon) || 7;
  const months = horizon * 12;

  const analysis = quotes.filter(q => num(q.loanAmount) > 0 && num(q.rate) > 0).map((q, i) => {
    const la = num(q.loanAmount), r = num(q.rate), pi = calcPI(la, r, q.term || 30);
    const lf = bucket(q, 1), pts = bucket(q, 4), lc = lf + pts, tc = lc + pi * months;
    const cash = num(q.cashToClose);
    const b1Items = bucketBreakdown(q, 1), b4Items = bucketBreakdown(q, 4);
    const b2Items = bucketBreakdown(q, 2), b3Items = bucketBreakdown(q, 3);
    const program = q.loanProgram || "Conventional";
    return { i, name: q.lenderName || `Quote ${i + 1}`, officer: q.loanOfficer, rate: r, pi, lf, pts, lc, tc, la, cash, color: COLORS[i % 4], b1Items, b4Items, b2Items, b3Items, program };
  });

  if (analysis.length < 2) return <div style={{ textAlign: "center", padding: 60, color: "var(--muted)", fontFamily: "var(--body)" }}>Enter at least two complete quotes to see comparison.</div>;

  // Detect if multiple loan programs are present
  const uniquePrograms = [...new Set(analysis.map(a => a.program))];
  const hasMultiplePrograms = uniquePrograms.length > 1;

  const hasWeights = weights.costWeight + weights.paymentWeight + weights.cashWeight + weights.reputationWeight > 0;
  const scored = computeWeightedScore(analysis, weights, reputations);
  const bestScored = scored.reduce((a, b) => a.score > b.score ? a : b);
  const bestTC = hasWeights ? bestScored : analysis.reduce((a, b) => a.tc < b.tc ? a : b);
  const baselineRate = Math.max(...analysis.map(a => a.rate));
  const baseline = analysis.find(a => a.rate === baselineRate);
  const hasReps = Object.keys(reputations).length > 0;

  const maxMo = 180, chartW = 580, chartH = 200, pL = 65, pR = 15, pT = 15, pB = 30;
  const w = chartW - pL - pR, h = chartH - pT - pB;
  const allV = []; for (let m = 0; m <= maxMo; m += 6) analysis.forEach(a => allV.push(a.lc + a.pi * m));
  const minV = Math.min(...allV), maxV = Math.max(...allV);
  const xS = m => pL + (m / maxMo) * w, yS = v => pT + h - ((v - minV) / (maxV - minV || 1)) * h;

  const handleExportPDF = () => {
    const html = generatePDFHTML(quotes, constraints, alerts, analysis, bestTC, baseline, reputations, scored);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "MortgageCompare_Report.html"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <AlertBanner alerts={alerts} />

      {/* Export button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={handleExportPDF} style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "var(--body)", color: "var(--text)", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          📄 Export Report
        </button>
      </div>

      {/* What Matters Most — Scenario Buttons */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontFamily: "var(--display)", color: "var(--text)", marginBottom: 4 }}>What Matters Most to You?</div>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--body)", marginBottom: 14 }}>Pick your priority and we'll re-rank the options</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PRIORITY_SCENARIOS.map(s => {
            const isActive = JSON.stringify(weights) === JSON.stringify(s.weights);
            return (
              <button key={s.id} onClick={() => onWeightsChange(s.weights)}
                style={{
                  flex: "1 1 100px", minWidth: 100, padding: "12px 10px", borderRadius: 10, cursor: "pointer",
                  border: isActive ? `2px solid #0C2E24` : "2px solid var(--border)",
                  background: isActive ? "#E8F5EE" : "#fff",
                  textAlign: "center", transition: "all 0.2s",
                }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? "#0C2E24" : "var(--text)", fontFamily: "var(--body)" }}>{s.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--body)" }}>{s.desc}</div>
              </button>
            );
          })}
        </div>
        {/* Results */}
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
          {[...scored].sort((a, b) => b.score - a.score).map((a, rank) => (
            <div key={a.i} style={{
              flex: 1, minWidth: 120, padding: "10px 14px", borderRadius: 10, textAlign: "center",
              background: rank === 0 ? a.color.fg : "#F9FAFB",
              border: rank === 0 ? `2px solid ${a.color.bg}` : "1px solid var(--border)",
            }}>
              {rank === 0 && <div style={{ fontSize: 8, fontWeight: 700, color: a.color.bg, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Recommended</div>}
              <div style={{ fontSize: 13, fontWeight: 700, color: a.color.bg, fontFamily: "var(--body)" }}>{a.name}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{a.rate}%</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--mono)", color: rank === 0 ? a.color.bg : "var(--text)", margin: "4px 0" }}>{a.score}</div>
              <div style={{ fontSize: 9, color: "var(--muted)" }}>score out of 100</div>
              {a.dimensionScores && (
                <div style={{ marginTop: 8, display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                  {[
                    { key: "cost", label: "Cost", color: "#0C2E24" },
                    { key: "payment", label: "Pmt", color: "#2563EB" },
                    { key: "cash", label: "Cash", color: "#D97706" },
                    { key: "reputation", label: "Rep", color: "#059669" },
                  ].map(d => (
                    <div key={d.key} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "#F3F4F6", color: d.color }}>
                      {d.label}: {a.dimensionScores[d.key]}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Reputation Lookup */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontFamily: "var(--display)", color: "var(--text)", marginBottom: 4 }}>Loan Officer Reputation</div>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--body)", marginBottom: 12 }}>AI-powered review lookup — searches Google, Zillow, and other review sites</div>
        
        {analysis.some(a => a.officer) && !hasReps && (
          <button onClick={() => { analysis.filter(a => a.officer).forEach(a => onLookupReputation(a.officer, a.name)); }}
            disabled={repLoading}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: repLoading ? "#D1D5DB" : "linear-gradient(135deg, #059669, #10B981)", color: "#fff", cursor: repLoading ? "wait" : "pointer", fontSize: 13, fontFamily: "var(--body)", fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            {repLoading ? "⏳ Searching reviews..." : "⭐ Look Up All Loan Officers"}
          </button>
        )}

        {hasReps ? (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(analysis.filter(a => a.officer).length, 2)}, 1fr)`, gap: 10 }}>
            {analysis.filter(a => a.officer).map(a => {
              const key = `${a.officer}|${a.name}`;
              return <ReputationCard key={key} rep={reputations[key]} name={`${a.officer} — ${a.name}`} color={a.color} />;
            })}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            {analysis.filter(a => a.officer).map(a => (
              <div key={a.i} style={{ flex: 1, padding: 12, background: "#F9FAFB", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: a.color.bg }}>{a.officer}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{a.name}</div>
                <button onClick={() => onLookupReputation(a.officer, a.name)} disabled={repLoading}
                  style={{ marginTop: 8, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 10, fontFamily: "var(--body)", color: "var(--muted)" }}>
                  {repLoading ? "..." : "Look up"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Chat */}
      <AIChat quotes={quotes} constraints={constraints} analysis={analysis} alerts={alerts} reputations={reputations} />

      {/* Winner */}
      <div style={{ background: `linear-gradient(135deg, ${bestTC.color.bg}, ${bestTC.color.bg}cc)`, borderRadius: 14, padding: "24px 28px", color: "#fff", marginBottom: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.65, fontFamily: "var(--body)" }}>Best Overall — {horizon} Year Horizon</div>
        <div style={{ fontSize: 28, fontFamily: "var(--display)", fontWeight: 400, marginTop: 4 }}>{bestTC.name}</div>
        {bestTC.officer && <div style={{ fontSize: 13, opacity: 0.7, fontFamily: "var(--body)" }}>with {bestTC.officer}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginTop: 16 }}>
          {[["Rate", bestTC.rate + "%"], ["Monthly P&I", fmt2(bestTC.pi)], ["Lender-Controlled", fmt(bestTC.lc)], ["Cash to Close", bestTC.cash > 0 ? fmt(bestTC.cash) : "—"], [`Total (${horizon}yr)`, fmt(bestTC.tc)]].map(([l, v]) => (
            <div key={l}><div style={{ fontSize: 9, opacity: 0.55, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 18, fontFamily: "var(--mono)", marginTop: 2 }}>{v}</div></div>
          ))}
        </div>
      </div>

      {/* Quick Cards */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${analysis.length}, 1fr)`, gap: 10, marginBottom: 20 }}>
        {analysis.map(a => (
          <div key={a.i} style={{ background: a.i === bestTC.i ? a.color.fg : "#fff", border: `2px solid ${a.i === bestTC.i ? a.color.bg : "var(--border)"}`, borderRadius: 10, padding: 14, position: "relative" }}>
            {a.i === bestTC.i && <div style={{ position: "absolute", top: -1, right: 10, background: a.color.bg, color: "#fff", fontSize: 8, fontWeight: 700, padding: "2px 8px", borderRadius: "0 0 5px 5px", letterSpacing: "0.05em" }}>BEST</div>}
            <div style={{ fontSize: 13, fontWeight: 700, color: a.color.bg, fontFamily: "var(--body)", marginBottom: 8 }}>{a.name}</div>
            <div style={{ fontSize: 20, fontFamily: "var(--mono)", color: "var(--text)" }}>{a.rate}%</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>{fmt2(a.pi)}/mo</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <ExpandableBucket label="Lender Fees" total={a.lf} items={a.b1Items} bgColor="#DBEAFE" textColor="#1E40AF" borderColor="#1E3A5F" />
              <ExpandableBucket label="Points & Origination" total={a.pts} items={a.b4Items} bgColor="#FEF3C7" textColor="#92400E" borderColor="#78350F" />
            </div>
            <div style={{ marginTop: 6, padding: 6, background: "#F9FAFB", borderRadius: 5, textAlign: "center" }}>
              <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase" }}>Lender-Controlled</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--mono)", color: a.color.bg }}>{fmt(a.lc)}</div>
            </div>
            {a.cash > 0 && (
              <div style={{ marginTop: 4, padding: 4, textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase" }}>Cash to Close</div>
                <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text)" }}>{fmt(a.cash)}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontFamily: "var(--display)", color: "var(--text)", marginBottom: 12 }}>Total Cost Over Time</div>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", maxWidth: chartW }}>
          {[0, 36, 60, 84, 120, 180].map(m => (<g key={m}><line x1={xS(m)} y1={pT} x2={xS(m)} y2={pT + h} stroke="#F3F4F6" /><text x={xS(m)} y={chartH - 6} textAnchor="middle" fontSize={9} fill="#9CA3AF">{m === 0 ? "0" : `${m / 12}yr`}</text></g>))}
          {[0, 0.25, 0.5, 0.75, 1].map(p => { const val = minV + (maxV - minV) * p; return <g key={p}><line x1={pL} y1={yS(val)} x2={pL + w} y2={yS(val)} stroke="#F3F4F6" /><text x={pL - 6} y={yS(val) + 4} textAnchor="end" fontSize={8} fill="#9CA3AF" fontFamily="var(--mono)">${(val / 1000).toFixed(0)}k</text></g>; })}
          <line x1={xS(months)} y1={pT} x2={xS(months)} y2={pT + h} stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4,4" />
          <text x={xS(months)} y={pT - 3} textAnchor="middle" fontSize={8} fill="#EF4444" fontWeight="600">{horizon}yr</text>
          {analysis.map(a => { const pts = []; for (let m = 0; m <= maxMo; m += 3) pts.push(`${m === 0 ? "M" : "L"} ${xS(m)} ${yS(a.lc + a.pi * m)}`); return <path key={a.i} d={pts.join(" ")} fill="none" stroke={a.color.bg} strokeWidth={2.5} />; })}
        </svg>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
          {analysis.map(a => (<div key={a.i} style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 14, height: 3, borderRadius: 2, background: a.color.bg }} /><span style={{ fontSize: 10, color: "var(--text)" }}>{a.name} ({a.rate}%)</span></div>))}
        </div>
      </div>

      {/* Breakeven */}
      {baseline && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontFamily: "var(--display)", marginBottom: 12 }}>Breakeven Analysis</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${analysis.length}, 1fr)`, gap: 8 }}>
            {analysis.map(a => {
              const sav = baseline.pi - a.pi, extra = a.lc - baseline.lc;
              const mo = sav > 0 && extra > 0 ? Math.ceil(extra / sav) : null;
              return (
                <div key={a.i} style={{ padding: 12, background: "#F9FAFB", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: a.color.bg, marginBottom: 6 }}>{a.name} ({a.rate}%)</div>
                  {a.i === baseline.i ? <div style={{ fontSize: 12, color: "var(--muted)" }}>Baseline</div>
                    : mo ? <><div style={{ fontSize: 26, fontFamily: "var(--mono)", fontWeight: 700 }}>{(mo / 12).toFixed(1)}</div><div style={{ fontSize: 10, color: "var(--muted)" }}>years to breakeven</div><div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Saves {fmt2(sav)}/mo · Costs {fmt(extra)} more</div></>
                      : <div style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>Lower cost ✓</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Time Horizon Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", padding: 18, marginBottom: 20, overflowX: "auto" }}>
        <div style={{ fontSize: 15, fontFamily: "var(--display)", marginBottom: 12 }}>Total Cost by Time Horizon</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--body)" }}>
          <thead><tr style={{ borderBottom: "2px solid var(--border)" }}>
            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--muted)", fontSize: 9, textTransform: "uppercase" }}>Horizon</th>
            {analysis.map(a => <th key={a.i} style={{ textAlign: "right", padding: "6px 8px", color: a.color.bg, fontSize: 9, textTransform: "uppercase" }}>{a.name}<br />{a.rate}%</th>)}
          </tr></thead>
          <tbody>{[3, 5, 7, 10, 15].map(yr => {
            const costs = analysis.map(a => a.lc + a.pi * yr * 12), minC = Math.min(...costs);
            return (<tr key={yr} style={{ borderBottom: "1px solid #F3F4F6", background: yr === horizon ? "#FEF2F2" : "transparent" }}>
              <td style={{ padding: "6px 8px", fontWeight: yr === horizon ? 700 : 400 }}>{yr} Yrs {yr === horizon ? "←" : ""}</td>
              {costs.map((c, j) => <td key={j} style={{ textAlign: "right", padding: "6px 8px", fontFamily: "var(--mono)", fontWeight: c === minC ? 700 : 400, color: c === minC ? "#059669" : "var(--text)" }}>{fmt(c)}{c === minC ? " ✓" : ""}</td>)}
            </tr>);
          })}</tbody>
        </table>
      </div>

      {/* Plain English */}
      <div style={{ background: "#FFFBEB", borderRadius: 10, border: "1px solid #FDE68A", padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontFamily: "var(--display)", color: "#92400E", marginBottom: 10 }}>Plain English Summary</div>
        <div style={{ fontSize: 12, fontFamily: "var(--body)", color: "#78350F", lineHeight: 1.8 }}>
          {(() => {
            const lines = [];
            const rates = [...new Set(analysis.map(a => a.rate))];
            rates.forEach(r => {
              const group = analysis.filter(a => a.rate === r);
              if (group.length >= 2) {
                const sorted = [...group].sort((a, b) => a.lc - b.lc);
                const diff = sorted[sorted.length - 1].lc - sorted[0].lc;
                lines.push(`At ${r}%, ${sorted[0].name} has ${fmt(diff)} less in lender-controlled costs than ${sorted[sorted.length - 1].name}. ${diff < 500 ? "That's essentially a wash." : diff < 2000 ? "A modest difference." : "A meaningful difference."}`);
              }
            });
            if (baseline && analysis.some(a => a.rate < baseline.rate)) {
              const lr = Math.min(...analysis.map(a => a.rate));
              const lrq = analysis.find(a => a.rate === lr);
              const s = baseline.pi - lrq.pi, e = lrq.lc - baseline.lc;
              if (s > 0 && e > 0) lines.push(`Buying down from ${baseline.rate}% to ${lr}% saves ${fmt2(s)}/month but costs ${fmt(e)} more upfront. Breakeven is about ${(Math.ceil(e / s) / 12).toFixed(1)} years.`);
            }
            lines.push(`Over your ${horizon}-year horizon, ${bestTC.name} at ${bestTC.rate}% gives the lowest total cost at ${fmt(bestTC.tc)}.`);
            return lines.map((l, i) => <p key={i} style={{ margin: "0 0 6px" }}>{l}</p>);
          })()}
        </div>
      </div>

      {/* Multi-Program Grouping — only appears when quotes span multiple loan programs */}
      {hasMultiplePrograms && (
        <MultiProgramView analysis={analysis} programs={uniquePrograms} horizon={horizon} />
      )}

      {/* Coming Soon */}
      <div style={{ padding: 14, background: "#F9FAFB", borderRadius: 10, border: "1px dashed #D1D5DB" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Coming Soon</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[{ icon: "📊", label: "Mortgage Coach Import" }, { icon: "🔗", label: "Shareable Links for Clients" }].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted)" }}><span>{f.icon}</span> {f.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───
export default function MortgageCompare() {
  const [quotes, setQuotes] = useState([EMPTY_QUOTE(), EMPTY_QUOTE()]);
  const [constraints, setConstraints] = useState({ timeHorizon: "7", maxPayment: "", maxCash: "" });
  const [tab, setTab] = useState("summary");
  const [reputations, setReputations] = useState({});
  const [repLoading, setRepLoading] = useState(false);
  const [weights, setWeights] = useState({ costWeight: 5, paymentWeight: 3, cashWeight: 3, reputationWeight: 4 });

  const updateQuote = useCallback((i, q) => setQuotes(prev => prev.map((p, j) => j === i ? q : p)), []);
  const addQuote = () => { if (quotes.length < 4) setQuotes([...quotes, EMPTY_QUOTE()]); };
  const removeQuote = (i) => { if (quotes.length > 2) setQuotes(quotes.filter((_, j) => j !== i)); };
  const alerts = useMemo(() => detectAlerts(quotes), [quotes]);

  const handleLookupReputation = useCallback(async (officer, lenderName) => {
    const key = `${officer}|${lenderName}`;
    if (reputations[key]) return;
    setRepLoading(true);
    try {
      const result = await lookupReputation(officer, lenderName);
      if (result) setReputations(prev => ({ ...prev, [key]: result }));
    } catch (err) { console.error("Reputation lookup failed:", err); }
    setRepLoading(false);
  }, [reputations]);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f4", "--body": "'Archivo', sans-serif", "--display": "'Playfair Display', serif", "--mono": "'JetBrains Mono', monospace", "--text": "#1a1a1a", "--muted": "#71717a", "--border": "#e4e4e7", "--input-bg": "#fafafa" }}>

      <div style={{ background: "linear-gradient(135deg, #0C2E24 0%, #1a5741 60%, #0C2E24 100%)", padding: "24px 24px 20px", color: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>⚖️</span>
                <h1 style={{ fontSize: 24, fontFamily: "var(--display)", fontWeight: 400, margin: 0 }}>MortgageCompare</h1>
              </div>
              <p style={{ fontSize: 12, opacity: 0.6, margin: "4px 0 0", fontFamily: "var(--body)" }}>Compare quotes. See the real cost. Make the right choice.</p>
            </div>
            <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: 3 }}>
              {[{ id: "summary", label: "📊 Summary" }, { id: "ask", label: "💬 Ask AI" }, { id: "detailed", label: "📋 Detail" }].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "var(--body)", fontWeight: 600, background: tab === t.id ? "#fff" : "transparent", color: tab === t.id ? "#0C2E24" : "rgba(255,255,255,0.7)" }}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px 48px" }}>
        <div style={{ background: "#fff", borderRadius: 8, padding: "10px 16px", marginBottom: 16, border: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Input label="Time Horizon" value={constraints.timeHorizon} onChange={v => setConstraints({ ...constraints, timeHorizon: v })} suffix="years" />
          <Input label="Max Payment (opt)" value={constraints.maxPayment} onChange={v => setConstraints({ ...constraints, maxPayment: v })} prefix="$" placeholder="No limit" />
          <Input label="Max Cash to Close (opt)" value={constraints.maxCash} onChange={v => setConstraints({ ...constraints, maxCash: v })} prefix="$" placeholder="No limit" />
          <button onClick={() => setQuotes([EMPTY_QUOTE(), EMPTY_QUOTE()])} style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 11, fontFamily: "var(--body)", color: "var(--muted)", marginBottom: 1 }}>Clear All</button>
        </div>

        {tab === "summary" && <SummaryView quotes={quotes} constraints={constraints} alerts={alerts} reputations={reputations} onLookupReputation={handleLookupReputation} repLoading={repLoading} weights={weights} onWeightsChange={setWeights} />}

        {tab === "ask" && (() => {
          const horizon = num(constraints.timeHorizon) || 7;
          const months = horizon * 12;
          const analysis = quotes.filter(q => num(q.loanAmount) > 0 && num(q.rate) > 0).map((q, i) => {
            const la = num(q.loanAmount), r = num(q.rate), pi = calcPI(la, r, q.term || 30);
            const lf = bucket(q, 1), pts = bucket(q, 4), lc = lf + pts, tc = lc + pi * months;
            const cash = num(q.cashToClose);
            const b1Items = bucketBreakdown(q, 1), b4Items = bucketBreakdown(q, 4);
            return { i, name: q.lenderName || `Quote ${i + 1}`, officer: q.loanOfficer, rate: r, pi, lf, pts, lc, tc, la, cash, color: COLORS[i % 4], b1Items, b4Items };
          });
          return <AIChat quotes={quotes} constraints={constraints} analysis={analysis} alerts={alerts} reputations={reputations} fullPage />;
        })()}

        {tab === "detailed" && (
          <>
            <AlertBanner alerts={alerts} />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              {quotes.map((q, i) => <QuoteCard key={i} quote={q} index={i} onChange={updateQuote} onRemove={removeQuote} canRemove={quotes.length > 2} />)}
            </div>
            {quotes.length < 4 && <button onClick={addQuote} style={{ padding: "10px", borderRadius: 8, border: "2px dashed #d1d5db", background: "transparent", cursor: "pointer", fontSize: 12, fontFamily: "var(--body)", color: "var(--muted)", width: "100%", marginBottom: 14 }}>+ Add Quote</button>}
            <button onClick={() => setTab("summary")} style={{ padding: "12px 24px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #0C2E24, #1a5741)", color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "var(--body)", fontWeight: 600 }}>View Summary →</button>
          </>
        )}
      </div>
    </div>
  );
}
