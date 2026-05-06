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

  // 等页面主要内容加载
  await page.waitForTimeout(5000);

  // 如果 CNN consent popup 出现，就点 Agree；没有就继续
  const agreeButton = page.getByRole("button", { name: "Agree" });

  try {
    await agreeButton.waitFor({ timeout: 3000 });
    await agreeButton.click();
    console.log("Clicked CNN consent Agree button.");
    await page.waitForTimeout(3000);
  } catch {
    console.log("No CNN consent popup detected.");
  }

  const bodyText = await page.locator("body").innerText();

  // Label: 例如 “Greed is driving the US market”
  const labelMatch = bodyText.match(
    /\b(Extreme Fear|Extreme Greed|Fear|Neutral|Greed)\s+is driving the US market\b/
  );

  const fearGreedLabel = labelMatch ? labelMatch[1] : null;

  // Score: 优先抓 label 附近的数字；如果失败，再抓 Last updated 前后的数字
  let fearGreedScore = null;

  if (fearGreedLabel) {
    const labelIndex = bodyText.indexOf(`${fearGreedLabel} is driving the US market`);
    const nearbyText = bodyText.slice(Math.max(0, labelIndex - 500), labelIndex + 500);

    const candidates = [...nearbyText.matchAll(/\b(\d{1,3})\b/g)]
      .map(match => Number(match[1]))
      .filter(num => num >= 0 && num <= 100);

    if (candidates.length > 0) {
      // 当前 score 通常是 label 附近最大的 0-100 数字
      fearGreedScore = Math.max(...candidates);
    }
  }

  if (fearGreedScore === null) {
    const fallbackMatch = bodyText.match(/Last updated[\s\S]{0,300}?\b(\d{1,3})\b/);
    fearGreedScore = fallbackMatch ? Number(fallbackMatch[1]) : null;
  }

  console.log("FearGreed Score:", fearGreedScore);
  console.log("FearGreed Label:", fearGreedLabel);

  if (fearGreedScore === null || fearGreedLabel === null) {
    console.log("Body text preview:");
    console.log(bodyText.slice(0, 2000));
    throw new Error("Failed to extract Fear & Greed score or label.");
  }

  await browser.close();
}

main().catch(error => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});