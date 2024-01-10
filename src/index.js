#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { transform, parse } = require("csv");
const argv = require("yargs-parser")(process.argv.slice(2));

if (!argv.f) {
  throw new Error(
    "Missing filepath argument: usage: index.js -f <filepath> --origin <origin>",
  );
}

if (!argv.origin) {
  throw new Error(
    "Missing origin argument: usage: index.js -f <filepath> --origin <origin>",
  );
}

const transformerMap = getTransformerMap();
if (!(argv.origin in transformerMap)) {
  throw new Error(`Unknown origin: ${argv.origin}`);
}

const filepath = argv.f;
const files = [];

if (fs.lstatSync(filepath).isDirectory()) {
  fs.readdirSync(filepath).forEach((file) => {
    const resolvedPath = path.join(filepath, file);
    const stats = fs.statSync(resolvedPath);
    if (stats.isFile() && file.endsWith(".csv") && !file.endsWith(".out.csv")) {
      files.push(resolvedPath);
    }
  });
} else {
  files.push(filepath);
}

files.forEach((filepath) => {
  const outfilePath = `${filepath.replace(".csv", ".out.csv")}`;
  const transformer = transformerMap[argv.origin]();
  fs.createReadStream(filepath, "utf8")
    .pipe(parse({ trim: true, fromLine: 2, skipEmptyLines: true }))
    .pipe(transformer)
    .pipe(fs.createWriteStream(outfilePath, "utf8"))
    .on("finish", () => {
      console.log("Done! Written to:", outfilePath);
    })
    .on("error", (error) => {
      console.error(error);
      throw error;
    });
});

function getTransformerMap() {
  const genericTransformer = ({ date, amount, type }) => [date, amount, type].join(",") + "\n";
  return {
    aldermore() {
      return transform((record, callback) => {
        // record format: "18 Mar 2023","Rollover","","-28.78","0.00"
        const [dateString, type, _, amountString] = record;
        const amount = amountString.replace(/[^0-9.\-]/g, "");
        callback(
          null,
          genericTransformer({
            date: new Date(dateString).toLocaleDateString("en-gb"),
            amount,
            type,
          }),
        );
      });
    },
    shawbrook() {
      return transform((record, callback) => {
        // record format: 28/07/2023,Faster Payment," £1,000.00"," £1,000.00"
        const [dateString, type, amountString] = record;
        const amount = amountString.replace(/[^0-9.\-]/g, "");
        callback(null, genericTransformer({ date: dateString, amount, type }));
      });
    },
  };
}
