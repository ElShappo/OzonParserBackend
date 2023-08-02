const express = require("express");
const multer = require("multer");
const cors = require('cors');

const XLSX = require('xlsx');

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
})

app.listen(port, () => {
  console.log(`Express app listening on PORT ${port}`)
})