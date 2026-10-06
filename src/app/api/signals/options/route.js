import { DEFAULT_MODEL, allowedModels, dailyLimit } from "@/lib/signals/store.js"

export async function GET() {
  return Response.json({
    models: allowedModels(),
    default_model: DEFAULT_MODEL,
    daily_limit: dailyLimit(),
  })
}
