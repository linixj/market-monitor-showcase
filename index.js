import { chromium } from "playwright";
import { google } from "googleapis";

const pageUrl = "https://www.cnn.com/markets/fear-and-greed";
const dataUrl = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const peUrl = "https://www.gurufocus.com/economic_indicators/6778/nasdaq-100-pe-ratio";

const sheetId = process.env.GOOGLE_SHEET_ID;
const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

async function getFearGreed() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1400, height: 1200 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });

  await page.goto(pageUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(5000);

  const agreeButton = page.getByRole("button", { name: "Agree" });

  try {
    await agreeButton.waitFor({ timeout: 3000 });
    await agreeButton.click();
    console.log("Clicked CNN consent Agree button.");
    await page.waitForTimeout(3000);
  } catch {
    console.log("No CNN consent popup detected.");
  }

  const fgData = await page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CNN graphdata request failed: ${res.status}`);
    }
    return await res.json();
  }, dataUrl);

  await browser.close();

  const score = Number(Number(fgData.fear_and_greed.score).toFixed(2));
  const rawLabel = fgData.fear_and_greed.rating || "";

  const label = rawLabel
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return {
    score,
    label,
    source: "CNN Fear & Greed Index",
    url: pageUrl,
    status: "OK"
  };
}


async function getNasdaq100PE() {
  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage({
    viewport: { width: 1400, height: 1200 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });

  await page.goto(peUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(5000);

  const bodyText = await page.locator("body").innerText();

  const match = bodyText.match(/Nasdaq 100 PE Ratio was\s+([0-9.]+)/i);

  if (!match) {
    console.log("GuruFocus body preview:");
    console.log(bodyText.slice(0, 2000));
    await browser.close();
    throw new Error("Failed to extract Nasdaq 100 PE from GuruFocus.");
  }

  const pe = Number(match[1]);

  await browser.close();

  return {
    value: pe,
    source: "GuruFocus Nasdaq 100 PE Ratio",
    url: peUrl,
    status: "OK"
  };
}

async function appendToGoogleSheet(row) {
  if (!sheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID secret.");
  }

  if (!serviceAccountJson) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON secret.");
  }

  const credentials = JSON.parse(serviceAccountJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({
    version: "v4",
    auth
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Daily_Data!A:N",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row]
    }
  });
}

async function main() {
  const now = new Date();

  const fg = await getFearGreed();
  const pe = await getNasdaq100PE();

  console.log("Nasdaq100 PE:", pe.value);
  console.log("PE Source:", pe.source);

  console.log("FearGreed Score:", fg.score);
  console.log("FearGreed Label:", fg.label);
  console.log("FearGreed Source:", fg.source);
  console.log("FearGreed URL:", fg.url);

  const row = [
    now.toISOString(),

    "", // VIX_Current
    "", // VIX_PreviousClose
    "", // VIX_Source
    "", // VIX_Status

    pe.value,
    pe.source,
    pe.status,

    fg.score,
    fg.source,
    fg.status,

    "", // Market_Score
    "", // Signal
    ""  // AI_Analysis
  ];

  await appendToGoogleSheet(row);

  console.log("Google Sheet row appended successfully.");
}

main().catch(error => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});