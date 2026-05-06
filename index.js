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

  page.on("console", msg => {
    console.log("PAGE LOG:", msg.text());
  });

  page.on("response", response => {
    const status = response.status();
    const resUrl = response.url();

    if (status >= 400) {
      console.log("HTTP ERROR:", status, resUrl);
    }
  });

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(10000);

  console.log("Final URL:", page.url());
  console.log("Title:", await page.title());

  const bodyText = await page.locator("body").innerText();
  console.log("Body text preview:");
  console.log(bodyText.slice(0, 1000));

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