/**
 * MEDTRIX CORE ENGINE v3.8 (Emergency Fix)
 */

const MEDTRIX = {
    config: {
        version: '3.8',
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
            } catch (e) { 
                console.error("Manifest Error:", e); 
                return []; 
            }
        },

        getQuiz: async function(filename) {
            // 1. Return Cache if available
            if (this._fileCache[filename]) return this._fileCache[filename];
            
            try {
                // 2. Fetch File
                const res = await fetch(`./quiz_data/${filename}`);
                if(!res.ok) throw new Error("File not found");
                const data = await res.json();
                
                // 3. SAFE Normalization (Prevents Crashing)
                if(data.questions && Array.isArray(data.questions)) {
                    data.questions = data.questions.map(q => {
                        try {
                            // Fix Question Text
                            if(!q.text) {
                                if(q.question && typeof q.question === 'object') {
                                    q.text = q.question.text || JSON.stringify(q.question);
                                } else {
                                    q.text = q.question || "Error: Question Text Missing";
                                }
                            }

                            // Fix Options (Force Array)
                            if(!q.options) q.options = [];
                            if(!Array.isArray(q.options) && typeof q.options === 'object') {
                                q.options = Object.values(q.options);
                            }
                            
                            // Normalize Option Structure
                            q.options = q.options.map(opt => {
                                if(typeof opt === 'object' && opt !== null) {
                                    return { text: opt.text || opt.value || "Option", correct: opt.correct || false };
                                }
                                return { text: String(opt), correct: false };
                            });

                            return q;
                        } catch(err) {
                            console.warn("Skipping broken question:", err);
                            return { text: "Error loading question", options: [] };
                        }
                    });
                } else {
                    // If file has no questions, return empty
                    data.questions = [];
                }

                this._fileCache[filename] = data;
                return data;
            } catch (e) { 
                console.error("Quiz Load Error:", e);
                return null; 
            }
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
            try {
                let history = JSON.parse(localStorage.getItem(MEDTRIX.config.dbKey) || '[]');
                // Prevent duplicate error entries
                if(!qData || !qData.uid) qData = { uid: Date.now(), text: "Unknown", options: [] };
                
                history = history.filter(h => h.uid !== qData.uid);
                history.push({
                    uid: qData.uid, text: qData.text, explanation: qData.explanation,
                    timestamp: Date.now(), isCorrect: isCorrect, source: filename, options: qData.options
                });
                localStorage.setItem(MEDTRIX.config.dbKey, JSON.stringify(history));
            } catch(e) {}
        }
    },

    // --- AI ENGINE (Safe & Robust) ---
    ai: {
        defaults: { provider: 'google', key: '', model: 'gemini-2.0-flash', url: '' },

        getConfig: function() {
            try {
                const saved = JSON.parse(localStorage.getItem(MEDTRIX.config.aiKey)) || {};
                return { ...this.defaults, ...saved };
            } catch(e) { return this.defaults; }
        },

        ask: async function(prompt, context) {
            if(!navigator.onLine) return "AI is unavailable offline.";
            
            const cfg = this.getConfig();
            const apiKey = cfg.key ? cfg.key.trim() : "";
            
            if (!apiKey || apiKey.length < 5) {
                return "⚠️ API Key Missing. Go to Settings to configure AI.";
            }

            try {
                let responseText = "";
                
                // GOOGLE
                if (cfg.provider === 'google') {
                    const modelName = (cfg.model || 'gemini-2.0-flash').trim();
                    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                    
                    const res = await fetch(endpoint, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt + "\n\nContext: " + context.substring(0,2000) }] }] })
                    });
                    
                    const data = await res.json();
                    if (data.error) throw new Error(data.error.message);
                    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
                } 
                // OPENAI / OTHERS
                else {
                    const baseUrl = cfg.url || 'https://api.openai.com/v1';
                    const finalUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
                    const modelName = (cfg.model || 'gpt-3.5-turbo').trim();

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
                    if (data.error) throw new Error(data.error.message);
                    responseText = data.choices[0].message.content;
                }
                return responseText;
            } catch (e) { return `Connection Failed: ${e.message}`; }
        }
    },

    ui: {
        initTheme: function() {
            try {
                const theme = localStorage.getItem(MEDTRIX.config.themeKey) || 'light';
                document.documentElement.setAttribute('data-theme', theme);
            } catch(e) {}
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

// Initialize
MEDTRIX.ui.initTheme();

async function hardReset() {
    if(confirm("⚠️ FACTORY RESET\n\nDelete all data?\nAre you sure?")) {
        localStorage.clear();
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for(let r of regs) await r.unregister();
        }
        alert("Reset Complete.");
        location.href = "index.html";
    }
}
