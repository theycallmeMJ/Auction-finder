const SQM_TO_SQFT = 10.7639;
const ARE_TO_SQFT = 1076.39;
const ARE_TO_CENTS = 2.47105;
const CENT_TO_SQFT = 435.6;
const CACHE_DAYS = 7;
const MAX_FRESH_ANALYSES_PER_DAY = 5;
const AI_ANALYSIS_MIN_SCORE = 70;

const DEFAULT_DISCLAIMER =
  "This analysis is based on available auction data and current online asking prices. Asking prices may differ from completed transaction values. Verify title, possession, encumbrances, physical condition, access, statutory approvals and market value independently before bidding.";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/quota/i.test(message)) return { code: "PROVIDER_QUOTA_EXHAUSTED", message: "Live comparable search quota is temporarily exhausted." };
  if (/timeout/i.test(message)) return { code: "PROVIDER_TIMEOUT", message: "Live comparable search timed out." };
  if (/tavily/i.test(message)) return { code: "SEARCH_PROVIDER_UNAVAILABLE", message: "Comparable search is temporarily unavailable." };
  return { code: "GROUNDING_UNAVAILABLE", message: "Live comparable search is temporarily unavailable." };
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/₹/g, "").replace(/,/g, "").trim();
  if (!normalized) return null;
  const lakh = normalized.match(/([\d.]+)\s*lakh/i);
  if (lakh) return Math.round(Number(lakh[1]) * 100000);
  const crore = normalized.match(/([\d.]+)\s*crore/i);
  if (crore) return Math.round(Number(crore[1]) * 10000000);
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseArea(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { sqft: value, raw: String(value), unit: "sqft", warning: null };
  }
  if (typeof value !== "string" || !value.trim()) return { sqft: null, raw: value ?? null, unit: null, warning: null };
  const raw = value.trim();
  const amount = numberOrNull(raw);
  if (!amount) return { sqft: null, raw, unit: null, warning: `Unsupported area value: ${raw}` };
  const lower = raw.toLowerCase();
  if (lower.includes("sq meter") || lower.includes("sqm") || lower.includes("sq m")) {
    return { sqft: amount * SQM_TO_SQFT, raw, unit: "sqm", warning: null };
  }
  if (lower.includes("hectare")) {
    return { sqft: amount * 2.47105 * 100 * CENT_TO_SQFT, raw, unit: "hectare", warning: null };
  }
  if (lower.includes("acre")) {
    return { sqft: amount * 43560, raw, unit: "acre", warning: null };
  }
  if (/\bares?\b/.test(lower)) {
    return { sqft: amount * ARE_TO_SQFT, raw, unit: "are", warning: null };
  }
  if (lower.includes("cent")) {
    return { sqft: amount * CENT_TO_SQFT, raw, unit: "cent", warning: null };
  }
  if (lower.includes("feet") || lower.includes("sqft") || lower.includes("sq ft")) {
    return { sqft: amount, raw, unit: "sqft", warning: null };
  }
  return { sqft: amount, raw, unit: "assumed_sqft", warning: `Area unit not explicit, assumed square feet: ${raw}` };
}

function round(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function auctionBaseScore(row) {
  const columnScore = numberOrNull(row?.score);
  const payloadScore = numberOrNull(row?.payload?.score?.overall);
  return columnScore ?? payloadScore ?? null;
}

function inferBhk(row) {
  const text = [row.title, row.propertyAddress, row.searchText].filter(Boolean).join(" ");
  const match = text.match(/\b([1-9])\s*BHK\b/i);
  return match ? Number(match[1]) : null;
}

function inferLocality(row) {
  return firstText(row.city, row.location?.split(",")?.[2]?.replace(/-\d{6}.*/, ""), row.district);
}

function normalizeProperty(row) {
  const carpet = parseArea(row.carpetArea);
  const builtUp = parseArea(row.builtUpArea);
  const genericArea = parseArea(row.areaSqft);
  const landSqft = row.propertySubType?.toLowerCase().includes("land") || row.propertySubType?.toLowerCase().includes("house")
    ? genericArea.sqft
    : null;
  const builtUpAreaSqft = builtUp.sqft ?? (row.propertySubType?.toLowerCase().includes("house") ? null : genericArea.sqft);
  const address = firstText(row.propertyAddress, row.location);
  const pincode = firstText(row.pinCode, row.location?.match(/\b\d{6}\b/)?.[0]);
  const possessionStatus = firstText(row.possessionStatus);
  const property = {
    auctionId: String(row.auctionId || ""),
    bankPropertyId: row.bankPropertyId || null,
    title: row.title || null,
    description: row.propertyAddress || row.searchText || null,
    bank: row.bank || null,
    propertyCategory: row.propertyType || null,
    propertyType: row.propertyType || null,
    propertySubType: row.propertySubType || null,
    projectName: null,
    reservePrice: row.reservePrice ?? numberOrNull(row.reservePriceText),
    emdAmount: numberOrNull(row.emd),
    carpetAreaSqft: round(carpet.sqft, 2),
    builtUpAreaSqft: round(builtUpAreaSqft, 2),
    superBuiltUpAreaSqft: null,
    landAreaSqft: round(landSqft, 2),
    landAreaCents: landSqft ? round(landSqft / CENT_TO_SQFT, 2) : null,
    landAreaAres: landSqft ? round(landSqft / ARE_TO_SQFT, 3) : null,
    bhk: inferBhk(row),
    furnishing: row.searchText?.match(/semi[- ]?furnished/i) ? "semi-furnished" : row.searchText?.match(/furnished/i) ? "furnished" : null,
    possessionStatus,
    ownershipType: row.searchText?.match(/freehold/i) ? "freehold" : null,
    constructionAgeYears: numberOrNull(row.searchText?.match(/construction age[^0-9]*(\d+)/i)?.[1] ?? ""),
    constructionYear: null,
    floorNumber: null,
    totalFloors: null,
    parkingCount: null,
    facing: null,
    waterAvailability: null,
    address,
    locality: inferLocality(row),
    city: row.city || null,
    district: row.district || null,
    state: row.state || null,
    pincode,
    latitude: null,
    longitude: null,
    auctionStart: row.startDate || null,
    auctionEnd: row.endDate || null,
    inspectionStart: row.inspectionDateFrom || null,
    inspectionEnd: row.inspectionDateTo || null,
    imageUrls: [],
    sourceUpdatedAt: row.updatedAt || row.scrapedAt || null,
    raw: {
      carpetArea: carpet.raw,
      builtUpArea: builtUp.raw,
      area: genericArea.raw,
      reservePriceText: row.reservePriceText ?? null,
    },
  };
  return { property, areaWarnings: [carpet.warning, builtUp.warning, genericArea.warning].filter(Boolean) };
}

function isHouse(property) {
  const text = `${property.propertySubType || ""} ${property.title || ""}`.toLowerCase();
  return /house|villa|building/.test(text) && !/flat|apartment/.test(text);
}

function isFlat(property) {
  const text = `${property.propertySubType || ""} ${property.title || ""}`.toLowerCase();
  return /flat|apartment/.test(text);
}

function isLand(property) {
  const text = `${property.propertySubType || ""} ${property.title || ""}`.toLowerCase();
  return /land|plot|vacant/.test(text) && !isHouse(property);
}

export function calculateDataCompleteness(property) {
  const missingFields = [];
  const criticalMissingFields = [];
  let score = 0;
  const add = (condition, points, field, critical = false) => {
    if (condition) score += points;
    else {
      missingFields.push(field);
      if (critical) criticalMissingFields.push(field);
    }
  };
  add(property.reservePrice, 10, "reservePrice", true);
  add(property.propertySubType, 8, "propertySubType", true);
  add(property.address || property.locality || property.city || property.pincode, 12, "usableLocation", true);
  add(property.builtUpAreaSqft || property.carpetAreaSqft, 12, "builtUpOrCarpetArea", !isLand(property));
  add(property.bhk || !isFlat(property), 5, "bhk");
  add(property.possessionStatus, 4, "possessionStatus");
  add(property.ownershipType, 4, "ownershipType");
  add(property.constructionAgeYears || property.constructionYear, 5, "constructionAge");
  add(property.latitude && property.longitude, 8, "coordinates");
  add(property.imageUrls?.length, 4, "images");
  add(property.auctionStart || property.auctionEnd, 3, "auctionDate");
  if (isHouse(property)) add(property.landAreaSqft, 15, "landArea", true);
  else if (isLand(property)) add(property.landAreaSqft, 25, "landArea", true);
  else if (isFlat(property)) add(property.projectName || property.floorNumber || property.parkingCount, 10, "projectFloorParking");
  else score += 5;
  return { score: Math.round(clamp(score)), missingFields, criticalMissingFields };
}

export function calculateDeterministicAnalysis(property, areaWarnings = []) {
  const completeness = calculateDataCompleteness(property);
  const warnings = [...areaWarnings];
  if (property.carpetAreaSqft && property.carpetAreaSqft <= 0) warnings.push("Carpet area is zero or negative.");
  if (property.builtUpAreaSqft && property.builtUpAreaSqft <= 0) warnings.push("Built-up area is zero or negative.");
  if (property.landAreaSqft && property.landAreaSqft <= 0) warnings.push("Land area is zero or negative.");
  if (property.carpetAreaSqft && property.builtUpAreaSqft && property.carpetAreaSqft > property.builtUpAreaSqft * 1.1) {
    warnings.push("Carpet area is greater than built-up area.");
  }
  if (isHouse(property) && property.landAreaSqft && property.builtUpAreaSqft && property.landAreaSqft < property.builtUpAreaSqft * 0.35) {
    warnings.push("Land area appears small compared with the building footprint.");
  }
  const reserve = property.reservePrice;
  const reservePricePerBuiltUpSqft = reserve && property.builtUpAreaSqft ? reserve / property.builtUpAreaSqft : null;
  const reservePricePerCarpetSqft = reserve && property.carpetAreaSqft ? reserve / property.carpetAreaSqft : null;
  const reservePricePerCent = reserve && property.landAreaCents ? reserve / property.landAreaCents : null;
  const priceSignal = reserve ? 58 : 30;
  let fundamentals = completeness.score * 0.65;
  if (/physical/i.test(property.possessionStatus || "")) fundamentals += 6;
  if (/symbolic/i.test(property.possessionStatus || "")) fundamentals -= 3;
  if (/freehold/i.test(property.ownershipType || "")) fundamentals += 4;
  if ((isHouse(property) || isLand(property)) && !property.landAreaSqft) fundamentals -= 18;
  const auctionReadiness = clamp(55 + (property.inspectionStart ? 8 : 0) + (property.emdAmount ? 8 : 0) + (property.auctionStart ? 8 : 0));
  const preliminaryScore = clamp(completeness.score * 0.35 + priceSignal * 0.25 + fundamentals * 0.25 + auctionReadiness * 0.15);
  return {
    completenessScore: completeness.score,
    preliminaryScore: Math.round(preliminaryScore),
    categoryScores: {
      dataQuality: completeness.score,
      priceSignal: Math.round(clamp(priceSignal)),
      propertyFundamentals: Math.round(clamp(fundamentals)),
      auctionReadiness: Math.round(clamp(auctionReadiness)),
    },
    computed: {
      reservePricePerBuiltUpSqft: round(reservePricePerBuiltUpSqft, 2),
      reservePricePerCarpetSqft: round(reservePricePerCarpetSqft, 2),
      reservePricePerCent: round(reservePricePerCent, 2),
    },
    missingFields: completeness.missingFields,
    criticalMissingFields: completeness.criticalMissingFields,
    warnings,
  };
}

export function buildComparableSearchContext(property) {
  const targetPropertyType = isFlat(property)
    ? "apartment"
    : isHouse(property)
      ? "independent house"
      : isLand(property)
        ? "land"
        : (property.propertySubType || property.propertyType || "property");
  const area = property.builtUpAreaSqft || property.carpetAreaSqft || property.landAreaSqft;
  const tolerance = isLand(property) ? 0.2 : isFlat(property) ? 0.25 : 0.3;
  const targetAreaMinSqft = area ? Math.round(area * (1 - tolerance)) : null;
  const targetAreaMaxSqft = area ? Math.round(area * (1 + tolerance)) : null;
  const targetLocality = property.locality || property.city || property.pincode || property.district;
  const areaPhrase = targetAreaMinSqft && targetAreaMaxSqft ? `${targetAreaMinSqft} ${targetAreaMaxSqft} sqft` : "";
  const bhkPhrase = property.bhk ? `${property.bhk} BHK` : "";
  const place = [property.projectName, property.locality, property.city, property.pincode].filter(Boolean).join(" ");
  const primarySearchQuery = [bhkPhrase, targetPropertyType, "for sale", place, areaPhrase].filter(Boolean).join(" ");
  const rentalSearchQuery = [bhkPhrase, targetPropertyType, "for rent", place, areaPhrase].filter(Boolean).join(" ");
  const fallbackSearchQueries = [
    [targetPropertyType, "for sale", property.city, property.district].filter(Boolean).join(" "),
    [bhkPhrase, targetPropertyType, "for sale", property.pincode].filter(Boolean).join(" "),
    [targetPropertyType, "rent", property.city, property.district].filter(Boolean).join(" "),
  ].filter(Boolean);
  return {
    primarySearchQuery,
    rentalSearchQuery,
    fallbackSearchQueries,
    targetPropertyType,
    targetLocality,
    targetAreaMinSqft,
    targetAreaMaxSqft,
    targetPriceMin: property.reservePrice ? Math.round(property.reservePrice * 0.8) : null,
    targetPriceMax: property.reservePrice ? Math.round(property.reservePrice * 1.8) : null,
    targetBhk: property.bhk,
  };
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizeComparable(item) {
  if (!item || typeof item !== "object") return null;
  const askingPrice = numberOrNull(item.askingPrice);
  const monthlyRent = numberOrNull(item.monthlyRent);
  const builtUpAreaSqft = numberOrNull(item.builtUpAreaSqft);
  const landAreaCents = numberOrNull(item.landAreaCents);
  return {
    title: String(item.title || "Comparable listing"),
    locality: item.locality || null,
    propertyType: String(item.propertyType || "unknown"),
    bhk: numberOrNull(item.bhk),
    builtUpAreaSqft,
    landAreaCents,
    askingPrice,
    monthlyRent,
    pricePerSqft: askingPrice && builtUpAreaSqft ? round(askingPrice / builtUpAreaSqft, 2) : null,
    sourceName: item.sourceName || null,
    sourceUrl: typeof item.sourceUrl === "string" && /^https?:\/\//.test(item.sourceUrl) ? item.sourceUrl : null,
    publishedOrUpdatedDate: item.publishedOrUpdatedDate || null,
    similarityScore: clamp(numberOrNull(item.similarityScore) ?? 40),
    matchReason: String(item.matchReason || "AI selected as a possible comparable."),
  };
}

function propertyTypeMatches(property, comparable) {
  const source = `${comparable.propertyType || ""} ${comparable.title || ""}`.toLowerCase();
  if (isHouse(property)) return !/flat|apartment|plot|land only|vacant/.test(source);
  if (isFlat(property)) return !/villa|independent house|plot|land only|vacant/.test(source);
  if (isLand(property)) return /plot|land|vacant/.test(source);
  return true;
}

function dedupeComparables(comparables) {
  const seen = new Set();
  const seenUrls = new Set();
  return comparables.filter((item) => {
    if (item.sourceUrl) {
      if (seenUrls.has(item.sourceUrl)) return false;
      seenUrls.add(item.sourceUrl);
    }
    const key = [item.sourceUrl, item.title?.toLowerCase(), item.askingPrice, item.monthlyRent, item.builtUpAreaSqft].filter(Boolean).join("|");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function processGroundedAnalysis(property, deterministic, searchContext, rawAnalysis) {
  const rawSale = Array.isArray(rawAnalysis?.saleComparables) ? rawAnalysis.saleComparables : [];
  const rawRental = Array.isArray(rawAnalysis?.rentalComparables) ? rawAnalysis.rentalComparables : [];
  const targetArea = property.builtUpAreaSqft || property.carpetAreaSqft || property.landAreaSqft;
  const areaMin = searchContext.targetAreaMinSqft;
  const areaMax = searchContext.targetAreaMaxSqft;
  const areaOk = (item) => !targetArea || !item.builtUpAreaSqft || !areaMin || !areaMax || (item.builtUpAreaSqft >= areaMin * 0.7 && item.builtUpAreaSqft <= areaMax * 1.3);
  const saleComparables = dedupeComparables(rawSale.map(normalizeComparable).filter(Boolean))
    .filter((item) => item.askingPrice && propertyTypeMatches(property, item) && areaOk(item))
    .slice(0, 8);
  const rentalComparables = dedupeComparables(rawRental.map(normalizeComparable).filter(Boolean))
    .filter((item) => item.monthlyRent && propertyTypeMatches(property, item) && areaOk(item))
    .slice(0, 8);
  const salePrices = saleComparables.map((item) => item.askingPrice).filter(Boolean);
  const rents = rentalComparables.map((item) => item.monthlyRent).filter(Boolean);
  const medianAsking = median(salePrices);
  const medianRent = median(rents);
  const enoughSaleEvidence = salePrices.length >= 3;
  const adjustedLow = enoughSaleEvidence ? Math.round(Math.min(...salePrices) * 0.9) : null;
  const adjustedHigh = enoughSaleEvidence ? Math.round(Math.max(...salePrices) * 0.95) : null;
  const reserve = property.reservePrice;
  const discountLow = reserve && adjustedHigh ? ((adjustedHigh - reserve) / adjustedHigh) * 100 : null;
  const discountHigh = reserve && adjustedLow ? ((adjustedLow - reserve) / adjustedLow) * 100 : null;
  const yieldLow = reserve && rents.length ? (Math.min(...rents) * 12 / reserve) * 100 : null;
  const yieldHigh = reserve && rents.length ? (Math.max(...rents) * 12 / reserve) * 100 : null;
  const confidence = salePrices.length >= 5 && deterministic.completenessScore >= 75 && !deterministic.criticalMissingFields.length
    ? "high"
    : salePrices.length >= 3 && deterministic.completenessScore >= 55
      ? "medium"
      : "low";
  const valueScore = clamp(50 + (discountLow ?? 0));
  const rentalScore = clamp(rentalComparables.length * 12 + (yieldLow ?? 0) * 4);
  const riskScore = clamp(100 - deterministic.criticalMissingFields.length * 18 - deterministic.warnings.length * 5);
  const locationScore = clamp(45 + saleComparables.length * 8);
  const appreciationScore = clamp(45 + saleComparables.length * 6);
  const liquidityScore = clamp(42 + saleComparables.length * 7);
  const overallScore = Math.round(clamp(valueScore * 0.28 + rentalScore * 0.16 + locationScore * 0.18 + appreciationScore * 0.14 + liquidityScore * 0.12 + riskScore * 0.12));
  return {
    saleComparables,
    rentalComparables,
    marketAssessment: {
      comparableAskingPriceLow: salePrices.length ? Math.min(...salePrices) : null,
      comparableAskingPriceHigh: salePrices.length ? Math.max(...salePrices) : null,
      medianComparableAskingPrice: medianAsking ? Math.round(medianAsking) : null,
      adjustedMarketValueLow: adjustedLow,
      adjustedMarketValueHigh: adjustedHigh,
      adjustmentReason: enoughSaleEvidence
        ? "Adjusted 5-10% below online asking prices to avoid treating asking prices as completed transaction values."
        : "Insufficient comparable evidence for an adjusted market range.",
    },
    rentalAssessment: {
      estimatedMonthlyRentLow: rents.length ? Math.min(...rents) : null,
      estimatedMonthlyRentHigh: rents.length ? Math.max(...rents) : null,
      likelyMonthlyRent: medianRent ? Math.round(medianRent) : null,
      rentalDemand: rentalComparables.length >= 4 ? "strong" : rentalComparables.length >= 2 ? "moderate" : rentalComparables.length ? "weak" : "unknown",
      explanation: rentalComparables.length ? "Based on filtered rental comparables returned by grounded search." : "No usable rental comparables were found.",
    },
    investmentAssessment: {
      auctionDiscountLowPercent: round(discountLow, 1),
      auctionDiscountHighPercent: round(discountHigh, 1),
      grossRentalYieldLowPercent: round(yieldLow, 2),
      grossRentalYieldHighPercent: round(yieldHigh, 2),
      locationScore: Math.round(locationScore),
      rentalScore: Math.round(rentalScore),
      appreciationScore: Math.round(appreciationScore),
      liquidityScore: Math.round(liquidityScore),
      valueScore: Math.round(valueScore),
      riskScore: Math.round(riskScore),
      overallScore,
    },
    bestFor: confidence === "low" ? ["needs_more_data"] : rentalComparables.length >= 3 ? ["rental", "self_use"] : ["self_use", "long_term_appreciation"],
    strengths: Array.isArray(rawAnalysis?.strengths) ? rawAnalysis.strengths.slice(0, 6) : [],
    risks: [...(Array.isArray(rawAnalysis?.risks) ? rawAnalysis.risks.slice(0, 6) : []), ...deterministic.warnings].slice(0, 8),
    missingInformation: [...new Set([...(Array.isArray(rawAnalysis?.missingInformation) ? rawAnalysis.missingInformation : []), ...deterministic.missingFields])].slice(0, 10),
    verdict: confidence === "low" ? "needs_more_data" : overallScore >= 75 ? "strong_shortlist" : overallScore >= 55 ? "worth_inspecting" : "low_priority",
    confidence,
    confidenceReason: confidence === "low"
      ? "Comparable evidence or critical auction-property fields are limited."
      : "Confidence is based on usable comparable count and auction-property completeness.",
    groundedSources: Array.isArray(rawAnalysis?.groundedSources) ? rawAnalysis.groundedSources.filter((item) => item?.url).slice(0, 12) : [],
    disclaimer: DEFAULT_DISCLAIMER,
    comparableCount: saleComparables.length + rentalComparables.length,
  };
}

function fallbackAnalysis(property, deterministic, reason = "Live comparable search was not available.") {
  return processGroundedAnalysis(property, deterministic, buildComparableSearchContext(property), {
    saleComparables: [],
    rentalComparables: [],
    strengths: property.reservePrice ? ["Reserve price is available for preliminary screening."] : [],
    risks: [reason],
    missingInformation: deterministic.missingFields,
    groundedSources: [],
  });
}

async function sha256Json(value) {
  const stableStringify = (input) => {
    if (Array.isArray(input)) return `[${input.map(stableStringify).join(",")}]`;
    if (input && typeof input === "object") {
      return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(input[key])}`).join(",")}}`;
    }
    return JSON.stringify(input);
  };
  const json = stableStringify(value);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function supabaseFetch(env, path) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Supabase read failed: ${response.status} ${message}`);
  }
  return response.json();
}

async function supabaseWrite(env, path, body, method = "POST") {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Supabase write failed: ${response.status} ${message}`);
  }
  return response.json().catch(() => null);
}

async function loadAuction(env, auctionId) {
  const rows = await supabaseFetch(env, `auctions?select=*&auction_id=eq.${encodeURIComponent(auctionId)}&limit=1`);
  return rows?.[0] ?? null;
}

async function readCache(env, auctionId, inputHash, provider, model) {
  const rows = await supabaseFetch(
    env,
    `property_market_analysis?select=*&auction_id=eq.${encodeURIComponent(auctionId)}&input_hash=eq.${encodeURIComponent(inputHash)}&provider=eq.${provider}&model=eq.${encodeURIComponent(model)}&status=eq.success&order=created_at.desc&limit=1`,
  ).catch(() => []);
  const cached = rows?.[0];
  if (!cached) return null;
  const createdAt = new Date(cached.created_at).getTime();
  if (Date.now() - createdAt > CACHE_DAYS * 24 * 60 * 60 * 1000) return null;
  return cached;
}

async function readPermanentAuctionCache(env, auctionId, provider) {
  const rows = await supabaseFetch(
    env,
    `property_market_analysis?select=*&auction_id=eq.${encodeURIComponent(auctionId)}&provider=eq.${encodeURIComponent(provider)}&status=eq.success&order=created_at.desc&limit=1`,
  );
  return rows?.[0] ?? null;
}

function isMissingMarketAnalysisTable(error) {
  return /property_market_analysis|PGRST205|schema cache/i.test(error?.message || "");
}

async function logUsage(env, payload) {
  await supabaseWrite(env, "ai_usage_log", [payload]).catch(() => null);
}

async function freshRequestCount(env, auctionId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseFetch(
    env,
    `ai_usage_log?select=id&auction_id=eq.${encodeURIComponent(auctionId)}&cached=eq.false&success=eq.true&created_at=gte.${encodeURIComponent(since)}&limit=20`,
  ).catch(() => []);
  return rows.length;
}

function extractJson(text) {
  if (!text) throw new Error("Gemini returned an empty response.");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Gemini response did not contain JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeTavilyResult(item, comparableType) {
  const url = typeof item?.url === "string" ? item.url : null;
  return {
    comparableType,
    title: String(item?.title || "Search result"),
    url,
    content: String(item?.content || item?.raw_content || "").slice(0, 1400),
    score: numberOrNull(item?.score),
    sourceName: url ? new URL(url).hostname.replace(/^www\./, "") : null,
    publishedDate: item?.published_date || null,
  };
}

async function tavilySearch(env, query, comparableType) {
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("Tavily is not configured.");
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      topic: "general",
      max_results: 6,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || payload?.message || `Tavily failed: ${response.status}`);
  return {
    query,
    comparableType,
    results: Array.isArray(payload.results) ? payload.results.map((item) => normalizeTavilyResult(item, comparableType)) : [],
  };
}

async function tavilyComparableSearch(env, searchContext) {
  const saleSearch = await tavilySearch(env, searchContext.primarySearchQuery, "sale");
  const rentalSearch = await tavilySearch(env, searchContext.rentalSearchQuery, "rental");
  return {
    provider: "tavily",
    saleSearch,
    rentalSearch,
    rawResults: [...saleSearch.results, ...rentalSearch.results],
  };
}

async function geminiRequest(env, input, attempt = 0) {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;
  if (!apiKey || !model) throw new Error("Gemini is not configured.");
  const groundingEnabled = String(env.ENABLE_GOOGLE_SEARCH_GROUNDING ?? "true") === "true";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 45000);
  const hasExternalSearchResults = Array.isArray(input?.searchResults?.rawResults);
  const prompt = [
    hasExternalSearchResults
      ? "You are analysing an Indian bank-auction property. Use only the supplied Tavily search results as online evidence. Return structured JSON only. Do not fabricate URLs, prices, rents, distances, land area, legal facts, transaction prices, or source names. If a price/rent/area is not visible in the supplied snippets, leave it null. Online listing prices are asking prices, not completed transaction prices. For independent houses, land extent is a major valuation input; if missing, lower confidence."
      : "You are analysing an Indian bank-auction property. Use Google Search to find current comparable sale and rental listings. Return structured JSON only. Do not fabricate URLs, prices, rents, distances, land area, legal facts, or transaction prices. Online listing prices are asking prices, not completed transaction prices. For independent houses, land extent is a major valuation input; if missing, lower confidence.",
    JSON.stringify(input, null, 2),
  ].join("\n\n");
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
    tools: groundingEnabled && !hasExternalSearchResults ? [{ google_search: {} }] : undefined,
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `Gemini failed: ${response.status}`);
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const analysis = extractJson(text);
    const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundedSources = chunks
      .map((chunk) => chunk.web)
      .filter((web) => web?.uri)
      .map((web) => ({ title: web.title || web.uri, url: web.uri, sourceName: web.title || null }));
    analysis.groundedSources = [...(analysis.groundedSources || []), ...groundedSources];
    return { analysis, raw: payload, groundingEnabled };
  } catch (error) {
    if (attempt < 1 && !/JSON|validation/i.test(error.message || "")) {
      return geminiRequest(env, input, attempt + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseRequest(request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/properties\/([^/]+)\/market-analysis$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function handleMarketAnalysisRequest(request, env) {
  const auctionId = parseRequest(request);
  if (!auctionId) return null;
  if (request.method !== "POST") return jsonResponse({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, 405);
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(auctionId)) {
    return jsonResponse({ error: { code: "INVALID_AUCTION_ID", message: "Invalid auction ID." } }, 400);
  }
  const searchProvider = env.SEARCH_PROVIDER || (env.TAVILY_API_KEY ? "tavily" : "gemini-grounding");
  const provider = searchProvider === "tavily" ? "tavily+gemini" : (env.AI_PROVIDER || "gemini");
  const model = env.GEMINI_MODEL || "not-configured";
  const groundingEnabled = String(env.ENABLE_GOOGLE_SEARCH_GROUNDING ?? "true") === "true";
  const auction = await loadAuction(env, auctionId);
  if (!auction) return jsonResponse({ error: { code: "NOT_FOUND", message: "Auction property was not found." } }, 404);
  const { property, areaWarnings } = normalizeProperty(auction.payload || {});
  const deterministic = calculateDeterministicAnalysis(property, areaWarnings);
  const searchContext = buildComparableSearchContext(property);
  const baseScore = auctionBaseScore(auction);
  if (baseScore !== null && baseScore < AI_ANALYSIS_MIN_SCORE) {
    return jsonResponse({
      property,
      deterministic,
      searchContext,
      marketAnalysis: null,
      fallbackAnalysis: fallbackAnalysis(property, deterministic, `AI market analysis is reserved for auctions scoring ${AI_ANALYSIS_MIN_SCORE}+ before paid search enrichment.`),
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: property.sourceUpdatedAt,
      provider,
      model,
      searchProvider,
      groundingEnabled,
      cached: false,
      skipped: true,
      baseScore,
      minScore: AI_ANALYSIS_MIN_SCORE,
      error: {
        code: "LOW_BASE_SCORE",
        message: `This auction score is ${baseScore}/100. AI market analysis starts at ${AI_ANALYSIS_MIN_SCORE}/100.`,
      },
    }, 200);
  }
  const inputHash = await sha256Json({
    property: {
      auctionId: property.auctionId,
      bankPropertyId: property.bankPropertyId,
      reservePrice: property.reservePrice,
      address: property.address,
      area: [property.carpetAreaSqft, property.builtUpAreaSqft, property.landAreaSqft],
      possessionStatus: property.possessionStatus,
      propertySubType: property.propertySubType,
      sourceUpdatedAt: property.sourceUpdatedAt,
    },
    model,
    searchProvider,
  });
  let permanentCached = null;
  try {
    permanentCached = await readPermanentAuctionCache(env, auctionId, provider);
  } catch (err) {
    if (isMissingMarketAnalysisTable(err)) {
      return jsonResponse({
        property,
        deterministic,
        searchContext,
        marketAnalysis: null,
        fallbackAnalysis: fallbackAnalysis(property, deterministic, "AI cache tables are not set up yet, so paid comparable search was not run."),
        generatedAt: new Date().toISOString(),
        sourceUpdatedAt: property.sourceUpdatedAt,
        provider,
        model,
        searchProvider,
        groundingEnabled,
        cached: false,
        skipped: true,
        baseScore,
        error: {
          code: "AI_CACHE_NOT_CONFIGURED",
          message: "Run supabase/schema.sql before Tavily/Gemini enrichment. This prevents repeated paid search calls without cache storage.",
        },
      }, 503);
    }
    throw err;
  }
  const cached = permanentCached || (body.forceRefresh ? null : await readCache(env, auctionId, inputHash, provider, model));
  if (cached) {
    return jsonResponse({
      property: cached.property_snapshot,
      deterministic: cached.deterministic_analysis,
      searchContext: cached.search_context,
      marketAnalysis: cached.processed_analysis,
      generatedAt: cached.created_at,
      sourceUpdatedAt: cached.source_updated_at,
      provider: cached.provider,
      model: cached.model,
      searchProvider,
      groundingEnabled: cached.grounding_enabled,
      baseScore,
      cached: true,
    });
  }
  if ((await freshRequestCount(env, auctionId)) >= MAX_FRESH_ANALYSES_PER_DAY) {
    const fallback = fallbackAnalysis(property, deterministic, "Daily fresh-analysis limit reached for this property.");
    return jsonResponse({ property, deterministic, searchContext, marketAnalysis: fallback, cached: false, error: { code: "RATE_LIMITED", message: "Fresh analysis limit reached. Try cached results later." } }, 429);
  }
  let rawAi = null;
  let processed = null;
  let status = "success";
  let error = null;
  let searchResults = null;
  try {
    if (searchProvider === "tavily") {
      searchResults = await tavilyComparableSearch(env, searchContext);
    }
    const aiInput = { property, deterministic, searchContext, searchResults };
    const gemini = await geminiRequest(env, aiInput);
    rawAi = { gemini: gemini.raw, searchResults };
    processed = processGroundedAnalysis(property, deterministic, searchContext, gemini.analysis);
  } catch (err) {
    error = sanitizeError(err);
    status = "failed";
    processed = fallbackAnalysis(property, deterministic, error.message);
  }
  const rows = await supabaseWrite(env, "property_market_analysis?on_conflict=auction_id,input_hash,provider,model", [{
    auction_id: property.auctionId,
    bank_property_id: property.bankPropertyId,
    input_hash: inputHash,
    source_updated_at: property.sourceUpdatedAt,
    provider,
    model,
    grounding_enabled: groundingEnabled,
    property_snapshot: property,
    deterministic_analysis: deterministic,
    search_context: searchContext,
    raw_ai_analysis: rawAi,
    processed_analysis: processed,
    grounded_sources: processed.groundedSources || [],
    status,
    error_message: error?.message ?? null,
    updated_at: new Date().toISOString(),
  }]).catch(() => null);
  const analysisId = rows?.[0]?.id;
  if (analysisId && processed) {
    const comparableRows = [...processed.saleComparables.map((item) => [item, "sale"]), ...processed.rentalComparables.map((item) => [item, "rental"])]
      .map(([item, comparableType]) => ({
        analysis_id: analysisId,
        auction_id: property.auctionId,
        comparable_type: comparableType,
        title: item.title,
        locality: item.locality,
        property_type: item.propertyType,
        bhk: item.bhk,
        built_up_area_sqft: item.builtUpAreaSqft,
        land_area_cents: item.landAreaCents,
        asking_price: item.askingPrice,
        monthly_rent: item.monthlyRent,
        price_per_sqft: item.pricePerSqft,
        source_name: item.sourceName,
        source_url: item.sourceUrl,
        published_or_updated_at: item.publishedOrUpdatedDate,
        similarity_score: item.similarityScore,
        match_reason: item.matchReason,
      }));
    if (comparableRows.length) await supabaseWrite(env, "property_comparables", comparableRows).catch(() => null);
  }
  await logUsage(env, {
    provider,
    model,
    auction_id: property.auctionId,
    grounded: groundingEnabled,
    request_count: 1,
    search_query_count: searchProvider === "tavily" ? 2 : null,
    cached: false,
    success: status === "success",
    error_code: error?.code ?? null,
  });
  return jsonResponse({
    property,
    deterministic,
    searchContext,
    marketAnalysis: status === "success" ? processed : null,
    fallbackAnalysis: status === "success" ? null : processed,
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt: property.sourceUpdatedAt,
    provider,
    model,
    searchProvider,
    groundingEnabled,
    baseScore,
    cached: false,
    error,
  }, status === "success" ? 200 : 200);
}
