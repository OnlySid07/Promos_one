const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium"); // Nueva librería para Vercel
const pdfkit = require("pdfkit");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.post("/generar-pdf", async (req, res) => {
    const { skus, descuentos } = req.body;

    if (!skus || skus.length === 0) {
        return res.status(400).json({ error: "Debe ingresar al menos un SKU." });
    }

    // 🛠 Configuración de Puppeteer-Core con Chromium optimizado para Vercel
    const browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(), // Ruta automática
        headless: chromium.headless
    });

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

    doc.registerFont("CustomFont", path.join(__dirname, "public/fonts/Strike-Black.ttf"));
    const A6_WIDTH = 400;
    const A6_HEIGHT = 260;
    let xPos = 30, yPos = 20;

    productos.forEach((producto, index) => {
        const precioOriginal = parseFloat(producto.originalPrice.replace("S/", "").replace(",", ""));
        const precioDescuento = (precioOriginal * (1 - producto.discount / 100)).toFixed(2);
        const [parteEntera, parteDecimal] = precioDescuento.split(".");

        doc.fontSize(16).font("CustomFont").text(producto.name, xPos + 40, yPos + 15, {
            width: A6_WIDTH - 15,
            align: "center"
        });

        doc.fontSize(20).font("CustomFont").text(`S/`, xPos + 90, yPos + 120, { continued: true });
        doc.fontSize(85).font("CustomFont").text(parteEntera, xPos + 120, yPos + 80, { continued: true });
        doc.font("CustomFont").fontSize(50).text(`.${parteDecimal}`, xPos + 220, yPos + 90, { continued: false });

        if ((index + 1) % 2 === 0) {
            xPos = 20;
            yPos += A6_HEIGHT + 20;
        } else {
            xPos += A6_WIDTH + 10;
        }
    });

    doc.end();

    stream.on("finish", () => {
        res.json({ pdfUrl: "/carteles.pdf" });
    });
});

module.exports = app;

app.get("/", (req, res) => {
    res.send("Servidor Express funcionando en Vercel 🚀");
});
//app.listen(3000, () => console.log("Servidor corriendo en http://localhost:3000"));