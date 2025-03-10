function generarPDF() {
    const skus = [];
    const descuentos = [];

    document.querySelectorAll(".sku").forEach((input, index) => {
        const sku = input.value.trim();
        const descuento = document.querySelectorAll(".descuento")[index].value;
        
        if (sku) {
            skus.push(sku);
            descuentos.push(descuento);
        }
    });

    if (skus.length === 0) {
        document.getElementById("mensaje").innerHTML = "<p style='color: red;'>Ingrese al menos un SKU.</p>";
        return;
    }

    document.getElementById("mensaje").innerHTML = "<p>Generando PDF...</p>";

    fetch("/generar-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus, descuentos })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            document.getElementById("mensaje").innerHTML = `<p style='color: red;'>${data.error}</p>`;
        } else {
            document.getElementById("mensaje").innerHTML = `<p><a href="${data.pdfUrl}" download>Descargar PDF</a></p>`;
        }
    })
    .catch(error => {
        document.getElementById("mensaje").innerHTML = "<p style='color: red;'>Error al generar el PDF.</p>";
        console.error(error);
    });
}
