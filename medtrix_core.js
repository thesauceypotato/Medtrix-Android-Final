/**
 * MEDTRIX CORE ENGINE v3.4 (Offline & Settings Edition)
 */

const MEDTRIX = {
    config: {
        version: '3.4',
        themeKey: 'medtrix-theme',
        dbKey: 'medtrix_analytics'
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
            // Try Memory Cache first
            if (this._fileCache[filename]) return this._fileCache[filename];
            
            try {
                // Fetch (Service Worker will intercept if offline)
                const res = await fetch(`./quiz_data/${filename}`);
                const data = await res.json();
                
                // Data Normalization
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

    // --- NEW: OFFLINE MANAGER (For Future Download Page) ---
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

    ai: {
        getKey: function() { 
            if (typeof MEDTRIX_SECRETS !== 'undefined' && MEDTRIX_SECRETS.API_KEY) {
                return MEDTRIX_SECRETS.API_KEY;
            }
            return ""; 
        },

        ask: async function(prompt, context) {
            const key = this.getKey();
            if(!navigator.onLine) return "AI is unavailable offline.";
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt + "\n\nContext: " + context.substring(0,1000) }] }] })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                return data.candidates[0].content.parts[0].text;
            } catch (e) { return `AI Error: ${e.message}`; }
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

// --- GLOBAL FACTORY RESET (UPDATED) ---
async function hardReset() {
    if(confirm("⚠️ FACTORY RESET\n\nThis will delete ALL progress, scores, and offline data.\nAre you sure?")) {
        // 1. Clear LocalStorage
        localStorage.clear();
        
        // 2. Clear Service Worker Caches
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }

        // 3. Unregister Workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for(let registration of registrations) {
                await registration.unregister();
            }
        }

        alert("System Reset Complete. Restarting...");
        location.href = "index.html";
    }
}
