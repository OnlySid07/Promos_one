const express = require("express");
const puppeteer = require("puppeteer");
const pdfkit = require("pdfkit");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Ruta de prueba para verificar que Puppeteer funciona en Vercel
app.get("/test-puppeteer", async (req, res) => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            executablePath: "/vercel/.cache/puppeteer/chrome/linux-134.0.6998.35/chrome-linux64/chrome"
        });
        const page = await browser.newPage();
        await page.goto("https://example.com");
        const title = await page.title();
        await browser.close();
        res.json({ success: true, title });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/generar-pdf", async (req, res) => {
    const { skus, descuentos } = req.body;

    if (!skus || skus.length === 0) {
        return res.status(400).json({ error: "Debe ingresar al menos un SKU." });
    }

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    let productos = [];

    for (let i = 0; i < skus.length; i++) {
        const sku = skus[i];
        const searchUrl = `https://www.promart.pe/busca?ft=${sku}`;

        await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

        try {
            await page.waitForSelector("div.container__item--product", { timeout: 5000 });

            const producto = await page.evaluate(() => {
                const productElement = document.querySelector("div.container__item--product");
                if (!productElement) return null;

                const name = productElement.querySelector("h2.item__productName a")?.innerText.trim() || "No encontrado";

                const priceElement = productElement.querySelector("div.bestPrice span.js-pp span");
                let integerPart = priceElement ? priceElement.innerText.trim() : "No encontrado";

                const decimalElement = productElement.querySelector("div.bestPrice span.js-pp sup");
                let decimalPart = decimalElement ? decimalElement.innerText.replace(".", "").trim() : "00";

                let priceText = integerPart !== "No encontrado" ? `${integerPart}.${decimalPart}` : "No encontrado";

                return { name, price: priceText };
            });

            if (producto) {
                productos.push({
                    sku,
                    name: producto.name,
                    originalPrice: producto.price,
                    discount: descuentos[i]
                });
            }
        } catch (error) {
            console.log(`Error obteniendo SKU ${sku}:`, error);
        }
    }

    await browser.close();

    if (productos.length === 0) {
        return res.status(400).json({ error: "No se encontraron productos." });
    }

    const pdfPath = path.join(__dirname, "public", "carteles.pdf");
    const doc = new pdfkit({ size: "A4", layout: "landscape" });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.end();

    stream.on("finish", () => {
        res.json({ pdfUrl: "/carteles.pdf" });
    });
});

module.exports = app;

app.get("/", (req, res) => {
    res.send("Servidor Express funcionando en Vercel 🚀");
});
