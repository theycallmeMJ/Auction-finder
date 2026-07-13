"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  SUPABASE_SESSION_STORAGE_KEY,
  fetchSupabaseAuctions,
  fetchSupabaseCatalog,
  getCurrentUser,
  getSessionEventKey,
  hasSupabaseConfig,
  readSessionFromUrl,
  recordLoginEvent,
  sendMagicLink,
  signInWithGoogle,
  signOut,
  type SupabaseAuthSession,
} from "./supabase";

type Auction = {
  status: string;
  auctionId: string;
  bankPropertyId: string;
  title: string;
  propertyType?: string;
  propertySubType?: string;
  propertyAddress?: string;
  borrowerName?: string;
  borrowerAddress?: string;
  customerId?: string;
  branch?: string;
  officer?: string;
  carpetArea?: string;
  builtUpArea?: string;
  areaSqft?: string;
  typeOfAction?: string;
  dealingOfficer?: string;
  mobileNo?: string;
  branchAddress?: string;
  inspectionDateFrom?: string;
  inspectionDateTo?: string;
  emdStartDate?: string;
  emdEndDate?: string;
  emd?: string;
  incrementPrice?: string;
  incrementDuringExtension?: string;
  extendWhenBidInLastMinutes?: string;
  extendByMinutes?: string;
  auctionDetailUrl?: string;
  propertyDetailUrl?: string;
  bank: string;
  reservePriceText: string;
  reservePrice: number | null;
  state: string;
  district: string;
  city: string;
  pinCode: string;
  startDate: string;
  endDate: string;
  location: string;
  loanAvailable: boolean;
  possessionStatus?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  nearbyPlaces?: {
    categories?: Record<string, unknown>;
    status?: string;
  } | null;
  pricePerSqft?: number | null;
  score?: {
    overall: number;
    area: number;
    property: number;
    risk: number;
    confidence: number;
    bonus: number;
    riskLabel: string;
    confidenceLabel: string;
    rankState?: number | null;
    rankDistrict?: number | null;
    explanations?: {
      area?: string[];
      property?: string[];
      risk?: string[];
      confidence?: string[];
      bonus?: string[];
    };
  };
  searchText: string;
};

type Option = {
  id: string;
  name: string;
  stateId?: string;
  districtId?: string;
  propertyTypeId?: string;
};

type Catalog = {
  states: Option[];
  districts: Option[];
  cities: Option[];
  propertyTypes: Option[];
  propertySubTypes: Option[];
  possessionStatuses: Option[];
};

type ComparableProperty = {
  title: string;
  locality: string | null;
  propertyType: string;
  bhk: number | null;
  builtUpAreaSqft: number | null;
  landAreaCents: number | null;
  askingPrice: number | null;
  monthlyRent: number | null;
  pricePerSqft: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  similarityScore: number;
  matchReason: string;
};

type MarketAnalysis = {
  saleComparables: ComparableProperty[];
  rentalComparables: ComparableProperty[];
  marketAssessment: {
    comparableAskingPriceLow: number | null;
    comparableAskingPriceHigh: number | null;
    medianComparableAskingPrice: number | null;
    adjustedMarketValueLow: number | null;
    adjustedMarketValueHigh: number | null;
    adjustmentReason: string;
  };
  rentalAssessment: {
    estimatedMonthlyRentLow: number | null;
    estimatedMonthlyRentHigh: number | null;
    likelyMonthlyRent: number | null;
    rentalDemand: string;
    explanation: string;
  };
  investmentAssessment: {
    auctionDiscountLowPercent: number | null;
    auctionDiscountHighPercent: number | null;
    grossRentalYieldLowPercent: number | null;
    grossRentalYieldHighPercent: number | null;
    fairPriceScore?: number;
    smartScore?: number;
    rentalComponents?: {
      tenantDemand: number;
      occupancyPotential: number;
      rentalYield: number;
      tenantStability: number;
      rentGrowth: number;
    };
    locationScore: number;
    rentalScore: number;
    appreciationScore: number;
    liquidityScore: number;
    valueScore: number;
    riskScore: number;
    overallScore: number;
    weights?: {
      fairPrice: number;
      appreciation: number;
      rental: number;
      location: number;
      liquidity: number;
      risk: number;
    };
  };
  evidenceQuality?: Record<string, { score: number; level: string; reason: string }>;
  locationEvidence?: {
    coordinatesAvailable: boolean;
    confirmedNearbyPlaces: Array<{ name: string; type: string; distanceKm: number }>;
    candidateHintsUsedOnlyForSearch: string[];
    explanation: string;
  };
  strengths: string[];
  risks: string[];
  missingInformation: string[];
  verdict: string;
  confidence: string;
  confidenceReason: string;
  groundedSources: Array<{ title: string; url: string; sourceName: string | null }>;
  searchDiagnostics?: {
    saleSearches?: Array<{ query: string; resultCount: number; keptCount?: number }>;
    rentalSearches?: Array<{ query: string; resultCount: number; keptCount?: number }>;
    valueSearches?: Array<{ query: string; resultCount: number; keptCount?: number }>;
    saleResultCount?: number;
    rentalResultCount?: number;
    valueResultCount?: number;
    broadened?: boolean;
  } | null;
  disclaimer: string;
  comparableCount?: number;
};

type MarketAnalysisResponse = {
  marketAnalysis: MarketAnalysis | null;
  fallbackAnalysis?: MarketAnalysis | null;
  deterministic?: {
    completenessScore: number;
    preliminaryScore: number;
    missingFields: string[];
    criticalMissingFields: string[];
    warnings: string[];
  };
  searchContext?: {
    primarySearchQuery: string;
    rentalSearchQuery: string;
  };
  cached: boolean;
  provider: string;
  model: string;
  searchProvider?: string;
  groundingEnabled: boolean;
  skipped?: boolean;
  baseScore?: number | null;
  minScore?: number;
  error?: {
    code: string;
    message: string;
  } | null;
};

type MarketAnalysisState = {
  status: "idle" | "loading" | "success" | "error";
  loadingStep: number;
  data?: MarketAnalysisResponse;
  error?: string;
};

const fallbackCatalog: Catalog = {
  states: [{ id: "17", name: "Kerala" }],
  districts: [{ id: "313", name: "Kottayam", stateId: "17" }],
  cities: [
    { id: "vaikom", name: "Vaikom", districtId: "313" },
    { id: "ettumanoor", name: "Ettumanoor", districtId: "313" },
    { id: "kottayam", name: "Kottayam", districtId: "313" },
    { id: "pampady", name: "Pampady", districtId: "313" },
    { id: "pala", name: "Pala", districtId: "313" },
    { id: "athirampuzha", name: "Athirampuzha", districtId: "313" },
    { id: "karukachal", name: "Karukachal", districtId: "313" },
  ],
  propertyTypes: [
    { id: "1", name: "Residential" },
    { id: "2", name: "Commercial" },
    { id: "3", name: "Agriculture" },
    { id: "4", name: "Industrial" },
    { id: "5", name: "Other" },
  ],
  propertySubTypes: [
    { id: "house", name: "Individual House", propertyTypeId: "1" },
    { id: "flat", name: "Flat", propertyTypeId: "1" },
    { id: "plot", name: "Plot", propertyTypeId: "1" },
    { id: "land-building", name: "Land and Building", propertyTypeId: "2" },
    { id: "godown", name: "Godown", propertyTypeId: "2" },
    { id: "vacant-land", name: "Vacant Land", propertyTypeId: "3" },
  ],
  possessionStatuses: [
    { id: "1", name: "Physical" },
    { id: "2", name: "Symbolic" },
    { id: "3", name: "Other" },
    { id: "unknown", name: "Unknown" },
  ],
};

const fallbackAuctions: Auction[] = [
  {
    status: "upcoming",
    auctionId: "325954",
    bankPropertyId: "CNRB311737190",
    title: "Individual House for Sale in VAIKOM, Vaikom",
    propertyType: "Residential",
    propertySubType: "Individual House",
    propertyAddress: "RESIDENTIAL BUILDING IN RE SY 72/2 BLOCK NO 8 CHENGAMAND VILLAGE ALUVA TALUK ERNAKULAM DISTRICT",
    borrowerName: "PRINTECH COMMUNICATION",
    borrowerAddress: "CITY TOWERS 2ND FLOOR BANK JUNCTION ALUVA 683101",
    customerId: "10532130098",
    branch: "ALUVA -(METRO STATION) - 5978",
    officer: "AROMAL BABU-Authorised Officer - Scale - IV - CM",
    carpetArea: "1100.00 sq feet",
    typeOfAction: "SARFAESI",
    dealingOfficer: "",
    mobileNo: "",
    branchAddress: "I Floor, 28/206, Kadicheemi Complex, Trunk Road",
    inspectionDateFrom: "",
    inspectionDateTo: "",
    emdStartDate: "26-06-2026 10:47",
    emdEndDate: "13-07-2026 17:00",
    emd: "1,10,000.00",
    incrementPrice: "25,000.00",
    incrementDuringExtension: "25,000.00",
    extendWhenBidInLastMinutes: "5",
    extendByMinutes: "5",
    bank: "Canara Bank",
    reservePriceText: "67.00 Lakh",
    reservePrice: 6700000,
    state: "Kerala",
    district: "",
    city: "Vaikom",
    pinCode: "686141",
    startDate: "14-07-2026 10:30:00",
    endDate: "14-07-2026 11:30:00",
    location: "Kerala, Kottayam, Vaikom-686141",
    loanAvailable: false,
    possessionStatus: "Unknown",
    pricePerSqft: null,
    score: {
      overall: 72,
      area: 74,
      property: 66,
      risk: 58,
      confidence: 72,
      bonus: 50,
      riskLabel: "Medium",
      confidenceLabel: "Medium",
      rankState: 1,
      rankDistrict: 1,
      explanations: {
        area: ["Fallback Kerala profile"],
        property: ["Reserve price and category available"],
        risk: ["Possession not captured"],
        confidence: ["Listing data available"],
        bonus: ["Neutral bonus until history is available"],
      },
    },
    searchText: "individual house vaikom canara bank kerala kottayam 686141",
  },
  {
    status: "upcoming",
    auctionId: "325171",
    bankPropertyId: "SBIN78523627212",
    title: "3 BHK Individual House for Sale in Pakalomattam, Ettumanoor",
    propertyType: "Residential",
    propertySubType: "Individual House",
    bank: "State Bank of India",
    reservePriceText: "19.50 Lakh",
    reservePrice: 1950000,
    state: "Kerala",
    district: "Kottayam",
    city: "Ettumanoor",
    pinCode: "686568",
    startDate: "14-07-2026 11:00:00",
    endDate: "14-07-2026 16:00:00",
    location: "Kerala, Kottayam, Ettumanoor-686568",
    loanAvailable: false,
    possessionStatus: "Unknown",
    searchText: "3 bhk individual house pakalomattam ettumanoor sbi kerala kottayam 686568",
  },
  {
    status: "upcoming",
    auctionId: "328309",
    bankPropertyId: "UBINMLRKTM3470",
    title: "Individual House for Sale in Kottayam",
    propertyType: "Residential",
    propertySubType: "Individual House",
    bank: "Union Bank of India",
    reservePriceText: "57.68 Lakh",
    reservePrice: 5768000,
    state: "Kerala",
    district: "Kottayam",
    city: "Kottayam",
    pinCode: "686010",
    startDate: "14-07-2026 12:00:00",
    endDate: "14-07-2026 17:00:00",
    location: "Kerala, Kottayam, Kottayam-686010",
    loanAvailable: false,
    possessionStatus: "Unknown",
    searchText: "individual house kottayam union bank kerala kottayam 686010",
  },
  {
    status: "upcoming",
    auctionId: "328252",
    bankPropertyId: "UBINEKLKTM3927",
    title: "Individual House for Sale in PAMPADY",
    propertyType: "Residential",
    propertySubType: "Individual House",
    bank: "Union Bank of India",
    reservePriceText: "14.54 Lakh",
    reservePrice: 1454000,
    state: "Kerala",
    district: "Kottayam",
    city: "Pampady",
    pinCode: "686502",
    startDate: "14-07-2026 12:00:00",
    endDate: "14-07-2026 17:00:00",
    location: "Kerala, Kottayam, Pampady-686502",
    loanAvailable: false,
    possessionStatus: "Unknown",
    searchText: "individual house pampady union bank kerala kottayam 686502",
  },
  {
    status: "upcoming",
    auctionId: "310304",
    bankPropertyId: "CNRB43598010006203",
    title: "Plot for Sale in Pala",
    propertyType: "Residential",
    propertySubType: "Plot",
    bank: "Canara Bank",
    reservePriceText: "15.03 Lakh",
    reservePrice: 1503000,
    state: "Kerala",
    district: "Kottayam",
    city: "Pala",
    pinCode: "686575",
    startDate: "15-07-2026 14:00:00",
    endDate: "15-07-2026 16:00:00",
    location: "Kerala, Kottayam, Pala-686575",
    loanAvailable: false,
    possessionStatus: "Unknown",
    searchText: "plot pala canara bank kerala kottayam 686575",
  },
  {
    status: "upcoming",
    auctionId: "322310",
    bankPropertyId: "SBIN77070908994C",
    title: "Individual House for Sale in Thellakom, Athirampuzha",
    propertyType: "Residential",
    propertySubType: "Individual House",
    bank: "State Bank of India",
    reservePriceText: "3.33 Crore",
    reservePrice: 33300000,
    state: "Kerala",
    district: "Kottayam",
    city: "Athirampuzha",
    pinCode: "686630",
    startDate: "20-07-2026 11:00:00",
    endDate: "20-07-2026 16:00:00",
    location: "Kerala, Kottayam, Athirampuzha-686630",
    loanAvailable: false,
    possessionStatus: "Unknown",
    searchText: "individual house thellakom athirampuzha state bank of india kerala kottayam",
  },
  {
    status: "closed",
    auctionId: "306551",
    bankPropertyId: "SBIN200052359984",
    title: "Individual House for Sale in Trikkodithanam, Changanacherry",
    propertyType: "Residential",
    propertySubType: "Individual House",
    bank: "State Bank of India",
    reservePriceText: "27.50 Lakh",
    reservePrice: 2750000,
    state: "Kerala",
    district: "Kottayam",
    city: "Changanacherry",
    pinCode: "686102",
    startDate: "07-07-2026 11:00:00",
    endDate: "07-07-2026 16:00:00",
    location: "Kerala, Kottayam, Changanacherry-686102",
    loanAvailable: false,
    possessionStatus: "Unknown",
    searchText: "individual house trikkodithanam changanacherry state bank of india kerala kottayam",
  },
];

const statusLabels: Record<string, string> = {
  upcoming: "Upcoming",
  live: "Live",
  closed: "Closed",
  cancelled: "Cancelled",
};

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const pricePresets = [
  { label: "Under 25L", min: "", max: "2500000" },
  { label: "25L-75L", min: "2500000", max: "7500000" },
  { label: "75L-2Cr", min: "7500000", max: "20000000" },
  { label: "Above 2Cr", min: "20000000", max: "" },
];

const scoreKeys = [
  { key: "area", label: "Area", weight: "35%" },
  { key: "property", label: "Property", weight: "25%" },
  { key: "risk", label: "Risk", weight: "20%" },
  { key: "confidence", label: "Confidence", weight: "10%" },
  { key: "bonus", label: "Bonus", weight: "10%" },
] as const;

const RESULTS_BATCH_SIZE = 40;
const PROTECTED_ACTION_STORAGE_KEY = "kerala-auction-finder-protected-actions";
const LOGIN_EVENT_STORAGE_KEY = "kerala-auction-finder-login-event";

function readPublicEnv(key: string) {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return processEnv[key] ?? viteEnv[key];
}

function getFreeProtectedActions() {
  const configured =
    readPublicEnv("NEXT_PUBLIC_FREE_PROTECTED_ACTIONS") ??
    readPublicEnv("VITE_FREE_PROTECTED_ACTIONS");
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 2;
}

const FREE_PROTECTED_ACTIONS = getFreeProtectedActions();

function priceLabel(value: number | null) {
  if (!value) return "Price unavailable";
  return formatter.format(value);
}

function rangeLabel(low?: number | null, high?: number | null) {
  if (!low && !high) return "Not enough evidence";
  if (low && high) return `${priceLabel(low)} - ${priceLabel(high)}`;
  return priceLabel(low ?? high ?? null);
}

function hasMoneyRange(low?: number | null, high?: number | null) {
  return Boolean(low || high);
}

function percentRangeLabel(low?: number | null, high?: number | null) {
  if (typeof low !== "number" && typeof high !== "number") return "Not enough evidence";
  const format = (value: number) => `${Math.max(0, value).toFixed(1)}%`;
  if (typeof low === "number" && typeof high === "number") return `${format(low)} - ${format(high)}`;
  return format((low ?? high) as number);
}

function hasPercentRange(low?: number | null, high?: number | null) {
  return typeof low === "number" || typeof high === "number";
}

function scoreLabel(value?: number) {
  return typeof value === "number" ? `${value}/100` : "Pending";
}

function humanizeFieldName(value: string) {
  const known: Record<string, string> = {
    builtUpOrCarpetArea: "Built-up / carpet area",
    ownershipType: "Ownership type",
    constructionAge: "Construction age",
    coordinates: "Map coordinates",
    images: "Photos",
    landArea: "Land area",
  };
  return known[value] ?? value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function compactInsightList(items: string[], fallback: string, limit = 4) {
  const seen = new Set<string>();
  const cleaned = items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.replace(/\s+/g, " ").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return (cleaned.length ? cleaned : [fallback]).slice(0, limit);
}

function compactRiskList(items: string[]) {
  const liveRefresh = items.find((item) => /^Live refresh failed:/i.test(item));
  const rest = items.filter((item) => !/^Live refresh failed:/i.test(item));
  return compactInsightList([...(liveRefresh ? [liveRefresh] : []), ...rest], "No risks identified yet.", 4);
}

function isAnalysisSystemNote(item: string) {
  return /^(Live refresh failed:|Live comparable search|Gemini analysis quota|Tavily comparable-search quota|AI analysis quota)/i.test(item);
}

function areaLabel(auction: Auction) {
  return auction.builtUpArea || auction.carpetArea || auction.areaSqft || "Not captured yet";
}

function hasMapCoordinates(auction: Auction) {
  return auction.latitude !== null && auction.latitude !== undefined && auction.longitude !== null && auction.longitude !== undefined;
}

function hasNearbyEvidence(auction: Auction) {
  return Boolean(auction.nearbyPlaces?.categories);
}

function mapAreaScore(auction: Auction) {
  return auction.score?.area ?? null;
}

function nearbyTypeLabel(type: string) {
  const normalized = type.toLowerCase().replace(/[_-]+/g, " ");
  const labels: Record<string, string> = {
    bus: "Bus stand",
    "bus stand": "Bus stand",
    hospital: "Hospital",
    clinic: "Clinic",
    metro: "Metro",
    school: "School",
    college: "College",
  };
  return labels[normalized] ?? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeAuction(auction: Auction): Auction {
  return {
    ...auction,
    state: auction.state || "Kerala",
    possessionStatus: auction.possessionStatus ?? "Unknown",
  };
}

function parseAuctionDate(value: string) {
  const [date = "", time = "00:00:00"] = value.split(" ");
  const [day, month, year] = date.split("-").map(Number);
  if (!day || !month || !year) return 0;
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${time}`).getTime();
}

function splitDateTime(value: string) {
  const [date = "", time = ""] = value.split(" ");
  return { date, time };
}

const marketLoadingSteps = [
  "Preparing property data",
  "Searching similar properties",
  "Comparing prices",
  "Calculating investment score",
];

function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.id} value={option.name}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function MarketAnalysisPanel({
  auction,
  state,
  onRequest,
  onRefresh,
}: {
  auction: Auction;
  state?: MarketAnalysisState;
  onRequest: () => void;
  onRefresh: () => void;
}) {
  const data = state?.data;
  const analysis = data?.marketAnalysis ?? data?.fallbackAnalysis ?? null;
  const isLoading = state?.status === "loading";
  const comparableCount = analysis?.comparableCount ?? ((analysis?.saleComparables.length ?? 0) + (analysis?.rentalComparables.length ?? 0));
  const saleSearches = analysis?.searchDiagnostics?.saleSearches ?? [];
  const rentalSearches = analysis?.searchDiagnostics?.rentalSearches ?? [];
  const valueSearches = analysis?.searchDiagnostics?.valueSearches ?? [];
  const showSearchDiagnostics = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugAi") === "1";
  const strengths = compactInsightList(analysis?.strengths ?? [], "No strengths identified yet.");
  const risks = compactRiskList(analysis?.risks ?? []);
  const missingInformation = compactInsightList(
    (analysis?.missingInformation ?? []).map(humanizeFieldName),
    "No major missing fields flagged.",
    6,
  );
  const smartScore = analysis?.investmentAssessment.smartScore ?? analysis?.investmentAssessment.overallScore;
  const confirmedNearby = analysis?.locationEvidence?.confirmedNearbyPlaces ?? [];
  const nearestPlaces = [...confirmedNearby]
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, 6);
  const locationConfidence = analysis?.evidenceQuality?.location;
  const analysisNote = analysis ? [
    data?.error?.message,
    ...(!data?.cached ? (analysis.risks ?? []).filter(isAnalysisSystemNote) : []),
  ].find(Boolean) : null;
  const propertyRisks = analysis ? compactInsightList(
    (analysis.risks ?? []).filter((item) => !isAnalysisSystemNote(item)),
    "No major property risk flagged.",
    4,
  ) : [];
  const hasAdjustedMarketRange = hasMoneyRange(analysis?.marketAssessment.adjustedMarketValueLow, analysis?.marketAssessment.adjustedMarketValueHigh);
  const hasComparableAskingRange = hasMoneyRange(analysis?.marketAssessment.comparableAskingPriceLow, analysis?.marketAssessment.comparableAskingPriceHigh);
  const hasAuctionDiscount = hasPercentRange(analysis?.investmentAssessment.auctionDiscountLowPercent, analysis?.investmentAssessment.auctionDiscountHighPercent);
  const hasRentalEstimate = hasMoneyRange(analysis?.rentalAssessment.estimatedMonthlyRentLow, analysis?.rentalAssessment.estimatedMonthlyRentHigh);
  const hasRentalYield = hasPercentRange(analysis?.investmentAssessment.grossRentalYieldLowPercent, analysis?.investmentAssessment.grossRentalYieldHighPercent);
  const hasRentalDemand = analysis?.rentalAssessment.rentalDemand && analysis.rentalAssessment.rentalDemand.toLowerCase() !== "unknown";

  return (
    <section className="market-analysis">
      <div className="market-analysis-head">
        <div>
          <h4>Smart AI Score</h4>
          <p>Runs market value, rental, risk, and confirmed location evidence in one analysis.</p>
        </div>
        <div className="market-analysis-actions">
          <button type="button" onClick={onRequest} disabled={isLoading}>
            {analysis ? "Check again" : "Generate Smart AI Score"}
          </button>
          {analysis && (
            <button type="button" className="ghost-button" onClick={onRefresh} disabled={isLoading}>
              Force refresh
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="market-loading" role="status" aria-live="polite">
          <div className="market-spinner" aria-hidden="true" />
          <div>
            <strong>AI is fetching diamonds...</strong>
            <span>{marketLoadingSteps[state?.loadingStep ?? 0] ?? marketLoadingSteps[0]}</span>
          </div>
        </div>
      )}

      {state?.status === "error" && !analysis && (
        <p className="market-error">{state.error || "Market analysis is temporarily unavailable."}</p>
      )}

      {data?.error && (
        <p className="market-warning">
          {data.error.message} Showing deterministic preliminary analysis where available.
        </p>
      )}

      {analysis && (
        <>
          <div className="smart-score-panel">
            <div className="smart-score-main">
              <span>Smart AI Score</span>
              <strong>{smartScore ?? "--"}/100</strong>
              <small>{analysis.verdict.replace(/_/g, " ")}</small>
            </div>
            <div className="smart-score-context">
              <div className="smart-score-meta">
                <span>{analysis.verdict.replace(/_/g, " ")}</span>
                <span>{analysis.confidence} confidence</span>
                <span>{comparableCount} comparables</span>
              </div>
              <p>{analysis.confidenceReason}</p>
              <div className="nearby-chip-list">
                {confirmedNearby.length ? confirmedNearby.slice(0, 4).map((item) => (
                  <span key={`${item.type}-${item.name}`}>
                    {nearbyTypeLabel(item.type)} · {item.name} · {item.distanceKm} km
                  </span>
                )) : (
                  <span>{analysis.locationEvidence?.coordinatesAvailable ? "No strong nearby-place evidence yet" : "Map coordinates not available"}</span>
                )}
              </div>
            </div>
          </div>

          <div className="ai-simple-grid">
            {hasAdjustedMarketRange && (
              <div>
                <span>Likely market value</span>
                <strong>{rangeLabel(analysis.marketAssessment.adjustedMarketValueLow, analysis.marketAssessment.adjustedMarketValueHigh)}</strong>
                <small>Reserve: {priceLabel(auction.reservePrice)}</small>
              </div>
            )}
            {hasAuctionDiscount && (
              <div>
                <span>Auction discount</span>
                <strong>{percentRangeLabel(analysis.investmentAssessment.auctionDiscountLowPercent, analysis.investmentAssessment.auctionDiscountHighPercent)}</strong>
                {hasComparableAskingRange && <small>{rangeLabel(analysis.marketAssessment.comparableAskingPriceLow, analysis.marketAssessment.comparableAskingPriceHigh)} asking range</small>}
              </div>
            )}
            {hasRentalEstimate && (
              <div>
                <span>Rental view</span>
                <strong>{rangeLabel(analysis.rentalAssessment.estimatedMonthlyRentLow, analysis.rentalAssessment.estimatedMonthlyRentHigh)}</strong>
                {hasRentalDemand && <small>{analysis.rentalAssessment.rentalDemand} demand</small>}
              </div>
            )}
            <div>
              <span>Main risk</span>
              <strong>{propertyRisks[0] ?? "No major property risk flagged"}</strong>
              <small>Risk score {analysis.investmentAssessment.riskScore}/100</small>
            </div>
          </div>

          {analysisNote && (
            <p className="analysis-note">
              Data note: {analysisNote}
            </p>
          )}

          <div className="ai-takeaway">
            <div>
              <span>Why it may be interesting</span>
              <strong>{strengths[0]}</strong>
            </div>
            <div>
              <span>What to verify first</span>
              <strong>{missingInformation[0] ?? risks[0] ?? "Documents and physical condition"}</strong>
            </div>
          </div>

          <details className="ai-details">
            <summary>View detailed analysis</summary>
            <div className="ai-details-body">
          <div className="location-intelligence">
            <div className="location-intelligence-head">
              <div>
                <h5>Location intelligence</h5>
                <p>Uses BAANKNET map coordinates when available, then verifies nearby places by distance.</p>
              </div>
              <div className="location-score-badge">
                <span>Smart AI Location score</span>
                <strong>{analysis.investmentAssessment.locationScore}/100</strong>
              </div>
            </div>
            <div className="location-signal-grid">
              <div>
                <span>Map coordinates</span>
                <strong>{analysis.locationEvidence?.coordinatesAvailable ? "Captured" : "Not available"}</strong>
              </div>
              <div>
                <span>Nearby evidence</span>
                <strong>{confirmedNearby.length ? `${confirmedNearby.length} places` : "Not confirmed"}</strong>
              </div>
              <div>
                <span>Evidence confidence</span>
                <strong>{locationConfidence ? `${locationConfidence.level} (${Math.round(locationConfidence.score)}/10)` : "Not scored"}</strong>
              </div>
            </div>
            {nearestPlaces.length > 0 && (
              <div className="nearby-place-grid">
                {nearestPlaces.map((item) => (
                  <div key={`${item.type}-${item.name}-${item.distanceKm}`}>
                    <span>{nearbyTypeLabel(item.type)}</span>
                    <strong>{item.name}</strong>
                    <small>{item.distanceKm} km away</small>
                  </div>
                ))}
              </div>
            )}
            {locationConfidence?.reason && <p className="location-evidence-note">{locationConfidence.reason}</p>}
          </div>

          <div className="market-grid">
            <div>
              <span>Reserve price</span>
              <strong>{priceLabel(auction.reservePrice)}</strong>
            </div>
            {hasComparableAskingRange && (
              <div>
                <span>Comparable asking prices</span>
                <strong>{rangeLabel(analysis.marketAssessment.comparableAskingPriceLow, analysis.marketAssessment.comparableAskingPriceHigh)}</strong>
                <small>Asking prices</small>
              </div>
            )}
            {hasAdjustedMarketRange && (
              <div>
                <span>Adjusted likely market range</span>
                <strong>{rangeLabel(analysis.marketAssessment.adjustedMarketValueLow, analysis.marketAssessment.adjustedMarketValueHigh)}</strong>
                <small>Estimated range</small>
              </div>
            )}
            {hasAuctionDiscount && (
              <div>
                <span>Auction discount</span>
                <strong>{percentRangeLabel(analysis.investmentAssessment.auctionDiscountLowPercent, analysis.investmentAssessment.auctionDiscountHighPercent)}</strong>
              </div>
            )}
            <div>
              <span>Confidence</span>
              <strong>{analysis.confidence}</strong>
              <small>{comparableCount} comparables</small>
            </div>
          </div>

          {(hasRentalEstimate || hasRentalYield || hasRentalDemand) && (
            <div className="market-grid rental">
              {hasRentalEstimate && (
                <div>
                  <span>Estimated monthly rent</span>
                  <strong>{rangeLabel(analysis.rentalAssessment.estimatedMonthlyRentLow, analysis.rentalAssessment.estimatedMonthlyRentHigh)}</strong>
                </div>
              )}
              {hasRentalYield && (
                <div>
                  <span>Gross rental yield</span>
                  <strong>{percentRangeLabel(analysis.investmentAssessment.grossRentalYieldLowPercent, analysis.investmentAssessment.grossRentalYieldHighPercent)}</strong>
                </div>
              )}
              {hasRentalDemand && (
                <div>
                  <span>Rental demand</span>
                  <strong>{analysis.rentalAssessment.rentalDemand}</strong>
                </div>
              )}
            </div>
          )}

          {(analysis.saleComparables.length > 0 || analysis.rentalComparables.length > 0) && (
            <div className="comparables">
              <h5>Comparable listings</h5>
              {[...analysis.saleComparables, ...analysis.rentalComparables].slice(0, 8).map((item, index) => (
                <div className="comparable-card" key={`${item.sourceUrl ?? item.title}-${index}`}>
                  <strong>{item.title}</strong>
                  <span>{item.locality || "Locality not shown"} · {item.propertyType}</span>
                  <span>
                    {item.builtUpAreaSqft ? `${Math.round(item.builtUpAreaSqft)} sqft` : "Area not shown"}
                    {item.landAreaCents ? ` · ${item.landAreaCents} cents` : ""}
                    {item.bhk ? ` · ${item.bhk} BHK` : ""}
                  </span>
                  <span>{item.askingPrice ? priceLabel(item.askingPrice) : item.monthlyRent ? `${priceLabel(item.monthlyRent)}/mo` : "Price not shown"}</span>
                  <small>{item.similarityScore}/100 similarity · {item.matchReason}</small>
                  {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Source</a>}
                </div>
              ))}
            </div>
          )}

          {showSearchDiagnostics && (saleSearches.length > 0 || rentalSearches.length > 0 || valueSearches.length > 0) && (
            <details className="search-diagnostics">
              <summary>Search diagnostics</summary>
              <div className="search-diagnostics-summary">
                <span>Sale results kept: {analysis.searchDiagnostics?.saleResultCount ?? 0}</span>
                <span>Rental results kept: {analysis.searchDiagnostics?.rentalResultCount ?? 0}</span>
                <span>Value signals kept: {analysis.searchDiagnostics?.valueResultCount ?? 0}</span>
                {analysis.searchDiagnostics?.broadened && <span>Fallback area search used</span>}
              </div>
              {[...saleSearches.map((item) => ({ ...item, type: "Sale" })), ...rentalSearches.map((item) => ({ ...item, type: "Rent" })), ...valueSearches.map((item) => ({ ...item, type: "Value" }))].slice(0, 16).map((item, index) => (
                <div className="search-diagnostic-row" key={`${item.type}-${item.query}-${index}`}>
                  <span>{item.type}</span>
                  <strong>{item.query}</strong>
                  <small>{item.resultCount} results</small>
                </div>
              ))}
            </details>
          )}

          <div className="market-lists">
            <div className="market-insight-card strengths">
              <h5>Strengths</h5>
              <ul>{strengths.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className="market-insight-card risks">
              <h5>Risks</h5>
              <ul>{propertyRisks.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>

          <div className="market-verdict">
            <strong>Verdict: {analysis.verdict.replace(/_/g, " ")}</strong>
            <p>{analysis.confidenceReason}</p>
            <p>{analysis.marketAssessment.adjustmentReason}</p>
          </div>

          {analysis.groundedSources.length > 0 && (
            <div className="sources">
              <h5>Sources</h5>
              {analysis.groundedSources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  {source.title || source.sourceName || source.url}
                </a>
              ))}
            </div>
          )}
            </div>
          </details>

          <p className="market-disclaimer">{analysis.disclaimer}</p>
        </>
      )}
    </section>
  );
}

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog>(fallbackCatalog);
  const [auctions, setAuctions] = useState<Auction[]>(fallbackAuctions);
  const [dataState, setDataState] = useState("Loading scraped BAANKNET data...");
  const [sortMode, setSortMode] = useState("score");
  const [viewMode, setViewMode] = useState<"search" | "rank">("search");
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [visibleCount, setVisibleCount] = useState(RESULTS_BATCH_SIZE);
  const [openScoreDetails, setOpenScoreDetails] = useState<Set<string>>(new Set());
  const [openAuctionDetails, setOpenAuctionDetails] = useState<Set<string>>(new Set());
  const [authSession, setAuthSession] = useState<SupabaseAuthSession | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [protectedActionCount, setProtectedActionCount] = useState(0);
  const [marketAnalysisByAuction, setMarketAnalysisByAuction] = useState<Record<string, MarketAnalysisState>>({});
  const [filters, setFilters] = useState({
    state: "Kerala",
    district: "",
    city: "",
    propertyType: "",
    propertySubType: "",
    possessionStatus: "",
    loanAvailability: "",
    status: "upcoming",
    minPrice: "",
    maxPrice: "",
    keyword: "",
  });

  const selectedDistrict = catalog.districts.find((district) => district.name === filters.district);
  const cityOptions = catalog.cities.filter(
    (city) => !selectedDistrict || city.districtId === selectedDistrict.id,
  );

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 680px)");
    const syncFilterState = () => setIsFilterOpen(!mobileQuery.matches);

    syncFilterState();
    mobileQuery.addEventListener("change", syncFilterState);
    return () => mobileQuery.removeEventListener("change", syncFilterState);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const sessionFromUrl = readSessionFromUrl();
      const storedSession = window.localStorage.getItem(SUPABASE_SESSION_STORAGE_KEY);
      const storedActionCount = Number(window.localStorage.getItem(PROTECTED_ACTION_STORAGE_KEY) ?? 0);

      if (sessionFromUrl) {
        window.localStorage.setItem(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(sessionFromUrl));
        window.localStorage.removeItem(PROTECTED_ACTION_STORAGE_KEY);
        setAuthSession(sessionFromUrl);
        setProtectedActionCount(0);
        setAuthMessage("You are signed in. Auction details are unlocked.");
        const eventKey = getSessionEventKey(sessionFromUrl.access_token);
        if (eventKey && window.localStorage.getItem(LOGIN_EVENT_STORAGE_KEY) !== eventKey) {
          recordLoginEvent(sessionFromUrl.access_token, "auth_redirect")
            .then(() => window.localStorage.setItem(LOGIN_EVENT_STORAGE_KEY, eventKey))
            .catch(() => undefined);
        }
        return;
      }

      if (storedSession) {
        try {
          const parsedSession = JSON.parse(storedSession) as SupabaseAuthSession;
          if (parsedSession.access_token) {
            setAuthSession(parsedSession);
            getCurrentUser(parsedSession.access_token).catch(() => {
              window.localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
              setAuthSession(null);
            });
          }
        } catch {
          window.localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
        }
      }

      setProtectedActionCount(Number.isFinite(storedActionCount) ? storedActionCount : 0);
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        if (hasSupabaseConfig()) {
          const [nextCatalog, nextAuctions] = await Promise.all([
            fetchSupabaseCatalog<Catalog>(),
            fetchSupabaseAuctions<Auction>(),
          ]);

          if (nextAuctions?.length) {
            if (isMounted) {
              setCatalog({
                ...fallbackCatalog,
                ...(nextCatalog ?? {}),
                propertySubTypes:
                  nextCatalog?.propertySubTypes && nextCatalog.propertySubTypes.length > 0
                    ? nextCatalog.propertySubTypes
                    : fallbackCatalog.propertySubTypes,
                possessionStatuses: nextCatalog?.possessionStatuses ?? fallbackCatalog.possessionStatuses,
              });
              setAuctions(
                nextAuctions.map(normalizeAuction),
              );
              setDataState(`Loaded ${nextAuctions.length.toLocaleString("en-IN")} Supabase auction rows`);
            }
            return;
          }
        }

        const [catalogResponse, auctionsResponse] = await Promise.all([
          fetch("/data/catalog.json"),
          fetch("/data/auctions.json"),
        ]);
        if (!catalogResponse.ok || !auctionsResponse.ok) {
          throw new Error("Static data files are not available yet");
        }
        const [nextCatalog, nextAuctions] = await Promise.all([
          catalogResponse.json() as Promise<Catalog>,
          auctionsResponse.json() as Promise<Auction[]>,
        ]);
        if (isMounted) {
          setCatalog({
            ...fallbackCatalog,
            ...nextCatalog,
            propertySubTypes:
              nextCatalog.propertySubTypes?.length > 0
                ? nextCatalog.propertySubTypes
                : fallbackCatalog.propertySubTypes,
            possessionStatuses: nextCatalog.possessionStatuses ?? fallbackCatalog.possessionStatuses,
          });
          setAuctions(
            nextAuctions.map(normalizeAuction),
          );
          setDataState(`Loaded ${nextAuctions.length.toLocaleString("en-IN")} scraped BAANKNET rows`);
        }
      } catch {
        if (isMounted) {
          setDataState("Using bundled sample rows until the scraper runs");
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredSubTypes = catalog.propertySubTypes.filter(
    (subtype) =>
      !filters.propertyType ||
      subtype.propertyTypeId === catalog.propertyTypes.find((type) => type.name === filters.propertyType)?.id,
  );

  const results = useMemo(() => {
    const min = filters.minPrice ? Number(filters.minPrice) : null;
    const max = filters.maxPrice ? Number(filters.maxPrice) : null;
    const keyword = filters.keyword.trim().toLowerCase();

    return auctions.filter((auction) => {
      const typeMatch =
        !filters.propertyType ||
        auction.propertyType === filters.propertyType ||
        auction.title.toLowerCase().includes(filters.propertyType.toLowerCase());
      const subtypeMatch =
        !filters.propertySubType ||
        auction.propertySubType === filters.propertySubType ||
        auction.title.toLowerCase().includes(filters.propertySubType.toLowerCase().split(" ")[0]);
      const possessionMatch =
        !filters.possessionStatus ||
        (auction.possessionStatus ?? "Unknown") === filters.possessionStatus;
      const loanMatch =
        !filters.loanAvailability ||
        (filters.loanAvailability === "available" ? auction.loanAvailable : !auction.loanAvailable);

      return (
        (!filters.status || auction.status === filters.status) &&
        (!filters.state || auction.state === filters.state) &&
        (!filters.district || auction.district === filters.district) &&
        (!filters.city || auction.city.toLowerCase() === filters.city.toLowerCase()) &&
        typeMatch &&
        subtypeMatch &&
        possessionMatch &&
        loanMatch &&
        (!min || (auction.reservePrice ?? 0) >= min) &&
        (!max || (auction.reservePrice ?? 0) <= max) &&
        (!keyword || auction.searchText.includes(keyword) || auction.title.toLowerCase().includes(keyword))
      );
    });
  }, [auctions, filters]);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      if (viewMode === "rank") return (b.score?.overall ?? 0) - (a.score?.overall ?? 0);
      if (sortMode === "price-low") return (a.reservePrice ?? Number.MAX_SAFE_INTEGER) - (b.reservePrice ?? Number.MAX_SAFE_INTEGER);
      if (sortMode === "price-high") return (b.reservePrice ?? 0) - (a.reservePrice ?? 0);
      if (sortMode === "score") return (b.score?.overall ?? 0) - (a.score?.overall ?? 0);
      if (sortMode === "location-score") {
        const aMapped = hasMapCoordinates(a) ? 1 : 0;
        const bMapped = hasMapCoordinates(b) ? 1 : 0;
        if (aMapped !== bMapped) return bMapped - aMapped;
        const scoreDelta = (mapAreaScore(b) ?? -1) - (mapAreaScore(a) ?? -1);
        if (scoreDelta !== 0) return scoreDelta;
        return (b.score?.overall ?? 0) - (a.score?.overall ?? 0);
      }
      if (sortMode === "latest") return parseAuctionDate(b.startDate) - parseAuctionDate(a.startDate);
      return parseAuctionDate(a.startDate) - parseAuctionDate(b.startDate);
    });
  }, [results, sortMode, viewMode]);

  const rankedResults = useMemo(
    () =>
      sortedResults.map((auction, index) => ({
        auction,
        filterRank: index + 1,
      })),
    [sortedResults],
  );
  const visibleRankedResults = useMemo(
    () => rankedResults.slice(0, visibleCount),
    [rankedResults, visibleCount],
  );
  const hiddenResultCount = Math.max(0, rankedResults.length - visibleRankedResults.length);

  const counts = useMemo(
    () =>
      auctions.reduce<Record<string, number>>((acc, auction) => {
        acc[auction.status] = (acc[auction.status] ?? 0) + 1;
        return acc;
      }, {}),
    [auctions],
  );

  const districtInsights = useMemo(() => {
    const districtCounts = auctions
      .filter((auction) => !filters.status || auction.status === filters.status)
      .reduce<Record<string, number>>((acc, auction) => {
        if (!auction.district || auction.district === "Unknown") return acc;
        acc[auction.district] = (acc[auction.district] ?? 0) + 1;
        return acc;
      }, {});

    return Object.entries(districtCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [auctions, filters.status]);

  const scoreStats = useMemo(() => {
    const active = auctions.filter((auction) => auction.status === "upcoming" || auction.status === "live");
    const scored = active.filter((auction) => typeof auction.score?.overall === "number");
    const topScore = scored.reduce((max, auction) => Math.max(max, auction.score?.overall ?? 0), 0);
    return { active: active.length, scored: scored.length, topScore };
  }, [auctions]);

  const activeFilters = [
    filters.status !== "upcoming" && { key: "status", label: statusLabels[filters.status] ?? filters.status },
    filters.district && { key: "district", label: `District: ${filters.district}` },
    filters.city && { key: "city", label: `City: ${filters.city}` },
    filters.propertyType && { key: "propertyType", label: filters.propertyType },
    filters.propertySubType && { key: "propertySubType", label: filters.propertySubType },
    filters.possessionStatus && { key: "possessionStatus", label: `Possession: ${filters.possessionStatus}` },
    filters.loanAvailability && {
      key: "loanAvailability",
      label: filters.loanAvailability === "available" ? "Loan available" : "Loan not marked",
    },
    filters.minPrice && { key: "minPrice", label: `Min ${priceLabel(Number(filters.minPrice))}` },
    filters.maxPrice && { key: "maxPrice", label: `Max ${priceLabel(Number(filters.maxPrice))}` },
    filters.keyword && { key: "keyword", label: `Search: ${filters.keyword}` },
  ].filter(Boolean) as { key: keyof typeof filters; label: string }[];
  const showHotDistricts =
    viewMode === "search" &&
    !filters.district &&
    !filters.city &&
    !filters.keyword;
  const showPriceBands =
    viewMode === "search" &&
    !filters.minPrice &&
    !filters.maxPrice;
  const showDiscoveryShortcuts = showHotDistricts || showPriceBands;

  function updateFilter(name: keyof typeof filters, value: string) {
    requestUnlockedAction(() => {
      setVisibleCount(RESULTS_BATCH_SIZE);
      setFilters((current) => {
        const next = { ...current, [name]: value };
        if (name === "state") {
          next.district = "";
          next.city = "";
        }
        if (name === "district") {
          next.city = "";
        }
        if (name === "propertyType") {
          next.propertySubType = "";
        }
        return next;
      });
    });
  }

  function resetFilters() {
    requestUnlockedAction(() => {
      setVisibleCount(RESULTS_BATCH_SIZE);
      setFilters({
        state: "Kerala",
        district: "",
        city: "",
        propertyType: "",
        propertySubType: "",
        possessionStatus: "",
        loanAvailability: "",
        status: "upcoming",
        minPrice: "",
        maxPrice: "",
        keyword: "",
      });
    });
  }

  function updateSortMode(value: string) {
    requestUnlockedAction(() => {
      setVisibleCount(RESULTS_BATCH_SIZE);
      setSortMode(value);
    });
  }

  function handleSearchMode() {
    requestUnlockedAction(() => {
      setVisibleCount(RESULTS_BATCH_SIZE);
      setViewMode("search");
      if (window.matchMedia("(max-width: 680px)").matches) {
        setIsFilterOpen(true);
      }
    });
  }

  function handleRankMode() {
    requestUnlockedAction(() => {
      setVisibleCount(RESULTS_BATCH_SIZE);
      setViewMode("rank");
    });
  }

  function updatePricePreset(min: string, max: string) {
    requestUnlockedAction(() => {
      setVisibleCount(RESULTS_BATCH_SIZE);
      setFilters((current) => ({
        ...current,
        minPrice: current.minPrice === min && current.maxPrice === max ? "" : min,
        maxPrice: current.minPrice === min && current.maxPrice === max ? "" : max,
      }));
    });
  }

  function loadMoreResults() {
    requestUnlockedAction(() => setVisibleCount((count) => count + RESULTS_BATCH_SIZE));
  }

  function updateOpenSet(
    setter: (value: Set<string> | ((current: Set<string>) => Set<string>)) => void,
    key: string,
    isOpen: boolean,
  ) {
    setter((current) => {
      const next = new Set(current);
      if (isOpen) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function rememberProtectedActionCount(nextCount: number) {
    setProtectedActionCount(nextCount);
    window.localStorage.setItem(PROTECTED_ACTION_STORAGE_KEY, String(nextCount));
  }

  function showAuthRequiredMessage() {
    setAuthMessage("Quick free sign-in unlocks more filtering, ranking, and auction details.");
    setAuthError("");
    setAuthModalOpen(true);
  }

  function requestUnlockedAction(action: () => void) {
    if (authSession || protectedActionCount < FREE_PROTECTED_ACTIONS) {
      action();
      return;
    }

    showAuthRequiredMessage();
  }

  function requestProtectedAction(action: () => void) {
    if (authSession) {
      action();
      return;
    }

    const nextCount = protectedActionCount + 1;
    if (nextCount <= FREE_PROTECTED_ACTIONS) {
      rememberProtectedActionCount(nextCount);
      action();
      return;
    }

    showAuthRequiredMessage();
  }

  function handleScoreDetailsToggle(key: string, isOpen: boolean) {
    if (!isOpen) {
      updateOpenSet(setOpenScoreDetails, key, false);
      return;
    }

    requestUnlockedAction(() => updateOpenSet(setOpenScoreDetails, key, true));
  }

  function handleAuctionDetailsToggle(key: string, isOpen: boolean) {
    if (!isOpen) {
      updateOpenSet(setOpenAuctionDetails, key, false);
      return;
    }

    requestProtectedAction(() => updateOpenSet(setOpenAuctionDetails, key, true));
  }

  function openProtectedLink(url?: string) {
    if (!url) return;
    requestProtectedAction(() => window.open(url, "_blank", "noopener,noreferrer"));
  }

  function requestMarketAnalysis(auction: Auction, forceRefresh = false) {
    requestProtectedAction(() => {
      const key = auction.auctionId;
      setMarketAnalysisByAuction((current) => ({
        ...current,
        [key]: { status: "loading", loadingStep: 0 },
      }));

      let step = 0;
      const interval = window.setInterval(() => {
        step = Math.min(step + 1, marketLoadingSteps.length - 1);
        setMarketAnalysisByAuction((current) => ({
          ...current,
          [key]: {
            ...(current[key] ?? { status: "loading" as const }),
            status: "loading",
            loadingStep: step,
          },
        }));
      }, 1400);

      fetch(`/api/properties/${encodeURIComponent(auction.auctionId)}/market-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      })
        .then(async (response) => {
          const text = await response.text();
          let payload: MarketAnalysisResponse;
          try {
            payload = text ? JSON.parse(text) as MarketAnalysisResponse : { marketAnalysis: null, cached: false, provider: "unknown", model: "unknown", groundingEnabled: false };
          } catch {
            payload = {
              marketAnalysis: null,
              cached: false,
              provider: "unknown",
              model: "unknown",
              groundingEnabled: false,
              error: {
                code: "NON_JSON_RESPONSE",
                message: text || `Market analysis failed with HTTP ${response.status}.`,
              },
            };
          }
          if (!response.ok) {
            throw new Error(payload.error?.message || "Market analysis failed.");
          }
          setMarketAnalysisByAuction((current) => ({
            ...current,
            [key]: { status: payload.error ? "error" : "success", loadingStep: marketLoadingSteps.length - 1, data: payload, error: payload.error?.message },
          }));
        })
        .catch((error: Error) => {
          setMarketAnalysisByAuction((current) => ({
            ...current,
            [key]: { status: "error", loadingStep: marketLoadingSteps.length - 1, error: error.message },
          }));
        })
        .finally(() => window.clearInterval(interval));
    });
  }

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = authEmail.trim();
    if (!email) {
      setAuthError("Enter your email to continue.");
      return;
    }

    setAuthError("");
    setAuthMessage("Sending your sign-in link...");
    try {
      await sendMagicLink(email);
      setAuthMessage("Check your email for the free sign-in link.");
    } catch {
      setAuthError("Could not send the sign-in link. Check Supabase auth settings and try again.");
      setAuthMessage("");
    }
  }

  async function handleSignOut() {
    const token = authSession?.access_token;
    window.localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
    setAuthSession(null);
    if (token) {
      await signOut(token).catch(() => undefined);
    }
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">BAANKNET auction finder</p>
          <h1>Find bank auction properties without the clutter.</h1>
          <p className="intro">
            Filter upcoming, live, and archived auction data by location, property category, bank,
            price, and local keywords.
          </p>
          <div className="auth-status">
            {authSession ? (
              <>
                <span>Signed in. Auction details unlocked.</span>
                <button type="button" onClick={handleSignOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <span>{FREE_PROTECTED_ACTIONS - protectedActionCount > 0 ? `${FREE_PROTECTED_ACTIONS - protectedActionCount} free auction actions left` : "Free sign-in unlocks filters, ranking, and details"}</span>
                <button type="button" onClick={() => setAuthModalOpen(true)}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
        <div className="summary-panel" aria-label="Current auction summary">
          <button type="button" className={filters.status === "upcoming" ? "selected" : ""} onClick={() => updateFilter("status", "upcoming")}>
            <span>{counts.upcoming ?? 0}</span>
            <p>Upcoming</p>
          </button>
          <button type="button" className={filters.status === "live" ? "selected" : ""} onClick={() => updateFilter("status", "live")}>
            <span>{counts.live ?? 0}</span>
            <p>Live</p>
          </button>
          <button type="button" className={filters.status === "closed" ? "selected" : ""} onClick={() => updateFilter("status", "closed")}>
            <span>{counts.closed ?? 0}</span>
            <p>Archive</p>
          </button>
          <button type="button" className={sortMode === "score" ? "selected" : ""} onClick={() => updateSortMode("score")}>
            <span>{scoreStats.topScore}</span>
            <p>Top Score</p>
          </button>
        </div>
      </section>

      <section className="workspace">
        <details
          className="filters"
          aria-label="Auction filters"
          open={isFilterOpen}
          onToggle={(event) => setIsFilterOpen(event.currentTarget.open)}
        >
          <summary className="mobile-filter-summary">
            <span>Filters</span>
            <strong>{activeFilters.length > 0 ? `${activeFilters.length} active` : "Tap to refine"}</strong>
          </summary>
          <div className="filter-body">
            <div className="filter-header">
              <h2>Filters</h2>
              <button
                type="button"
                onClick={resetFilters}
              >
                Reset
              </button>
            </div>

            <div className="status-tabs" aria-label="Status">
              {Object.entries(statusLabels).map(([status, label]) => (
                <button
                  key={status}
                  className={filters.status === status ? "active" : ""}
                  type="button"
                  onClick={() => updateFilter("status", status)}
                >
                  {label}
                </button>
              ))}
            </div>

            <Select label="State" value={filters.state} options={catalog.states} onChange={(value) => updateFilter("state", value)} />
            <Select
              label="District"
              value={filters.district}
              options={catalog.districts}
              onChange={(value) => updateFilter("district", value)}
              disabled={!filters.state}
            />
            <Select
              label="City"
              value={filters.city}
              options={cityOptions}
              onChange={(value) => updateFilter("city", value)}
              disabled={!filters.district}
            />
            <Select
              label="Property type"
              value={filters.propertyType}
              options={catalog.propertyTypes}
              onChange={(value) => updateFilter("propertyType", value)}
            />
            <Select
              label="Property sub type"
              value={filters.propertySubType}
              options={filteredSubTypes}
              onChange={(value) => updateFilter("propertySubType", value)}
              disabled={!filters.propertyType}
            />
            <Select
              label="Possession status"
              value={filters.possessionStatus}
              options={catalog.possessionStatuses}
              onChange={(value) => updateFilter("possessionStatus", value)}
            />
            <label className="field">
              <span>Loan availability</span>
              <select
                value={filters.loanAvailability}
                onChange={(event) => updateFilter("loanAvailability", event.target.value)}
              >
                <option value="">All</option>
                <option value="available">Loan available</option>
                <option value="not-available">Loan not marked available</option>
              </select>
            </label>

            <div className="price-grid">
              <label className="field">
                <span>Min price</span>
                <input
                  inputMode="numeric"
                  placeholder="1000000"
                  value={filters.minPrice}
                  onChange={(event) => updateFilter("minPrice", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Max price</span>
                <input
                  inputMode="numeric"
                  placeholder="7000000"
                  value={filters.maxPrice}
                  onChange={(event) => updateFilter("maxPrice", event.target.value)}
                />
              </label>
            </div>

            <label className="field keyword-field">
              <span>Keyword</span>
              <input
                placeholder="Kaduthuruthy, Pampady, bank..."
                value={filters.keyword}
                onChange={(event) => updateFilter("keyword", event.target.value)}
              />
            </label>

            <div className="mobile-filter-actions">
              <button type="button" className="secondary" onClick={resetFilters}>
                Clear
              </button>
              <button type="button" onClick={() => setIsFilterOpen(false)}>
                Show {sortedResults.length.toLocaleString("en-IN")} results
              </button>
            </div>
          </div>
        </details>

        <section className="results" aria-live="polite">
          <div className="mode-switch" aria-label="Result mode">
            <button type="button" className={viewMode === "search" ? "active" : ""} onClick={handleSearchMode}>
              Search
              <span>Filter and inspect auctions</span>
            </button>
            <button
              type="button"
              className={viewMode === "rank" ? "active" : ""}
              onClick={handleRankMode}
            >
              Rank
              <span>Score current results best-first</span>
            </button>
          </div>

          <div className="mobile-refine-row" aria-label="Mobile refine controls">
            <button type="button" onClick={() => setIsFilterOpen(true)}>
              Filters
              <span>{activeFilters.length > 0 ? activeFilters.length : "All"}</span>
            </button>
            {viewMode === "search" ? (
              <label>
                <span>Sort</span>
                <select value={sortMode} onChange={(event) => updateSortMode(event.target.value)}>
                  <option value="soonest">Soonest</option>
                  <option value="score">Auction</option>
                  <option value="location-score">Map/area</option>
                  <option value="latest">Latest</option>
                  <option value="price-low">Price ↑</option>
                  <option value="price-high">Price ↓</option>
                </select>
              </label>
            ) : (
              <span>Best score first</span>
            )}
          </div>

          {showDiscoveryShortcuts && (
            <section className="interactive-strip" aria-label="Quick exploration controls">
              {showHotDistricts && (
                <div className="quick-block">
                  <div className="strip-heading">
                    <span>Hot districts</span>
                    <small>{statusLabels[filters.status]} activity</small>
                  </div>
                  <div className="pill-row">
                    {districtInsights.map(([district, count]) => (
                      <button
                        type="button"
                        key={district}
                        className={filters.district === district ? "pill active" : "pill"}
                        onClick={() => updateFilter("district", filters.district === district ? "" : district)}
                      >
                        {district}
                        <strong>{count}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {showPriceBands && (
                <div className="quick-block">
                  <div className="strip-heading">
                    <span>Price bands</span>
                    <small>Tap to compare</small>
                  </div>
                  <div className="pill-row">
                    {pricePresets.map((preset) => (
                      <button
                        type="button"
                        key={preset.label}
                        className={filters.minPrice === preset.min && filters.maxPrice === preset.max ? "pill active" : "pill"}
                        onClick={() => updatePricePreset(preset.min, preset.max)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {activeFilters.length > 0 && (
            <div className="active-filters" aria-label="Active filters">
              {activeFilters.map((filter) => (
                <button type="button" key={filter.key} onClick={() => updateFilter(filter.key, "")}>
                  {filter.label}
                  <span>x</span>
                </button>
              ))}
              <button type="button" className="clear-all" onClick={resetFilters}>
                Clear all
              </button>
            </div>
          )}

          <div className="results-header">
            <div>
              <p className="eyebrow">Kerala pilot</p>
              <h2>
                {viewMode === "rank" ? "Ranked auctions" : `${sortedResults.length} matching auctions`}
              </h2>
            </div>
            <div className="toolbar">
              <p>{dataState}</p>
              {viewMode === "search" ? (
                <div className="sort-control">
                  <label>
                    <span>Sort</span>
                    <select value={sortMode} onChange={(event) => updateSortMode(event.target.value)}>
                      <option value="soonest">Soonest first</option>
                      <option value="score">Auction score</option>
                      <option value="location-score">Map/area score</option>
                      <option value="latest">Latest first</option>
                      <option value="price-low">Price low to high</option>
                      <option value="price-high">Price high to low</option>
                    </select>
                  </label>
                  {sortMode === "location-score" && (
                    <small>Uses the daily map/area score. Smart AI Location can differ after analysis.</small>
                  )}
                </div>
              ) : (
                <div className="rank-note">
                  Ranking current filter set by Auction Score
                </div>
              )}
            </div>
          </div>

          {viewMode === "rank" && (
            <div className="rank-board" aria-label="Ranking summary">
              {rankedResults.slice(0, 3).map(({ auction, filterRank }) => (
                <button
                  type="button"
                  key={auction.auctionId}
                  onClick={() => updateFilter("city", auction.city)}
                >
                  <span>#{filterRank}</span>
                  <strong>{auction.score?.overall ?? "--"}</strong>
                  <p>{auction.city || auction.district || "Unknown area"}</p>
                  <small>{auction.title}</small>
                </button>
              ))}
            </div>
          )}

          <div className="cards">
            {visibleRankedResults.map(({ auction, filterRank }) => {
              const scoreDetailsKey = `${auction.status}-${auction.auctionId}-score`;
              const auctionDetailsKey = `${auction.status}-${auction.auctionId}-details`;
              const isScoreDetailsOpen = openScoreDetails.has(scoreDetailsKey);
              const isAuctionDetailsOpen = openAuctionDetails.has(auctionDetailsKey);
              const mappedLocation = hasMapCoordinates(auction);
              const verifiedNearby = hasNearbyEvidence(auction);
              const auctionMapAreaScore = mapAreaScore(auction);

              return (
              <article className="auction-card" key={`${auction.status}-${auction.auctionId}`}>
                <div className="card-main">
                  <div className="card-title-row">
                    <div className="badge-row">
                      {viewMode === "rank" && <span className="badge rank-badge">Rank #{filterRank}</span>}
                      <span className={`badge ${auction.status}`}>{statusLabels[auction.status]}</span>
                      <span className="badge score-badge">{auction.score?.overall ?? "--"} score</span>
                      <span className={mappedLocation ? "badge location mapped" : "badge location"}>
                        {mappedLocation ? `Map/area ${scoreLabel(auctionMapAreaScore)}` : "Location not mapped"}
                      </span>
                      {verifiedNearby && <span className="badge nearby">Nearby verified</span>}
                      {auction.loanAvailable && <span className="badge loan">Loan available</span>}
                    </div>
                    <button type="button" className="ghost-button city-filter-button" onClick={() => updateFilter("city", auction.city)}>
                      More in {auction.city || "this city"}
                    </button>
                  </div>
                  <h3>{auction.title}</h3>
                  <div className="mobile-card-kpis" aria-label="Auction highlights">
                    <span>
                      <strong>{priceLabel(auction.reservePrice)}</strong>
                      Reserve
                    </span>
                    <span>
                      <strong>{auction.score?.overall ?? "--"}</strong>
                      Score
                    </span>
                    <span>
                      <strong>{auction.startDate.split(" ")[0] || "--"}</strong>
                      Starts
                    </span>
                  </div>
                  <div className="mobile-card-actions" aria-label="Auction actions">
                    {auction.auctionDetailUrl && (
                      <button type="button" onClick={() => openProtectedLink(auction.auctionDetailUrl)}>
                        View notice
                      </button>
                    )}
                    {auction.propertyDetailUrl && (
                      <button type="button" onClick={() => openProtectedLink(auction.propertyDetailUrl)}>
                        View property
                      </button>
                    )}
                  </div>
                  <div className="score-strip" aria-label="Auction score">
                    <div className="score-ring">
                      <strong>{auction.score?.overall ?? "--"}</strong>
                      <span>Score</span>
                    </div>
                    <div className="score-mini-grid">
                      <span>Rank #{auction.score?.rankState ?? "--"} Kerala</span>
                      {viewMode === "rank" && <span>Current filter #{filterRank}</span>}
                      <span>Area {scoreLabel(auction.score?.area)}</span>
                      <span>{mappedLocation ? "Map verified" : "Map pending"}</span>
                      <span>Risk {auction.score?.riskLabel ?? "Pending"}</span>
                      <span>Confidence {auction.score?.confidenceLabel ?? "Pending"}</span>
                    </div>
                  </div>
                  <dl className="details">
                    <div className="detail-reserve">
                      <dt>Reserve price</dt>
                      <dd>{priceLabel(auction.reservePrice)}</dd>
                    </div>
                    <div>
                      <dt>Bank</dt>
                      <dd>{auction.bank}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{auction.location}</dd>
                    </div>
                    <div>
                      <dt>Property</dt>
                      <dd>
                        {auction.propertyType ?? "Other"} / {auction.propertySubType ?? "Other"}
                      </dd>
                    </div>
                    <div>
                      <dt>Area</dt>
                      <dd>{areaLabel(auction)}</dd>
                    </div>
                    <div>
                      <dt>Possession</dt>
                      <dd>{auction.possessionStatus ?? "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Auction window</dt>
                      <dd>
                        <span className="auction-window">
                          <span>{splitDateTime(auction.startDate).date || auction.startDate}</span>
                          <span>
                            {splitDateTime(auction.startDate).time || "--"} - {splitDateTime(auction.endDate).time || "--"}
                          </span>
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="card-side">
                  <strong className="price-pop">{priceLabel(auction.reservePrice)}</strong>
                  <span>Auction ID</span>
                  <strong>{auction.auctionId}</strong>
                  <span>Property ID</span>
                  <strong>{auction.bankPropertyId}</strong>
                  <span>Auction score</span>
                  <strong>{scoreLabel(auction.score?.overall)}</strong>
                  <span>Map/area score</span>
                  <strong>{mappedLocation ? scoreLabel(auctionMapAreaScore) : "Not mapped"}</strong>
                  <div className="card-actions" aria-label="Auction links">
                    {auction.auctionDetailUrl && (
                      <button type="button" onClick={() => openProtectedLink(auction.auctionDetailUrl)}>
                        Notice
                      </button>
                    )}
                    {auction.propertyDetailUrl && (
                      <button type="button" onClick={() => openProtectedLink(auction.propertyDetailUrl)}>
                        Property
                      </button>
                    )}
                  </div>
                </div>
                <details
                  className="score-details"
                  open={isScoreDetailsOpen}
                >
                  <summary
                    onClick={(event) => {
                      event.preventDefault();
                      handleScoreDetailsToggle(scoreDetailsKey, !isScoreDetailsOpen);
                    }}
                  >
                    Why this score?
                  </summary>
                  {isScoreDetailsOpen && (
                    <div className="detail-sections">
                      <section>
                        <h4>Auction Score</h4>
                        <div className="score-breakdown">
                          {scoreKeys.map((item) => (
                            <div key={item.key}>
                              <div className="score-line-head">
                                <span>{item.label}</span>
                                <strong>{scoreLabel(auction.score?.[item.key])}</strong>
                              </div>
                              <div className="score-bar">
                                <span style={{ width: `${auction.score?.[item.key] ?? 0}%` }} />
                              </div>
                              <small>Weight {item.weight}</small>
                            </div>
                          ))}
                        </div>
                        <div className="score-explain">
                          {scoreKeys.map((item) => {
                            const reasons = auction.score?.explanations?.[item.key] ?? [];
                            return (
                              <div key={item.key}>
                                <h5>{item.label} signals</h5>
                                <ul>
                                  {(reasons.length > 0 ? reasons : ["Pending richer data"]).slice(0, 4).map((reason) => (
                                    <li key={reason}>{reason}</li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    </div>
                  )}
                </details>

                <details
                  className="more-details"
                  open={isAuctionDetailsOpen}
                >
                  <summary
                    onClick={(event) => {
                      event.preventDefault();
                      handleAuctionDetailsToggle(auctionDetailsKey, !isAuctionDetailsOpen);
                    }}
                  >
                    Show auction details
                  </summary>
                  {isAuctionDetailsOpen && (
                    <div className="detail-sections">
                      <MarketAnalysisPanel
                        auction={auction}
                        state={marketAnalysisByAuction[auction.auctionId]}
                        onRequest={() => requestMarketAnalysis(auction)}
                        onRefresh={() => requestMarketAnalysis(auction, true)}
                      />

                      <section>
                        <h4>General Detail</h4>
                        <dl>
                          <div>
                            <dt>Auction ID</dt>
                            <dd>{auction.auctionId || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Bank Property ID</dt>
                            <dd>{auction.bankPropertyId || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Customer ID</dt>
                            <dd>{auction.customerId || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Branch</dt>
                            <dd>{auction.branch || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Officer, Designation</dt>
                            <dd>{auction.officer || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Property Type</dt>
                            <dd>{auction.propertyType || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Property Sub Type</dt>
                            <dd>{auction.propertySubType || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Carpet Area</dt>
                            <dd>{auction.carpetArea || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Built Up Area</dt>
                            <dd>{auction.builtUpArea || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Area</dt>
                            <dd>{auction.areaSqft || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Property Title</dt>
                            <dd>{auction.title || "Not captured yet"}</dd>
                          </div>
                          <div className="wide">
                            <dt>Property Address</dt>
                            <dd>{auction.propertyAddress || auction.location || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Borrower name</dt>
                            <dd>{auction.borrowerName || "Not captured yet"}</dd>
                          </div>
                          <div className="wide">
                            <dt>Registered Address of Borrower</dt>
                            <dd>{auction.borrowerAddress || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Type of Action</dt>
                            <dd>{auction.typeOfAction || "-"}</dd>
                          </div>
                        </dl>
                      </section>

                      <section>
                        <h4>Inspection Detail</h4>
                        <dl>
                          <div>
                            <dt>Dealing Officer Name, Designation</dt>
                            <dd>{auction.dealingOfficer || "-"}</dd>
                          </div>
                          <div>
                            <dt>Mobile No.</dt>
                            <dd>{auction.mobileNo || "-"}</dd>
                          </div>
                          <div className="wide">
                            <dt>Branch Address</dt>
                            <dd>{auction.branchAddress || "Not captured yet"}</dd>
                          </div>
                        </dl>
                      </section>

                      <section>
                        <h4>Key Date</h4>
                        <dl>
                          <div>
                            <dt>Inspection Date & Time From</dt>
                            <dd>{auction.inspectionDateFrom || "-"}</dd>
                          </div>
                          <div>
                            <dt>Inspection Date & Time To</dt>
                            <dd>{auction.inspectionDateTo || "-"}</dd>
                          </div>
                          <div>
                            <dt>EMD Start date & time</dt>
                            <dd>{auction.emdStartDate || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>EMD End date & time</dt>
                            <dd>{auction.emdEndDate || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Auction Start Date & Time</dt>
                            <dd>{auction.startDate || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Auction End Date & Time</dt>
                            <dd>{auction.endDate || "Not captured yet"}</dd>
                          </div>
                        </dl>
                      </section>

                      <section>
                        <h4>Business Rules</h4>
                        <dl>
                          <div>
                            <dt>Reserve Price</dt>
                            <dd>{auction.reservePriceText || priceLabel(auction.reservePrice)}</dd>
                          </div>
                          <div>
                            <dt>EMD</dt>
                            <dd>{auction.emd || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Increment Price</dt>
                            <dd>{auction.incrementPrice || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Increment Price During Time Extension</dt>
                            <dd>{auction.incrementDuringExtension || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Extend Time When Valid Bid Received in Last(In Minutes)</dt>
                            <dd>{auction.extendWhenBidInLastMinutes || "Not captured yet"}</dd>
                          </div>
                          <div>
                            <dt>Extend Time By (In Minutes)</dt>
                            <dd>{auction.extendByMinutes || "Not captured yet"}</dd>
                          </div>
                        </dl>
                      </section>
                    </div>
                  )}
                </details>
              </article>
              );
            })}
          </div>

          {hiddenResultCount > 0 && (
            <button
              type="button"
              className="load-more"
              onClick={loadMoreResults}
            >
              Load {Math.min(RESULTS_BATCH_SIZE, hiddenResultCount).toLocaleString("en-IN")} more
            </button>
          )}

          {sortedResults.length === 0 && (
            <div className="empty-state">
              <h3>No auctions match these filters.</h3>
              <p>Try clearing the city, widening the price range, or searching the archive status.</p>
            </div>
          )}
        </section>
      </section>

      {authModalOpen && !authSession && (
        <div className="auth-modal-backdrop" role="presentation">
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button
              type="button"
              className="auth-close"
              aria-label="Close sign-in prompt"
              onClick={() => setAuthModalOpen(false)}
            >
              x
            </button>
            <p className="eyebrow">Free account required</p>
            <h2 id="auth-title">Continue browsing auction details</h2>
            <p>
              To keep Kerala Auction Finder fast and reliable for real users, please sign in after a few
              property views. It is completely free.
            </p>
            <div className="auth-benefits" aria-label="Sign-in benefits">
              <span>More auction details</span>
              <span>Official notice links</span>
              <span>Future saves and alerts</span>
            </div>
            {hasSupabaseConfig() && (
              <>
                <button type="button" className="google-auth-button" onClick={signInWithGoogle}>
                  Continue with Google
                </button>
                <div className="auth-divider">or email me a link</div>
              </>
            )}
            <form className="auth-form" onSubmit={handleMagicLinkSubmit}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={authEmail}
                  placeholder="you@example.com"
                  onChange={(event) => setAuthEmail(event.target.value)}
                />
              </label>
              <button type="submit">Send sign-in link</button>
            </form>
            {authMessage && <p className="auth-message">{authMessage}</p>}
            {authError && <p className="auth-error">{authError}</p>}
          </section>
        </div>
      )}
    </main>
  );
}
