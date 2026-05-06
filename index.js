import { chromium } from "playwright";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import { analyzeMarket } from "./rules.js";

const pageUrl = "https://www.cnn.com/markets/fear-and-greed";
const dataUrl = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
// const peUrl = "https://www.gurufocus.com/economic_indicators/6778/nasdaq-100-pe-ratio";
const peUrl = "https://worldperatio.com/index/nasdaq-100/";
const vixUrl = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX";

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
  const browser = await chromium.launch({
    headless: true
  });

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

  // 调试用
  console.log("WorldPEratio body preview:");
  console.log(bodyText.slice(0, 2000));

  // 匹配类似：
  // PE Ratio: 34.95
  // 或 Current PE Ratio 34.95
  const match = bodyText.match(
    /P\/E Ratio:\s*([0-9]+(?:\.[0-9]+)?)/i
    );

  if (!match) {
    await browser.close();
    throw new Error("Failed to extract Nasdaq100 PE.");
  }

  const pe = Number(match[1]);

  await browser.close();

  return {
    value: pe,
    source: "WorldPEratio Nasdaq 100 PE",
    url: peUrl,
    status: "OK"
  };
}

async function getVIX() {
  const response = await fetch(vixUrl);

  if (!response.ok) {
    throw new Error(`Yahoo VIX request failed: ${response.status}`);
  }

  const data = await response.json();
  const meta = data.chart.result[0].meta;

  const current = Number(Number(meta.regularMarketPrice).toFixed(2));
  const previousClose = Number(Number(meta.previousClose).toFixed(2));

  if (
    Number.isNaN(current) ||
    Number.isNaN(previousClose) ||
    current < 8 ||
    current > 100
  ) {
    return {
      current: null,
      previousClose: null,
      source: "Yahoo Finance ^VIX",
      status: "INVALID"
    };
  }

  return {
    current,
    previousClose,
    source: "Yahoo Finance ^VIX",
    status: "OK"
  };
}

function analyzeMarket(vix, pe, fg) {
  let score = 0;

  let vixAnalysis = "";
  let peAnalysis = "";
  let fgAnalysis = "";
  let signal = "HOLD";

  // VIX scoring
  if (vix.current > 30) {
    score += 2;
    vixAnalysis = "VIX is above 30, indicating elevated market fear. This is usually a potential buying signal.";
  } else if (vix.current > 20) {
    score += 1;
    vixAnalysis = "VIX is between 20 and 30, showing moderate market stress.";
  } else if (vix.current < 14) {
    score -= 2;
    vixAnalysis = "VIX is below 14, suggesting low fear and possible market complacency.";
  } else {
    vixAnalysis = "VIX is in a neutral range. No strong fear signal is present.";
  }

  // PE scoring
  if (pe.value > 35) {
    score -= 2;
    peAnalysis = "Nasdaq 100 PE is above 35, suggesting valuation risk is elevated.";
  } else if (pe.value > 32) {
    score -= 1;
    peAnalysis = "Nasdaq 100 PE is between 32 and 35, indicating valuation is somewhat expensive.";
  } else if (pe.value < 28) {
    score += 2;
    peAnalysis = "Nasdaq 100 PE is below 28, suggesting valuation is more attractive.";
  } else {
    peAnalysis = "Nasdaq 100 PE is in a neutral valuation range.";
  }

  // Fear & Greed scoring
  if (fg.score > 80) {
    score -= 2;
    fgAnalysis = "Fear & Greed is above 80, indicating extreme greed and elevated sentiment risk.";
  } else if (fg.score > 65) {
    score -= 1;
    fgAnalysis = "Fear & Greed is above 65, showing greed but not extreme greed.";
  } else if (fg.score < 25) {
    score += 2;
    fgAnalysis = "Fear & Greed is below 25, indicating extreme fear and potential opportunity.";
  } else {
    fgAnalysis = "Fear & Greed is in a neutral range.";
  }

  if (score >= 3) {
    signal = "STRONG_BUY";
  } else if (score >= 1) {
    signal = "BUY_DCA";
  } else if (score <= -3) {
    signal = "TAKE_PROFIT";
  } else if (score <= -1) {
    signal = "CAUTION";
  } else {
    signal = "HOLD";
  }

  const overallAnalysis =
    `Overall signal is ${signal}. Current score is ${score}. ` +
    `The system combines volatility, valuation, and sentiment. ` +
    `This is a rules-based signal, not a price prediction.`;

  return {
    score,
    signal,
    vixAnalysis,
    peAnalysis,
    fgAnalysis,
    overallAnalysis
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


async function sendEmail({ vix, pe, fg, analysis }) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    throw new Error("Missing Gmail secrets.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword
    }
  });

  const body = `
Daily Market Signal

VIX Current: ${vix.current}
VIX Previous Close: ${vix.previousClose}

Nasdaq 100 PE: ${pe.value}

Fear & Greed: ${fg.score} (${fg.label})

Score: ${analysis.score}
Signal: ${analysis.signal}

Analysis:
${analysis.overallAnalysis}

Details:
- ${analysis.vixAnalysis}
- ${analysis.peAnalysis}
- ${analysis.fgAnalysis}
`;

  await transporter.sendMail({
    from: gmailUser,
    to: gmailUser,
    subject: `Daily Market Signal - ${analysis.signal}`,
    text: body
  });
}

async function main() {
  const now = new Date();

  const fg = await getFearGreed();
  const pe = await getNasdaq100PE();
  const vix = await getVIX();
  const analysis = analyzeMarket(vix, pe, fg);

  console.log("Nasdaq100 PE:", pe.value);
  console.log("PE Source:", pe.source);

  console.log("FearGreed Score:", fg.score);
  console.log("FearGreed Label:", fg.label);
  console.log("FearGreed Source:", fg.source);
  console.log("FearGreed URL:", fg.url);

  console.log("VIX Current:", vix.current);
  console.log("VIX Previous Close:", vix.previousClose);
  console.log("VIX Source:", vix.source);

  const row = [
    now.toISOString(),

    vix.current,
    vix.previousClose,
    vix.source,
    vix.status,

    pe.value,
    pe.source,
    pe.status,

    fg.score,
    fg.source,
    fg.status,

    analysis.score,
    analysis.signal,
    analysis.vixAnalysis,
    analysis.peAnalysis,
    analysis.fgAnalysis,
    analysis.overallAnalysis,
    "" // Email_Status
  ];

  await appendToGoogleSheet(row);

  console.log("Google Sheet row appended successfully.");

  await sendEmail({ vix, pe, fg, analysis });
  console.log("Email sent successfully.");
}

main().catch(error => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});