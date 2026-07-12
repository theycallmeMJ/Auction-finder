"use client";

import { useEffect, useMemo, useState } from "react";

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

function priceLabel(value: number | null) {
  if (!value) return "Price unavailable";
  return formatter.format(value);
}

function scoreLabel(value?: number) {
  return typeof value === "number" ? `${value}/100` : "Pending";
}

function areaLabel(auction: Auction) {
  return auction.builtUpArea || auction.carpetArea || auction.areaSqft || "Not captured yet";
}

function parseAuctionDate(value: string) {
  const [date = "", time = "00:00:00"] = value.split(" ");
  const [day, month, year] = date.split("-").map(Number);
  if (!day || !month || !year) return 0;
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${time}`).getTime();
}

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

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog>(fallbackCatalog);
  const [auctions, setAuctions] = useState<Auction[]>(fallbackAuctions);
  const [dataState, setDataState] = useState("Loading scraped BAANKNET data...");
  const [sortMode, setSortMode] = useState("soonest");
  const [viewMode, setViewMode] = useState<"search" | "rank">("search");
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
    let isMounted = true;

    async function loadData() {
      try {
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
            nextAuctions.map((auction) => ({
              ...auction,
              possessionStatus: auction.possessionStatus ?? "Unknown",
            })),
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
    filters.district && { key: "district", label: `District: ${filters.district}` },
    filters.city && { key: "city", label: `City: ${filters.city}` },
    filters.propertyType && { key: "propertyType", label: filters.propertyType },
    filters.propertySubType && { key: "propertySubType", label: filters.propertySubType },
    filters.loanAvailability && {
      key: "loanAvailability",
      label: filters.loanAvailability === "available" ? "Loan available" : "Loan not marked",
    },
    filters.minPrice && { key: "minPrice", label: `Min ${priceLabel(Number(filters.minPrice))}` },
    filters.maxPrice && { key: "maxPrice", label: `Max ${priceLabel(Number(filters.maxPrice))}` },
    filters.keyword && { key: "keyword", label: `Search: ${filters.keyword}` },
  ].filter(Boolean) as { key: keyof typeof filters; label: string }[];

  function updateFilter(name: keyof typeof filters, value: string) {
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
  }

  function resetFilters() {
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
          <button type="button" className={sortMode === "score" ? "selected" : ""} onClick={() => setSortMode("score")}>
            <span>{scoreStats.topScore}</span>
            <p>Top Score</p>
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="filters" aria-label="Auction filters">
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

          <label className="field">
            <span>Keyword</span>
            <input
              placeholder="Kaduthuruthy, Pampady, bank..."
              value={filters.keyword}
              onChange={(event) => updateFilter("keyword", event.target.value)}
            />
          </label>
        </aside>

        <section className="results" aria-live="polite">
          <div className="mode-switch" aria-label="Result mode">
            <button type="button" className={viewMode === "search" ? "active" : ""} onClick={() => setViewMode("search")}>
              Search
              <span>Filter and inspect auctions</span>
            </button>
            <button type="button" className={viewMode === "rank" ? "active" : ""} onClick={() => setViewMode("rank")}>
              Rank
              <span>Score current results best-first</span>
            </button>
          </div>

          <section className="interactive-strip" aria-label="Quick exploration controls">
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
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        minPrice: current.minPrice === preset.min && current.maxPrice === preset.max ? "" : preset.min,
                        maxPrice: current.minPrice === preset.min && current.maxPrice === preset.max ? "" : preset.max,
                      }))
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

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
                {viewMode === "rank" ? "Ranked opportunities" : `${sortedResults.length} matching auctions`}
              </h2>
            </div>
            <div className="toolbar">
              <p>{dataState}</p>
              {viewMode === "search" ? (
                <label>
                  <span>Sort</span>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                    <option value="soonest">Soonest first</option>
                    <option value="score">Opportunity score</option>
                    <option value="latest">Latest first</option>
                    <option value="price-low">Price low to high</option>
                    <option value="price-high">Price high to low</option>
                  </select>
                </label>
              ) : (
                <div className="rank-note">
                  Ranking current filter set by Opportunity Score
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
            {rankedResults.map(({ auction, filterRank }) => (
              <article className="auction-card" key={`${auction.status}-${auction.auctionId}`}>
                <div className="card-main">
                  <div className="card-title-row">
                    <div className="badge-row">
                      {viewMode === "rank" && <span className="badge rank-badge">Rank #{filterRank}</span>}
                      <span className={`badge ${auction.status}`}>{statusLabels[auction.status]}</span>
                      {auction.loanAvailable && <span className="badge loan">Loan available</span>}
                    </div>
                    <button type="button" className="ghost-button" onClick={() => updateFilter("city", auction.city)}>
                      More in {auction.city || "this city"}
                    </button>
                  </div>
                  <h3>{auction.title}</h3>
                  <div className="score-strip" aria-label="Opportunity score">
                    <div className="score-ring">
                      <strong>{auction.score?.overall ?? "--"}</strong>
                      <span>Score</span>
                    </div>
                    <div className="score-mini-grid">
                      <span>Rank #{auction.score?.rankState ?? "--"} Kerala</span>
                      {viewMode === "rank" && <span>Current filter #{filterRank}</span>}
                      <span>Area {scoreLabel(auction.score?.area)}</span>
                      <span>Risk {auction.score?.riskLabel ?? "Pending"}</span>
                      <span>Confidence {auction.score?.confidenceLabel ?? "Pending"}</span>
                    </div>
                  </div>
                  <dl className="details">
                    <div>
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
                        {auction.startDate} to {auction.endDate}
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
                  <span>Opportunity</span>
                  <strong>{scoreLabel(auction.score?.overall)}</strong>
                </div>
                <details className="score-details">
                  <summary>Why this score?</summary>
                  <div className="detail-sections">
                    <section>
                      <h4>Opportunity Score</h4>
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
                </details>

                <details className="more-details">
                  <summary>Show auction details</summary>
                  <div className="detail-sections">
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
                </details>
              </article>
            ))}
          </div>

          {sortedResults.length === 0 && (
            <div className="empty-state">
              <h3>No auctions match these filters.</h3>
              <p>Try clearing the city, widening the price range, or searching the archive status.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
