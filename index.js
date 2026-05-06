import { chromium } from "playwright";

const url = "https://www.cnn.com/markets/fear-and-greed";

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  await page.goto(url, {
    waitUntil: "networkidle",
    timeout: 60000
  });

  await page.screenshot({
    path: "cnn-fear-greed.png",
    fullPage: true
  });

  const title = await page.title();

  console.log("Page title:", title);
  console.log("Screenshot saved: cnn-fear-greed.png");

  await browser.close();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});