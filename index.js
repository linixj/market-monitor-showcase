import { chromium } from "playwright";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import { analyzeMarket } from "./rules.js";
import axios from "axios";

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

async function getEmailRecipients() {
  const credentials = JSON.parse(serviceAccountJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({
    version: "v4",
    auth
  });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Recipients!A:C"
  });

  const rows = response.data.values || [];

  // skip header row
  const recipients = rows
    .slice(1)
    .filter(row => {
      const email = row[0];
      const active = String(row[2] || "").toUpperCase();
      return email && active === "TRUE";
    })
    .map(row => row[0].trim());

  if (recipients.length === 0) {
    throw new Error("No active email recipients found in Recipients tab.");
  }

  return recipients;
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

  const recipients = await getEmailRecipients();

  await transporter.sendMail({
  from: gmailUser,

  // 你的邮箱作为主收件人
  to: gmailUser,

  // 其他人放 BCC
  bcc: recipients.join(","),

  subject: `Daily Market Signal - ${analysis.signal}`,

  text: body
});
}

async function sendTelegram({ vix, pe, fg, analysis }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = process.env.TELEGRAM_CHAT_IDS;

  if (!botToken || !chatIds) {
    console.log("Telegram secrets not configured.");
    return;
  }

  const message = `
Daily Market Signal

VIX Current: ${vix.current}
VIX Previous Close: ${vix.previousClose}

Nasdaq 100 PE: ${pe.value}

Fear & Greed: ${fg.score} (${fg.label})

Score: ${analysis.score}
Signal: ${analysis.signal}

Analysis:
${analysis.overallAnalysis}
`;

  const ids = chatIds
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

  for (const chatId of ids) {
    await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: chatId,
        text: message
      }
    );

    console.log(`Telegram sent to ${chatId}`);
  }
}

async function main() {
  const now = new Date();

  const fg = await getFearGreed();
  const pe = await getNasdaq100PE();
  const vix = await getVIX();
  const analysis = analyzeMarket({ vix, pe, fg });

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

  await sendTelegram({ vix, pe, fg, analysis });
  console.log("Telegram bot sent successfully.");
}

main().catch(error => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});