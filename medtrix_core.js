/**
 * MEDTRIX CORE ENGINE v3.6 (AI Stability Edition)
 */

const MEDTRIX = {
    config: {
        version: '3.6',
        themeKey: 'medtrix-theme',
        dbKey: 'medtrix_analytics',
        aiKey: 'medtrix_ai_config' 
    },

    data: {
        _manifestCache: null,
        _fileCache: {},

        getManifest: async function() {
            if (this._manifestCache) return this._manifestCache;
            try {
                const res = await fetch('./quiz_manifest.json');
                if (!res.ok) throw new Error("Manifest load failed");
                let rawList = await res.json();
                this._manifestCache = rawList;
                return rawList;
            } catch (e) { console.error(e); return []; }
        },

        getQuiz: async function(filename) {
            if (this._fileCache[filename]) return this._fileCache[filename];
            try {
                const res = await fetch(`./quiz_data/${filename}`);
                const data = await res.json();
                
                // Normalization Logic
                if(data.questions) {
                    data.questions = data.questions.map(q => {
                        if(typeof q.question === 'object') q.text = q.question.text || JSON.stringify(q.question);
                        else q.text = q.question || q.text;

                        if(q.options) {
                            if(!Array.isArray(q.options)) q.options = Object.values(q.options);
                            q.options = q.options.map(opt => {
                                if(typeof opt === 'object') return { text: opt.text || opt.value, correct: opt.correct || false };
                                return { text: opt, correct: false };
                            });
                        }
                        return q;
                    });
                }
                this._fileCache[filename] = data;
                return data;
            } catch (e) { return null; }
        },

        formatTitle: function(rawName) {
            return rawName.replace('.json', '').replace(/^\d+[_-\s]*/, '').replace(/_/g, ' ');
        }
    },

    offline: {
        saveQuiz: async function(url) {
            if(!('caches' in window)) return false;
            try {
                const cache = await caches.open('medtrix-core-v3');
                await cache.add(url);
                MEDTRIX.ui.toast("Downloaded for Offline!");
                return true;
            } catch(e) { 
                MEDTRIX.ui.toast("Download Failed");
                return false; 
            }
        },
        deleteQuiz: async function(url) {
            if(!('caches' in window)) return false;
            const cache = await caches.open('medtrix-core-v3');
            const success = await cache.delete(url);
            if(success) MEDTRIX.ui.toast("Removed from device");
            return success;
        }
    },

    db: {
        saveResult: function(qData, isCorrect, filename) {
            let history = JSON.parse(localStorage.getItem(MEDTRIX.config.dbKey) || '[]');
            history = history.filter(h => h.uid !== qData.uid);
            history.push({
                uid: qData.uid, text: qData.text, explanation: qData.explanation,
                timestamp: Date.now(), isCorrect: isCorrect, source: filename, options: qData.options
            });
            try { localStorage.setItem(MEDTRIX.config.dbKey, JSON.stringify(history)); } catch(e) {}
        }
    },

    // --- AI ENGINE (UPDATED v3.6) ---
    ai: {
        defaults: { provider: 'google', key: '', model: 'gemini-2.0-flash', url: '' },

        getConfig: function() {
            return JSON.parse(localStorage.getItem(MEDTRIX.config.aiKey)) || this.defaults;
        },

        ask: async function(prompt, context) {
            if(!navigator.onLine) return "AI is unavailable offline.";
            
            // 1. LOAD CONFIG
            const cfg = this.getConfig();
            const apiKey = cfg.key ? cfg.key.trim() : "";
            
            // 2. SAFETY CHECK (Prevents the 'Unregistered Caller' error)
            if (!apiKey || apiKey.length < 10) {
                return "⚠️ API Key Missing. Please go to Settings and paste your Google Gemini API Key.";
            }

            try {
                let responseText = "";

                // GOOGLE GEMINI
                if (cfg.provider === 'google') {
                    const modelName = cfg.model || 'gemini-2.0-flash';
                    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                    
                    const res = await fetch(endpoint, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt + "\n\nContext: " + context.substring(0,1500) }] }] })
                    });
                    
                    const data = await res.json();
                    if (data.error) throw new Error(data.error.message);
                    responseText = data.candidates[0].content.parts[0].text;
                } 
                
                // OPENAI / OTHERS
                else {
                    const baseUrl = cfg.url || 'https://api.openai.com/v1';
                    const finalUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
                    const modelName = cfg.model || 'gpt-3.5-turbo';

                    const res = await fetch(finalUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: modelName,
                            messages: [
                                { role: "system", content: "You are a helpful medical tutor." },
                                { role: "user", content: prompt + "\n\nContext: " + context.substring(0,1500) }
                            ]
                        })
                    });

                    const data = await res.json();
                    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
                    responseText = data.choices[0].message.content;
                }

                return responseText;

            } catch (e) { 
                console.error(e);
                return `AI Connection Error: ${e.message}`; 
            }
        }
    },

    ui: {
        initTheme: function() {
            const theme = localStorage.getItem(MEDTRIX.config.themeKey) || 'light';
            document.documentElement.setAttribute('data-theme', theme);
        },
        toast: function(msg) {
            let t = document.createElement('div');
            t.innerText = msg;
            t.style.cssText = "position:fixed; bottom:90px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#fff; padding:8px 16px; border-radius:20px; z-index:9999; font-size:0.8rem; animation:fadeIn 0.3s;";
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 1500);
        }
    }
};

MEDTRIX.ui.initTheme();

async function hardReset() {
    if(confirm("⚠️ FACTORY RESET\n\nThis will delete ALL data including API Keys.\nAre you sure?")) {
        localStorage.clear();
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for(let r of regs) await r.unregister();
        }
        alert("System Reset Complete.");
        location.href = "index.html";
    }
}
