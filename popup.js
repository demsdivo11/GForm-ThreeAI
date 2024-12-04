document.getElementById("scrapeButton").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: scrapeGoogleForm
        });
    });
});  

function scrapeGoogleForm() {
    const formData = [];

    // Ambil semua elemen pertanyaan (listitem)
    const questionElements = document.querySelectorAll('div[role="listitem"]');

    questionElements.forEach((questionElement, index) => {
        // Ambil teks pertanyaan
        const questionTextElement = questionElement.querySelector('div.HoXoMd span.M7eMe');
        const questionText = questionTextElement ? questionTextElement.innerText.trim() : `Pertanyaan ${index + 1}`;

        // Ambil semua opsi jawaban
        const optionElements = questionElement.querySelectorAll('label .aDTYNe.snByac.OvPDhc.OIC90c');
        const options = [];

        optionElements.forEach(optionElement => {
            const optionText = optionElement.innerText.trim();
            if (optionText) {
                options.push(optionText);
            }
        });

        formData.push({
            question: questionText,
            options: options.length > 0 ? options : "Tidak ada pilihan (bukan pilihan ganda)"
        });
    });

    // Output hasil ke console
    console.log("Scraped Data:", formData);

    // Tampilkan hasil dalam alert
    alert(JSON.stringify(formData, null, 2));
}
