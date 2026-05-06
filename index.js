import { chromium } from "playwright";

const url = "https://www.cnn.com/markets/fear-and-greed";

async function main() {

  const browser =
    await chromium.launch({
      headless: true
    });

  const page =
    await browser.newPage();

  await page.goto(url, {
    waitUntil: "networkidle",
    timeout: 60000
  });

  await page.screenshot({
    path: "cnn-fear-greed.png",
    fullPage: true
  });

  console.log("Screenshot saved.");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});