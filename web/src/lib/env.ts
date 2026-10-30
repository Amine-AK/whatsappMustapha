import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return v;
}

export const env = {
  appPassword: () => required("APP_PASSWORD"),
  sessionSecret: () => {
    const v = required("SESSION_SECRET");
    if (v.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return v;
  },

  sheetId: () => required("GOOGLE_SHEET_ID"),
  sheetName: () => process.env.GOOGLE_SHEET_NAME || "Feuille 1",
  serviceAccountEmail: () => required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  // Vercel and .env files store the key on one line with literal "\n".
  privateKey: () => required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  sheetsApiBase: () => process.env.GOOGLE_SHEETS_API_BASE || "https://sheets.googleapis.com",
  // Only for local testing against a fake Sheets server.
  staticAccessToken: () => process.env.GOOGLE_ACCESS_TOKEN || "",

  watiEndpoint: () => (process.env.WATI_API_ENDPOINT || "").replace(/\/+$/, ""),
  watiToken: () => (process.env.WATI_ACCESS_TOKEN || "").replace(/^Bearer\s+/i, ""),
  watiTemplate: () => process.env.WATI_TEMPLATE_NAME || "",
  watiBroadcast: () => process.env.WATI_BROADCAST_NAME || "debt_reminder",
  // The shop's WhatsApp number in WATI, e.g. 212658869574 (required by WATI's API).
  watiChannelNumber: () => (process.env.WATI_CHANNEL_NUMBER || "").replace(/\D/g, ""),
};

export function watiConfigured(): boolean {
  return Boolean(env.watiEndpoint() && env.watiToken() && env.watiTemplate() && env.watiChannelNumber());
}
