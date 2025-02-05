import dotenv from "dotenv";
import papaparse from "papaparse";
import * as ibmdb from "ibm_db";
import fs from "fs";
import { config } from "../config/config.js";
//import { testData } from "../config/config.js";

dotenv.config({ path: `./.env.${process.env.NODE_ENV}` });

const reference = process.argv[2].toString();
console.log(`reference: ${reference}`);
let tableName;
let fileNameBasic;
let DB2QueryString;

if (reference === "price-stock") {
  tableName = config.vhsGusDb.tableNamePriceStock;
  fileNameBasic = config.fileNamePriceStockReport;
  DB2QueryString = `select * from ${tableName}`;
} else if (reference === "laden-shop-amazon") {
  tableName = config.vhsGusDb.tableNameLadenShopAmazon;
  fileNameBasic = config.fileNameLadenShopAmazonVK;
  DB2QueryString = `select EAN, ART_NR, CLASSIFICATION4, CLASSIFICATION5, VK_ANZ_LADEN_1M, VK_ANZ_LADEN_3M, VK_ANZ_LADEN_1J, VK_ANZ_SHOP_1M, VK_ANZ_SHOP_3M, VK_ANZ_SHOP_1J, VK_ANZ_AMA_1M, VK_ANZ_AMA_3M, VK_ANZ_MARKTPLATZ_1M, VK_ANZ_MARKTPLATZ_3M, VK_ANZ_MARKTPLATZ_1J, BESTAND, BESTAND_EXKL_AMAZON from ${tableName}`;
  //DB2QueryString = `select * from ${tableName}`;
}
const formatDate = (newDate) => {
  let yyyy = newDate.getFullYear();
  let mm = newDate.getMonth() + 1; // month is zero-based
  let dd = newDate.getDate();

  if (dd < 10) dd = `0${dd}`;
  if (mm < 10) mm = `0${mm}`;

  const dateFormatted = `${yyyy}-${mm}-${dd}`;
  return dateFormatted;
};

const fetchAndSaveReport = async (tableName, fileNameBasic, DB2QueryString) => {
  console.log(tableName);
  // get current date and format
  const today = new Date();
  const todayFormatted = formatDate(today);
  console.log(todayFormatted);
  const fileName = `${fileNameBasic}_${todayFormatted}.csv`;

  // Check if already exists
  fs.readdir(`../reports`, async (err, files) => {
    if (err) {
      console.log("Unable to scan directory: " + err);
    }
    const alreadyExists = files.find((file) => file === fileName);
    console.log(alreadyExists);
    if (alreadyExists) {
      console.log("report already exists");
    } else {
      const reportData = await getDataViaIbmDbConnection(
        tableName,
        DB2QueryString
      );
      if (reportData) {
        let reportDataCsv;

        if (reference === "price-stock") {
          // Delete VHS-key so that EAN is on first place
          const withoutVHSColumn = reportData.map(
            ({ VHS_ART_NR, ...item }) => item
          );

          const purchasePriceWithComma = withoutVHSColumn.map((item) => {
            if (
              item.LIEFER_EK_EUR_PREFERRED &&
              item.LIEFER_EK_EUR_PREFERRED.includes(".")
            ) {
              if (item.LIEFER_EK_EUR_PREFERRED.startsWith(".")) {
                console.log(item.LIEFER_EK_EUR_PREFERRED);
                return {
                  ...item,
                  LIEFER_EK_EUR_PREFERRED: `0${item.LIEFER_EK_EUR_PREFERRED.replace(
                    ".",
                    ","
                  )}`,
                };
              } else {
                return {
                  ...item,
                  LIEFER_EK_EUR_PREFERRED: item.LIEFER_EK_EUR_PREFERRED.replace(
                    ".",
                    ","
                  ),
                };
              }
            } else {
              return item;
            }
          });

          const salesPriceWithComma = purchasePriceWithComma.map((item) => {
            if (item.VK && item.VK.toString().includes(".")) {
              if (item.VK.toString().startsWith(".")) {
                return {
                  ...item,
                  VK: `0${item.VK.replace(".", ",")}`,
                };
              } else {
                return {
                  ...item,
                  VK: item.VK.toString().replace(".", ","),
                };
              }
            } else {
              return item;
            }
          });

          reportDataCsv = papaparse.unparse(salesPriceWithComma, {
            newline: "\n",
          });
        } else if (reference === "laden-shop-amazon") {
          reportDataCsv = papaparse.unparse(reportData);
        }

        fs.writeFile(`../reports/${fileName}`, reportDataCsv, (error) => {
          if (error) {
            console.log("error saving file " + error);
          } else {
            console.log(`report ${fileName} saved to reports folder`);
          }
        });
      } else {
        console.log("no report data available");
      }
    }
  });
};

await fetchAndSaveReport(tableName, fileNameBasic, DB2QueryString);

// Establish connection to ExitB IBM DB2

export const getDataViaIbmDbConnection = async (
  tableName,
  DB2QueryString
): Promise<any> => {
  let connStr = `DATABASE=${process.env.VHS_GUS_DB_NAME};HOSTNAME=${process.env.VHS_GUS_HOST};UID=${process.env.VHS_GUS_USERNAME};PWD=${process.env.VHS_GUS_PASSWORD};PORT=${process.env.VHS_GUS_PORT};PROTOCOL=TCPIP`;
  console.log(connStr);
  return new Promise((resolve, reject) => {
    ibmdb.open(connStr, (err, conn) => {
      if (err) console.log(err);
      conn.query(DB2QueryString, (err, data) => {
        console.log(`DB2 Query String: ${DB2QueryString}`);
        if (data.length) {
          // console.log(data);
          console.log(`fetching data from ${tableName} completed`);
        } else {
          console.log(data);
          console.log("no data available: ");
          console.log(err);
        }
        err ? reject(err) : resolve(data);
        conn.close(() => console.log(`connection closed`));
      });
    });
  });
};

// const mapArray = () => {
//   const array = testData;
//   const commaPrice = array.map((item) => {
//     if (
//       item.LIEFER_EK_EUR_PREFERRED &&
//       item.LIEFER_EK_EUR_PREFERRED.includes(".")
//     ) {
//       return {
//         ...item,
//         LIEFER_EK_EUR_PREFERRED: item.LIEFER_EK_EUR_PREFERRED.replace(".", ","),
//       };
//     }
//     return item;
//   });
//   console.log(commaPrice);
// };

// if (reference === "test") {
//   mapArray();
// }
