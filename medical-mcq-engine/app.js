/**
 * MEDTRIX ENGINE V4.2 - OPTIMIZED
 */

const App = {
    // --- STATE ---
    data: {
        subjects: [],
        syllabus: {},
        cache: {},
        activeSubject: null,
        activeQuestions: [],
        currentQIndex: 0,
        sessionStats: { correct: 0, wrong: 0, total: 0 }
    },

    // --- DOM ELEMENTS ---
    elements: {
        main: document.getElementById('main-container'),
        search: document.getElementById('searchInput'),
        lightbox: document.getElementById('lightbox'),
        lightboxImg: document.getElementById('lightbox-img'),
        header: document.getElementById('main-header')
    },

    // --- INITIALIZATION ---
    async init() {
        const savedTheme = localStorage.getItem('medtrix-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

        try {
            const [subRes, sylRes] = await Promise.all([
                fetch('./data/subjects.json'),
                fetch('./data/syllabus.json')
            ]);
            
            this.data.subjects = await subRes.json();
            this.data.syllabus = await sylRes.json();

            window.addEventListener('hashchange', () => this.router());
            this.elements.search.addEventListener('input', (e) => this.handleSearch(e.target.value));

            this.router();

        } catch (error) {
            console.error(error);
            this.elements.main.innerHTML = `<div style="text-align:center; padding:50px; color:var(--danger)">
                <h3>System Error</h3><p>Could not load Library. Check JSON paths.</p>
            </div>`;
        }
    },

    // --- ROUTER ---
    async router() {
        const hash = window.location.hash.slice(1) || '/';
        const segments = hash.split('/');
        
        const isQuiz = segments[0] === 'quiz';
        this.elements.header.style.display = isQuiz ? 'none' : 'block';

        if (hash === '/' || hash === '') {
            this.renderHome();
            return;
        }

        if (segments[0] === 'subject') {
            const subName = decodeURIComponent(segments[1]);
            await this.loadSubjectData(subName);
            this.renderChapterList(subName);
            return;
        }

        if (segments[0] === 'quiz') {
            const subName = decodeURIComponent(segments[1]);
            const chapterIndex = segments[2];
            
            if (!this.data.cache[subName]) await this.loadSubjectData(subName);
            this.startQuiz(subName, chapterIndex);
            return;
        }
    },

    async loadSubjectData(name) {
        if (this.data.cache[name]) return;
        this.elements.main.innerHTML = `<div style="text-align:center; padding:50px; color:var(--accent);">
            <i class="fa-solid fa-spinner fa-spin fa-3x"></i><br><br>Loading Question Bank...
        </div>`;
        const subjectObj = this.data.subjects.find(s => s.name === name);
        const fileName = subjectObj ? subjectObj.file : `${name}.json`;
        try {
            const res = await fetch(`./data/${fileName}`);
            this.data.cache[name] = await res.json();
        } catch (e) { alert(`Error loading: ${fileName}`); }
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('medtrix-theme', next);
    },

    // --- TEXT CLEANER ---
    cleanText(text) {
        if (!text) return "";
        
        const map = { 
            '≡': '→', '->': '→', 'â€“': '-', 'â€”': '—', 'â€™': "'", 
            'ï»¿': '', '': '•', '': '•', '': '≥', '': '≤', 
            '': '×', '': 'µ', '': '→', '°': '→' 
        };

        let clean = text.replace(/≡|->|â€“|â€”|â€™|ï»¿||||||||°/g, m => map[m]);

        clean = clean.replace(//g, "α")
                     .replace(//g, "β")
                     .replace(//g, "γ")
                     .replace(//g, "δ")
                     .replace(//g, "Δ")
                     .replace(//g, "θ");

        clean = clean.replace(/\ba\s?\((1)/g, "α($1"); 

        return clean;
    },

    // --- RENDERERS ---

    // 1. Home Grid
    renderHome() {
        this.elements.search.value = '';
        this.elements.main.className = 'grid-view'; 
        
        const html = this.data.subjects.map(sub => `
            <div class="card" onclick="location.hash = '#subject/${sub.name}'">
                <i class="fa-solid ${this.getIcon(sub.name)}"></i>
                <h3>${sub.name}</h3>
            </div>
        `).join('');
        this.elements.main.innerHTML = html;
    },

    // 2. Chapter List
    renderChapterList(subName) {
        this.elements.main.className = 'list-view';

        let chapters = this.data.syllabus[subName];
        // Handle spelling variations
        if (!chapters && subName === 'Paediatrics') chapters = this.data.syllabus['Pediatrics'];
        if (!chapters && subName === 'Pediatrics') chapters = this.data.syllabus['Paediatrics'];
        chapters = chapters || [];

        const allQuestions = this.data.cache[subName] || [];

        let html = `
            <div style="display:flex; align-items:center; gap:15px; margin-bottom:20px">
                <button onclick="location.hash='#/'" style="background:none; border:none; color:var(--text-main); font-size:1.5rem; cursor:pointer;"><i class="fa-solid fa-chevron-left"></i></button>
                <h2 style="font-family:'Orbitron'; color:var(--accent); margin:0;">${subName}</h2>
            </div>
            
            <div class="list-item" style="border-left: 4px solid var(--accent);" onclick="location.hash = '#quiz/${subName}/ALL'">
                <div>
                    <div style="font-size:0.75rem; color:var(--accent); font-weight:bold; letter-spacing:1px;">FULL BANK</div>
                    <div style="font-weight:600; font-size:1.1rem;">Practice All Questions</div>
                </div>
                <div class="badge">${allQuestions.length}</div>
            </div>
        `;

        html += chapters.map((title, idx) => {
            const chNum = idx + 1;
            const count = allQuestions.filter(q => q.id.includes(`_Ch${chNum}_`)).length;
            if(count === 0) return '';
            
            return `
                <div class="list-item" onclick="location.hash = '#quiz/${subName}/${chNum}'">
                    <div>
                        <div style="font-size:0.75rem; opacity:0.6; font-weight:bold;">CHAPTER ${chNum}</div>
                        <div style="font-weight:600;">${this.cleanText(title)}</div>
                    </div>
                    <div style="font-weight:bold; opacity:0.5; font-size:0.9rem;">${count}</div>
                </div>
            `;
        }).join('');

        this.elements.main.innerHTML = html;
    },

    // 3. Quiz Mode
    startQuiz(subName, chNum) {
        this.data.activeSubject = subName;
        this.elements.main.className = '';
        this.data.sessionStats = { correct: 0, wrong: 0, total: 0 };

        if (chNum === 'ALL') {
            this.data.activeQuestions = this.data.cache[subName];
        } else {
            this.data.activeQuestions = this.data.cache[subName].filter(q => q.id.includes(`_Ch${chNum}_`));
        }
        
        this.data.currentQIndex = 0;
        this.renderQuestion();
    },

    renderQuestion() {
        const q = this.data.activeQuestions[this.data.currentQIndex];
        const total = this.data.activeQuestions.length;
        const current = this.data.currentQIndex + 1;

        let imgHtml = '';
        if(q.images && q.images.length > 0) {
            imgHtml = q.images.map(img => `<img src="./data/images/${img}" class="q-img" onclick="App.openImage(this.src)" onerror="this.style.display='none'">`).join('');
        }

        const isLast = current === total;
        const nextAction = isLast ? 'App.finishQuiz()' : 'App.navQuestion(1)';
        const nextText = isLast ? 'FINISH' : 'NEXT';

        const html = `
            <div style="max-width:800px; margin:0 auto;">
                <div class="quiz-header">
                    <button onclick="history.back()" style="background:none; border:none; color:var(--text-sub); cursor:pointer;"><i class="fa-solid fa-arrow-left"></i> Exit</button>
                    <span style="font-weight:bold; color:var(--accent);">${current} / ${total}</span>
                </div>

                <div class="q-box">
                    <div class="q-text">${this.cleanText(q.question_text)}</div>
                  <div class="image-stitch-container">${imgHtml}</div>
                    
                    <div style="margin-top:20px;">
                        ${q.options.map((opt, i) => `
                            <div class="option" onclick="App.handleAnswer(this, ${i}, '${q.correct_option}')">
                                <span style="color:var(--accent); font-weight:bold;">${String.fromCharCode(65 + i)}</span>
                                <span>${this.cleanText(opt)}</span>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Explanation Box (Initially Hidden) -->
                    <div id="explanation" class="exp-box" style="display:none">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:10px;">EXPLANATION</div>
                        ${this.cleanText(q.explanation)}
                    </div>
                </div>
            </div>

            <div class="footer-bar">
                <button class="btn btn-nav" onclick="App.navQuestion(-1)"><i class="fa-solid fa-arrow-left"></i></button>
                <button class="btn btn-action" onclick="${nextAction}">${nextText}</button>
            </div>
        `;
        this.elements.main.innerHTML = html;
        window.scrollTo(0,0);
    },

    handleAnswer(el, index, correctChar) {
        if (el.classList.contains('disabled')) return;
        
        const parent = el.parentElement;
        const options = parent.children;
        const selectedChar = String.fromCharCode(97 + index); 
        const correctIndex = correctChar.toLowerCase().charCodeAt(0) - 97;

        this.data.sessionStats.total++;
        if (selectedChar === correctChar.toLowerCase()) {
            el.classList.add('correct');
            this.data.sessionStats.correct++;
        } else {
            el.classList.add('wrong');
            this.data.sessionStats.wrong++;
            if(options[correctIndex]) options[correctIndex].classList.add('correct');
        }

        Array.from(options).forEach(opt => opt.classList.add('disabled'));
        
        // Show Explanation
        document.getElementById('explanation').style.display = 'block';
        
        // Optional: Medtrix Core Integration
        try {
            if(window.MEDTRIX && window.MEDTRIX.db) {
                window.MEDTRIX.db.saveResult({
                    uid: this.data.activeSubject + "_" + this.data.currentQIndex,
                    text: this.data.activeQuestions[this.data.currentQIndex].question_text,
                    explanation: this.data.activeQuestions[this.data.currentQIndex].explanation,
                    options: this.data.activeQuestions[this.data.currentQIndex].options,
                    source: this.data.activeSubject
                }, (selectedChar === correctChar.toLowerCase()), "Q-Bank Engine");
            }
        } catch(e) {}
    },

    navQuestion(dir) {
        const newIndex = this.data.currentQIndex + dir;
        if (newIndex >= 0 && newIndex < this.data.activeQuestions.length) {
            this.data.currentQIndex = newIndex;
            this.renderQuestion();
        }
    },

    finishQuiz() {
        const s = this.data.sessionStats;
        const totalQs = this.data.activeQuestions.length;
        const skipped = totalQs - s.total;
        const accuracy = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;

        // Sync Global Stats
        try {
            const globalStats = JSON.parse(localStorage.getItem('MEDTRIX_GLOBAL_STATS') || '{"totalAnswered":0, "totalCorrect":0, "quizzesTaken":0}');
            globalStats.totalAnswered += s.total;
            globalStats.totalCorrect += s.correct;
            globalStats.quizzesTaken += 1;
            localStorage.setItem('MEDTRIX_GLOBAL_STATS', JSON.stringify(globalStats));
        } catch (e) {}

        this.elements.header.style.display = 'block';
        
        const html = `
            <div style="max-width:600px; margin:0 auto;">
                <div class="result-card">
                    <h2 style="font-family:'Orbitron'; margin-bottom:30px;">SESSION ANALYSIS</h2>
                    
                    <div class="chart-container">
                        <canvas id="resultChart"></canvas>
                        <div class="chart-center-text" style="color:${accuracy > 50 ? 'var(--success)' : 'var(--danger)'}">
                            ${accuracy}%
                        </div>
                    </div>

                    <div class="stat-row">
                        <div class="stat-item" style="color:var(--success)">
                            <div>${s.correct}</div><div>Correct</div>
                        </div>
                        <div class="stat-item" style="color:var(--danger)">
                            <div>${s.wrong}</div><div>Wrong</div>
                        </div>
                        <div class="stat-item" style="color:var(--text-sub)">
                            <div>${skipped}</div><div>Skipped</div>
                        </div>
                    </div>

                    <div style="margin-top:40px; display:flex; gap:10px;">
                        <button class="btn" style="border:1px solid var(--text-sub); color:var(--text-main)" onclick="location.reload()">
                            HOME
                        </button>
                        <button class="btn btn-action" onclick="App.startQuiz('${this.data.activeSubject}', 'ALL')">
                            RETRY
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.elements.main.innerHTML = html;

        setTimeout(() => {
            const ctx = document.getElementById('resultChart').getContext('2d');
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Correct', 'Wrong', 'Skipped'],
                    datasets: [{
                        data: [s.correct, s.wrong, skipped],
                        backgroundColor: ['#10b981', '#ef4444', 'rgba(128,128,128,0.2)'],
                        borderWidth: 0, cutout: '85%'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }, 100);
    },

    handleSearch(query) {
        if(window.location.hash !== '' && window.location.hash !== '#/') return;
        if(query.length < 2) { this.renderHome(); return; }
        const filtered = this.data.subjects.filter(s => s.name.toLowerCase().includes(query.toLowerCase()));
        this.elements.main.className = 'grid-view';
        this.elements.main.innerHTML = filtered.map(sub => `
            <div class="card" onclick="location.hash = '#subject/${sub.name}'">
                <i class="fa-solid ${this.getIcon(sub.name)}"></i>
                <h3>${sub.name}</h3>
            </div>
        `).join('');
    },
    
    openImage(src) {
        this.elements.lightboxImg.src = src;
        this.elements.lightbox.classList.remove('hidden');
    },

    getIcon(name) {
        const n = name.toLowerCase().trim();
        const map = {
            'anatomy': 'fa-bone',
            'physiology': 'fa-heart-pulse',
            'biochemistry': 'fa-dna',
            'pathology': 'fa-disease',
            'microbiology': 'fa-bacterium', 
            'pharmacology': 'fa-pills', 
            'forensic medicine': 'fa-skull-crossbones',
            'fmt': 'fa-skull-crossbones',
            'psm': 'fa-people-roof', 
            'community medicine': 'fa-people-roof',
            'ent': 'fa-ear-listen',
            'ophthalmology': 'fa-eye',
            'medicine': 'fa-user-doctor', 
            'surgery': 'fa-user-doctor',
            'general surgery': 'fa-user-doctor',
            'obstetrics & gynaecology': 'fa-person-pregnant',
            'obg': 'fa-person-pregnant',
            'pediatrics': 'fa-baby', 
            'paediatrics': 'fa-baby',
            'orthopedics': 'fa-crutch',
            'orthopaedics': 'fa-crutch',
            'dermatology': 'fa-hand-dots',
            'psychiatry': 'fa-brain', 
            'radiology': 'fa-x-ray', 
            'anesthesia': 'fa-syringe',
            'anaesthesia': 'fa-syringe'
        };
        return map[n] || 'fa-book-medical';
    }
};

window.addEventListener('DOMContentLoaded', () => App.init());
