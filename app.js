const express = require("express");
const multer = require("multer");
const cors = require('cors');

const XLSX = require('xlsx');
const puppeteer = require('puppeteer');

const app = express();
const port = 5000;

app.use(cors());

const uploadDirectory = './uploads';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirectory)
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '.xlsx' )
  }
})

const upload = multer({ storage: storage })

app.post("/read", upload.single("file"), (req, res) => {
  try {
    if (req.file?.filename === null || req.file?.filename === undefined) {
      res.status(400).json('No file');
    } else {
      const path = req.file.path;
      const workbook = XLSX.readFile(path);
      const sheetNames = workbook.SheetNames;
      let jsonData = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetNames[0]]
      );
      console.log('yes!');
      res.status(200).send(jsonData);
    }
  } catch (e) {
    res.status(500);
  }
});

app.get('/', (req, res) => {
  const workbook = XLSX.readFile(`${uploadDirectory}/file.xlsx`);
  console.log(workbook);

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  res.send(rawData);
});

app.get('/wb/:productNameSearch/:mode', async (req, res) => {
  const sortMethods = ["priceup", "pricedown"];

  let {productNameSearch, mode} = req.params;
  console.log(productNameSearch, mode);

  let url = new URL("https://www.wildberries.ru/catalog/0/search.aspx");
  url.searchParams.set("search", productNameSearch);

  switch (mode) {
    case "min":
      url.searchParams.set("sort", sortMethods[0]);
      break;
    case "max":
      url.searchParams.set("sort", sortMethods[1]);
      break;
    default: // i.e. sort by popularity
      mode = "default";
      break;
  }

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(2 * 60 * 1000);

  await page.goto(url);
  const productsList = await page.waitForSelector(".product-card-list");
  await page.screenshot({ path: "productsList.png" });

  const productSelector = ".product-card-list > article > div > a";
  await page.waitForSelector(productSelector);
  await page.screenshot({path: 'productsListRendered.png'}); 

  const productLink = await page.evaluate(() => {
    return document.querySelector(".product-card-list > article > div > a").href;
  });

  console.log(productLink);

  page.setViewport({width: 1920, height: 1080});

  await page.goto(productLink);
  await Promise.all([page.waitForSelector(".product-page__header > h1"), page.waitForSelector(".price-block__final-price"), page.waitForSelector(".price-block__old-price")]);
  await page.screenshot({path: "itemPage.png"});

  const productName = await page.evaluate(() => {
    return document.querySelector(".product-page__header > h1").textContent;
  });

  const productPriceWithSale = await page.evaluate(() => {
    return document.querySelector(".price-block__final-price").textContent.trim();
  });

  const productPriceWithoutSale = await page.evaluate(() => {
    return document.querySelector(".price-block__old-price").textContent.trim();
  });

  console.log(productName);
  console.log(productPriceWithSale);
  console.log(productPriceWithoutSale);

  res.send([productName, productPriceWithSale, productPriceWithoutSale, productLink]);
})

app.listen(port, () => {
  console.log(`Express app listening on PORT ${port}`)
});