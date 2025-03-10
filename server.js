const express = require("express");
//const puppeteer = require("puppeteer");
const puppeteer = require("puppeteer-core");

const pdfkit = require("pdfkit");
const fs = require("fs");
const cors = require("cors");
const path = require("path");


const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));


// Puerto en el que la aplicación se ejecutará





app.post("/generar-pdf", async (req, res) => {
    const { skus, descuentos } = req.body;

    if (!skus || skus.length === 0) {
        return res.status(400).json({ error: "Debe ingresar al menos un SKU." });
    }

    const browser = await puppeteer.launch({
        executablePath: "/usr/bin/chromium",
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--single-process"
        ]
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

                // Obtener parte entera del precio
                const priceElement = productElement.querySelector("div.bestPrice span.js-pp span");
                let integerPart = priceElement ? priceElement.innerText.trim() : "No encontrado";

                // Obtener parte decimal del precio y limpiar puntos extra
                const decimalElement = productElement.querySelector("div.bestPrice span.js-pp sup");
                let decimalPart = decimalElement ? decimalElement.innerText.replace(".", "").trim() : "00"; // Quitar punto extra si existe

                // Unir parte entera y decimal correctamente
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

        // Dividimos el número en parte entera y decimal
        const [parteEntera, parteDecimal] = precioDescuento.split(".");

        // Posiciones base
        const xSimbolo = xPos + 90; // Posición del "S/"
        const yPrecio = yPos + 60;   // Línea base del precio

        // Dibujar el nombre del producto

        const maxCaracteres = 40; // Ajusta según el espacio disponible
        let nombreProducto = producto.name.length > maxCaracteres
            ? producto.name.substring(0, maxCaracteres) + "..."
            : producto.name;


        doc.fontSize(16).font("CustomFont").text(nombreProducto, xPos + 40, yPos + 15, {
            width: A6_WIDTH - 15,
            align: "center"
        });

        // Dibujar el símbolo "S/"
        doc.fontSize(20).font("CustomFont").text(`S/`, xSimbolo + 20, yPrecio + 60, { continued: true });

        // Obtener ancho del símbolo y parte entera
        const anchoSimbolo = doc.widthOfString("S/ ");  
        const anchoParteEntera = doc.widthOfString(parteEntera);

        // Ajustar la posición de la parte entera con respecto al símbolo
        const xParteEntera = xSimbolo + anchoSimbolo;
        doc.fontSize(85).font("CustomFont").text(parteEntera, xParteEntera, yPrecio, { continued: true });

        // Calcular ancho de la parte entera para posicionar la parte decimal correctamente
        const xParteDecimal = xParteEntera + anchoParteEntera - 15; // Ajustamos con "-10" para acercar el decimal
        doc.font("CustomFont").fontSize(50).text(`.${parteDecimal}`, xParteDecimal, yPrecio + 10, { continued: false });


        // Precio normal y SKU
        doc.fontSize(10).text(`Precio normal`, xPos + 270, yPos + 40);
        doc.fontSize(10).font("CustomFont").text(`S/${precioOriginal.toFixed(2)}`, xPos + 280, yPos + 55);


        doc.fontSize(10).text(`SKU: ${producto.sku}`, xPos + 90, yPos + 210);

        // **Organizar los carteles en formato A4**
        if ((index + 1) % 2 === 0) {
            // Si es el segundo cartel en la fila, saltamos a la siguiente fila
            xPos = 20;
            yPos += A6_HEIGHT + 20;
        } else {
            // Si es el primer cartel en la fila, movemos a la derecha
            xPos += A6_WIDTH + 10;
        }
    });


    doc.end();

    stream.on("finish", () => {
        res.json({ pdfUrl: "/carteles.pdf" });
    });
});
module.exports = app;

const PORT = process.env.PORT || 3000;

app.listen(PORT,function(){
    console.log("Servidor corriendo en " + PORT);
});

//app.listen(3000, () => console.log("Servidor corriendo en http://localhost:3000")); 