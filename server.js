const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

app.get("/env.js", (_req, res) => {
  res.type("application/javascript").send(
    `window.__SUPABASE_CONFIG__ = {
  url: ${JSON.stringify(process.env.SUPABASE_URL || "")},
  anonKey: ${JSON.stringify(process.env.SUPABASE_ANON_KEY || "")}
};`
  );
});

app.use(express.static(rootDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.listen(port, () => {
  console.log(`MOMCARE berjalan di http://localhost:${port}`);
});
