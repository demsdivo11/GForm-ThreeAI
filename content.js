// Skrip untuk mengambil semua teks di halaman
function scrapeAllText() {
    const allText = [];

    // Ambil semua elemen di dalam halaman
    const elements = document.querySelectorAll('*');

    elements.forEach(element => {
        // Ambil teks dari elemen
        const text = element.innerText;

        // Simpan teks jika tidak kosong dan tidak hanya spasi
        if (text && text.trim() !== '') {
            allText.push(text.trim());
        }
    });

    // Output hasil
    console.log("All Text:", allText);

    // Tampilkan hasil dalam format JSON di alert
    alert(JSON.stringify(allText, null, 2));
}

scrapeAllText();
