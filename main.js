document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    window.addEventListener("resize", () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    // ===== ИЗОБРАЖЕНИЯ =====
    const images = {};
    ['q', 'w', 'e', 'r', 'x', 'tinker', 'enemy', 'bomb', 'march'].forEach(name => {
        const img = new Image();
        img.src = `${name}.png`;
        images[name] = img;
    });
    let playerAvatarImg = null;

    // ===== НАСТРОЙКИ И ПРОФИЛЬ =====
    let settings = {
        volume: 0.5,
        quickCast: false,
        showRangeX: true,
        keyBindings: { q: "q", w: "w", e: "e", r: "r", x: "x", cancel: "s" }
    };
    let profile = { nickname: "", avatar: null, bestScore: 0 };
    let currentDifficulty = "normal";
    let gameConfig = { playerSpeed: 4, baseEnemySpeed: 1.5, speedMultiplier: 0.3, waveInterval: 2, extraEnemies: 2 };

    // ===== СОСТОЯНИЕ ИГРЫ =====
    let gameState = "menu";
    let killCount = 0, waveCount = 0, spawnTimer = 0;
    let enemies = [], rockets = [], lasers = [], machines = [], zones = [];
    let cooldowns = { q: 0, w: 0, e: 0, r: 0, x: 0 };
    let cdTime = { q: 16000, w: 18000, e: 29000, r: 1250, x: 15000 };
    let selectedSkill = null, rearmTimeout = null;
    const RANGE_X = 378;
    const isMobile = 'ontouchstart' in window;

    const player = { x: canvas.width/2, y: canvas.height/2, speed: 4, targetX: null, targetY: null, canMove: true, angle: 0, rearm: false, casting: false, castEnd: 0, castDir: 0 };
    let mouseX = 0, mouseY = 0, isRightMouseDown = false;

    // ===== ЗВУКИ =====
    const sounds = { 
        q: new Audio("sounds/sound1.mp3"), w: new Audio("sounds/sound2.mp3"), 
        e: new Audio("sounds/sound3.mp3"), r: new Audio("sounds/sound4.mp3"), 
        x: new Audio("sounds/sound5.mp3"), start: new Audio("sounds/sound6.mp3"), 
        gameover: new Audio("sounds/sound7.mp3") 
    };
    Object.values(sounds).forEach(s => s.volume = settings.volume);

    // ===== UI ЭЛЕМЕНТЫ =====
    let killCounter, menuScreen, difficultyScreen, profileScreen, leaderboardScreen, settingsScreen, gameOverScreen;
    let volumeSlider, avatarInput, nicknameInput, avatarPreview;

    // ===== LOCAL STORAGE =====
    function loadData() {
        try {
            const s = localStorage.getItem("tinker_settings");
            if (s) Object.assign(settings, JSON.parse(s));
            const p = localStorage.getItem("tinker_profile");
            if (p) {
                Object.assign(profile, JSON.parse(p));
                if (profile.avatar) { playerAvatarImg = new Image(); playerAvatarImg.src = profile.avatar; }
            }
        } catch(e) { console.warn("Load error:", e); }
    }
    function saveSettings() { localStorage.setItem("tinker_settings", JSON.stringify(settings)); }
    function saveProfile() { localStorage.setItem("tinker_profile", JSON.stringify(profile)); }
    function getLeaderboard() { try { return JSON.parse(localStorage.getItem("tinker_leaderboard") || "[]"); } catch { return []; } }
    function saveLeaderboard(lb) { localStorage.setItem("tinker_leaderboard", JSON.stringify(lb)); }

    function updateLeaderboard(nickname, score, avatar) {
        let lb = getLeaderboard();
        const lower = nickname.toLowerCase();
        let existing = lb.find(p => p.nickname.toLowerCase() === lower);
        if (existing) { existing.score = Math.max(existing.score, score); if (avatar) existing.avatar = avatar; }
        else { lb.push({ nickname, score, avatar: avatar || profile.avatar }); }
        lb.sort((a, b) => b.score - a.score);
        saveLeaderboard(lb.slice(0, 10));
    }

    // ===== РИСОВАНИЕ =====
    function drawCircularImage(img, x, y, r) {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
        if (img && img.complete && img.naturalHeight !== 0) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
        else { ctx.fillStyle = "cyan"; ctx.fill(); }
        ctx.restore();
    }
    function drawCircularImageCtx(c, img, x, y, r) {
        c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
        if (img && img.complete && img.naturalHeight) c.drawImage(img, x - r, y - r, r * 2, r * 2);
        c.restore();
    }
    function loadImg(b64) { const i = new Image(); i.src = b64; return i; }
    function updateAvatarPreview() {
        const c = avatarPreview.getContext("2d");
        c.clearRect(0, 0, 100, 100);
        drawCircularImageCtx(c, playerAvatarImg || images['tinker'], 50, 50, 45);
    }
    function updateMenuBest() { document.getElementById("menuBest").innerText = `Лучший счёт: ${profile.bestScore}`; }

    // ===== ИНТЕРФЕЙС =====
    function createUI() {
        killCounter = document.createElement("div");
        killCounter.style.cssText = "position:fixed;top:15px;left:20px;color:white;font-size:24px;font-weight:bold;text-shadow:0 0 8px black;z-index:100;display:none;";
        document.body.appendChild(killCounter);

        menuScreen = document.createElement("div");
        menuScreen.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;flex-direction:column;z-index:200;";
        menuScreen.innerHTML = `<h1 style="color:cyan;font-size:60px;margin-bottom:10px;text-shadow:0 0 20px cyan;">TINKER GAME</h1>
            <p id="menuBest" style="color:#aaa;font-size:20px;margin-bottom:30px;">Лучший счёт: 0</p>
            <button id="playBtn" style="padding:15px 50px;font-size:28px;background:#222;color:white;border:3px solid cyan;border-radius:12px;cursor:pointer;margin-bottom:15px;">ИГРАТЬ</button>
            <button id="leaderBtn" style="padding:12px 40px;font-size:22px;background:#222;color:#ff4;border:3px solid #ff4;border-radius:12px;cursor:pointer;margin-bottom:15px;">ЛИДЕРЫ</button>
            <button id="settingsBtn" style="padding:12px 40px;font-size:22px;background:#222;color:white;border:3px solid #888;border-radius:12px;cursor:pointer;margin-bottom:15px;">НАСТРОЙКИ</button>`;
        document.body.appendChild(menuScreen);

        profileScreen = document.createElement("div");
        profileScreen.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;flex-direction:column;z-index:200;";
        profileScreen.innerHTML = `<h2 style="color:cyan;font-size:45px;margin-bottom:30px;">ВАШ ПРОФИЛЬ</h2>
            <input id="nickInput" type="text" placeholder="Никнейм" maxlength="15" style="padding:12px;font-size:20px;background:#333;color:white;border:2px solid cyan;border-radius:8px;text-align:center;margin-bottom:15px;">
            <button id="avatarFileBtn" style="padding:10px;background:#444;color:#4f4;border:2px dashed #4f4;border-radius:8px;cursor:pointer;font-size:16px;margin-bottom:10px;">Выбрать файл аватарки</button>
            <input id="avatarFileInput" type="file" accept="image/*" style="display:none;">
            <canvas id="avatarPreview" width="100" height="100" style="margin:0 auto;border-radius:50%;border:3px solid cyan;background:#222;margin-bottom:15px;"></canvas>
            <button id="startFromProfile" style="padding:15px;font-size:22px;background:#222;color:#4f4;border:3px solid #4f4;border-radius:8px;cursor:pointer;">ДАЛЕЕ (ВЫБОР СЛОЖНОСТИ)</button>`;
        document.body.appendChild(profileScreen);

        difficultyScreen = document.createElement("div");
        difficultyScreen.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;flex-direction:column;z-index:200;";
        difficultyScreen.innerHTML = `<h2 style="color:cyan;font-size:45px;margin-bottom:30px;">ВЫБЕРИТЕ СЛОЖНОСТЬ</h2>
            <div style="display:flex;flex-direction:column;gap:15px;width:350px;">
                <button class="diffBtn" data-diff="passive" style="padding:12px;font-size:20px;background:#222;color:#4f4;border:2px solid #4f4;border-radius:8px;cursor:pointer;">ПАССИВНЫЙ (Тест)</button>
                <button class="diffBtn" data-diff="easy" style="padding:12px;font-size:20px;background:#222;color:#4f4;border:2px solid #4f4;border-radius:8px;cursor:pointer;">ЛЕГКИЙ</button>
                <button class="diffBtn" data-diff="normal" style="padding:12px;font-size:20px;background:#222;color:#ff4;border:2px solid #ff4;border-radius:8px;cursor:pointer;">НОРМАЛЬНЫЙ</button>
                <button class="diffBtn" data-diff="hard" style="padding:12px;font-size:20px;background:#222;color:#f44;border:2px solid #f44;border-radius:8px;cursor:pointer;">СЛОЖНЫЙ</button>
                <button class="diffBtn" data-diff="custom" style="padding:12px;font-size:20px;background:#222;color:#ccc;border:2px solid #888;border-radius:8px;cursor:pointer;">ПОЛЬЗОВАТЕЛЬСКИЙ</button>
            </div>
            <div id="customPanel" style="display:none;margin-top:25px;width:400px;background:#1a1a1a;padding:20px;border-radius:12px;border:1px solid #555;">
                <div style="margin-bottom:10px;color:white;"><label>Скорость героя: <input type="range" id="custHeroSpeed" min="2" max="8" value="4" style="width:150px;"> <span id="custHeroSpeedVal">4</span></label></div>
                <div style="margin-bottom:10px;color:white;"><label>Множитель скорости врагов: <input type="range" id="custEnemyMult" min="0" max="2" step="0.1" value="0.3" style="width:150px;"> <span id="custEnemyMultVal">0.3</span></label></div>
                <div style="margin-bottom:10px;color:white;"><label>Интервал волн: <input type="range" id="custWaveInt" min="1" max="5" value="2" style="width:150px;"> <span id="custWaveIntVal">2</span></label></div>
                <div style="margin-bottom:20px;color:white;"><label>Доп. враги: <input type="range" id="custExtra" min="1" max="4" value="2" style="width:150px;"> <span id="custExtraVal">2</span></label></div>
                <button id="startCustomBtn" style="width:100%;padding:10px;font-size:18px;background:#0a0;color:white;border:none;border-radius:6px;cursor:pointer;">НАЧАТЬ ИГРУ</button>
            </div>
            <button id="cancelDiffBtn" style="margin-top:20px;padding:10px 30px;font-size:18px;background:#333;color:white;border:1px solid #555;border-radius:6px;cursor:pointer;">НАЗАД</button>`;
        document.body.appendChild(difficultyScreen);

        leaderboardScreen = document.createElement("div");
        leaderboardScreen.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;flex-direction:column;z-index:200;";
        leaderboardScreen.innerHTML = `<h2 style="color:#ff4;font-size:45px;margin-bottom:30px;">ТОП-10 ИГРОКОВ</h2>
            <div id="lbTable" style="width:450px;background:#222;padding:20px;border-radius:12px;border:2px solid #888;color:white;"></div>
            <button id="backFromLB" style="margin-top:20px;padding:12px 40px;font-size:20px;background:#333;color:white;border:1px solid #555;border-radius:8px;cursor:pointer;">НАЗАД</button>`;
        document.body.appendChild(leaderboardScreen);

        settingsScreen = document.createElement("div");
        settingsScreen.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;flex-direction:column;z-index:200;";
        settingsScreen.innerHTML = `<h2 style="color:cyan;font-size:45px;margin-bottom:30px;">НАСТРОЙКИ</h2>
            <div style="margin-bottom:25px;width:400px;"><label style="color:white;font-size:20px;display:block;margin-bottom:10px;">Громкость: <span id="volumeValue">50%</span></label><input type="range" id="volumeSlider" min="0" max="100" value="50" style="width:100%;cursor:pointer;"></div>
            <div style="margin-bottom:25px;"><label style="color:white;font-size:20px;display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="checkbox" id="quickCastCheckbox" style="width:20px;height:20px;cursor:pointer;"> Быстрое применение</label></div>
            <div style="margin-bottom:15px; color:white;"><label>Индикатор 5 спелла: <input type="checkbox" id="showRangeXCheckbox" style="width:20px;height:20px;cursor:pointer;" checked></label></div>
            <div style="margin-bottom:30px;"><h3 style="color:white;font-size:24px;margin-bottom:15px;">Клавиши:</h3>
                <div style="display:grid;grid-template-columns:120px 100px;gap:10px;">
                    <div style="color:#aaa;">Лазер:</div><button class="keyBtn" data-key="q" style="padding:8px;font-size:16px;background:#333;color:white;border:2px solid cyan;border-radius:5px;cursor:pointer;">${settings.keyBindings.q.toUpperCase()}</button>
                    <div style="color:#aaa;">Ракеты:</div><button class="keyBtn" data-key="w" style="padding:8px;font-size:16px;background:#333;color:white;border:2px solid cyan;border-radius:5px;cursor:pointer;">${settings.keyBindings.w.toUpperCase()}</button>
                    <div style="color:#aaa;">Марши:</div><button class="keyBtn" data-key="e" style="padding:8px;font-size:16px;background:#333;color:white;border:2px solid cyan;border-radius:5px;cursor:pointer;">${settings.keyBindings.e.toUpperCase()}</button>
                    <div style="color:#aaa;">Реарм:</div><button class="keyBtn" data-key="r" style="padding:8px;font-size:16px;background:#333;color:white;border:2px solid cyan;border-radius:5px;cursor:pointer;">${settings.keyBindings.r.toUpperCase()}</button>
                    <div style="color:#aaa;">Блинк:</div><button class="keyBtn" data-key="x" style="padding:8px;font-size:16px;background:#333;color:white;border:2px solid cyan;border-radius:5px;cursor:pointer;">${settings.keyBindings.x.toUpperCase()}</button>
                    <div style="color:#aaa;">Отмена:</div><button class="keyBtn" data-key="cancel" style="padding:8px;font-size:16px;background:#333;color:white;border:2px solid cyan;border-radius:5px;cursor:pointer;">${settings.keyBindings.cancel.toUpperCase()}</button>
                </div>
            </div>
            <button id="backBtn" style="padding:12px 40px;font-size:22px;background:#222;color:white;border:3px solid #0f0;border-radius:12px;cursor:pointer;">НАЗАД</button>`;
        document.body.appendChild(settingsScreen);

        gameOverScreen = document.createElement("div");
        gameOverScreen.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;flex-direction:column;z-index:200;";
        gameOverScreen.innerHTML = `<h1 style="color:red;font-size:55px;margin-bottom:30px;">ТЫ ПРОИГРАЛ!</h1><p id="finalKills" style="color:white;font-size:28px;margin-bottom:10px;"></p><p id="lbMsg" style="color:#aaa;font-size:18px;margin-bottom:20px;"></p>
            <div style="display:flex;gap:20px;"><button id="restartBtn" style="padding:12px 30px;font-size:22px;background:#222;color:white;border:3px solid #0f0;border-radius:10px;cursor:pointer;">ИГРАТЬ ЕЩЁ РАЗ</button><button id="menuBtn" style="padding:12px 30px;font-size:22px;background:#222;color:white;border:3px solid cyan;border-radius:10px;cursor:pointer;">ГЛАВНОЕ МЕНЮ</button></div>`;
        document.body.appendChild(gameOverScreen);

        // Элементы
        nicknameInput = document.getElementById("nickInput");
        avatarInput = document.getElementById("avatarFileInput");
        avatarPreview = document.getElementById("avatarPreview");
        
        loadData();
        updateAvatarPreview();
        updateMenuBest();

        // Обработчики
        document.getElementById("playBtn").onclick = () => { playSound("start"); showProfileScreen(); };
        document.getElementById("startFromProfile").onclick = () => {
            profile.nickname = nicknameInput.value.trim() || profile.nickname || "Anon";
            saveProfile();
            showDifficultyScreen();
        };
        document.getElementById("leaderBtn").onclick = showLeaderboard;
        document.getElementById("settingsBtn").onclick = showSettings;
        document.getElementById("backBtn").onclick = showMainMenu;
        document.getElementById("backFromLB").onclick = showMainMenu;
        document.getElementById("restartBtn").onclick = startGame;
        document.getElementById("menuBtn").onclick = showMainMenu;
        document.getElementById("cancelDiffBtn").onclick = () => showProfileScreen();

        document.getElementById("avatarFileBtn").onclick = () => avatarInput.click();
        avatarInput.addEventListener("change", e => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = ev => {
                    profile.avatar = ev.target.result;
                    playerAvatarImg = new Image();
                    playerAvatarImg.src = ev.target.result;
                    playerAvatarImg.onload = updateAvatarPreview;
                    saveProfile();
                    updateAvatarPreview();
                };
                reader.readAsDataURL(file);
            }
        });

        volumeSlider = document.getElementById("volumeSlider");
        volumeSlider.oninput = e => { settings.volume = e.target.value/100; document.getElementById("volumeValue").innerText = Math.round(settings.volume*100)+"%"; Object.values(sounds).forEach(s=>s.volume=settings.volume); saveSettings(); };
        document.getElementById("quickCastCheckbox").onchange = e => { settings.quickCast = e.target.checked; saveSettings(); };
        document.getElementById("showRangeXCheckbox").onchange = e => { settings.showRangeX = e.target.checked; saveSettings(); };
        
        document.querySelectorAll(".keyBtn").forEach(btn => {
            btn.onclick = () => {
                btn.innerText = "?"; btn.style.borderColor = "yellow";
                const h = e => { e.preventDefault(); settings.keyBindings[btn.dataset.key] = e.key.toLowerCase(); btn.innerText = e.key.toUpperCase(); btn.style.borderColor = "cyan"; window.removeEventListener("keydown", h); saveSettings(); };
                window.addEventListener("keydown", h);
            };
        });

        document.querySelectorAll(".diffBtn").forEach(btn => {
            btn.onclick = () => {
                const diff = btn.dataset.diff;
                if (diff === "custom") {
                    document.getElementById("customPanel").style.display = "block";
                    currentDifficulty = "custom";
                    loadCustomUI();
                } else {
                    applyPreset(diff);
                    document.getElementById("customPanel").style.display = "none";
                    startGame();
                }
            };
        });

        document.getElementById("startCustomBtn").onclick = () => {
            gameConfig.playerSpeed = +document.getElementById("custHeroSpeed").value;
            gameConfig.speedMultiplier = +document.getElementById("custEnemyMult").value;
            gameConfig.waveInterval = +document.getElementById("custWaveInt").value;
            gameConfig.extraEnemies = +document.getElementById("custExtra").value;
            startGame();
        };
        ["custHeroSpeed", "custEnemyMult", "custWaveInt", "custExtra"].forEach(id => document.getElementById(id).addEventListener("input", loadCustomUI));
    }

    function loadCustomUI() {
        document.getElementById("custHeroSpeedVal").innerText = document.getElementById("custHeroSpeed").value;
        document.getElementById("custEnemyMultVal").innerText = document.getElementById("custEnemyMult").value;
        document.getElementById("custWaveIntVal").innerText = document.getElementById("custWaveInt").value;
        document.getElementById("custExtraVal").innerText = document.getElementById("custExtra").value;
    }

    function applyPreset(diff) {
        currentDifficulty = diff;
        switch(diff) {
            case 'passive': 
                gameConfig = { playerSpeed: 4, baseEnemySpeed: 1.5, speedMultiplier: 0, waveInterval: 3, extraEnemies: 0 }; break;
            case 'easy': 
                gameConfig = { playerSpeed: 6, baseEnemySpeed: 1.5, speedMultiplier: 0.1, waveInterval: 3, extraEnemies: 1 }; break;
            case 'normal': 
                gameConfig = { playerSpeed: 4, baseEnemySpeed: 1.5, speedMultiplier: 0.3, waveInterval: 2, extraEnemies: 2 }; break;
            case 'hard': 
                gameConfig = { playerSpeed: 2.8, baseEnemySpeed: 1.5, speedMultiplier: 0.5, waveInterval: 2, extraEnemies: 3 }; break;
        }
    }

    function showMainMenu() {
        gameState = "menu"; currentDifficulty = null;
        menuScreen.style.display = "flex";
        profileScreen.style.display = "none"; difficultyScreen.style.display = "none";
        leaderboardScreen.style.display = "none"; settingsScreen.style.display = "none";
        gameOverScreen.style.display = "none"; killCounter.style.display = "none";
        updateMenuBest(); resetGame();
    }
    function showProfileScreen() {
        gameState = "profile"; nicknameInput.value = profile.nickname;
        profileScreen.style.display = "flex"; menuScreen.style.display = "none"; updateAvatarPreview();
    }
    function showDifficultyScreen() {
        gameState = "difficulty"; profileScreen.style.display = "none"; difficultyScreen.style.display = "flex";
    }
    function showLeaderboard() {
        gameState = "leaderboard"; menuScreen.style.display = "none"; leaderboardScreen.style.display = "flex";
        const lb = getLeaderboard();
        let html = lb.length ? lb.map((p, i) => `<div style="display:flex;align-items:center;gap:15px;padding:10px;background:#333;margin-bottom:5px;border-radius:8px;"><span style="font-weight:bold;font-size:24px;width:30px;">${i+1}</span><canvas id="lbA${i}" width="40" height="40" style="border-radius:50%;border:1px solid #666;"></canvas><span style="flex:1;font-size:20px;">${p.nickname}</span><span style="color:cyan;font-weight:bold;font-size:20px;">${p.score}</span></div>`).join("") : "<p style='text-align:center;'>Пока пусто</p>";
        document.getElementById("lbTable").innerHTML = html;
        lb.forEach((p, i) => { const c = document.getElementById(`lbA${i}`); if(c) drawCircularImageCtx(c.getContext("2d"), p.avatar ? loadImg(p.avatar) : images['tinker'], 20, 20, 18); });
    }
    function showSettings() {
        gameState = "settings"; menuScreen.style.display = "none"; settingsScreen.style.display = "flex";
        volumeSlider.value = settings.volume * 100; document.getElementById("volumeValue").innerText = Math.round(settings.volume*100)+"%";
        document.getElementById("quickCastCheckbox").checked = settings.quickCast;
        document.getElementById("showRangeXCheckbox").checked = settings.showRangeX;
        document.querySelectorAll(".keyBtn").forEach(btn => { const k = btn.dataset.key; if(settings.keyBindings[k]) btn.innerText = settings.keyBindings[k].toUpperCase(); });
    }

    function startGame() {
        if (!profile.nickname) { showProfileScreen(); return; }
        gameState = "game"; killCount = 0;
        menuScreen.style.display = "none"; profileScreen.style.display = "none"; difficultyScreen.style.display = "none";
        leaderboardScreen.style.display = "none"; gameOverScreen.style.display = "none";
        killCounter.style.display = "block";
        resetGame(); updateKillCounter();
    }

    function resetGame() {
        enemies=[]; rockets=[]; lasers=[]; machines=[]; zones=[];
        cooldowns={q:0,w:0,e:0,r:0,x:0};
        player.x=canvas.width/2; player.y=canvas.height/2; player.speed=gameConfig.playerSpeed;
        player.targetX=null; player.targetY=null; player.casting=false; player.canMove=true; player.rearm=false;
        spawnTimer=0; waveCount=0; selectedSkill=null;
        spawnEnemies(); // Гарантированный спавн первой волны
    }

    function updateKillCounter() { killCounter.innerText = `Убито: ${killCount}`; }
    function distance(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }
    function getCurrentEnemySpeed() { return gameConfig.baseEnemySpeed * (1 + gameConfig.speedMultiplier * waveCount); }

    // ===== СПАВН (ИСПРАВЛЕН) =====
    function spawnEnemies() {
        if (gameState !== "game") return;
        waveCount++;
        const offset = 60;

        if (currentDifficulty === "passive") {
            if (enemies.filter(e => e.isTest).length < 2) {
                for (let i = 0; i < 2; i++) enemies.push({x: Math.random()*(canvas.width-100)+50, y: Math.random()*(canvas.height-100)+50, hp: 3, isTest: true, stationary: true});
            }
            return;
        }

        let count = 2; // Базовый спавн
        if (waveCount % gameConfig.waveInterval === 0) count += gameConfig.extraEnemies;
        for(let i=0; i<count; i++) {
            let side = Math.floor(Math.random()*4);
            let e = {x:0, y:0, hp: 3, isTest: false, stationary: false}; // 3 HP = 3 удара роботами
            switch(side){case 0: e.x=Math.random()*canvas.width; e.y=-offset; break; case 1: e.x=canvas.width+offset; e.y=Math.random()*canvas.height; break; case 2: e.x=Math.random()*canvas.width; e.y=canvas.height+offset; break; case 3: e.x=-offset; e.y=Math.random()*canvas.height; break;}
            enemies.push(e);
        }
    }

    // ===== ДВИЖЕНИЕ =====
    function movePlayer() {
        if (!player.targetX || !player.canMove || player.rearm) return;
        const dx=player.targetX-player.x, dy=player.targetY-player.y, dist=Math.hypot(dx,dy);
        if (dist>10) { player.x+=(dx/dist)*player.speed; player.y+=(dy/dist)*player.speed; player.angle=Math.atan2(dy,dx); }
    }
    function moveEnemies() {
        const spd = getCurrentEnemySpeed();
        enemies.forEach(e => {
            if (e.stationary) { if (distance(player,e)<40) gameOver(); return; }
            const dx=player.x-e.x, dy=player.y-e.y, dist=Math.hypot(dx,dy);
            if (dist>0) { e.x+=(dx/dist)*spd; e.y+=(dy/dist)*spd; }
            if (dist<40) gameOver();
        });
    }
    function gameOver() {
        if (gameState==="gameover") return;
        gameState="gameover"; killCounter.style.display="none"; gameOverScreen.style.display="flex";
        document.getElementById("finalKills").innerText = `Убито: ${killCount}`;
        if (killCount > profile.bestScore) { profile.bestScore = killCount; saveProfile(); updateLeaderboard(profile.nickname, killCount, profile.avatar); document.getElementById("lbMsg").innerText = "🎉 Новый рекорд! Вы в таблице лидеров!"; }
        else document.getElementById("lbMsg").innerText = "";
        playSound("gameover");
    }

    // ===== СКИЛЛЫ =====
    function cancelCast() {
        selectedSkill=null;
        if(player.casting){player.casting=false;player.canMove=true;cooldowns.e=0;}
        if(player.rearm){if(rearmTimeout)clearTimeout(rearmTimeout);player.rearm=false;player.canMove=true;cooldowns.r=Date.now()+5000;}
    }
    function useSkill(key, x=null, y=null) {
        if(gameState!=="game" || cooldowns[key]>Date.now() || (player.rearm && key!=="r")) return;
        let castX=x, castY=y;
        if(key==="x" && distance(player,{x,y})>RANGE_X){const a=Math.atan2(y-player.y,x-player.x);castX=player.x+Math.cos(a)*RANGE_X;castY=player.y+Math.sin(a)*RANGE_X;}
        if(key==="q"){
            let closest=null, minD=Infinity;
            enemies.forEach(e=>{let d=distance({x:castX,y:castY},e);if(d<minD){minD=d;closest=e;}});
            if(closest && minD<100){cooldowns[key]=Date.now()+cdTime[key]; skillQ(castX,castY,closest);}
            return;
        }
        cooldowns[key]=Date.now()+cdTime[key]; selectedSkill=null;
        if(key==="w") skillW(); else if(key==="e") skillE(castX,castY); else if(key==="r") skillR(); else if(key==="x") skillX(castX,castY);
    }
    function skillQ(x,y,t){lasers.push({x1:player.x,y1:player.y,x2:t.x,y2:t.y,life:10}); if(currentDifficulty==="passive"&&t.isTest){t.x=Math.random()*(canvas.width-100)+50;t.y=Math.random()*(canvas.height-100)+50;t.hp=3;} else enemies=enemies.filter(e=>e!==t); playSound("q");killCount++;updateKillCounter();}
    function skillW(){let s=[...enemies].sort((a,b)=>distance(player,a)-distance(player,b)); s.slice(0,2).forEach(t=>rockets.push({x:player.x,y:player.y,target:t})); playSound("w");}
    function skillE(x,y){if(player.casting) return; player.castDir=Math.atan2(y-player.y,x-player.x); player.angle=player.castDir; player.casting=true; player.castEnd=Date.now()+500; player.canMove=false;} // Звук убран отсюда
    function skillR(){player.canMove=false; player.rearm=true; if(rearmTimeout)clearTimeout(rearmTimeout); rearmTimeout=setTimeout(()=>{Object.keys(cooldowns).forEach(k=>cooldowns[k]=0);player.canMove=true;player.rearm=false;rearmTimeout=null;},1250); playSound("r");}
    function skillX(x,y){player.x=x;player.y=y;player.targetX=x;player.targetY=y;playSound("x");}

    // ===== ЗОНЫ И РОБОТЫ =====
    function updateZonesAndMachines() {
        const now=Date.now();
        for(let i=zones.length-1;i>=0;i--){
            const z=zones[i]; const elapsed=now-z.startTime;
            if(elapsed>=z.duration) z.active=false;
            if(z.active && elapsed<z.duration){
                z.spawnAcc+=16;
                if(z.spawnAcc>=400){
                    z.spawnAcc-=400;
                    const rem=z.totalMachines-z.machinesSpawned; const left=z.duration-elapsed;
                    const b=Math.max(1,Math.ceil(left/400)); const c=Math.ceil(rem/b);
                    for(let k=0;k<c;k++){
                        if(z.machinesSpawned>=z.totalMachines) break;
                        const off=(Math.random()-0.5)*z.width*0.8; const px=-Math.sin(z.angle)*off; const py=Math.cos(z.angle)*off;
                        machines.push({x:z.x-Math.cos(z.angle)*(z.length/2)+px, y:z.y-Math.sin(z.angle)*(z.length/2)+py, zone:z, angle:z.angle, speed:160, radius:6, active:true});
                        z.machinesSpawned++;
                    }
                }
            }
        }
        for(let i=machines.length-1;i>=0;i--){
            const m=machines[i]; m.x+=Math.cos(m.angle)*m.speed*(1/60); m.y+=Math.sin(m.angle)*m.speed*(1/60);
            const dx=m.x-m.zone.x, dy=m.y-m.zone.y;
            if(dx*Math.cos(m.zone.angle)+dy*Math.sin(m.zone.angle)>=m.zone.length/2){m.active=false;continue;}
            for(let e of enemies){
                if(distance(m,e)<m.radius+20){e.hp--; m.active=false; if(e.hp<=0){ if(currentDifficulty==="passive"&&e.isTest){e.x=Math.random()*(canvas.width-100)+50;e.y=Math.random()*(canvas.height-100)+50;e.hp=3;} else enemies=enemies.filter(en=>en!==e); killCount++; updateKillCounter(); } break;}
            }
        }
        machines=machines.filter(m=>m.active);
        zones=zones.filter(z=>z.machinesSpawned<z.totalMachines||machines.some(m=>m.zone===z));
    }
    function checkCasting(){
        if(player.casting && Date.now()>=player.castEnd){
            player.casting=false; player.canMove=true; 
            playSound("e"); // Звук только после успешных 0.5 сек
            zones.push({x:player.x,y:player.y,angle:player.castDir,length:400,width:400,duration:6000,startTime:Date.now(),spawnAcc:0,machinesSpawned:0,totalMachines:50,active:true}); // 6 сек, независимо от других
        }
    }

    // ===== РЕНДЕР =====
    function draw() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        if(gameState!=="game") return;
        ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle); if (player.rearm) ctx.rotate(Date.now()/200);
        drawCircularImage(playerAvatarImg || images['tinker'], 0, 0, 30);
        ctx.restore();
        enemies.forEach(e => drawCircularImage(images['enemy'], e.x, e.y, 20));
        ctx.strokeStyle="blue"; ctx.lineWidth=4; lasers.forEach(l=>{ctx.beginPath();ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);ctx.stroke();});
        rockets.forEach(r => drawCircularImage(images['bomb'], r.x, r.y, 10));
        machines.forEach(m=>{ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.angle); if(images['march']&&images['march'].complete&&images['march'].naturalHeight) ctx.drawImage(images['march'],-8,-8,16,16); ctx.restore();});
        drawXIndicator();
    }
    function drawXIndicator(){
        if(!settings.showRangeX) return;
        ctx.save(); ctx.lineWidth=4; ctx.strokeStyle="rgba(0,255,255,0.35)"; ctx.beginPath(); ctx.arc(player.x,player.y,RANGE_X,0,Math.PI*2); ctx.stroke(); ctx.restore();
        if(selectedSkill==="x" || (settings.quickCast && false)){
            let ix=mouseX, iy=mouseY; const dist=distance(player,{x:mouseX,y:mouseY});
            if(dist>RANGE_X){const a=Math.atan2(mouseY-player.y,mouseX-player.x); ix=player.x+Math.cos(a)*RANGE_X; iy=player.y+Math.sin(a)*RANGE_X;}
            ctx.save(); ctx.translate(ix,iy); ctx.rotate(Math.atan2(mouseY-iy,mouseX-ix));
            const img=images['x']; if(img&&img.complete&&img.naturalHeight) ctx.drawImage(img,-20,-20,40,40);
            ctx.restore();
        }
    }
    function updateProjectiles(){
        rockets.forEach(r=>{if(!r.target||!enemies.includes(r.target)){r.dead=true;return;}let dx=r.target.x-r.x,dy=r.target.y-r.y,d=Math.hypot(dx,dy);if(d>0){r.x+=(dx/d)*5;r.y+=(dy/d)*5;}if(d<20){if(currentDifficulty==="passive"&&r.target.isTest){r.target.x=Math.random()*(canvas.width-100)+50;r.target.y=Math.random()*(canvas.height-100)+50;r.target.hp=3;}else enemies=enemies.filter(e=>e!==r.target);r.dead=true;killCount++;updateKillCounter();}});
        rockets=rockets.filter(r=>!r.dead); lasers.forEach(l=>l.life--); lasers=lasers.filter(l=>l.life>0);
    }

    // ===== ЦИКЛ =====
    function loop(){
        if(gameState==="game"){
            spawnTimer++;
            if(spawnTimer>180){spawnEnemies();spawnTimer=0;} // Спавн каждые 3 секунды без проверок
            movePlayer(); moveEnemies(); checkCasting(); updateZonesAndMachines(); updateProjectiles();
            draw();
            document.querySelectorAll(".skill").forEach(btn=>{
                const key=btn.dataset.skill; const cd=btn.querySelector(".cd"); let rem=cooldowns[key]-Date.now();
                if(rem>0){btn.style.opacity=0.5;cd.innerText=(rem/1000).toFixed(1);}else{btn.style.opacity=1;cd.innerText="";}
                if(selectedSkill===key) btn.classList.add("active"); else btn.classList.remove("active");
            });
        }
        requestAnimationFrame(loop);
    }
    function playSound(key){if(sounds[key]){sounds[key].currentTime=0;sounds[key].play().catch(()=>{});}}

    // ===== УПРАВЛЕНИЕ =====
    canvas.addEventListener("contextmenu", e=>e.preventDefault());
    canvas.addEventListener("mousemove", e=>{mouseX=e.clientX;mouseY=e.clientY;if(isRightMouseDown&&gameState==="game"){player.targetX=mouseX;player.targetY=mouseY;}});
    canvas.addEventListener("mousedown", e=>{if(gameState!=="game")return;if(e.button===2){isRightMouseDown=true;player.targetX=e.clientX;player.targetY=e.clientY;}if(e.button===0&&selectedSkill&&!settings.quickCast)useSkill(selectedSkill,mouseX,mouseY);});
    window.addEventListener("mouseup", e=>{if(e.button===2)isRightMouseDown=false;});
    window.addEventListener("keydown", e=>{
        if(gameState!=="game")return; const k=e.key.toLowerCase();
        const cK=Object.entries(settings.keyBindings).find(([_,v])=>v===k);
        if(cK&&cK[0]==="cancel"){cancelCast();return;}
        const sK=Object.entries(settings.keyBindings).find(([_,v])=>v===k);
        if(!sK||["cancel"].includes(sK[0]))return; const s=sK[0];
        if(settings.quickCast) useSkill(s,mouseX,mouseY); else { if(s==="w"||s==="r") useSkill(s,mouseX,mouseY); else selectedSkill=s; }
    });
    canvas.addEventListener("touchmove", e=>{if(gameState!=="game"||selectedSkill)return;const t=e.touches[0];player.targetX=t.clientX;player.targetY=t.clientY;});
    canvas.addEventListener("touchstart", e=>{if(gameState!=="game")return;const t=e.touches[0];if(selectedSkill){useSkill(selectedSkill,t.clientX,t.clientY);selectedSkill=null;}else{player.targetX=t.clientX;player.targetY=t.clientY;}});
    document.querySelectorAll(".skill").forEach(btn=>{btn.onclick=()=>{if(gameState!=="game")return;const s=btn.dataset.skill;if(cooldowns[s]>Date.now())return;if(settings.quickCast||s==="w"||s==="r")useSkill(s,mouseX,mouseY);else selectedSkill=s;}});

    // ЗАПУСК
    createUI();
    showMainMenu();
    loop();
});