import { handleMarketAnalysisRequest } from "../../../../../cloudflare/market-analysis-api.mjs";

export async function POST(request: Request) {
  return handleMarketAnalysisRequest(request, process.env);
}
