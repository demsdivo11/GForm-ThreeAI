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
    aistudio: 'AIzaSyC7tZFl4_G6KRpnO2HEM2WrNxo1LY1oBj4',
    openai: 'isi dengan apikey openai anda sendiri'
};
const KEY_STORAGE_KEY = 'gf_ai_keys';
const LAST_RESULT_KEY = 'gf_last_result';
const LAST_STATUS_KEY = 'gf_last_status';
const LAST_MODEL_KEY = 'gf_last_model';
const DEFAULT_PROVIDER = 'aistudio';
const DEFAULT_GOOGLE_MODEL = 'gemini-2.0-flash';
let savedApiKeys = {};

function setStatus(text) {
    statusEl.textContent = text;
    if (chrome?.storage?.local) {
        chrome.storage.local.set({ [LAST_STATUS_KEY]: text });
    }
}

function getModelAndProvider() {
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    const model = selectedOption ? selectedOption.value : DEFAULT_GOOGLE_MODEL;
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
    chrome.storage.local.get([KEY_STORAGE_KEY, 'gf_ai_key', LAST_RESULT_KEY, LAST_STATUS_KEY, LAST_MODEL_KEY], (res) => {
        if (res) {
            if (res[KEY_STORAGE_KEY] && typeof res[KEY_STORAGE_KEY] === 'object') {
                savedApiKeys = res[KEY_STORAGE_KEY];
            }
            if (res.gf_ai_key && !savedApiKeys.aistudio) {
                savedApiKeys.aistudio = res.gf_ai_key;
            }
            if (res[LAST_MODEL_KEY] && modelSelect.querySelector(`option[value="${res[LAST_MODEL_KEY]}"]`)) {
                modelSelect.value = res[LAST_MODEL_KEY];
            }
            if (res[LAST_RESULT_KEY]) {
                resultEl.textContent = res[LAST_RESULT_KEY];
                resultEl.hidden = false;
                resultActions.hidden = false;
            }
            if (res[LAST_STATUS_KEY]) {
                statusEl.textContent = res[LAST_STATUS_KEY];
            }
        }
        refreshApiKeyInput();
    });
} else {
    refreshApiKeyInput();
}

modelSelect.addEventListener('change', () => {
    refreshApiKeyInput();
    if (chrome?.storage?.local) {
        chrome.storage.local.set({ [LAST_MODEL_KEY]: modelSelect.value });
    }
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
                    if (chrome?.storage?.local) {
                        chrome.storage.local.set({ [LAST_RESULT_KEY]: suggestion });
                    }
                    resultEl.hidden = false;
                    resultActions.hidden = false;
                    const { data: parsedSuggestions, error: parseError } = parseSuggestionJSON(suggestion);
                    if (parsedSuggestions.length > 0) {
                        setStatus(`${finalStatus} • menerapkan jawaban...`);
                        chrome.scripting.executeScript(
                            {
                                target: { tabId: tabs[0].id },
                                function: applySuggestionsToGoogleForm,
                                args: [parsedSuggestions]
                            },
                            (applyResults) => {
                                const res = applyResults && applyResults[0] && applyResults[0].result;
                                if (Array.isArray(res)) {
                                    const successCount = res.filter((r) => r && r.success).length;
                                    setStatus(`${finalStatus} • ${successCount}/${res.length} opsi diklik`);
                                } else {
                                    setStatus(`${finalStatus} • Gagal menerapkan jawaban otomatis`);
                                }
                            }
                        );
                    } else {
                        const errMsg = parseError ? ` (${parseError})` : '';
                        setStatus(`${finalStatus} • JSON tidak terbaca${errMsg}, klik manual`);
                    }
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
    if (chrome?.storage?.local) {
        chrome.storage.local.remove([LAST_RESULT_KEY, LAST_STATUS_KEY]);
    }
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
    promptParts.push('Anda adalah asisten yang memilih jawaban paling mungkin dari Google Form.');
    promptParts.push('Output WAJIB berupa JSON array tanpa teks lain.');
    promptParts.push('Gunakan penalaran dan hitung dengan teliti; pilih opsi yang paling benar, jangan asal.');
    promptParts.push('Format setiap item: {"questionIndex": <nomor pertanyaan 1-based>, "optionNumber": <nomor opsi 1-based atau null jika tidak ada>, "optionText": "<teks opsi persis dari daftar>"}');
    promptParts.push('Gunakan nomor pertanyaan dan nomor opsi sesuai yang diberikan di bawah (1-based). Jangan menebak label lain.');
    promptParts.push('Jika tidak ada pilihan, set optionNumber ke null dan optionText ke "".');
    promptParts.push('Berikut daftar pertanyaan dan opsi:');
    formData.forEach((q, i) => {
        promptParts.push(`${i + 1}. ${q.question}`);
        if (Array.isArray(q.options)) {
            q.options.forEach((o, j) => promptParts.push(`   - (${j + 1}) ${o}`));
        } else {
            promptParts.push('   - (no choices)');
        }
    });
    promptParts.push('Hanya kembalikan JSON, tidak ada teks lain.');
    return promptParts.join('\n');
}

async function callAiStudio(promptText, apiKey, modelName) {
    const model = modelName || DEFAULT_GOOGLE_MODEL;
    const base = 'https://generativelanguage.googleapis.com/v1/models/';
    const endpoint = `${base}${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
        contents: [
            {
                role: 'user',
                parts: [{ text: promptText }]
            }
        ],
        generationConfig: {
            temperature: 0,
            maxOutputTokens: 1024
        }
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
    if (json.candidates && json.candidates[0]) {
        const candidate = json.candidates[0];
        if (candidate.content && Array.isArray(candidate.content.parts)) {
            output = candidate.content.parts.map((p) => p.text || p).join('');
        } else if (candidate.output) {
            output = candidate.output;
        } else {
            output = JSON.stringify(candidate, null, 2);
        }
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

function extractJsonArrayText(text) {
    if (!text) return '';
    let raw = String(text);
    let start = raw.indexOf('[');
    let end = raw.lastIndexOf(']');

    // If no bracket found, strip code fences and try again
    if (start === -1) {
        raw = raw.replace(/```/g, '').replace(/^json\b/i, '').trim();
        start = raw.indexOf('[');
        end = raw.lastIndexOf(']');
    }

    // Best effort: slice from first [ to last ], or to end if missing ]
    if (start !== -1) {
        if (end !== -1 && end > start) {
            return raw.slice(start, end + 1).trim();
        }
        return raw.slice(start).trim();
    }

    return raw.trim();
}

function parseSuggestionJSON(text) {
    let extracted = extractJsonArrayText(text).replace(/```/g, '').replace(/^json\b/i, '').trim();
    if (extracted.startsWith('[') && !extracted.trim().endsWith(']')) {
        extracted = `${extracted}]`;
    }
    let lastErr = '';
    const tryParse = (val) => {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return { data: parsed, error: '' };
            return { data: [], error: 'Parsed but not array' };
        } catch (err) {
            lastErr = err.message;
            return null;
        }
    };

    const first = tryParse(extracted);
    if (first) return first;

    // fallback: remove trailing commas
    const noTrailing = extracted.replace(/,(?=\s*[}\]])/g, '');
    const second = tryParse(noTrailing);
    if (second) return second;

    // fallback: salvage any object literals found
    const objectMatches = extracted.match(/\{[\s\S]*?\}/g) || [];
    const salvaged = [];
    objectMatches.forEach((objStr) => {
        try {
            const parsed = JSON.parse(objStr);
            salvaged.push(parsed);
        } catch (err) {
            lastErr = err.message;
        }
    });
    if (salvaged.length > 0) {
        return { data: salvaged, error: '' };
    }

    console.error('Parse suggestion gagal', lastErr);
    return { data: [], error: lastErr || 'Unknown parse error' };
}

function applySuggestionsToGoogleForm(suggestions) {
    const questionElements = document.querySelectorAll('div[role="listitem"]');
    const results = [];
    const norm = (t) => (t || '').toString().replace(/\s+/g, ' ').trim().toLowerCase();
    const loose = (t) => (t || '').toString().toLowerCase().replace(/[^a-z0-9]/gi, '');
    const isVisible = (el) => {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };
    const isSkippableText = (txt) => {
        const t = norm(txt);
        return !t || t.includes('batal pilihan') || t.includes('clear selection');
    };

        suggestions.forEach((s, idx) => {
            const qIndexRaw = s.questionIndex ?? s.index ?? s.no ?? s.questionNo ?? (idx + 1);
            const qIndex = Number(qIndexRaw) - 1;
            if (Number.isNaN(qIndex) || qIndex < 0 || qIndex >= questionElements.length) {
                results.push({ success: false, message: 'Indeks pertanyaan tidak valid', questionIndex: qIndexRaw });
                return;
            }

            const questionEl = questionElements[qIndex];
            const rawOptionNodes = Array.from(
                questionEl.querySelectorAll(
                    'label, .docssharedWizToggleLabeledContainer, .freebirdFormviewerComponentsQuestionRadioChoice, div[role="radio"], div[role="checkbox"]'
                )
            );
            const optionNodes = rawOptionNodes.filter((node) => isVisible(node) && !isSkippableText(node.innerText));

            const optRaw = s.optionNumber ?? s.option ?? s.optionNo;
            const optionNumber = optRaw === null ? null : Number(optRaw);
            let targetNode = null;

            if (optionNumber === null && !s.optionText) {
                results.push({ success: true, questionIndex: qIndex + 1, message: 'Lewati (tidak ada opsi)' });
                return;
            }

            if (optionNumber && !Number.isNaN(optionNumber) && optionNumber >= 1 && optionNumber <= optionNodes.length) {
                targetNode = optionNodes[optionNumber - 1];
            }

            const desiredText = norm(s.optionText);
            if (!targetNode && desiredText) {
                targetNode =
                    optionNodes.find((node) => {
                        const text = norm(node.innerText || '');
                        return text === desiredText || text.includes(desiredText) || desiredText.includes(text);
                    }) ||
                    optionNodes.find((node) => loose(node.innerText || '') === loose(desiredText));
            }

            // fallback to raw nodes if still not found (optionNumber reference might need unfiltered nodes)
            if (!targetNode && optionNumber && optionNumber >= 1 && optionNumber <= rawOptionNodes.length) {
                targetNode = rawOptionNodes[optionNumber - 1];
            }

            if (!targetNode) {
                results.push({ success: false, message: 'Opsi tidak ditemukan', questionIndex: qIndex + 1 });
                return;
            }

            const clickTarget =
                targetNode.querySelector('input[type="radio"], input[type="checkbox"], div[role="radio"], div[role="checkbox"]') ||
                targetNode;
            clickTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
            clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            results.push({ success: true, questionIndex: qIndex + 1 });
        });

        return results;
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
    setStatus(`OpenAI quota habis. Beralih ke Google ${DEFAULT_GOOGLE_MODEL}...`);
    try {
        const suggestion = await callAI(formData, DEFAULT_PROVIDER, DEFAULT_GOOGLE_MODEL, fallbackKey);
        return { success: true, suggestion, status: 'Selesai (AI via Google)' };
    } catch (fallbackErr) {
        console.error(fallbackErr);
        return { success: false, message: 'Fallback Google gagal: ' + (fallbackErr.message || String(fallbackErr)) };
    }
}
