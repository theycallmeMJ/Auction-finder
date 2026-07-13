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

test("search context contains property type, locality and area range", () => {
  const context = buildComparableSearchContext(house);
  assert.match(context.primarySearchQuery, /independent house/i);
  assert.match(context.primarySearchQuery, /Thrikkakara North/i);
  assert.ok(context.targetAreaMinSqft);
  assert.ok(context.targetAreaMaxSqft);
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
    groundedSources: [{ title: "Example", url: "https://example.com", sourceName: "Example" }],
  });

  assert.equal(processed.saleComparables.length, 1);
  assert.equal(processed.rentalComparables.length, 1);
  assert.equal(processed.marketAssessment.medianComparableAskingPrice, 7000000);
  assert.ok(processed.investmentAssessment.grossRentalYieldLowPercent);
});

