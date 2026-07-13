import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComparableSearchContext,
  calculateDataCompleteness,
  calculateDeterministicAnalysis,
  parseArea,
  processGroundedAnalysis,
} from "../cloudflare/market-analysis-api.mjs";

const house = {
  auctionId: "326336",
  bankPropertyId: "PUNBsubinbaby",
  title: "Individual House for Sale in Thrikkakara North",
  propertyType: "Residential",
  propertySubType: "Individual House",
  reservePrice: 5000000,
  carpetAreaSqft: 152 * 10.7639,
  builtUpAreaSqft: 158 * 10.7639,
  landAreaSqft: null,
  landAreaCents: null,
  landAreaAres: null,
  bhk: 2,
  possessionStatus: "Symbolic",
  ownershipType: null,
  constructionAgeYears: 10,
  constructionYear: null,
  latitude: null,
  longitude: null,
  imageUrls: [],
  auctionStart: "14-07-2026 11:00",
  auctionEnd: "14-07-2026 12:00",
  locality: "Thrikkakara North",
  city: "Kalamassery",
  district: "Ernakulam",
  state: "Kerala",
  pincode: "682021",
};

test("area conversions are normalised to square feet", () => {
  assert.equal(Math.round(parseArea("152 sq meter").sqft), 1636);
  assert.equal(Math.round(parseArea("1 are").sqft), 1076);
  assert.equal(Math.round(parseArea("1 cent").sqft), 436);
});

test("missing land area materially affects independent-house completeness", () => {
  const completeness = calculateDataCompleteness(house);
  assert.ok(completeness.criticalMissingFields.includes("landArea"));
  assert.ok(completeness.score < 85);
});

test("missing land area does not heavily penalise a flat", () => {
  const flat = { ...house, propertySubType: "Flat", title: "2 BHK Flat for Sale", landAreaSqft: null };
  const completeness = calculateDataCompleteness(flat);
  assert.ok(!completeness.criticalMissingFields.includes("landArea"));
});

test("search context uses buyer-style queries instead of database-like filters", () => {
  const context = buildComparableSearchContext(house);
  assert.match(context.primarySearchQuery, /independent house/i);
  assert.match(context.primarySearchQuery, /Kerala India/i);
  assert.doesNotMatch(context.primarySearchQuery, /\b\d{3,5}\s+\d{3,5}\s+sqft\b/i);
  assert.doesNotMatch(context.primarySearchQuery, /Kalamassery Kalamassery/i);
  assert.ok(context.saleQueries.some((query) => /1700 sqft|1600 sqft|1800 sqft/i.test(query)));
  assert.ok(context.saleQueries.some((query) => /Rajagiri Hospital|CUSAT|Kalamassery Metro|Thrikkakara/i.test(query)));
  assert.ok(!context.saleQueries.some((query) => /near\s+(CUSAT|Rajagiri Hospital|Kalamassery Metro|Infopark|Kakkanad)/i.test(query)));
  assert.ok(!context.rentalQueries.some((query) => /near\s+(CUSAT|Rajagiri Hospital|Kalamassery Metro|Infopark|Kakkanad)/i.test(query)));
  assert.equal(context.confirmedNearbyLandmarks.length, 0);
  assert.ok(context.candidateLandmarkHints.some((item) => item.name === "CUSAT"));
  assert.ok(context.regionalDemandDrivers.some((item) => item.name === "Infopark"));
  assert.ok(context.valueQueries.some((query) => /price per sqft|property rates|prices/i.test(query)));
  assert.ok(context.targetAreaMinSqft);
  assert.ok(context.targetAreaMaxSqft);
});

test("confirmed nearby places from sync become factual search landmarks", () => {
  const mappedHouse = {
    ...house,
    latitude: 9.988483,
    longitude: 76.313045,
    nearbyPlaces: {
      categories: {
        schools: { count: 8, nearestDistanceKm: 1.2, nearestName: "CUSAT" },
        hospitals: { count: 4, nearestDistanceKm: 2.4, nearestName: "Rajagiri Hospital" },
        metro: { count: 1, nearestDistanceKm: 3.1, nearestName: "Kalamassery Metro Station" },
      },
    },
  };
  const context = buildComparableSearchContext(mappedHouse);
  assert.ok(context.confirmedNearbyLandmarks.some((item) => item.name === "CUSAT"));
  assert.ok(context.saleQueries.some((query) => /near CUSAT/i.test(query)));
  assert.ok(context.rentalQueries.some((query) => /near CUSAT|near Rajagiri Hospital|near Kalamassery Metro/i.test(query)));
});

test("comparable processing removes duplicates and mismatched property types", () => {
  const deterministic = calculateDeterministicAnalysis(house);
  const context = buildComparableSearchContext(house);
  const processed = processGroundedAnalysis(house, deterministic, context, {
    saleComparables: [
      {
        title: "Independent house Thrikkakara",
        propertyType: "Independent House",
        askingPrice: 7000000,
        builtUpAreaSqft: 1700,
        sourceUrl: "https://example.com/house",
        similarityScore: 88,
      },
      {
        title: "Independent house Thrikkakara duplicate",
        propertyType: "Independent House",
        askingPrice: 7000000,
        builtUpAreaSqft: 1700,
        sourceUrl: "https://example.com/house",
        similarityScore: 80,
      },
      {
        title: "Apartment nearby",
        propertyType: "Apartment",
        askingPrice: 6500000,
        builtUpAreaSqft: 1600,
        sourceUrl: "https://example.com/flat",
        similarityScore: 60,
      },
    ],
    rentalComparables: [
      {
        title: "Independent house rent",
        propertyType: "Independent House",
        monthlyRent: 22000,
        builtUpAreaSqft: 1650,
        sourceUrl: "https://example.com/rent",
        similarityScore: 80,
      },
    ],
    searchDiagnostics: {
      rentalResultCount: 10,
      saleResultCount: 6,
    },
    groundedSources: [{ title: "Example", url: "https://example.com", sourceName: "Example" }],
  });

  assert.equal(processed.saleComparables.length, 1);
  assert.equal(processed.rentalComparables.length, 1);
  assert.equal(processed.marketAssessment.medianComparableAskingPrice, 7000000);
  assert.ok(processed.investmentAssessment.grossRentalYieldLowPercent);
  assert.ok(processed.investmentAssessment.rentalScore > 50);
});

test("confirmed nearby evidence is exposed for Smart AI scoring", () => {
  const mappedHouse = {
    ...house,
    nearbyPlaces: {
      categories: {
        schools: { count: 8, nearestDistanceKm: 1.2, nearestName: "CUSAT" },
        hospitals: { count: 4, nearestDistanceKm: 2.4, nearestName: "Rajagiri Hospital" },
      },
    },
  };
  const deterministic = calculateDeterministicAnalysis(mappedHouse);
  const context = buildComparableSearchContext(mappedHouse);
  const processed = processGroundedAnalysis(mappedHouse, deterministic, context, {
    saleComparables: [],
    rentalComparables: [],
    valueSignals: [],
  });

  assert.equal(processed.investmentAssessment.smartScore, processed.investmentAssessment.overallScore);
  assert.ok(processed.locationEvidence.confirmedNearbyPlaces.length >= 2);
  assert.ok(processed.investmentAssessment.locationScore > 45);
});
