const solveBtn = document.getElementById('solveBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const copyBtn = document.getElementById('copyBtn');
const resultActions = document.getElementById('resultActions');
const apiKeyInput = document.getElementById('apiKey');
const saveKeyCheckbox = document.getElementById('saveKey');
const modelSelect = document.getElementById('modelSelect');
const aiSolveBtn = document.getElementById('aiSolveBtn');

const PRESET_KEYS = {
    aistudio: 'isi dengan apikey aistudio anda sendiri',
    openai: 'isi dengan apikey openai anda sendiri'
};
const KEY_STORAGE_KEY = 'gf_ai_keys';
const DEFAULT_PROVIDER = 'aistudio';
const DEFAULT_GOOGLE_MODEL = 'text-bison-001';
let savedApiKeys = {};

function setStatus(text) {
    statusEl.textContent = text;
}

function getModelAndProvider() {
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    const model = selectedOption ? selectedOption.value : 'text-bison-001';
    const provider = (selectedOption && selectedOption.dataset && selectedOption.dataset.provider) || DEFAULT_PROVIDER;
    return { model, provider };
}

function refreshApiKeyInput() {
    const { provider } = getModelAndProvider();
    const saved = savedApiKeys[provider];
    if (saved) {
        apiKeyInput.value = saved;
        saveKeyCheckbox.checked = true;
    } else if (PRESET_KEYS[provider]) {
        apiKeyInput.value = PRESET_KEYS[provider];
        saveKeyCheckbox.checked = false;
    } else {
        apiKeyInput.value = '';
        saveKeyCheckbox.checked = false;
    }
}

function persistKeys() {
    if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [KEY_STORAGE_KEY]: savedApiKeys });
    }
}

function getProviderKey(provider) {
    const saved = savedApiKeys[provider];
    if (typeof saved === 'string' && saved.trim()) {
        return saved.trim();
    }
    const preset = PRESET_KEYS[provider];
    return typeof preset === 'string' ? preset : '';
}

solveBtn.addEventListener('click', () => {
    setStatus('Mencari form di tab aktif...');
    solveBtn.disabled = true;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
            setStatus('Tidak ada tab aktif.');
            solveBtn.disabled = false;
            return;
        }

        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: scrapeGoogleForm
        }, (injectionResults) => {
            solveBtn.disabled = false;
            if (!injectionResults || !injectionResults[0]) {
                setStatus('Gagal mendapatkan data dari halaman.');
                return;
            }

            const data = injectionResults[0].result;
            if (!data || data.length === 0) {
                setStatus('Tidak ditemukan pertanyaan. Pastikan halaman adalah Google Form.');
                resultEl.hidden = true;
                resultActions.hidden = true;
                return;
            }

            setStatus(`Selesai: ${data.length} pertanyaan ditemukan`);
            resultEl.textContent = JSON.stringify(data, null, 2);
            resultEl.hidden = false;
            resultActions.hidden = false;
        });
    });
});

// load saved api key if any and merge with presets
if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([KEY_STORAGE_KEY, 'gf_ai_key'], (res) => {
        if (res) {
            if (res[KEY_STORAGE_KEY] && typeof res[KEY_STORAGE_KEY] === 'object') {
                savedApiKeys = res[KEY_STORAGE_KEY];
            }
            if (res.gf_ai_key && !savedApiKeys.aistudio) {
                savedApiKeys.aistudio = res.gf_ai_key;
            }
        }
        refreshApiKeyInput();
    });
} else {
    refreshApiKeyInput();
}

modelSelect.addEventListener('change', () => {
    refreshApiKeyInput();
});

saveKeyCheckbox.addEventListener('change', () => {
    if (!saveKeyCheckbox.checked) {
        const { provider } = getModelAndProvider();
        if (savedApiKeys[provider]) {
            delete savedApiKeys[provider];
            persistKeys();
        }
        refreshApiKeyInput();
    }
});

aiSolveBtn.addEventListener('click', async () => {
    setStatus('Mempersiapkan...');
    aiSolveBtn.disabled = true;
    // get api key from input (can be empty)
    const { provider, model } = getModelAndProvider();
    const enteredKey = apiKeyInput.value && apiKeyInput.value.trim();
    const providerKey = getProviderKey(provider);
    const apiKey = enteredKey || providerKey;

    if (!apiKey) {
        setStatus('API key untuk provider ini belum tersedia.');
        aiSolveBtn.disabled = false;
        return;
    }

    // If user chose to save key, persist it
    if (saveKeyCheckbox.checked && enteredKey) {
        try {
            savedApiKeys[provider] = enteredKey;
            persistKeys();
        } catch (e) {
            // ignore
        }
    }

    setStatus('Mencari form...');
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs || !tabs[0]) {
            setStatus('Tidak ada tab aktif.');
            aiSolveBtn.disabled = false;
            return;
        }

        chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, function: scrapeGoogleForm }, async (injectionResults) => {
            if (!injectionResults || !injectionResults[0]) {
                setStatus('Gagal mendapatkan data dari halaman.');
                aiSolveBtn.disabled = false;
                return;
            }

            const data = injectionResults[0].result;
            if (!data || data.length === 0) {
                setStatus('Tidak ditemukan pertanyaan.');
                aiSolveBtn.disabled = false;
                return;
            }

            setStatus('Memanggil AI...');
            try {
                let finalStatus = 'Selesai (AI)';
                let suggestion = null;
                try {
                    suggestion = await callAI(data, provider, model, apiKey);
                } catch (err) {
                    console.error(err);
                    const fallbackResult = await attemptGoogleFallback(err, data, provider);
                    if (fallbackResult && fallbackResult.success) {
                        suggestion = fallbackResult.suggestion;
                        finalStatus = fallbackResult.status || 'Selesai (AI via Google)';
                    } else if (fallbackResult && fallbackResult.message) {
                        setStatus(fallbackResult.message);
                    } else {
                        setStatus('Gagal memanggil AI: ' + (err.message || String(err)));
                    }
                }

                if (suggestion) {
                    resultEl.textContent = suggestion;
                    resultEl.hidden = false;
                    resultActions.hidden = false;
                    setStatus(finalStatus);
                }
            } catch (err) {
                console.error(err);
                if (!resultEl.textContent) {
                    setStatus('Gagal memanggil AI: ' + (err.message || String(err)));
                }
            }

            aiSolveBtn.disabled = false;
        });
    });
});

clearBtn.addEventListener('click', () => {
    resultEl.textContent = '';
    resultEl.hidden = true;
    resultActions.hidden = true;
    setStatus('Bersih. Siap.');
});

copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(resultEl.textContent);
        setStatus('Tersalin ke clipboard');
    } catch (err) {
        setStatus('Gagal menyalin');
    }
});

function scrapeGoogleForm() {
    const formData = [];

    const questionElements = document.querySelectorAll('div[role="listitem"]');

    questionElements.forEach((questionElement, index) => {
        // Ambil teks pertanyaan (lebih generik)
        let questionText = '';
        const label = questionElement.querySelector('div.HoXoMd span.M7eMe') || questionElement.querySelector('div[role="heading"]') || questionElement.querySelector('label');
        questionText = label ? label.innerText.trim() : `Pertanyaan ${index + 1}`;

        // Ambil opsi (generik)
        const optionElements = questionElement.querySelectorAll('label, .freebirdFormviewerComponentsQuestionRadioChoice, .docssharedWizToggleLabeledContainer');
        const options = [];

        optionElements.forEach(opt => {
            const text = opt.innerText && opt.innerText.trim();
            if (text) options.push(text);
        });

        formData.push({
            question: questionText,
            options: options.length > 0 ? options : 'Tidak ada pilihan (bukan pilihan ganda)'
        });
    });

    return formData;
}

async function callAI(formData, provider, modelName, apiKey) {
    const promptText = buildPrompt(formData);
    if (provider === 'openai') {
        return callOpenAI(promptText, apiKey, modelName);
    }
    return callAiStudio(promptText, apiKey, modelName);
}

function buildPrompt(formData) {
    const promptParts = [];
    promptParts.push('Anda adalah asisten yang membantu memilih jawaban paling mungkin dari sebuah Google Form.');
    promptParts.push('Berikan output sebagai JSON array. Untuk setiap pertanyaan, keluarkan objek {"question": ..., "suggestion": ..., "reason": ...}.');
    promptParts.push('Berikut daftar pertanyaan dan opsi:');
    formData.forEach((q, i) => {
        promptParts.push(`${i + 1}. ${q.question}`);
        if (Array.isArray(q.options)) {
            q.options.forEach((o, j) => promptParts.push(`   - (${j + 1}) ${o}`));
        } else {
            promptParts.push('   - (no choices)');
        }
    });
    promptParts.push('Tolong pilih satu jawaban singkat (isi "suggestion" dengan teks opsi yang paling relevan).');
    promptParts.push('Jawaban harus dalam format JSON hanya. Jangan sertakan penjelasan tambahan di luar JSON.');
    return promptParts.join('\n');
}

async function callAiStudio(promptText, apiKey, modelName) {
    const model = modelName || 'text-bison-001';
    const base = 'https://generativelanguage.googleapis.com/v1beta2/models/';
    const endpoint = `${base}${encodeURIComponent(model)}:generateText?key=${encodeURIComponent(apiKey)}`;
    const body = {
        prompt: { text: promptText },
        temperature: 0.0,
        maxOutputTokens: 512
    };

    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API error ${resp.status}: ${text}`);
    }

    const json = await resp.json();
    let output = '';
    if (json.candidates && json.candidates[0] && json.candidates[0].output) {
        output = json.candidates[0].output;
    } else if (json.result && json.result[0]) {
        output = json.result[0];
    } else if (json.candidates && json.candidates[0] && json.candidates[0].content) {
        output = json.candidates[0].content;
    } else {
        output = JSON.stringify(json, null, 2);
    }
    return normalizeModelOutput(output);
}

async function callOpenAI(promptText, apiKey, modelName) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelName || 'gpt-4o-mini',
            temperature: 0,
            messages: [
                { role: 'system', content: 'Anda adalah asisten ahli yang memberikan jawaban Google Form terbaik.' },
                { role: 'user', content: promptText }
            ]
        })
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API error ${resp.status}: ${text}`);
    }

    const json = await resp.json();
    let output = '';
    const choice = json.choices && json.choices[0];
    if (choice && choice.message) {
        if (Array.isArray(choice.message.content)) {
            output = choice.message.content.map((part) => part.text || part).join('');
        } else {
            output = choice.message.content;
        }
    } else if (json.output && json.output[0]) {
        output = json.output[0];
    } else {
        output = JSON.stringify(json, null, 2);
    }
    return normalizeModelOutput(output);
}

function normalizeModelOutput(output) {
    try {
        const parsed = typeof output === 'string' ? JSON.parse(output) : output;
        return JSON.stringify(parsed, null, 2);
    } catch (e) {
        return output;
    }
}

function shouldFallbackToGoogle(provider, err) {
    if (provider !== 'openai' || !err) return false;
    const msg = (err.message || String(err || '')).toLowerCase();
    return msg.includes('429') || msg.includes('quota');
}

async function attemptGoogleFallback(err, formData, provider) {
    if (!shouldFallbackToGoogle(provider, err)) {
        return null;
    }
    const fallbackKey = getProviderKey(DEFAULT_PROVIDER);
    if (!fallbackKey) {
        return { success: false, message: 'OpenAI quota habis dan kunci Google tidak tersedia.' };
    }
    setStatus('OpenAI quota habis. Beralih ke Google text-bison-001...');
    try {
        const suggestion = await callAI(formData, DEFAULT_PROVIDER, DEFAULT_GOOGLE_MODEL, fallbackKey);
        return { success: true, suggestion, status: 'Selesai (AI via Google)' };
    } catch (fallbackErr) {
        console.error(fallbackErr);
        return { success: false, message: 'Fallback Google gagal: ' + (fallbackErr.message || String(fallbackErr)) };
    }
}
