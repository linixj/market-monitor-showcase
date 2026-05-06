import { chromium } from "playwright";

const url = "https://www.cnn.com/markets/fear-and-greed";

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1400, height: 1200 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(5000);

  // Click CNN consent popup if it appears
  const agreeButton = page.getByRole("button", { name: "Agree" });

  if (await agreeButton.isVisible().catch(() => false)) {
    await agreeButton.click();
    await page.waitForTimeout(3000);
  }

  const bodyText = await page.locator("body").innerText();

  console.log("BODY TEXT PREVIEW:");
  console.log(bodyText.slice(0, 2000));

  // Extract score: usually appears around Fear & Greed gauge
  const scoreMatch = bodyText.match(/\b(Extreme Fear|Fear|Neutral|Greed|Extreme Greed)\b[\s\S]{0,200}?\b(\d{1,3})\b/);

  let fearGreedScore = null;
  let fearGreedLabel = null;

  if (scoreMatch) {
    fearGreedLabel = scoreMatch[1];
    fearGreedScore = Number(scoreMatch[2]);
  } else {
    // fallback: from screenshot text structure, current score often appears as standalone number near 0-100 scale
    const numberMatches = bodyText.match(/\b([0-9]{1,3})\b/g);
    console.log("Number candidates:", numberMatches);
  }

  console.log("FearGreed Score:", fearGreedScore);
  console.log("FearGreed Label:", fearGreedLabel);

  await page.screenshot({
    path: "cnn-fear-greed.png",
    fullPage: true
  });

  await browser.close();
}

main().catch(error => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});