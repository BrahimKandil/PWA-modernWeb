const { createServer } = require("node:https");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const Next = require("next");

const port = Number(process.env.HTTPS_PORT ?? 3443);
const app = Next({ dev: process.env.HTTPS_DEV === "1", port });
const handler = app.getRequestHandler();

const options = {
  key: readFileSync(join(process.cwd(), "certs", "arp-lan-key.pem")),
  cert: readFileSync(join(process.cwd(), "certs", "arp-lan.pem")),
};

app.prepare().then(() => {
  createServer(options, (req, res) => handler(req, res)).listen(port, "0.0.0.0", () => {
    console.log(`ARP Éducation (HTTPS) prêt :`);
    console.log(`  PC        → https://localhost:${port}`);
    console.log(`  Téléphone → https://192.168.100.10:${port}  (même Wi-Fi)`);
  });
});
