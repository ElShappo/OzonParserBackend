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

function fullDomain(partialPath) {
  console.log(partialPath);
  let improvedPartialPath = partialPath.match(/product\/.+/);
  let marketplaceDomain = "https://www.ozon.ru/";
  return marketplaceDomain + improvedPartialPath;
}

app.get('/ozon/:mode', async (req, res) => {
  let result = [];
  const sortMethods = ["ozon_card_price", "price_desc", ""];
  const productNamesSearch = JSON.parse(req.query.productNames);
  let { mode } = req.params;

  let url = new URL("https://www.ozon.ru/search");

  url.searchParams.set("from_global", "true");

  switch (mode) {
    case "min":
      url.searchParams.set("sorting", sortMethods[0]);
      break;
    case "max":
      url.searchParams.set("sorting", sortMethods[1]);
      break;
    default: // i.e. sort by popularity
      mode = "default";
      break;
  }

  for (let productNameSearch of productNamesSearch) {
    url.searchParams.set("text", `${productNameSearch}`);
    
    let response;
    let html;

    try {
      response = await fetch(url);
      html = await response.text();
    } catch (e) {
      console.error(`Error occurred when trying to fetch ${url}`);
      console.error(e);
    }

    const parser = new DOMParser();
    const htmlDocument = parser.parseFromString(html, "text/html");
    const extremum = htmlDocument.documentElement.querySelector(
      ".widget-search-result-container > div > div"
    );
    let pricesSection;
    let link;
    try {
      pricesSection = extremum.querySelector(":scope > div > div");
      link = extremum.querySelector(":scope > div > a");
    } catch (error) {
      console.error(
        `Could not get pricesSection & link (${mode}) for ${productName}`
      );
      console.error(productName);
      console.error(url);
      console.error(html);
      console.error(htmlDocument);
      return [null, null, null, null];
    }
    let name = link.querySelector(":scope > div > span");

    let partialPath = link.href;
    let productLink = fullDomain(partialPath);

    let prices = pricesSection.querySelector(":scope > div");
    let productPriceWithSale =
      prices.querySelectorAll(":scope > span")[0].innerHTML;

    let productPriceWithoutSale = null;
    try {
      // sometimes there is no sale at all, if that happens, we trigger a warning
      productPriceWithoutSale =
        prices.querySelectorAll(":scope > span")[1].innerHTML;
    } catch (error) {
      console.warn(
        `Could not get a price without sale (${mode}) for ${productName}`
      );
    }
    let productName = name.innerHTML;
    result.push({productName, productPriceWithSale, productPriceWithoutSale, productLink});
  }
  res.send(result);
})

// can get details about single or multiple products
app.get('/wb/:mode', async (req, res) => {
  let result = [];
  const sortMethods = ["priceup", "pricedown"];
  const productNamesSearch = JSON.parse(req.query.productNames);
  let { mode } = req.params;

  let url = new URL("https://www.wildberries.ru/catalog/0/search.aspx");
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
  page.setDefaultNavigationTimeout(2 * 60 * 100);

  for (let productNameSearch of productNamesSearch) {
    url.searchParams.set("search", productNameSearch);
    await page.goto(url);
    await page.waitForSelector(".product-card-list");
    // await page.screenshot({ path: "productsList.png" });
  
    const productSelector = ".product-card-list > article > div > a";
    await page.waitForSelector(productSelector);
    // await page.screenshot({path: 'productsListRendered.png'});
  
    const productLink = await page.evaluate(() => {
      return document.querySelector(".product-card-list > article > div > a").href;
    });
  
    console.log(productLink);
  
    // page.setViewport({width: 1920, height: 1080});
  
    await page.goto(productLink);
    await Promise.all([page.waitForSelector(".product-page__header > h1"), page.waitForSelector(".price-block__final-price")]);
    // await page.screenshot({path: "itemPage.png"});
  
    let productName;
  
    try {
      productName = await page.evaluate(() => {
        return document.querySelector(".product-page__header > h1").textContent;
      });
    } catch (error) {
      productName = null;
      console.error(error);
      console.error(`Couldn\'t get productName for ${productNameSearch} with mode = ${mode}`);
    }
  
    let productPriceWithSale;
  
    try {
      productPriceWithSale = await page.evaluate(() => {
        return document.querySelector(".price-block__final-price").textContent.trim();
      });
    } catch (error) {
      productPriceWithSale = null;
      console.error(error);
      console.error(`Couldn\'t get productPriceWithSale for ${productNameSearch} with mode = ${mode}`);
    }
  
    let productPriceWithoutSale;
  
    try {
      productPriceWithoutSale = await page.evaluate(() => {
        return document.querySelector(".price-block__old-price").textContent.trim();
      });
    } catch (error) {
      productPriceWithoutSale = null;
      console.error(error);
      console.error(`Couldn\'t get productPriceWithoutSale for ${productNameSearch} with mode = ${mode}`);
    }
  
    console.log(productName);
    console.log(productPriceWithSale);
    console.log(productPriceWithoutSale);

    result.push({productName, productPriceWithSale, productPriceWithoutSale, productLink});
  }
  browser.close();
  res.send(result);
})

// can get details about single product
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
  await page.waitForSelector(".product-card-list");
  // await page.screenshot({ path: "productsList.png" });

  const productSelector = ".product-card-list > article > div > a";
  await page.waitForSelector(productSelector);
  // await page.screenshot({path: 'productsListRendered.png'});

  const productLink = await page.evaluate(() => {
    return document.querySelector(".product-card-list > article > div > a").href;
  });

  console.log(productLink);

  // page.setViewport({width: 1920, height: 1080});

  await page.goto(productLink);
  await Promise.all([page.waitForSelector(".product-page__header > h1"), page.waitForSelector(".price-block__final-price")]);
  // await page.screenshot({path: "itemPage.png"});

  let productName;

  try {
    productName = await page.evaluate(() => {
      return document.querySelector(".product-page__header > h1").textContent;
    });
  } catch (error) {
    productName = null;
    console.error(error);
    console.error(`Couldn\'t get productName for ${productNameSearch} with mode = ${mode}`);
  }

  let productPriceWithSale;

  try {
    productPriceWithSale = await page.evaluate(() => {
      return document.querySelector(".price-block__final-price").textContent.trim();
    });
  } catch (error) {
    productPriceWithSale = null;
    console.error(error);
    console.error(`Couldn\'t get productPriceWithSale for ${productNameSearch} with mode = ${mode}`);
  }

  let productPriceWithoutSale;

  try {
    productPriceWithoutSale = await page.evaluate(() => {
      return document.querySelector(".price-block__old-price").textContent.trim();
    });
  } catch (error) {
    productPriceWithoutSale = null;
    console.error(error);
    console.error(`Couldn\'t get productPriceWithoutSale for ${productNameSearch} with mode = ${mode}`);
  }

  console.log(productName);
  console.log(productPriceWithSale);
  console.log(productPriceWithoutSale);

  browser.close();

  res.send([productName, productPriceWithSale, productPriceWithoutSale, productLink]);
})

app.listen(port, () => {
  console.log(`Express app listening on PORT ${port}`)
});