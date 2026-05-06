import { chromium } from "playwright";

const pageUrl = "https://www.cnn.com/markets/fear-and-greed";
const dataUrl = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

async function main() {
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

  // 如果有 CNN consent popup，就点 Agree
  const agreeButton = page.getByRole("button", { name: "Agree" });

  try {
    await agreeButton.waitFor({ timeout: 3000 });
    await agreeButton.click();
    console.log("Clicked CNN consent Agree button.");
    await page.waitForTimeout(3000);
  } catch {
    console.log("No CNN consent popup detected.");
  }

  // 在浏览器页面环境里请求 CNN graphdata
  const fgData = await page.evaluate(async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CNN graphdata request failed: ${res.status}`);
    }
    return await res.json();
  }, dataUrl);

  const fearGreedScore = Number(fgData.fear_and_greed.score);
  const rawLabel = fgData.fear_and_greed.rating || "";

  const fearGreedLabel =
    rawLabel
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

  console.log("FearGreed Score:", fearGreedScore);
  console.log("FearGreed Label:", fearGreedLabel);
  console.log("FearGreed Source:", "CNN Fear & Greed Index");
  console.log("FearGreed URL:", pageUrl);

  if (
    Number.isNaN(fearGreedScore) ||
    fearGreedScore < 0 ||
    fearGreedScore > 100
  ) {
    throw new Error("Invalid Fear & Greed score.");
  }

  await browser.close();
}

main().catch(error => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});