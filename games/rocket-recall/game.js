        // Game state management
        const GameState = {
            WELCOME: 'welcome',
            QUIZ: 'quiz',
            PLAYING: 'playing',
            BOSS_INTRO: 'bossIntro',
            SHOP: 'shop',
            GAME_OVER: 'gameOver'
        };

        // Top border that aliens can't spawn past (highest/most-negative allowed spawn Y).
        const TOP_BORDER = -250;

        // Definitions for the run-specific bonus power-ups (see POWERUP_DEFS below the game object).
        // Main game object
        const game = {
            canvas: null,
            ctx: null,
            width: 0,
            height: 0,
            state: GameState.WELCOME,
            wave: 1,
            baseLives: 15,
            lives: 15,
            score: 0,
            coins: 0,
            highScore: 0,
            lastDeathCause: '',
            lastDeathEnemyType: '',
            equippedRunPowerups: [],
            runPowerupDoubled: {},
            ammo: 20,
            landscapeHeight: 80,
            difficulty: 'easy',
            
            // Game objects
            player: null,
            bullets: [],
            pendingBullets: [],
            enemies: [],
            enemyBullets: [],
            boss: null,
            explosions: [],
            lastBossType: -1,
            powerups: [],
            orbitBlades: [],
            
            // Enemy defeat tracking
            enemiesDefeatedThisRun: 0,
            totalEnemiesDefeatedAllTime: 0,
            enemiesDefeatedForLifeSteal: 0,
            shotsFiredThisRun: 0,
            
            // Powerup spawn system
            powerupSpawnChance: 0.1,
            powerupSpawnIncrement: 0.1,
            powerupSpawnScheduled: false,
            powerupSpawnTime: 0,
            tripleShotActive: false,
            rocketActive: false,
            rapidFireActive: false,
            rapidFireShotCounter: 0,
            
            // Timing
            lastShot: 0,
            fireRate: 500,
            
            // Input
            keys: {},
            
            // Wave management
            enemiesSpawned: 0,
            totalEnemiesThisWave: 0,
            waveComplete: false,
            currentWaveIsBoss: false,
            
            // Quiz timing and progress
            quizTimeLeft: 0,
            quizTimer: null,
            questionsAnswered: 0,
            totalQuestionsThisQuiz: 0,
            usedQuestions: [],
            currentQuestionIndex: -1,

            // Adaptive difficulty: each question starts at weight 1. Wrong answers
            // double a question's weight (more likely to reappear, capped at 16);
            // correct answers halve it (less likely to reappear, floor of 0.1).
            // Indexed the same way as quizQuestions.
            questionWeights: [],

            // Number of questions answered correctly in the current quiz. After the
            // quiz ends, the player gets to choose 1 power-up out of this many random
            // options (upgrading it if they already own it).
            quizCorrectCount: 0,

            // Whether the player has already received the free starter power-up
            // guarantee after finishing the very first quiz of a run.
            firstQuizAwarded: false,
            
            // Permanent (cross-run) upgrades - bought with coins on the Game Over screen
            permanentUpgrades: {
                correctAnswerBoost: 0,
                fireRateBoost: 0,
                shipSpeed: 0,
                extraLife: 0,
                powerupSpawnRate: 0
            },
            
            // Run-specific power-ups - reset every run, chosen after boss-fight bonus quizzes
            runPowerups: {},
            
            shields: 0,
            baseAmmoPerCorrect: 10,
            baseFireRate: 500,
            baseSpeed: 5,
            fireJammedUntil: 0,
            volatileHazards: [],
            curseSeen: {},
            emergencyAmmoUsedThisWave: false,
            
            // Camera shake
            shakeUntil: 0,
            shakeIntensity: 0,
            shakeDuration: 0,
            shakeOffsetX: 0,
            shakeOffsetY: 0,
            
            // Secret code system
            secretCodeActive: false,
            startingWave: 1,
            startingAmmo: 20,
            skipQuizzes: false,
            powerupTestMode: false
        };

        // Metadata + logic for the run-specific bonus power-ups earned after defeating a boss.
        const POWERUP_DEFS = {
            extraShotSpread: { name: 'Extra Shot (Spread)', maxLevel: Infinity, desc: (l) => `Fire an extra shot in a spread pattern (+1 ammo used per shot). Level ${l+1}.` },
            extraShotForward: { name: 'Extra Shot (Forward)', maxLevel: Infinity, desc: (l) => `Fire another forward shot beside your existing shots (+1 ammo used per shot). Level ${l+1}.` },
            laserShot: { name: 'Laser Shot', maxLevel: Infinity, desc: (l) => `Bullets grow +200% longer than their base length per level and pierce up to ${l+1} enemies before the beam's piercing power drops off. Level ${l+1}.` },
            higherCaliber: { name: 'Higher Calibre', maxLevel: Infinity, desc: (l) => `Bullets are +100% wider than their base width per level, with a rocket-trail pixel effect. Level ${l+1}.` },
            repairedHulls: { name: 'Repaired Hulls', maxLevel: Infinity, desc: (l) => `+1 Health (only if below starting health). Level ${l+1}.` },
            strongerThrusters: { name: 'Stronger Thrusters', maxLevel: Infinity, desc: (l) => `Move 10% faster with a bigger thruster effect. Level ${l+1}.` },
            ammoGeneration: { name: 'Ammo Generation', maxLevel: Infinity, desc: (l) => `+10 ammo per correct answer. Level ${l+1}.` },
            shieldWall: { name: 'Shield Wall', maxLevel: Infinity, desc: (l) => `+1 Bonus Health (can exceed starting health). Level ${l+1}.` },
            luckySalvage: { name: 'Lucky Salvage', maxLevel: Infinity, desc: (l) => `Enemies have a higher chance to drop bonus coins or ammo. Level ${l+1}.` },
            splitShot: { name: 'Split Shot', maxLevel: Infinity, desc: (l) => `Bullets split into extra bullets after travelling 30% of the screen (the new bullets cost extra ammo). Level ${l+1}.` },
            explosiveAmmo: { name: 'Explosive Ammo', maxLevel: Infinity, desc: (l) => `Bullets explode in a small radius on impact. Level ${l+1}.` },
            lifeSteal: { name: 'Life Steal', maxLevel: 5, desc: (l) => `Recover 1 HP every ${20 - (l + 1)} enemies defeated. Level ${l+1}.` },
            burstFire: { name: 'Burst Fire', maxLevel: Infinity, desc: (l) => `Fire ${l+1} extra volley(s) with a tiny delay between each (each extra volley costs its own ammo). Level ${l+1}.` },
            waveCannon: { name: 'Wave Cannon', maxLevel: Infinity, desc: (l) => `Bullets travel in a sine-wave pattern. Level ${l+1}.` },
            shrapnelRounds: { name: 'Shrapnel Rounds', maxLevel: Infinity, desc: (l) => `Bullets burst into shrapnel fragments on hit/expiry. Level ${l+1}.` },
            orbitingBlades: { name: 'Orbiting Blades', maxLevel: Infinity, desc: (l) => `Summon a rotating energy blade around your ship that damages enemies on contact. Level ${l+1}.` },
            bulletBloom: { name: 'Bullet Bloom', maxLevel: Infinity, desc: (l) => `Bullets grow larger the farther they travel. Level ${l+1}.` },
            boomerangShots: { name: 'Boomerang Shots', maxLevel: Infinity, desc: (l) => `Bullets bounce off any wall (top, bottom, or sides) up to ${l+1} time${l+1 === 1 ? '' : 's'} before disappearing. Level ${l+1}.` },
            piercingRound: { name: 'Piercing Round', maxLevel: Infinity, desc: (l) => `Bullets pierce +1 additional enemy. Level ${l+1}.` },
            fasterShot: { name: 'Faster Shot', maxLevel: Infinity, desc: (l) => `Bullets fire 10% faster than base fire rate per level. Level ${l+1}.` },
            prismCannon: { name: 'Prism Cannon', maxLevel: Infinity, desc: (l) => `Every 5th shot randomly gains extra effects. Level ${l+1}.` },

            // ===== Cursed cards: a real buff, with a real cost attached. Each curse can
            // only ever be picked once per run — if you pass on it, it's gone for good
            // until your next run (see game.curseSeen).
            glassCannonRounds: { name: 'Glass Cannon Rounds', maxLevel: 1, curse: true, desc: () => `+25% fire rate. Cursed: your current health is halved the moment you pick this.` },
            staticDischarge: { name: 'Static Discharge', maxLevel: 1, curse: true, desc: () => `+1 permanent Piercing Round. Cursed: every 10th shot jams your weapon for 0.5s.` },
            overclockedBarrels: { name: 'Overclocked Barrels', maxLevel: 1, curse: true, desc: () => `+30% fire rate. Cursed: each shot costs +1 extra ammo.` },
            bloodMagnet: { name: 'Blood Magnet', maxLevel: 1, curse: true, desc: () => `+2 coins per enemy defeated. Cursed: enemies deal +1 extra damage on collision or reaching the ground.` },
            twinBarrelCurse: { name: 'Twin Barrel Curse', maxLevel: 1, curse: true, desc: () => `+1 Extra Shot (Spread). Cursed: -15% move speed.` },
            volatileCore: { name: 'Volatile Core', maxLevel: 1, curse: true, desc: () => `Enemies you defeat have a 25% chance to leave a brief hazard cloud that damages other nearby enemies too. Cursed: it damages you as well if you're caught in it.` }
        };
        const POWERUP_KEYS = Object.keys(POWERUP_DEFS);


        // The currently active set of quiz questions. A valid code MUST be loaded
        // before the game can start - there is no built-in default question bank.
        let quizQuestions = null;
        let currentSubjectName = null;

        // Teacher setup: secret session codes mapped to separate JSON files.
        // Add a line here (and drop the matching JSON file in the question-banks folder)
        // to add a new subject - no other code changes needed.
        // Suggested naming: '<year><term><subject initial><extra letter>'
        // e.g. Year 9 Biology Term 3 full = '93bf', Year 9 Physics Speed = '92ps'.
        //
        // JSON FORMAT (must match across all games for consistency):
        // A plain top-level array of question objects, each shaped like:
        //   { "q": "question text", "o": ["option A", "option B", ...], "a": 0 }
        // where "a" is the index (0-based) into "o" of the correct option.
        const QUESTION_BANK_FILES = {
    '93bf':'../../question-banks/multichoice/year-9-biology-full.json',
    '92ps':'../../question-banks/multichoice/year-9-physics-speed.json',
    '92pf':'../../question-banks/multichoice/year-9-physics-force.json',
    'test':'../../question-banks/multichoice/devtestquestions.json',
    '112cf':'../../question-banks/multichoice/year-11-chemistry-full.json',
    '11-13dc':'../../question-banks/multichoice/senior-dance-choreography.json',
    '11-13dg':'../../question-banks/multichoice/senior-dance-genres.json',
    'science':'../../question-banks/multichoice/year-9-science-full.json',
    'chef':'../../question-banks/multichoice/cooking.json',
    'elfdef':'../../question-banks/multichoice/englishlanguagedef.json',
    'elfex':'../../question-banks/multichoice/englishlanguageex.json',
        }

        // Question banks are a plain top-level array of { q, o, a } objects:
        //   q = question text (string)
        //   o = array of answer options (>= 2)
        //   a = index into o of the correct answer
        function validateQuestionBank(data) {
            if (!Array.isArray(data) || data.length === 0) return false;
            return data.every(item =>
                typeof item.q === 'string' &&
                Array.isArray(item.o) && item.o.length >= 2 &&
                Number.isInteger(item.a) && item.a >= 0 && item.a < item.o.length
            );
        }

        function setActiveSubject(name) {
            currentSubjectName = name;
            const subjectTitle = document.getElementById('subjectTitleInline');
            const quizTitle = document.getElementById('quizTitleText');
            if (subjectTitle) subjectTitle.textContent = name ? name.toUpperCase() : '';
            if (quizTitle) quizTitle.textContent = name ? name.toUpperCase() : '';
            updateBeginButtonState();
        }

        function updateBeginButtonState() {
            const beginBtn = document.getElementById('beginGameBtn');
            if (!beginBtn) return;
            beginBtn.disabled = !quizQuestions;
            beginBtn.style.opacity = quizQuestions ? '1' : '0.5';
            beginBtn.style.cursor = quizQuestions ? 'pointer' : 'not-allowed';
        }

        // Loads a question bank by code. Called from the single code box on the
        // title screen (see applyCode() below), and also on page load to restore
        // whichever bank was last used. A question bank is REQUIRED to play -
        // there's no default fallback, so Begin Game stays disabled until one loads.
        async function loadQuestionBank(code) {
            const statusDiv = document.getElementById('bankStatus');

            if (code === '') {
                quizQuestions = null;
                setActiveSubject(null);
                statusDiv.innerHTML = 'No question bank loaded — enter a code to play';
                statusDiv.style.color = 'var(--red-damage)';
                localStorage.removeItem('lastBankCode');
                return false;
            }

            const file = QUESTION_BANK_FILES[code];
            if (!file) {
                quizQuestions = null;
                setActiveSubject(null);
                statusDiv.innerHTML = `❌ Code "${code}" not recognized — enter a valid code to play`;
                statusDiv.style.color = 'var(--red-damage)';
                return false;
            }

            statusDiv.textContent = 'Loading...';
            statusDiv.style.color = 'var(--blue-highlight)';

            try {
                const response = await fetch(file);
                if (!response.ok) throw new Error(`fetch failed with status ${response.status}`);
                const data = await response.json();

                if (!validateQuestionBank(data)) {
                    throw new Error('question bank JSON failed validation');
                }

                // Normalize { q, o, a } -> { question, options, correct } for the game engine.
                quizQuestions = data.map(item => ({
                    question: item.q,
                    options: item.o,
                    correct: item.a
                }));
                // Reset adaptive weighting - every question starts equally likely.
                game.questionWeights = quizQuestions.map(() => 1);
                const subjectName = code.toUpperCase();
                setActiveSubject(subjectName);
                statusDiv.innerHTML = `✅ Loaded: <strong>${subjectName}</strong> (${quizQuestions.length} questions)`;
                statusDiv.style.color = 'var(--green-success)';
                localStorage.setItem('lastBankCode', code);
                return true;
            } catch (err) {
                console.error('Question bank load failed:', err);
                quizQuestions = null;
                setActiveSubject(null);
                statusDiv.innerHTML = `❌ Couldn't load code "${code}" — enter a valid code to play. (If you're testing locally, this game must be served from a web server, not opened as a local file.)`;
                statusDiv.style.color = 'var(--red-damage)';
                return false;
            }
        }

        // Re-load whichever bank code was used last time, for convenience
        window.addEventListener('load', () => {
            const savedCode = localStorage.getItem('lastBankCode');
            if (savedCode) {
                const input = document.getElementById('bankCode');
                if (input) {
                    input.value = savedCode;
                    loadQuestionBank(savedCode);
                }
            }
        });

        // Game classes
        // Builds the modifier set applied to a freshly-fired bullet, based on the
        // player's current run-specific power-ups. `extraForce` (used by Prism Cannon)
        // layers extra effects onto a single shot regardless of what's owned.
        function buildBulletMods(extraForce) {
            const rp = game.runPowerups;
            const mods = {
                laserLevel: rp.laserShot || 0,
                caliberLevel: rp.higherCaliber || 0,
                split: rp.splitShot || 0,
                explosive: rp.explosiveAmmo || 0,
                wave: rp.waveCannon || 0,
                shrapnel: rp.shrapnelRounds || 0,
                bloom: rp.bulletBloom || 0,
                boomerang: rp.boomerangShots || 0,
                pierce: rp.piercingRound || 0
            };
            if (extraForce) {
                extraForce.forEach(key => {
                    if (key === 'laserShot') mods.laserLevel = Math.max(1, mods.laserLevel + 1);
                    else if (key === 'higherCaliber') mods.caliberLevel = Math.max(1, mods.caliberLevel + 1);
                    else if (key === 'splitShot') mods.split += 1;
                    else if (key === 'explosiveAmmo') mods.explosive += 1;
                    else if (key === 'waveCannon') mods.wave += 1;
                    else if (key === 'shrapnelRounds') mods.shrapnel += 1;
                    else if (key === 'bulletBloom') mods.bloom += 1;
                    else if (key === 'boomerangShots') mods.boomerang += 1;
                    else if (key === 'piercingRound') mods.pierce += 1;
                });
            }
            return mods;
        }

        class Player {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.width = 76;
                this.height = 68;
                this.thrusting = false;
                this.animFrame = 0;
                this.animTimer = 0;
            }

            get speed() {
                const thrusterLevel = game.runPowerups.strongerThrusters || 0;
                const shipSpeedMultiplier = 1 + (game.permanentUpgrades.shipSpeed * 0.1);
                const twinBarrelLevel = game.runPowerups.twinBarrelCurse || 0;
                const twinBarrelPenalty = Math.max(0.4, 1 - twinBarrelLevel * 0.15);
                return game.baseSpeed * shipSpeedMultiplier * (1 + thrusterLevel * 0.1) * twinBarrelPenalty;
            }

            update() {
                this.thrusting = false;
                if (targetX !== null && isPointerActive) {
                    const targetPlayerX = targetX - this.width / 2;
                    const distance = targetPlayerX - this.x;
                    const moveSpeed = this.speed * 1.5;
                    
                    if (Math.abs(distance) > moveSpeed) {
                        this.x += Math.sign(distance) * moveSpeed;
                        this.thrusting = true;
                    } else {
                        this.x = targetPlayerX;
                    }
                    
                    this.x = Math.max(0, Math.min(game.width - this.width, this.x));
                }
                else {
                    if (game.keys['ArrowLeft'] || game.keys['a'] || game.keys['A']) {
                        this.x = Math.max(0, this.x - this.speed);
                        this.thrusting = true;
                    }
                    if (game.keys['ArrowRight'] || game.keys['d'] || game.keys['D']) {
                        this.x = Math.min(game.width - this.width, this.x + this.speed);
                        this.thrusting = true;
                    }
                }

                this.animTimer++;
                if (this.animTimer % (this.thrusting ? 6 : 20) === 0) {
                    this.animFrame = (this.animFrame + 1) % 2;
                }

                const now = Date.now();
                
                // Fire-rate reductions are linear percentages of the base fire rate
                // (not compounding), summed together and applied once - so e.g. 5
                // levels of a 10%/level upgrade means 50% off the ORIGINAL fire rate,
                // not 0.9^5.
                const fireRateBoostPct = game.permanentUpgrades.fireRateBoost * 0.1;
                const fasterShotLevel = game.runPowerups.fasterShot || 0;
                const fasterShotPct = fasterShotLevel * 0.1;
                const glassCannonPct = (game.runPowerups.glassCannonRounds || 0) * 0.25;
                const overclockedPct = (game.runPowerups.overclockedBarrels || 0) * 0.3;
                const totalFireRateReduction = Math.min(0.9, fireRateBoostPct + fasterShotPct + glassCannonPct + overclockedPct);
                let currentFireRate = game.baseFireRate * (1 - totalFireRateReduction);
                
                // Laser Shot fires 20% slower to balance its piercing beam
                if ((game.runPowerups.laserShot || 0) > 0) {
                    currentFireRate *= 1.2;
                }
                
                // Rapid fire powerup: 3x fire rate
                if (game.rapidFireActive) {
                    currentFireRate = currentFireRate / 3;
                }
                
                if (now - game.lastShot > currentFireRate && game.ammo > 0 &&
                    !(game.fireJammedUntil && now < game.fireJammedUntil)) {
                    if (this.shoot()) {
                        game.lastShot = now;
                    }
                }

                updateOrbitBlades();
            }

            // Builds the list of {dx, dir, type, angle} bullet specs for one shot,
            // accounting for legacy pickup powerups plus the Extra Shot run power-ups.
            buildShotSpecs() {
                let specs = [];
                if (game.tripleShotActive) {
                    specs.push({dx: 0, dir: 0, type: 'normal'});
                    specs.push({dx: -10, dir: -1, type: 'normal'});
                    specs.push({dx: 10, dir: 1, type: 'normal'});
                } else if (game.rocketActive) {
                    specs.push({dx: 0, dir: 0, type: 'rocket'});
                } else if (game.rapidFireActive) {
                    const spreadAngle = (Math.random() * 20 - 10) * (Math.PI / 180);
                    specs.push({dx: 0, dir: 0, type: 'rapidfire', angle: spreadAngle});
                } else {
                    specs.push({dx: 0, dir: 0, type: 'normal'});
                }

                const baseType = specs[0].type;

                // Extra Shot (Forward): parallel shots beside existing ones
                const fwdLevel = game.runPowerups.extraShotForward || 0;
                for (let i = 0; i < fwdLevel; i++) {
                    const side = (i % 2 === 0) ? 1 : -1;
                    let mag = 16 * (Math.floor(i / 2) + 1);
                    let dx = side * mag;
                    let guard = 0;
                    while (specs.some(s => s.dx === dx) && guard < 10) {
                        mag += 16;
                        dx = side * mag;
                        guard++;
                    }
                    specs.push({dx, dir: 0, type: baseType === 'rocket' ? 'rocket' : (baseType === 'rapidfire' ? 'rapidfire' : 'normal')});
                }

                // Extra Shot (Spread): additional angled bullets. Twin Barrel Curse grants
                // spread shots the same way, cursed side effect and all.
                const spreadLevel = (game.runPowerups.extraShotSpread || 0) + (game.runPowerups.twinBarrelCurse || 0);
                for (let i = 0; i < spreadLevel; i++) {
                    const side = (i % 2 === 0) ? 1 : -1;
                    const step = Math.ceil((i + 1) / 2);
                    specs.push({dx: 0, dir: side * (0.6 + (step - 1) * 0.4), type: 'normal'});
                }

                return specs;
            }

            fireBullets(specs, mods) {
                specs.forEach(s => {
                    game.bullets.push(new Bullet(this.x + this.width / 2 + s.dx, this.y, s.dir, s.type, s.angle || 0, mods));
                });
            }

            shoot(isBurstEcho) {
                const rp = game.runPowerups;
                
                // Powerups that add extra bullets to a single shot (Extra Shot Spread/
                // Forward) also increase that shot's ammo cost by however many bullets
                // they added, on top of the base 1 ammo.
                const extraBulletAmmoCost = (rp.extraShotForward || 0) + (rp.extraShotSpread || 0) + (rp.twinBarrelCurse || 0) + (rp.overclockedBarrels || 0);
                const shotAmmoCost = 1 + extraBulletAmmoCost;
                
                if (game.rapidFireActive) {
                    if (game.ammo <= 0) return false;
                } else {
                    if (game.ammo < shotAmmoCost) return false;
                }

                if (!isBurstEcho) {
                    game.shotsFiredThisRun++;
                    if ((rp.staticDischarge || 0) > 0 && game.shotsFiredThisRun % 10 === 0) {
                        game.fireJammedUntil = Date.now() + 500;
                    }
                }
                let extraForce = null;
                if (rp.prismCannon > 0 && game.shotsFiredThisRun % 5 === 0) {
                    const pool = ['laserShot', 'higherCaliber', 'splitShot', 'explosiveAmmo', 'waveCannon', 'shrapnelRounds', 'bulletBloom', 'boomerangShots', 'piercingRound'];
                    extraForce = [];
                    for (let i = 0; i < rp.prismCannon; i++) extraForce.push(pool[Math.floor(Math.random() * pool.length)]);
                }

                const mods = buildBulletMods(extraForce);
                const specs = this.buildShotSpecs();
                this.fireBullets(specs, mods);

                if (game.rapidFireActive) {
                    game.rapidFireShotCounter += shotAmmoCost;
                    while (game.rapidFireShotCounter >= 3) {
                        game.ammo--;
                        game.rapidFireShotCounter -= 3;
                    }
                } else {
                    game.ammo -= shotAmmoCost;
                }
                updateUI();

                // Burst Fire: echo the same shot a few more times with a tiny delay.
                // Each echo is a full extra volley, so it costs the same ammo as the
                // original shot (skipped if there isn't enough ammo left by then).
                if (!isBurstEcho && rp.burstFire > 0) {
                    for (let b = 1; b <= rp.burstFire; b++) {
                        setTimeout(() => {
                            if (game.state !== GameState.PLAYING) return;
                            if (game.ammo < shotAmmoCost) return;
                            this.fireBullets(this.buildShotSpecs(), mods);
                            game.ammo -= shotAmmoCost;
                            updateUI();
                        }, b * 70);
                    }
                }
                
                return true;
            }

            draw() {
                const pixelSize = 4;
                const px = this.x;
                const py = this.y;
                
                const shipPatternIdle = [
                    '         #         ',
                    '        #F#        ',
                    '       #FFF#       ',
                    '      #FFFFF#      ',
                    '      #FBBBF#      ',
                    '     #FBBBBBF#     ',
                    '    #FFQFFFQFF#    ',
                    '    #FFQFFFQFF#    ',
                    '    #FFQFMFQFF#    ',
                    '   #FFFQFMFQFFF#   ',
                    '  #FFFQFMMMFQFFF#  ',
                    ' #FFFQ##MMM##QFFF# ',
                    'U#####YY#M#YY#####X',
                    '    #YAAY#YAAY#    ',
                    '      AA   AA      ',
                    '      EE   EE      ',
                    '      EE   EE      '
                ];

                // Second frame: thrusters firing, with flame extended further downward
                const shipPatternThrust = [
                    '         #         ',
                    '        #F#        ',
                    '       #FFF#       ',
                    '      #FFFFF#      ',
                    '      #FBBBF#      ',
                    '     #FBBBBBF#     ',
                    '    #FFQFFFQFF#    ',
                    '    #FFQFFFQFF#    ',
                    '    #FFQFMFQFF#    ',
                    '   #FFFQFMFQFFF#   ',
                    '  #FFFQFMMMFQFFF#  ',
                    ' #FFFQ##MMM##QFFF# ',
                    'U#####YY#M#YY#####X',
                    '    #YAAY#YAAY#    ',
                    '     TAAT TAAT     ',
                    '     TEET TEET     ',
                    '     TEET TEET     '
                ];

                const thrusterLevel = game.runPowerups.strongerThrusters || 0;
                const useThrustFrame = this.thrusting && this.animFrame === 1;
                const shipPattern = useThrustFrame ? shipPatternThrust : shipPatternIdle;

                const repairedLevel = game.runPowerups.repairedHulls || 0;
                const hullSaturation = Math.min(1, repairedLevel * 0.15);
                const hullColor = repairedLevel > 0
                    ? `rgb(${Math.round(102 + hullSaturation * 40)}, ${Math.round(102 + hullSaturation * 90)}, ${Math.round(102 + hullSaturation * 40)})`
                    : '#666666';

                const colors = {
                    '#': hullColor,
                    'F': '#00ccff',
                    'B': '#0066cc',
                    'Q': '#ffff00',
                    'M': '#ff0066',
                    'Y': '#ffcc00',
                    'A': '#ff6600',
                    'E': '#ff0000',
                    'U': '#00ff00',
                    'X': '#00ff00',
                    'T': '#ffaa33'
                };
                
                for (let row = 0; row < shipPattern.length; row++) {
                    for (let col = 0; col < shipPattern[row].length; col++) {
                        const pixel = shipPattern[row][col];
                        if (colors[pixel]) {
                            game.ctx.fillStyle = colors[pixel];
                            game.ctx.fillRect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                        }
                    }
                }

                // Thruster particle effect, grows with Stronger Thrusters level
                if (this.thrusting) {
                    const flameCount = 3 + thrusterLevel * 2;
                    for (let i = 0; i < flameCount; i++) {
                        const spread = 10 + thrusterLevel * 2;
                        const fx = px + this.width / 2 + (Math.random() * spread * 2 - spread);
                        const fy = py + this.height + Math.random() * (10 + thrusterLevel * 3);
                        game.ctx.fillStyle = Math.random() < 0.5 ? '#ffaa33' : '#ff6600';
                        game.ctx.fillRect(fx, fy, 3, 3);
                    }
                }

                // Shield Wall bonus-health pixel effect
                if ((game.runPowerups.shieldWall || 0) > 0) {
                    const pulse = Math.sin(Date.now() / 200) * 0.2 + 0.5;
                    game.ctx.strokeStyle = `rgba(46, 204, 113, ${pulse})`;
                    game.ctx.lineWidth = 2;
                    game.ctx.setLineDash([4, 4]);
                    game.ctx.strokeRect(px - 8, py - 8, this.width + 16, this.height + 16);
                    game.ctx.setLineDash([]);
                }
                
                if (game.shields > 0) {
                    const shieldAlpha = Math.sin(Date.now() / 150) * 0.3 + 0.4;
                    game.ctx.strokeStyle = `rgba(0, 255, 255, ${shieldAlpha})`;
                    game.ctx.lineWidth = 2;
                    game.ctx.strokeRect(px - 4, py - 4, this.width + 8, this.height + 8);
                }

                drawOrbitBlades(px + this.width / 2, py + this.height / 2);
            }
        }

        class Bullet {
            constructor(x, y, spreadDirection = 0, type = 'normal', angle = 0, mods = null, isFragment = false) {
                this.spawnX = x;
                this.x = x;
                this.y = y;
                this.startY = y;
                this.type = type;
                this.spreadDirection = spreadDirection;
                this.angle = angle;
                this.mods = mods || {};
                this.isFragment = isFragment;
                this.driftX = 0;
                this.hasSplit = false;
                this.markedForRemoval = false;
                this.hitEnemies = new Set();
                
                let baseWidth, baseHeight;
                if (type === 'rocket') {
                    baseWidth = 8; baseHeight = 24; this.speed = 10;
                } else if (type === 'rapidfire') {
                    baseWidth = 4; baseHeight = 15; this.speed = 12;
                } else {
                    baseWidth = 6; baseHeight = 20; this.speed = 8;
                }
                
                if (isFragment) {
                    this.width = 4;
                    this.height = 4;
                    this.speed = 5;
                    this.pierceRemaining = 0;
                } else {
                    // Linear scaling based on the bullet's own base size - each level adds
                    // another fixed multiple of the ORIGINAL size, it doesn't compound.
                    const caliberLevel = this.mods.caliberLevel || 0;
                    const laserLevel = this.mods.laserLevel || 0;
                    this.width = baseWidth * (1 + caliberLevel * 1.0); // +100% of base width per level
                    this.height = baseHeight * (1 + laserLevel * 2.0); // +200% of base length per level
                    
                    this.pierceRemaining = this.mods.pierce || 0;
                    // Laser pierces up to `laserLevel` enemies - beyond that its piercing
                    // power drops off (it stops piercing further, same as any other bullet).
                    if (laserLevel > 0) this.pierceRemaining += laserLevel;
                }
                this.baseWidth = this.width;
                this.baseHeight = this.height;
                this.bloomScale = 1;
            }

            // Boomerang Shots: bullets keep their normal trajectory untouched. Only once
            // one actually reaches a wall (left, right, top, or bottom) does it reflect
            // back, up to `this.mods.boomerang` times total shared across every wall.
            applyWallBounce(candidateX) {
                if (!(this.mods.boomerang > 0)) return candidateX;
                if (this.bouncesRemaining === undefined) this.bouncesRemaining = this.mods.boomerang;

                let x = candidateX;
                if ((x <= 0 || x >= game.width - this.width) && this.bouncesRemaining > 0) {
                    x = x <= 0 ? -x : 2 * (game.width - this.width) - x;
                    this.bounceOffsetX = (this.bounceOffsetX || 0) + (candidateX - x);
                    this.bouncesRemaining--;
                } else if (this.bounceOffsetX) {
                    x = candidateX - this.bounceOffsetX;
                }
                return x;
            }

            applyVerticalBounce() {
                if (!(this.mods.boomerang > 0)) return;
                if (this.bouncesRemaining === undefined) this.bouncesRemaining = this.mods.boomerang;

                if (this.y <= 0 && this.speed > 0 && this.bouncesRemaining > 0) {
                    // Travelling up, hit the top wall - bounce back down.
                    this.y = -this.y;
                    this.speed = -this.speed;
                    this.bouncesRemaining--;
                } else if (this.y >= game.height - this.height && this.speed < 0 && this.bouncesRemaining > 0) {
                    // Travelling down, hit the bottom wall - bounce back up.
                    this.y = 2 * (game.height - this.height) - this.y;
                    this.speed = -this.speed;
                    this.bouncesRemaining--;
                } else if (this.bouncesRemaining <= 0 && ((this.y <= 0 && this.speed > 0) || (this.y >= game.height && this.speed < 0))) {
                    // Out of bounces - let it fly off screen like any other spent bullet.
                    this.markedForRemoval = true;
                }
            }

            // Split Shot: break into extra bullets after travelling 30% of the screen.
            // The net new bullets created (count - 1, since the original is replaced)
            // cost extra ammo, same as any other power-up that adds bullets to a shot.
            spawnSplitChildren(count) {
                this.hasSplit = true;
                this.markedForRemoval = true;
                const childMods = Object.assign({}, this.mods, {split: 0});
                for (let i = 0; i < count; i++) {
                    const spread = (i - (count - 1) / 2) * 1.4 || (i % 2 === 0 ? 1 : -1);
                    const child = new Bullet(this.x, this.y, spread, this.type, this.angle, childMods);
                    game.pendingBullets.push(child);
                }
                game.ammo = Math.max(0, game.ammo - (count - 1));
                updateUI();
            }

            update() {
                if (this.isFragment) {
                    this.x += this.fragDX;
                    this.y += this.fragDY;
                    this.fragTraveled = (this.fragTraveled || 0) + Math.hypot(this.fragDX, this.fragDY);
                    if (this.fragTraveled >= this.fragMaxTravel) this.markedForRemoval = true;
                    return;
                }

                if (this.type === 'rapidfire') {
                    this.y -= this.speed * Math.cos(this.angle);
                    this.applyVerticalBounce();
                    this.rapidDriftX = (this.rapidDriftX || 0) + this.speed * Math.sin(this.angle);
                    
                    let waveOffset = 0;
                    if (this.mods.wave) {
                        const traveled = Math.abs(this.startY - this.y);
                        const amplitude = 10 + this.mods.wave * 6;
                        waveOffset = Math.sin(traveled * 0.05) * amplitude;
                    }
                    this.x = this.applyWallBounce(this.spawnX + this.rapidDriftX + waveOffset);
                    
                    if (this.mods.bloom) {
                        const traveled = Math.min(game.height, Math.abs(this.startY - this.y));
                        const t = traveled / game.height;
                        this.bloomScale = 1 + t * 0.1 * (1 + this.mods.bloom);
                        this.width = this.baseWidth * this.bloomScale;
                        this.height = this.baseHeight * this.bloomScale;
                    }
                    
                    if (this.mods.split > 0 && !this.hasSplit) {
                        const traveled = Math.abs(this.startY - this.y);
                        if (traveled >= game.height * 0.3) {
                            this.spawnSplitChildren(2 + (this.mods.split - 1));
                        }
                    }
                    return;
                }

                this.y -= this.speed;
                this.applyVerticalBounce();

                if (this.spreadDirection !== 0) {
                    this.driftX += this.spreadDirection * 2;
                }

                let waveOffset = 0;
                if (this.mods.wave) {
                    const traveled = Math.abs(this.startY - this.y);
                    const amplitude = 10 + this.mods.wave * 6;
                    waveOffset = Math.sin(traveled * 0.05) * amplitude;
                }
                this.x = this.applyWallBounce(this.spawnX + this.driftX + waveOffset);

                // Bullet Bloom: grows the farther it travels
                if (this.mods.bloom) {
                    const traveled = Math.min(game.height, Math.abs(this.startY - this.y));
                    const t = traveled / game.height;
                    this.bloomScale = 1 + t * 0.1 * (1 + this.mods.bloom);
                    this.width = this.baseWidth * this.bloomScale;
                    this.height = this.baseHeight * this.bloomScale;
                }

                // Split Shot: break into extra bullets after travelling 30% of the screen
                if (this.mods.split > 0 && !this.hasSplit) {
                    const traveled = Math.abs(this.startY - this.y);
                    if (traveled >= game.height * 0.3) {
                        this.spawnSplitChildren(2 + (this.mods.split - 1));
                    }
                }
            }

            draw() {
                if (this.isFragment) {
                    game.ctx.fillStyle = '#ffaa33';
                    game.ctx.fillRect(this.x, this.y, this.width, this.height);
                    return;
                }

                // Higher Calibre pixel-art trail (small trailing pixel sparks instead of a flat blob)
                if (this.mods.caliberLevel > 0) {
                    const trailPixels = 3;
                    for (let i = 0; i < trailPixels; i++) {
                        const px = 3;
                        const tx = this.x - this.width * (0.15 + i * 0.12) + (Math.random() - 0.5) * 2;
                        const ty = this.y + this.height * (0.55 + i * 0.14);
                        game.ctx.fillStyle = i === 0 ? 'rgba(255,221,51,0.9)' : (i === 1 ? 'rgba(255,153,0,0.6)' : 'rgba(120,60,0,0.35)');
                        game.ctx.fillRect(tx, ty, px, px);
                    }
                }
                // Laser pixel sparkle effect
                if (this.mods.laserLevel > 0) {
                    for (let i = 0; i < 2; i++) {
                        const sx = this.x + (Math.random() * this.width - this.width / 2);
                        const sy = this.y + Math.random() * this.height;
                        game.ctx.fillStyle = 'rgba(180, 255, 255, 0.8)';
                        game.ctx.fillRect(sx, sy, 2, 2);
                    }
                }
                // Wave Cannon glowing trail
                if (this.mods.wave) {
                    game.ctx.fillStyle = 'rgba(0, 255, 200, 0.25)';
                    game.ctx.fillRect(this.x - this.width / 2, this.y + this.height * 0.3, this.width * 2, this.height * 0.6);
                }

                if (this.type === 'rocket') {
                    // Red rocket pixel art
                    const pixelSize = 2;
                    const px = this.x - 4;
                    const py = this.y;
                    
                    const rocketPattern = [
                        '  RR  ',
                        ' RRRR ',
                        'RRRRRR',
                        'RRRRRR',
                        'RRRRRR',
                        'WWWWWW',
                        'WWWWWW',
                        'YYYYYY',
                        'YYYYYY',
                        ' Y  Y ',
                        ' Y  Y '
                    ];
                    
                    const colors = {
                        'R': '#ff0000',
                        'W': '#ffffff',
                        'Y': '#ffff00'
                    };
                    
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < rocketPattern.length; row++) {
                            for (let col = 0; col < rocketPattern[row].length; col++) {
                                if (rocketPattern[row][col] === pixelType) {
                                    game.ctx.rect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                } else if (this.mods.laserLevel > 0) {
                    // Laser bullet - elongated cyan beam
                    const grad = game.ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.height);
                    grad.addColorStop(0, 'rgba(150,255,255,0.1)');
                    grad.addColorStop(0.5, '#66ffff');
                    grad.addColorStop(1, 'rgba(150,255,255,0.1)');
                    game.ctx.fillStyle = grad;
                    game.ctx.fillRect(this.x - this.width / 2, this.y, this.width, this.height);
                } else if (this.mods.caliberLevel > 0) {
                    // Pixel-art shell casing: brass body with a bright tip
                    const p = Math.max(2, Math.round(this.width / 5));
                    const bx = this.x - this.width / 2;
                    const by = this.y;
                    const shellPattern = [
                        ' TT ',
                        'TTTT',
                        'BBBB',
                        'BBBB',
                        'BBBB',
                        ' BB '
                    ];
                    const shellColors = { T: '#ffe680', B: '#d4af37' };
                    Object.keys(shellColors).forEach(key => {
                        game.ctx.fillStyle = shellColors[key];
                        for (let row = 0; row < shellPattern.length; row++) {
                            for (let col = 0; col < shellPattern[row].length; col++) {
                                if (shellPattern[row][col] === key) {
                                    game.ctx.fillRect(bx + col * p, by + row * p, p, p);
                                }
                            }
                        }
                    });
                } else if (this.type === 'rapidfire') {
                    // Smaller orange bullet
                    game.ctx.fillStyle = '#ff8800';
                    game.ctx.fillRect(this.x, this.y, this.width, this.height);
                } else if (this.spreadDirection !== 0) {
                    // Triple shot spread bullets - blue
                    game.ctx.fillStyle = '#00ccff';
                    game.ctx.fillRect(this.x, this.y, this.width, this.height);
                } else {
                    // Normal yellow bullet
                    game.ctx.fillStyle = '#ffff00';
                    game.ctx.fillRect(this.x, this.y, this.width, this.height);
                }
            }
        }

        // Spawns small shrapnel fragments in random cardinal directions, travelling
        // a distance equal to the bomb powerup's blast radius.
        function spawnShrapnel(x, y, level) {
            const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
            const maxTravel = 80 * (1 + 0.1 * (game.runPowerups.explosiveAmmo || 0));
            for (let i = 0; i < level; i++) {
                const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
                const frag = new Bullet(x, y, 0, 'normal', 0, null, true);
                frag.fragDX = dx * 5;
                frag.fragDY = dy * 5;
                frag.fragMaxTravel = maxTravel;
                game.pendingBullets.push(frag);
            }
            game.explosions.push(new Explosion(x, y, 'particle', '#ffcc66', 10));
        }

        function getTotalPermanentUpgrades() {
            return Object.values(game.permanentUpgrades).reduce((a, b) => a + b, 0);
        }

        // Spawn-rate weights (as percentages) for each base alien subtype, per the wave/upgrade formulas.
        function computeEnemySpawnWeights(wave, upgrades) {
            const orange = Math.max(0, 80 - 4 * (wave + upgrades));
            const green = Math.min(25, (20 + 4 * wave) / 4);
            const blue = Math.min(25, (20 + 4 * upgrades) / 4);
            const yellow = Math.min(20, (100 - orange) / 6 + (wave + upgrades) / 6);
            const pink = Math.min(5, wave + upgrades / 8);
            const whiteRaw = (100 - (80 - wave * 4) - green - blue - yellow - pink) / 2;
            const white = Math.min(12.5, Math.max(0, whiteRaw));
            const newRaw = (100 - (80 - upgrades * 4) - green - blue - yellow - pink) / 2;
            const cyan = Math.min(12.5, Math.max(0, newRaw));
            return { orange, green, blue, yellow, pink, white, cyan };
        }

        function pickEnemySubtype(weights) {
            const entries = Object.entries(weights);
            const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
            if (total <= 0) return 'orange';
            let r = Math.random() * total;
            for (const [k, w] of entries) {
                r -= Math.max(0, w);
                if (r <= 0) return k;
            }
            return 'orange';
        }

        function getEnemyStatsForSubtype(subtype, wave, upgrades) {
            const scaledHealth = Math.max(1, Math.floor(wave / 3));
            switch (subtype) {
                case 'green': return { health: scaledHealth, coins: 2, pointValue: 20 };
                case 'blue': return { health: scaledHealth, coins: 2, pointValue: 20 };
                case 'yellow': return { health: scaledHealth, coins: 4, pointValue: 30 };
                case 'pink': return { health: upgrades + 1, coins: 10, pointValue: 50 };
                case 'white': return { health: 2, coins: 2, pointValue: 20 };
                case 'cyan': return { health: Math.max(1, wave), coins: 10, pointValue: 100 };
                case 'orange':
                default: return { health: 1, coins: 1, pointValue: 10 };
            }
        }

        function hexToHsl(hex) {
            let r = parseInt(hex.slice(1, 3), 16) / 255;
            let g = parseInt(hex.slice(3, 5), 16) / 255;
            let b = parseInt(hex.slice(5, 7), 16) / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h, s, l = (max + min) / 2;
            if (max === min) { h = s = 0; }
            else {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    default: h = (r - g) / d + 4;
                }
                h /= 6;
            }
            return [h * 360, s, l];
        }
        function hslToHex(h, s, l) {
            h = ((h % 360) + 360) % 360 / 360;
            let r, g, b;
            if (s === 0) { r = g = b = l; }
            else {
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1; if (t > 1) t -= 1;
                    if (t < 1 / 6) return p + (q - p) * 6 * t;
                    if (t < 1 / 2) return q;
                    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                    return p;
                };
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
            }
            const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
            return '#' + toHex(r) + toHex(g) + toHex(b);
        }
        // Target hues for each base alien subtype. Orange keeps its original palette.

        const SUBTYPE_PRIMARY_COLOR = { orange: '#ff4400', blue: '#0088ff', pink: '#8844ff', green: '#00aa44', yellow: '#ffff00', white: '#e8e8e8', cyan: '#00e0d0' };
        function getPinkColorMap(baseColors, enemy) {
            let nearest = null, nearestDist = Infinity;
            for (const other of game.enemies) {
                if (other === enemy || other.type === 'boss' || !other.deployed) continue;
                const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
                if (d < nearestDist) { nearestDist = d; nearest = other; }
            }
            const matchColor = nearest ? (SUBTYPE_PRIMARY_COLOR[nearest.subtype] || SUBTYPE_PRIMARY_COLOR.orange) : baseColors.B;
            return Object.assign({}, baseColors, { B: matchColor });
        }

        function spawnSwarmWave() {
            const enemyCount = game.wave * 2 * 2; // The Swarm: double the normal count
            game.totalEnemiesThisWave = enemyCount;
            const upgradeTotal = getTotalPermanentUpgrades();
            const spawnWeights = computeEnemySpawnWeights(game.wave, upgradeTotal);
            const usedPositions = [];
            const minDistance = 50;

            for (let i = 0; i < enemyCount; i++) {
                let x, y, attempts = 0;
                do {
                    x = Math.random() * (game.width - 48);
                    y = Math.max(TOP_BORDER, -50 - (Math.random() * 200));
                    attempts++;
                } while (attempts < 50 && usedPositions.some(pos => Math.hypot(x - pos.x, y - pos.y) < minDistance));
                usedPositions.push({ x, y });

                // Faster deploy: half the normal delay window, so the swarm floods in quickly.
                const maxDelaySeconds = game.wave;
                const deployDelay = Math.floor(Math.random() * (maxDelaySeconds * 60));

                const subtype = pickEnemySubtype(spawnWeights);
                const enemy = new Enemy(x, y, 'normal', deployDelay, null, false, subtype);
                enemy.isSwarm = true;
                game.enemies.push(enemy);
            }
        }

        // Display names/taglines for the boss intro screen. Purely cosmetic - bossType
        // numbers are still what drives actual behavior.
        const BOSS_INFO = {
            0: { name: 'SPLITTER', tagline: 'Fractures its own fire on approach.' },
            1: { name: 'WARDEN', tagline: 'Blinks across the field between strikes.' },
            2: { name: 'PRISM', tagline: 'Charges devastating bouncing beams.' },
            3: { name: 'VANGUARD', tagline: 'Leads an escort of aliens into battle.' },
            4: { name: 'BASTION', tagline: 'Heavily armored. Relentless spray fire.' },
            swarm: { name: 'THE SWARM', tagline: 'Overwhelming numbers. No mercy.' }
        };

        // Renders a boss's pixel-art portrait onto a given <canvas>, reusing the same
        // sprite data the in-game boss draws with.
        function renderBossPortrait(canvas, bossType, scale = 6) {
            const sprite = bossSprites[bossType];
            const pattern = sprite.patterns[0];
            const colors = sprite.colors;
            canvas.width = pattern[0].length * scale;
            canvas.height = pattern.length * scale;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let y = 0; y < pattern.length; y++) {
                for (let x = 0; x < pattern[y].length; x++) {
                    const ch = pattern[y][x];
                    if (ch !== ' ' && colors[ch]) {
                        ctx.fillStyle = colors[ch];
                        ctx.fillRect(x * scale, y * scale, scale, scale);
                    }
                }
            }
        }

        // Boss sprite patterns, hoisted to module scope so they aren't rebuilt every frame.
        const bossSprites = [
        {
            patterns: [
[
                    '                       RR                       ',
                    '            RRR      RRRRRR      RRR            ',
                    '            RRRRRRRRRRRRRRRRRRRRRRRR            ',
                    '           RRRRRRRRRRRRRKBRRRRRRRRRRR           ',
                    '           RRRRRRBBBBBBBKKBBBBBRRRRRR           ',
                    '    RRRRRRRRRRBBBBBBBBBBBKKBBBBBBBRRRRRRRRRR    ',
                    '    RRRRRRRRBBBBBBBBBBBBBKKBBBBBBBBBRRRRRRRR    ',
                    '    RRRRRRRBBBBBBBBBBBBBKKBBBBBBBBBBBBRRRRRR    ',
                    '    RRRRRBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBRRRRR    ',
                    '     RRRRBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBBRRR     ',
                    '    RRRRBBBBBBBBBBBBBBKBBBBBBBBBBBBBBBBBRRRR    ',
                    ' RRRRRRBBBBBBBBBBOOOOBKKBBBOYYYRBBBBBBBBBRRRRRR ',
                    'RRRRRRRBBBBBBBBBOOOOOOBKBRYYYYYYOBBBBBBBBBRRRRRR',
                    'RRRRRRBBBBBBBBBOOOOOOOOBBYYYYYYYYOBBBBBBBBRRRRRR',
                    ' RRRRRBBBBBBBBOOOOBBOOOOOYYYBBYYYYBBBBBBBBRRRRR ',
                    '  RRRRBBBBBBBBOOOBKKBOOOYYYBKKBYYYBBBBBBBBRRRR  ',
                    '  RRRRBBBBBBBBOOOBKKBOOOYYYBKKBYYYBBBBBBBBRRRR  ',
                    ' RRRRRBBBBBBBBOOOOBBOOOOYYYYBBYYYYBBBBBBBBRRRRR ',
                    'RRRRRRBBBBBBBBBOOOOOOOOBBYYYYYYYYOBBBBBBBBRRRRRR',
                    'RRRRRRRBBBBBBBBOOOOOOOOKBOYYYYYYYBBBBBBBBBRRRRRR',
                    ' RRRRRRBBBBBBBBBROOOOOKKBBOYYYYOBBBBBBBBBRRRRRR ',
                    '    RRRRBBBBBBBBBBBBBBKBBBBBBBBBBBBBBBBBBRRR    ',
                    '     RRRBBBBBBBBBBBBBBKBBBBBBBBBBBBBBBBBRRR     ',
                    '    RRRRRBBBBBBBBBBBBBKKKBBBBBBBBBBBBBBRRRRR    ',
                    '    RRRRRRBBBBBBBBBBBBBBKKBBBBBBBBBBBBRRRRRR    ',
                    '    RRRRRRRRBBBBBBBBBBBBBKKBBBBBBBBBBRRRRRRR    ',
                    '    RRRRRRRRRBBBBBBBBBBBBKKBBBBBBBBRRRRRRRRR    ',
                    '           RRRRRBBBBBBBBKKBBBBBBRRRRR           ',
                    '           RRRRRRRRRRRRBKBRRRRRRRRRRR           ',
                    '            RRRRRRRRRRRRBRRRRRRRRRRR            ',
                    '            RRR      RRRRRR      RRR            ',
                    '                      RRRR                      '
                ],
[
                    '                       RR                       ',
                    '            RRR      RRRRRR      RRR            ',
                    '            RRRRRRRRRRRRRRRRRRRRRRRR            ',
                    '           RRRRRRRRRRRRRBKBRRRRRRRRRR           ',
                    '           RRRRBBBBBBBBBKKBBBBBBBRRRR           ',
                    '    RRRRRRRRBBBBBBBBBBKKKBBBBBBBBBBBRRRRRRRR    ',
                    '    RRRRRRBBBBBBBBBBBBKBBBBBBBBBBBBBBBRRRRRR    ',
                    '    RRRRBBBBBBBBBBBBBBKBBBBBBBBBBBBBBBBBRRRR    ',
                    '    RRRBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBBBRRR    ',
                    '     RBBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBBBBR     ',
                    '    RBBBBBBBBBBROORBBBBKKBBBBOOOOBBBBBBBBBBR    ',
                    ' RRRRBBBBBBBBROOOOOORBBBKKBOYYYYYYOBBBBBBBBRRRR ',
                    'RRRRBBBBBBBBROOOOOOOORBBBKBYYYYYYYYOBBBBBBBBRRRR',
                    'RRRRBBBBBBBBOOOOOOOOOOBBBKYYYYYYYYYYBBBBBBBBRRRR',
                    ' RRRBBBBBBBROOOOBBOOOORBKOYYYYBBYYYYOBBBBBBBRRR ',
                    '  RRBBBBBBBOOOOBKKBOOOOKKOYYYBKKBYYYOBBBBBBBRR  ',
                    '  RRBBBBBBBOOOOBKKBOOOOKBOYYYBKKBYYYOBBBBBBBRR  ',
                    ' RRRBBBBBBBROOOOBBOOOOBKBOYYYYBBYYYYOBBBBBBBRRR ',
                    'RRRRBBBBBBBBOOOOOOOOOOKKBBYYYYYYYYYYBBBBBBBBRRRR',
                    'RRRRBBBBBBBBROOOOOOOORKKBBOYYYYYYYYOBBBBBBBBRRRR',
                    ' RRRRBBBBBBBBROOOOOORBBKKBBOYYYYYYOBBBBBBBBRRRR ',
                    '    RBBBBBBBBBBROORBBBBBKKBBBOOOOBBBBBBBBBBR    ',
                    '     RBBBBBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBR     ',
                    '    RRRBBBBBBBBBBBBBBBBBBKBBBBBBBBBBBBBBBRRR    ',
                    '    RRRRBBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBRRRR    ',
                    '    RRRRRRBBBBBBBBBBBBBKKBBBBBBBBBBBBBRRRRRR    ',
                    '    RRRRRRRBBBBBBBBBBBBKKBBBBBBBBBBBBRRRRRRR    ',
                    '           RRRBBBBBBBBKKBBBBBBBBBBRRR           ',
                    '           RRRRRRRRRRBKBRRRRRRRRRRRRR           ',
                    '            RRRRRRRRRRBRRRRRRRRRRRRR            ',
                    '            RRR      RRRRRR      RRR            ',
                    '                      RRRR                      '
                ]
            ],
            colors: { 'R': '#ff3d1a', 'B': '#992200', 'O': '#ffaa00', 'Y': '#fff23c', 'K': '#1a0500' }
        },
        {
            patterns: [
[
                    '                                                ',
                    '                 PPPPP         PP               ',
                    '                       RR      PPPP             ',
                    '                      RRRR                      ',
                    '        P            RRRRRR                     ',
                    '       PP           RRRRRRRR                    ',
                    '      PP           RRRRRBRRRR                   ',
                    '      P           RRRRRBBBRRRR           PP     ',
                    '                 RRRRRBBBBBRRRR           PP    ',
                    '                RRRRRBBBBBBBRRRR           PP   ',
                    '               RRRRRBBBBPBBBBRRRRR              ',
                    '              RRRRRBBBBWWBBBBBRRRRR             ',
                    '     BBBBBB  RRRRRBBBBPWWWBBBBBRRRRR BBBBBB     ',
                    '  P  BCCCCBRRRRRRBBBBPWWWWPBBBBBRRRRRBCCCCB     ',
                    ' PP  CCCCCCRRRRRBBBBBWWBBWWPBBBBBRRRRCCCCCC     ',
                    ' PP  CCCCCC RRRBBBBBWWBKKBWWBBBBBRRR CCCCCC     ',
                    '     CCCCCC   RRRBBBWWBKKBWWPBBBRRR  CCCCCC  PP ',
                    '     BCCCCB    RRRBKPWWBBWWPBBRRRR   BCCCCB  PP ',
                    '     BBBBBB     RRRBBPWWWWWBBRRR     BBBBBB  P  ',
                    '                 RRRBBWWWWBBRRR                 ',
                    '                  RRRBBWWPKRRR                  ',
                    '                   RRBKPPBBRRR                  ',
                    '   PP              RRRBBBBRRR                   ',
                    '    PP              RRBBBBRRR                   ',
                    '     PP             RRRBBRRR             P      ',
                    '                     RRBBRRR            PP      ',
                    '                     RRRRRR            PP       ',
                    '                      RRRR             P        ',
                    '                      RRRR                      ',
                    '             PPPP      RR                       ',
                    '               PP      RR PPPPP                 ',
                    '                                                '
                ],
[
                    '                         P                      ',
                    '                         PPPP                   ',
                    '            PPPP       RR                       ',
                    '           PPP        RRRR                      ',
                    '                     RRRRRR          PP         ',
                    '                    RRRRRRRR          PPP       ',
                    '                   RRRRRBRRRR           P       ',
                    '                  RRRRRBBBRRRR                  ',
                    '    PP           RRRRRBBBBBRRRR                 ',
                    '   PP           RRRRRBBBPBBBRRRR                ',
                    '   PP          RRRRRBBBWWBBBBRRRRR              ',
                    '              RRRRRBBBPWWWBBBBRRRRR             ',
                    '     BBCCBB  RRRRRBBBPWWWWPBBBBRRRRR BBCCBB  P  ',
                    '     BCCCCCRRRRRRBBBBWWWWWWPBBBBRRRRRBCCCCC  P  ',
                    '     CCCCCCPRRRRBBBBWWWBBWWWBBBBBRRRRCCCCCCC PP ',
                    '     CCCCCCCRRRBBBBWWWBKKBWWWBBBBRRR CCCCCCC    ',
                    '     CCCCCCC  RRRBBWWWBKKBWWWBBBRRR  CCCCCCC    ',
                    ' PP  CCCCCC    RRRBBWWWBBWWWBBRRRR   CCCCCC     ',
                    '  P  BCCCCB     RRRBPWWWWWWPBRRR     BCCCCB     ',
                    '  PP             RRRBPWWWWPBRRR                 ',
                    '                  RRRBWWWWBBRR                  ',
                    '                   RRBBWWBBRRR             PP   ',
                    '                   RRRKPPKRRR              PP   ',
                    '                    RRBBBBRRR             PP    ',
                    '                    RRRBBRRR                    ',
                    '       P             RRBBRRR                    ',
                    '       PPP           RRRRRR                     ',
                    '         PP           RRRR                      ',
                    '                      RRRR        PPP           ',
                    '                       RR       PPPP            ',
                    '                   PPPPRR                       ',
                    '                                                '
                ]
            ],
            colors: { 'R': '#ff0060', 'B': '#3a0033', 'W': '#ffffff', 'P': '#ff66cc', 'C': '#33ffee', 'K': '#120010' }
        },
        {
            patterns: [
[
                    '             RRRRRRRRRRRRRRRRRRRRRR             ',
                    '            RRRRRRRRRRRRRRRRRRRRRRRR            ',
                    '            RRRRRRRRRRRRRRRRRRRRRRRRR           ',
                    '           RRRRRBBBBBBBBBBBBBBBBRRRRR           ',
                    '          RRRRRRBBBBBBBBBBBBBBBBBRRRRR          ',
                    '          RRRRRBBBBBBBBBBBBBBBBBBRRRRR          ',
                    '         RRRRRBBBBBBBBBBBBBBBBBBBBRRRRR         ',
                    '         RRRRRBBBBBBBBYYYYBBBBBBBBRRRRR         ',
                    '        RRRRRBBBBBBBYYYYYYYBBBBBBBBRRRRR        ',
                    '        RRRRRBBBBBBYYYYYYYYYYBBBBBBRRRRRR       ',
                    '       RRRRRBBBBBYYYYGYGGGGYYYYBBBBBRRRRR       ',
                    '      RRRRRRBBBBYYYYGGGGGGGGYYYYBBBBBRRRRR      ',
                    '      RRRRRBBBBYYYYGGGGGGGGGYYYYBBBBBRRRRR      ',
                    '     RRRRRBBBBBBYYYGGGGWWGGGGYYYBBBBBBRRRRR     ',
                    '  RRRRRRRRBBBBBYYYGGGGWWWWGGGGYYBBBBBBRRRRRRRR  ',
                    'RRRRRRRRRBBBBBBBYYGGGWWKKWWGGGYYBBBBBBBRRRRRRRRR',
                    'RRRRRRRRRBBBBBBBYYGGGWWKKWWGGGYYBBBBBBBRRRRRRRRR',
                    '  RRRRRRRRBBBBBBYYGGGGWWWWGGGGYYYBBBBBRRRRRRRRR ',
                    '     RRRRRBBBBBBYYYGGGGWWGGGGYYYBBBBBBRRRRR     ',
                    '      RRRRRBBBBBYYYYGGGGGGGGGYYYYBBBBRRRRR      ',
                    '      RRRRRRBBBBYYYYGGGGGGGGYYYYBBBBBRRRRR      ',
                    '       RRRRRBBBBBYYYYGGGGYGYYYYBBBBBRRRRR       ',
                    '       RRRRRRBBBBBBYYYYYYYYYYBBBBBBRRRRRR       ',
                    '        RRRRRBBBBBBBBYYYYYYYBBBBBBBRRRRR        ',
                    '         RRRRRBBBBBBBBYYYYBBBBBBBBRRRRRR        ',
                    '         RRRRRRBBBBBBBBBBBBBBBBBBBRRRRR         ',
                    '          RRRRRBBBBBBBBBBBBBBBBBBRRRRR          ',
                    '          RRRRRRBBBBBBBBBBBBBBBBBRRRRR          ',
                    '           RRRRRBBBBBBBBBBBBBBBBRRRRR           ',
                    '            RRRRRRRRRRRRRRRRRRRRRRRRR           ',
                    '            RRRRRRRRRRRRRRRRRRRRRRRR            ',
                    '             RRRRRRRRRRRRRRRRRRRRRRR            '
                ],
[
                    '              RRRRRRRRRRRRRRRRRRRRRRR           ',
                    '             RRRRRRRRRRRRRRRRRRRRRRRR           ',
                    '            RRRRRRBBBRRRRRRRRRRRRRRRRR          ',
                    '            RRRRRBBBBBBBBBBBRRRRRRRRRR          ',
                    '           RRRRRRBBBBBBBBBBBBBBBBRRRRR          ',
                    '          RRRRRRBBBBBBBBBBBBBBBBBBRRRRR         ',
                    '         RRRRRRBBBBBBBBBYYBBBBBBBBRRRRRR        ',
                    '        RRRRRRBBBBBBBYYYYYYYBBBBBBBRRRRR        ',
                    '        RRRRRBBBBBBYYYYYYYYYYBBBBBBRRRRR        ',
                    '       RRRRRRBBBBYYYYYYYYYYYYYBBBBBBRRRR        ',
                    '      RRRRRRBBBBYYYYGGGGGGGGYYYBBBBBRRRRR       ',
                    '     RRRRRRBBBBBYYYYGGGGGGGGGYYYYBBBRRRRR       ',
                    '   RRRRRRRBBBBBYYYYGGGGWWGGGGYYYYBBBBRRRRR      ',
                    'RRRRRRRRRBBBBBBYYYGGGWWWWWWGGGYYYBBBBRRRRR      ',
                    'RRRRRRRRRBBBBBBYYYGGGWWGGWWGGGYYYBBBBBRRRR      ',
                    '  RRRRRRRRBBBBBYYGGGWWGKKGWWGGGYYBBBBBRRRRRR    ',
                    '     RRRRRBBBBBYYGGGWWGKKGWWGGGYYBBBBBRRRRRRRR  ',
                    '      RRRRBBBBBYYYGGGWWGGWWGGGYYYBBBBBBRRRRRRRRR',
                    '      RRRRRBBBBYYYGGGWWWWWWGGGYYYBBBBBBRRRRRRRRR',
                    '      RRRRRBBBBYYYYGGGGWWGGGGYYYYBBBBBRRRRRRR   ',
                    '       RRRRRBBBYYYYGGGGGGGGGYYYYBBBBBRRRRRR     ',
                    '       RRRRRBBBBBYYYGGGGGGGGYYYYBBBBRRRRRR      ',
                    '        RRRRBBBBBBYYYYYYYYYYYYYBBBBRRRRRR       ',
                    '        RRRRRBBBBBBYYYYYYYYYYBBBBBBRRRRRR       ',
                    '        RRRRRBBBBBBBYYYYYYYBBBBBBBRRRRRR        ',
                    '        RRRRRRBBBBBBBBYYBBBBBBBBBRRRRRR         ',
                    '         RRRRRBBBBBBBBBBBBBBBBBBRRRRRR          ',
                    '          RRRRRBBBBBBBBBBBBBBBBRRRRRR           ',
                    '          RRRRRRRRRRBBBBBBBBBBBRRRRRR           ',
                    '          RRRRRRRRRRRRRRRRRBBBRRRRRR            ',
                    '           RRRRRRRRRRRRRRRRRRRRRRRR             ',
                    '           RRRRRRRRRRRRRRRRRRRRRRR              '
                ]
            ],
            colors: { 'R': '#ff5522', 'B': '#5a1400', 'Y': '#2dd15c', 'G': '#9dffb8', 'W': '#eaffff', 'K': '#0a0500' }
        },
        {
            patterns: [
[
                    '                                                ',
                    '                                                ',
                    '                                                ',
                    '                       BB                       ',
                    '                       BB                       ',
                    '                      BBBB                      ',
                    '                     BBBRBB                     ',
                    '                     YYYYYYB                    ',
                    '                    BYYYYYYB                    ',
                    '                   BBYYYYYYBB                   ',
                    '                  BBBYYYYYYBBB                  ',
                    '                  BBBYYYYYYBBBB                 ',
                    '                 BBBRYYYYYYRBBB                 ',
                    '                BBBRRYYYYYYRRBBB                ',
                    '                BBBRRYYMMYYRRBBBB               ',
                    '             RRRBBBRRYYMMYYRRRBBRRRR            ',
                    '         RRRRRRBBBBRRYYYYYYRRBBBBRRRRRR         ',
                    '     RRRRRRRBMMMMBBRRYYYYYYRRBBBMMMBBRRRRRR     ',
                    '  RRRRRRBMMMMMMMMBBRRYYYYYYRRBBMMMMMMMMBRRRRRRR ',
                    'RRRRRBMMMMMMMMMMMBBRRYYYYYYRRBBMMMMMMMMMMMBRRRRR',
                    ' RRBCCMMMMMMMMMMMBBBRYYYYYYRRBBMMMMMMMMMMMCCMRRR',
                    ' RRCCCCMMMMMMMBRRBBBRYYYYYYRRBBRRBMMMMMMMCCCCRR ',
                    '  RCCCCMMMMBRRRRRRBBRYYYYYYRBBBRRRRRBBMMMCCCCR  ',
                    '   RCCMBBRRRRRRRRBBBBYYYYYYRBBBRRRRRRRRRBMCCRR  ',
                    '   RRRRRRRRRRR    BBBYYYYYYBBBB   RRRRRRRRRRR   ',
                    '    RRRRRRR       BBBBBRRBBBBB       RRRRRRR    ',
                    '    RRRR            BBBBBBBB            RRRR    ',
                    '                     BBBBBB                     ',
                    '                       BB                       ',
                    '                                                ',
                    '                                                ',
                    '                                                '
                ],
[
                    '                                                ',
                    '                                                ',
                    '                                                ',
                    '                       BB                       ',
                    '                       BB                       ',
                    '                      BBBB                      ',
                    '                     BBBRBB                     ',
                    '                     YYYYYYR                    ',
                    '                    BYYYYYYB                    ',
                    '                   BBYYYYYYBB                   ',
                    '                  BBBYYYYYYBBB                  ',
                    '                  BBBYYYYYYRBBB                 ',
                    '                 BBBRYYYYYYRBBB                 ',
                    '                BBBBRYYYYYYRRBBB                ',
                    '                BBBRRYYKKYYRRBBBB               ',
                    '             RRRBBBRRYYKKYYRRRBBRRRR            ',
                    '         RRRRRRBBBBRRYYYYYYRRBBBBRRRRRR         ',
                    '     RRRRRRRBMMMMBBRRYYYYYYRRBBBMMMBBRRRRRR     ',
                    '  RRRRRRBMMMMMMMMBBRRYYYYYYRRBBMMMMMMMMBRRRRRRR ',
                    'RRRRRMMMMMMMMMMMMBBRRYYYYYYRRBBMMMMMMMMMMMMRRRRR',
                    ' RRCCCCMMMMMMMMMMBBBRYYYYYYRRBBMMMMMMMMMMCCCCRRR',
                    ' RRCCCCMMMMMMMBRRBBBRYYYYYYRRBBRRBMMMMMMMCCCCRR ',
                    '  RCCCCMMMMBRRRRRRBBRYYYYYYRBBBRRRRRBBMMMCCCCR  ',
                    '   CCCCBBRRRRRRRRBBBRYYYYYYRBBBRRRRRRRRRBCCCCR  ',
                    '   RRRRRRRRRRR    BBBYYYYYYBBBB   RRRRRRRRRRR   ',
                    '    RRRRRRR       BBBBBRRBBBBB       RRRRRRR    ',
                    '    RRRR            BBBBBBBB            RRRR    ',
                    '                     BBBBBB                     ',
                    '                       BB                       ',
                    '                                                ',
                    '                                                ',
                    '                                                '
                ]
            ],
            colors: { 'R': '#cc1122', 'B': '#470a12', 'Y': '#ffcc33', 'M': '#2a2a33', 'C': '#66ddff', 'K': '#0d0206' }
        },
        {
            patterns: [
[
                    '                                                ',
                    '                                                ',
                    '                                                ',
                    '                                                ',
                    '      RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR      ',
                    '     RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR     ',
                    '    RRBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBR    ',
                    '   RMKBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBKMR   ',
                    '  RRKKBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMKKRR  ',
                    '  RBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRMBBMMMMPPPPPPPPPPPPPPPPPPPPPPPPPPPPBMMMBBMRR ',
                    ' RMKBBMMMMPPPPPPPPPPPPPPPPPPPPPPPPPPPPBMMMBBKMR ',
                    ' RMKBBMMMMPPPPPPPPPPPPPPPPPPPPPPPPPPPPBMMMBBKMR ',
                    ' RRMBBMMMMPPPPPPPPPPPPPPPPPPPPPPPPPPPPBMMMBBMRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBBRR ',
                    '  RBKKBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBKKBRR ',
                    '   RKKBBBMMKKKKKMMMMMMMMMMMMMMMMKKKKKMMBBBKKRR  ',
                    '    RBBBBBBKKKKKMBBBBBBBBBBBBBBBKKKKKMBBBBBRR   ',
                    '     RBBBBBKKKKKMBBBBBBBBBBBBBBBKKKKKMBBBBRR    ',
                    '      RRRRRKKKKKBRRRRRRRRRRRRRRRKKKKKBRRRRR     ',
                    '       RRRRKKKKKRRRRRRRRRRRRRRRRKKKKKRRRRR      ',
                    '           KKKKK                KKKKK           ',
                    '           KKKKK                KKKKK           ',
                    '           KBBBK                KBBBK           '
                ],
[
                    '                                                ',
                    '                                                ',
                    '                                                ',
                    '                                                ',
                    '      RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR      ',
                    '     RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR     ',
                    '    RRBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBR    ',
                    '   RMKBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBKMR   ',
                    '  RRKKBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMKKRR  ',
                    '  RBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMBBBBBBBBBBBBBBBBBBBBBBBBBBBBMMMMBBBRR ',
                    ' RRMBBMMMMPPPPPPPPPPPPPPPPPPPPPPPPPPPPBMMMBBMRR ',
                    ' RMKBBMMMMPPPPPPPPPPPPPPPPPPPPPPPPPPPPBMMMBBKMR ',
                    ' RMKBBMMMMPPPPPPPPPPPPPPPPPPPPPPPPPPPPBMMMBBKMR ',
                    ' RRMBBMMMMPPPPPPPPPPPPPPPPPPPPPPPPPPPPBMMMBBMRR ',
                    ' RRBBBMMMMBBBBBBBBBBBBBBBBBBBBBBBBBBBBMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBRR ',
                    ' RRBBBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBBBRR ',
                    '  RBKKBBMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMBBKKBRR ',
                    '   RKKBBBMMKKKKKMMMMMMMMMMMMMMMMKKKKKMMBBBKKRR  ',
                    '    RBBBBBBKKKKKMBBBBBBBBBBBBBBBKKKKKMBBBBBRR   ',
                    '     RBBBBBKKKKKMBBBBBBBBBBBBBBBKKKKKMBBBBRR    ',
                    '      RRRRRKKKKKBRRRRRRRRRRRRRRRKKKKKBRRRRR     ',
                    '       RRRRKKKKKRRRRRRRRRRRRRRRRKKKKKRRRRR      ',
                    '           KKKKK                KKKKK           ',
                    '           KKKKK                KKKKK           ',
                    '           KKKKK                KKKKK           '
                ]
            ],
            colors: { 'R': '#ff2255', 'B': '#3a0a44', 'M': '#1c0a22', 'P': '#ff6ea8', 'K': '#050208', 'W': '#ffd9e8' }
        }
        ];

        // Base alien sprite patterns, hoisted to module scope so they aren't rebuilt every frame.
        const alienSprites = [
            {
                patterns: [
                    [
                        '  AAAAAAAA  ',
                        ' AAAAAAAAAA ',
                        'AABBAAAABBAA',
                        'AABBAAAABBAA',
                        'AAAAAAAAAAAA',
                        ' AACC##CCAA ',
                        'AA  CCCC  AA',
                        '  AA    AA  '
                    ],
                    [
                        '  AAAAAAAA  ',
                        ' AAAAAAAAAA ',
                        'AABBAAAABBAA',
                        'AABBAAAABBAA',
                        'AAAAAAAAAAAA',
                        ' AACC##CCAA ',
                        '  AACCCCAA  ',
                        ' AA      AA '
                    ],
                    [
                        '  AAAAAAAA  ',
                        ' AAAAAAAAAA ',
                        'AAABBAABBAAA',
                        'AAABBAABBAAA',
                        'AAAAAAAAAAAA',
                        ' AACC##CCAA ',
                        'AA  CCCC  AA',
                        '  AA    AA  '
                    ],
                    [
                        '  AAAAAAAA  ',
                        ' AAAAAAAAAA ',
                        'ABBAAAAABBAA',
                        'ABBAAAAABBAA',
                        'AAAAAAAAAAAA',
                        ' AACC##CCAA ',
                        'AA  CCCC  AA',
                        '  AA    AA  '
                    ]
                ],
                colors: {
                    'A': '#ff4400', 'B': '#ff0000', 'C': '#ffaa00', '#': '#660000'
                }
            },
            {
                patterns: [
                    [
                        ' CC AAAAAA CC',
                        'CCC AAAAAA CCC',
                        ' CC AABBAA CC',
                        '   AABBBBAA   ',
                        '  AABBBBBBAA  ',
                        ' AABB####BBAA ',
                        'AA  B####B  AA',
                        ' A  BBBBBB  A '
                    ],
                    [
                        'CC  AAAAAA  CC',
                        ' CC AAAAAA CC ',
                        '  CCAABBAACC  ',
                        '   AABBBBAA   ',
                        '  AABBBBBBAA  ',
                        ' AABB####BBAA ',
                        'AA  B####B  AA',
                        ' A  BBBBBB  A '
                    ],
                    [
                        '  C AAAAAA C  ',
                        ' CCC AAAAAA CCC ',
                        '  C AABBAA C  ',
                        '   AABBBBAA   ',
                        '  AABBBBBBAA  ',
                        ' AABB####BBAA ',
                        'AA  B####B  AA',
                        ' A  BBBBBB  A '
                    ],
                    [
                        ' CCCAAAAAACCC',
                        'C    AAAAAA    C',
                        ' CC AABBAA CC',
                        '   AABBBBAA   ',
                        '  AABBBBBBAA  ',
                        ' AABB####BBAA ',
                        'AA  B####B  AA',
                        ' A  BBBBBB  A '
                    ]
                ],
                colors: {
                    'A': '#0088ff', 'B': '#004488', 'C': '#44aaff', '#': '#00ffff'
                }
            },
            {
                patterns: [
                    [
                        '  ##AAAA##  ',
                        ' #AAAAAAAA# ',
                        '#AABBCCBBAA#',
                        'AABBCCCCBBAA',
                        'AACCCCCCCCAA',
                        'CCCC####CCCC',
                        'CC CCCCCC CC',
                        'C  CC##CC  C',
                        'C  CCCCCC  C',
                        'CC  CCCC  CC'
                    ],
                    [
                        '  ##AAAA##  ',
                        ' #AAAAAAAA# ',
                        '#AABBCCBBAA#',
                        'AABBCCCCBBAA',
                        'AACCCCCCCCAA',
                        'CCCC####CCCC',
                        ' CCCCCCCCCC ',
                        ' C CC##CC C ',
                        ' C CCCCCC C ',
                        ' CC  CC  CC '
                    ]
                ],
                colors: {
                    'A': '#8844ff', 'B': '#440088', 'C': '#cc88ff', '#': '#ff00ff'
                }
            },
            {
                patterns: [
                    [
                        'F##########F',
                        '#AAAAAAAAAA#',
                        '#ABBCCCCBBA#',
                        'F#ACCCCCCCA#F',
                        'F#ACC##CCA#F',
                        'F#ACCCCCCCA#F',
                        'F#A##CC##A#F',
                        'F##########F',
                        'F  ##FF##  F',
                        ' F #FFFF# F '
                    ],
                    [
                        ' F#########F',
                        '#AAAAAAAAAA#',
                        '#ABBCCCCBBA#',
                        'F#ACCCCCCCA#F',
                        'F#ACC#CCC#A#F',
                        'F#ACCCCCCCA#F',
                        'F#A##CC##A#F',
                        'F##########F',
                        ' F #FFFF# F ',
                        'F  ##FF##  F'
                    ]
                ],
                colors: {
                    'A': '#00aa44', 'B': '#004422', 'C': '#44ff88', '#': '#88ff88', 'F': '#00ffaa'
                }
            },
            {
                patterns: [
                    [
                        '  Y      Y  ',
                        ' YY  EE  YY ',
                        'YYYYLLLLYYYY',
                        'YLLDDDDDDLLY',
                        'YLDD####DDLY',
                        ' LD######DL ',
                        '  DD####DD  ',
                        '   D    D   ',
                        '  H      H  ',
                        '  H      H  '
                    ],
                    [
                        ' Y        Y ',
                        '  YY EE YY  ',
                        'YYYYLLLLYYYY',
                        'YLLDDDDDDLLY',
                        'YLDD####DDLY',
                        ' LD######DL ',
                        '  DD####DD  ',
                        '   D    D   ',
                        '   H    H   ',
                        '  H      H  '
                    ]
                ],
                colors: {
                    'Y': '#ffdd00', 'E': '#ff0000', 'L': '#332200', 'D': '#cc8800', '#': '#ffaa00', 'H': '#664400'
                }
            },
            {
                patterns: [
                    [
                        '  WW    WW  ',
                        ' WWWW  WWWW ',
                        'WWSSWWWWSSWW',
                        'WWSSWWWWSSWW',
                        'WWWWWWWWWWWW',
                        ' WW  WW  WW ',
                        '  W      W  '
                    ],
                    [
                        '  WW    WW  ',
                        ' WWWW  WWWW ',
                        'WWSSWWWWSSWW',
                        'WWSSWWWWSSWW',
                        'WWWWWWWWWWWW',
                        ' W  WW  WW  ',
                        '   W      W '
                    ]
                ],
                colors: {
                    'W': '#eef2ff', 'S': '#8fb8ff'
                }
            },
            {
                patterns: [
                    [
                        '   NN  NN   ',
                        '  NNNNNNNN  ',
                        ' NNTTTTTTNN ',
                        'NNTT####TTNN',
                        'NNTT####TTNN',
                        ' NNTTTTTTNN ',
                        '  NN NN NN  ',
                        ' NN  NN  NN '
                    ],
                    [
                        '   NN  NN   ',
                        '  NNNNNNNN  ',
                        ' NNTTTTTTNN ',
                        'NNTT####TTNN',
                        'NNTT####TTNN',
                        ' NNTTTTTTNN ',
                        ' NN  NN  NN ',
                        '  NN NN NN  '
                    ]
                ],
                colors: {
                    'N': '#00e0d0', 'T': '#00706a', '#': '#7dffee'
                }
            }
        ];

        class Enemy {
            constructor(x, y, type = 'normal', deployDelay = 0, bossType = null, isMiniAlien = false, subtype = 'orange') {
                this.x = x;
                this.y = y;
                this.isMiniAlien = isMiniAlien;
                
                if (isMiniAlien) {
                    this.width = 48 * 0.3;
                    this.height = 32 * 0.3;
                    this.type = 'normal';
                    this.health = 1;
                    this.maxHealth = 1;
                    this.speed = 0.5 + (game.wave * 0.1);
                    this.spriteType = Math.floor(Math.random() * 5);
                    this.pointValue = 5;
                    this.deployDelay = 0;
                    this.deployed = true;
                    this.animFrame = 0;
                    this.animTimer = 0;
                } else {
                    this.width = type === 'boss' ? 96 : 48;
                    this.height = type === 'boss' ? 64 : 32;
                    this.type = type;
                    this.deployDelay = deployDelay;
                    this.deployed = deployDelay === 0;
                    this.animFrame = 0;
                    this.animTimer = 0;
                    this.direction = 1;
                    this.dropDistance = type === 'boss' ? 28 : 20;
                    this.canShoot = false;
                    this.alienFireRate = 0;
                    this.lastAlienShot = 0;
                    
                    if (type === 'boss') {
                        this.bossType = bossType !== null ? bossType : Math.floor(Math.random() * 4);
                        this.spriteType = this.bossType;
                        this.pointValue = 100;
                        
                        this.health = game.wave * 2;
                        this.maxHealth = this.health;
                        
                        const bossWaveNumber = Math.floor(game.wave / 5);
                        const abilitySpeedBoost = bossWaveNumber * 0.25 * 1000;
                        
                        switch (this.bossType) {
                            case 0:
                                this.speed = (1 + (game.wave * 0.2)) * 0.75;
                                this.lastSpawn = Date.now();
                                this.spawnRate = Math.max(1000, 5000 - abilitySpeedBoost);
                                break;
                            case 1:
                                this.speed = 1 + (game.wave * 0.2);
                                this.lastShot = Date.now();
                                this.fireRate = Math.max(500, 2000 - abilitySpeedBoost);
                                this.lastTeleport = Date.now();
                                // Teleports 50% more often (interval divided by 1.5)
                                this.teleportRate = Math.max(1333, Math.floor((10000 - abilitySpeedBoost) / 1.5));
                                break;
                            case 2:
                                this.speed = 1 + (game.wave * 0.2);
                                this.lastBeamTime = 0;
                                this.nextBeamTime = Date.now() + 10000;
                                this.beamCharging = false;
                                this.beamFiring = false;
                                this.beamStartTime = 0;
                                this.beamAngles = [];
                                this.beamsToFire = Math.max(2, bossWaveNumber * 2);
                                this.currentBeamIndex = 0;
                                this.beamX = 0;
                                this.beamY = 0;
                                this.frozen = false;
                                break;
                            case 3:
                                this.speed = 1 + (game.wave * 0.2);
                                this.minions = [];
                                const minionCount = Math.max(1, Math.floor((game.wave * 2) / 5));
                                for (let i = 0; i < minionCount; i++) {
                                    const minionOffset = (i - (minionCount - 1) / 2) * 50;
                                    const minionSubtypes = ['orange', 'green', 'blue', 'yellow'];
                                    this.minions.push({
                                        x: this.x + minionOffset,
                                        y: this.y + 20,
                                        width: 24,
                                        height: 16,
                                        subtype: minionSubtypes[Math.floor(Math.random() * minionSubtypes.length)],
                                        health: 2,
                                        speedMult: 1.2,
                                        lastShot: Date.now(),
                                        fireRate: Math.max(500, 1000 - abilitySpeedBoost),
                                        targetX: game.player.x,
                                        targetY: game.player.y,
                                        targetTime: Date.now()
                                    });
                                }
                                break;
                            case 4:
                                // Tank: triple health, decreasing machine-gun-spray interval per wave.
                                this.health = game.wave * 2 * 3;
                                this.maxHealth = this.health;
                                this.speed = (1 + (game.wave * 0.2)) * 0.6;
                                this.lastSpray = Date.now();
                                this.sprayInterval = Math.max(400, 2200 - game.wave * 60);
                                this.sprayBulletsPerBurst = 5;
                                break;
                        }
                    } else {
                        this.subtype = subtype || 'orange';
                        const stats = getEnemyStatsForSubtype(this.subtype, game.wave, getTotalPermanentUpgrades());
                        this.health = stats.health;
                        this.maxHealth = this.health;
                        this.coinValue = stats.coins;
                        this.speed = 0.5 + (game.wave * 0.1);
                        // Each subtype has its own dedicated sprite index (fixed, not random) -
                        // orange=0, blue=1, pink=2, green=3, yellow=4, white=5, cyan=6.
                        const SUBTYPE_SPRITE_INDEX = { orange: 0, blue: 1, pink: 2, green: 3, yellow: 4, white: 5, cyan: 6 };
                        this.spriteType = SUBTYPE_SPRITE_INDEX[this.subtype] !== undefined ? SUBTYPE_SPRITE_INDEX[this.subtype] : 0;
                        this.pointValue = stats.pointValue;
                        // Slight per-instance variation: which 2 frames this alien cycles through,
                        // and (for orange/blue/green) a randomized accent color.
                        this.frameChoiceA = 0;
                        const framePoolSize = (this.subtype === 'orange' || this.subtype === 'blue') ? 4 : 2;
                        this.frameChoiceB = 1 + Math.floor(Math.random() * (framePoolSize - 1));
                        this.scaleJitter = 0.94 + Math.random() * 0.12;
                        if (this.subtype === 'orange') {
                            const eyeColors = ['#ff0000', '#ff3355', '#ffaa00', '#ff6600'];
                            this.accentColor = eyeColors[Math.floor(Math.random() * eyeColors.length)];
                        } else if (this.subtype === 'blue') {
                            const grillColors = ['#00ffff', '#66ddff', '#2299ff', '#00ccaa'];
                            this.accentColor = grillColors[Math.floor(Math.random() * grillColors.length)];
                        } else if (this.subtype === 'green') {
                            const greenShades = ['#00aa44', '#22cc55', '#118833', '#33bb66'];
                            this.accentColor = greenShades[Math.floor(Math.random() * greenShades.length)];
                        }

                        // Per-subtype movement state
                        this.moveTimer = 0;
                        this.moveHeading = 1; // 1 = right, -1 = left
                        if (this.subtype === 'green' || this.subtype === 'blue') {
                            this.movePhase = 'down';
                            this.phaseTimer = 30 + Math.floor(Math.random() * 30);
                            this.moveHeading = Math.random() < 0.5 ? -1 : 1;
                            this.curveT = 0;
                        } else if (this.subtype === 'yellow') {
                            this.sineBaseX = x;
                            this.sineAmplitude = 60 + Math.random() * 45; // increased amplitude: swings further side to side
                            this.sineFreq = 0.03 + Math.random() * 0.015;
                            this.sinePhase = Math.random() * Math.PI * 2;
                        } else if (this.subtype === 'white') {
                            this.zigTimer = 0;
                            this.moveHeading = Math.random() < 0.5 ? -1 : 1;
                        } else if (this.subtype === 'cyan') {
                            this.dashState = 'hover';
                            this.dashTimer = 60 + Math.floor(Math.random() * 40);
                            this.dashTargetX = x;
                        }
                    }
                }
            }

            update() {
                if (!this.deployed) {
                    this.deployDelay--;
                    if (this.deployDelay <= 0) {
                        this.deployed = true;
                    }
                    return;
                }
                
                this.animTimer++;
                if (this.animTimer % 30 === 0) {
                    if (this.frameChoiceA !== undefined && this.frameChoiceB !== undefined) {
                        this.animFrame = (this.animFrame === this.frameChoiceA) ? this.frameChoiceB : this.frameChoiceA;
                    } else {
                        this.animFrame = (this.animFrame + 1) % 2;
                    }
                }
                
                if (this.type === 'boss') {
                    this.updateBoss();
                } else {
                    this.updateBaseAlienMovement();
                    if (this.canShoot && !this.isMiniAlien) {
                        const now = Date.now();
                        if (now - this.lastAlienShot > this.alienFireRate) {
                            this.lastAlienShot = now;
                            if (this.subtype === 'white' && this.groupLeader) {
                                // Volley Sync: group members don't fire on their own timer -
                                // the group leader triggers a synchronized ripple for everyone.
                            } else if (this.subtype === 'white' && !this.groupLeader) {
                                fireWhiteVolley(this);
                            } else {
                                fireBaseAlienBullet(this);
                            }
                        }
                    }
                }
            }

            // Distinct per-subtype movement patterns for the base aliens.
            updateBaseAlienMovement() {
                const subtype = this.subtype || 'orange';
                this.moveTimer++;

                if (subtype === 'green' || subtype === 'blue') {
                    this.phaseTimer--;
                    if (this.phaseTimer <= 0) {
                        if (this.movePhase === 'down') {
                            this.movePhase = 'turn';
                            this.phaseTimer = 24 + Math.floor(Math.random() * 16);
                            this.curveT = 0;
                        } else {
                            this.movePhase = 'down';
                            this.phaseTimer = 30 + Math.floor(Math.random() * 30);
                            this.moveHeading = Math.random() < 0.5 ? -1 : 1;
                        }
                    }
                    if (this.movePhase === 'down') {
                        this.y += this.speed;
                    } else if (subtype === 'green') {
                        // Sharp angular turn (increased amplitude for a wider side-to-side swing)
                        this.x += this.moveHeading * this.speed * 2.4;
                        this.y += this.speed * 0.4;
                    } else {
                        // Blue: smooth curved turn using an eased sine sweep (increased amplitude)
                        this.curveT += 0.06;
                        const ease = Math.sin(this.curveT);
                        this.x += this.moveHeading * this.speed * 2.4 * Math.max(0, ease);
                        this.y += this.speed * 0.6;
                    }
                    this.x = Math.max(0, Math.min(game.width - this.width, this.x));
                } else if (subtype === 'yellow') {
                    this.y += this.speed;
                    const prevX = this.x;
                    this.x = this.sineBaseX + Math.sin(this.moveTimer * this.sineFreq + this.sinePhase) * this.sineAmplitude;
                    this.x = Math.max(0, Math.min(game.width - this.width, this.x));
                    const dx = this.x - prevX, dy = this.speed;
                    this.facingAngle = Math.atan2(dy, dx);
                    const mag = Math.hypot(dx, dy) || 1;
                    this.fireVx = (dx / mag) * 3;
                    this.fireVy = (dy / mag) * 3;
                } else if (subtype === 'pink') {
                    let nearest = null, nearestDist = Infinity;
                    for (const other of game.enemies) {
                        if (other === this || other.type === 'boss' || !other.deployed) continue;
                        const d = Math.hypot(other.x - this.x, other.y - this.y);
                        if (d < nearestDist) { nearestDist = d; nearest = other; }
                    }
                    if (nearest) {
                        const dx = (nearest.prevX !== undefined) ? (nearest.x - nearest.prevX) : 0;
                        const dy = (nearest.prevY !== undefined) ? (nearest.y - nearest.prevY) : this.speed;
                        this.x += dx;
                        this.y += dy || this.speed;
                    } else {
                        this.y += this.speed;
                    }
                } else if (subtype === 'white') {
                    if (this.groupLeader) {
                        // Group member: don't compute independent movement - just ride along
                        // with the leader's position so the whole group moves as one unit.
                        this.x = this.groupLeader.x + this.groupOffsetX;
                        this.y = this.groupLeader.y + this.groupOffsetY;
                        this.x = Math.max(0, Math.min(game.width - this.width, this.x));
                        this.fireVx = this.groupLeader.fireVx;
                        this.fireVy = this.groupLeader.fireVy;
                    } else {
                        this.zigTimer++;
                        // Wavelength tripled (was 14) and amplitude increased another 50%
                        // (was 2.7) on top of the earlier amplitude bump.
                        if (this.zigTimer > 42) { this.zigTimer = 0; this.moveHeading *= -1; }
                        this.x += this.moveHeading * this.speed * 4.05;
                        this.y += this.speed * 0.85;
                        this.x = Math.max(0, Math.min(game.width - this.width, this.x));
                        const mag = Math.hypot(this.moveHeading * 4.05, 0.85) || 1;
                        this.fireVx = (this.moveHeading * 4.05 / mag) * 3;
                        this.fireVy = (0.85 / mag) * 3;
                    }
                } else if (subtype === 'cyan') {
                    if (this.dashState === 'hover') {
                        this.y += this.speed * 0.3;
                        this.x += Math.sin(this.moveTimer * 0.08) * 0.9; // increased amplitude
                        this.dashTimer--;
                        if (this.dashTimer <= 0) {
                            this.dashState = 'dash';
                            this.dashTimer = 20;
                            this.dashTargetX = game.player ? game.player.x : this.x;
                        }
                    } else {
                        const dx = this.dashTargetX - this.x;
                        this.x += Math.max(-4, Math.min(4, dx * 0.15));
                        this.y += this.speed * 1.8;
                        this.dashTimer--;
                        if (this.dashTimer <= 0) {
                            this.dashState = 'hover';
                            this.dashTimer = 60 + Math.floor(Math.random() * 40);
                        }
                    }
                    this.x = Math.max(0, Math.min(game.width - this.width, this.x));
                } else {
                    // Orange: unchanged straight descent
                    this.y += this.speed;
                }

                this.prevX = this.x;
                this.prevY = this.y;
            }

            updateBoss() {
                const now = Date.now();
                
                switch (this.bossType) {
                    case 0:
                        // Spawner: fires bullets that split into more bullets at 25% and 75%
                        // of the way down the screen (wave/5*3 bullets per split generation).
                        this.x += this.speed * this.direction;
                        if (this.x <= 0 || this.x >= game.width - this.width) {
                            this.direction *= -1;
                            this.y += this.dropDistance;
                        }
                        
                        if (!this.lastSpawn) this.lastSpawn = now;
                        if (now - this.lastSpawn > this.spawnRate) {
                            const splitCount = Math.max(2, Math.floor((game.wave / 5) * 3));
                            const b = new EnemyBullet(this.x + this.width / 2, this.y + this.height, 'boss_split');
                            b.splitCount = splitCount;
                            b.splitStage = 0;
                            applyRandomBossBulletEffect(b, this);
                            game.enemyBullets.push(b);
                            this.lastSpawn = now;
                        }
                        break;
                        
                    case 1:
                        this.x += this.speed * this.direction;
                        if (this.x <= 0 || this.x >= game.width - this.width) {
                            this.direction *= -1;
                            this.y += this.dropDistance;
                        }
                        
                        if (now - this.lastShot > this.fireRate) {
                            const burstCount = Math.max(2, Math.floor((game.wave / 5) * 2));
                            for (let i = 0; i < burstCount; i++) {
                                setTimeout(() => {
                                    if (game.state !== GameState.PLAYING) return;
                                    const bx = this.x + this.width / 2, by = this.y + this.height;
                                    // Slight homing: aim mostly downward, nudged a little toward the player.
                                    const dx = (game.player.x + game.player.width / 2) - bx;
                                    const dy = (game.player.y) - by;
                                    const dist = Math.hypot(dx, dy) || 1;
                                    const b = new EnemyBullet(bx, by, 'boss_rocket');
                                    b.speedX = (dx / dist) * 1.2;
                                    b.speedY = 4.5;
                                    applyRandomBossBulletEffect(b, this);
                                    game.enemyBullets.push(b);
                                }, i * 80);
                            }
                            this.lastShot = now;
                        }
                        
                        const timeUntilTeleport = this.teleportRate - (now - this.lastTeleport);
                        if (timeUntilTeleport <= 1000 && timeUntilTeleport > 0) {
                            this.teleportWarning = true;
                        } else {
                            this.teleportWarning = false;
                        }
                        
                        if (now - this.lastTeleport > this.teleportRate) {
                            game.explosions.push(new Explosion(this.x + this.width/2, this.y + this.height/2, 'teleport'));
                            
                            this.x = Math.random() * (game.width - this.width);
                            this.lastTeleport = now;
                            this.teleportWarning = false;
                            
                            game.explosions.push(new Explosion(this.x + this.width/2, this.y + this.height/2, 'teleport'));
                        }
                        break;
                        
                    case 2:
                        if (!this.frozen && !this.beamCharging && !this.beamFiring) {
                            this.x += this.speed * this.direction;
                            if (this.x <= 0 || this.x >= game.width - this.width) {
                                this.direction *= -1;
                                this.y += this.dropDistance;
                            }
                            
                            if (now >= this.nextBeamTime) {
                                this.beamCharging = true;
                                this.frozen = true;
                                this.beamStartTime = now;
                                this.currentBeamIndex = 0;
                                this.beamAngles = [];
                                for (let i = 0; i < this.beamsToFire; i++) {
                                    const angleOffset = (Math.random() * 60 - 30) * (Math.PI / 180);
                                    this.beamAngles.push(Math.PI / 2 + angleOffset);
                                }
                                this.beamX = this.x + this.width/2;
                                this.beamY = this.y + this.height/2;

                                // Random bonus effect for this volley (Sine / Double Shot / Growing;
                                // Wall Bounce is skipped for Crystal since its beam path math
                                // is a fixed 2-point bounce, not a variable-length chain).
                                this.beamEffect = null;
                                const effChance = getBossBulletEffectChance(game.wave);
                                const effRoll = Math.random() * 100;
                                if (effRoll < effChance) {
                                    this.beamEffect = 'sine';
                                } else if (effRoll < effChance * 3) {
                                    this.beamEffect = 'doubleshot';
                                    const angleOffset = (Math.random() * 60 - 30) * (Math.PI / 180);
                                    this.beamAngles.push(Math.PI / 2 + angleOffset);
                                } else if (effRoll < effChance * 4) {
                                    this.beamEffect = 'growing';
                                }
                            }
                        } else if (this.beamCharging) {
                            if (now - this.beamStartTime > 1000) {
                                this.beamCharging = false;
                                this.beamFiring = true;
                                this.beamStartTime = now;
                            }
                        } else if (this.beamFiring) {
                            if (now - this.beamStartTime > 3000) {
                                this.beamFiring = false;
                                this.frozen = false;
                                this.nextBeamTime = now + 5000 + Math.random() * 5000;
                            }
                        }
                        break;
                        
                    case 3:
                        this.x += this.speed * this.direction;
                        if (this.x <= 0 || this.x >= game.width - this.width) {
                            this.direction *= -1;
                            this.y += this.dropDistance;
                        }
                        
                        this.minions.forEach((minion, index) => {
                            const minionOffset = (index - (this.minions.length - 1) / 2) * 50;
                            minion.x = this.x + minionOffset;
                            minion.y = this.y + 20;
                            
                            if (now - minion.targetTime > 1000) {
                                minion.targetX = game.player.x;
                                minion.targetY = game.player.y;
                                minion.targetTime = now;
                            }
                            
                            if (now - minion.lastShot > minion.fireRate) {
                                game.enemyBullets.push(new EnemyBullet(
                                    minion.x + minion.width/2,
                                    minion.y + minion.height,
                                    'alienshot',
                                    minion.targetX,
                                    minion.targetY
                                ));
                                minion.lastShot = now;
                            }
                        });
                        break;
                    case 4:
                        // Tank: slow, tanky, fires a machine-gun spray of purple balls.
                        this.x += this.speed * this.direction;
                        if (this.x <= 0 || this.x >= game.width - this.width) {
                            this.direction *= -1;
                            this.y += this.dropDistance;
                        }
                        if (!this.lastSpray) this.lastSpray = now;
                        if (now - this.lastSpray > this.sprayInterval) {
                            for (let i = 0; i < this.sprayBulletsPerBurst; i++) {
                                setTimeout(() => {
                                    if (game.state !== GameState.PLAYING) return;
                                    const b = new EnemyBullet(this.x + this.width / 2, this.y + this.height, 'tank_spray');
                                    b.sprayColor = i % 2 === 0 ? '#aa33ff' : '#cc66ff';
                                    b.speedX = (Math.random() - 0.5) * 1.5;
                                    applyRandomBossBulletEffect(b, this);
                                    game.enemyBullets.push(b);
                                }, i * 90);
                            }
                            this.lastSpray = now;
                        }
                        break;
                }
            }

            draw() {
                if (!this.deployed) return;
                
                const basePixelSize = 4;
                const pixelSize = this.isMiniAlien ? basePixelSize * 0.3 : basePixelSize;
                const px = this.x;
                const py = this.y;
                
                if (this.type === 'boss') {
                    
                    const bossSprite = bossSprites[this.spriteType];
                    const pattern = bossSprite.patterns[this.animFrame];
                    const colorMap = bossSprite.colors;
                    const bossPixelSize = 2; // 48x32 grid at 2px/cell = 96x64, matching the boss hitbox
                    
                    Object.keys(colorMap).forEach(pixelType => {
                        game.ctx.fillStyle = colorMap[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < pattern.length; row++) {
                            for (let col = 0; col < pattern[row].length; col++) {
                                if (pattern[row][col] === pixelType) {
                                    game.ctx.rect(px + col * bossPixelSize, py + row * bossPixelSize, bossPixelSize, bossPixelSize);
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                    
                    if (this.bossType === 1 && this.teleportWarning) {
                        const indicatorSize = 6;
                        const offset = 8;
                        const pulseAlpha = Math.sin(Date.now() / 100) * 0.5 + 0.5;
                        
                        game.ctx.fillStyle = `rgba(255, 255, 0, ${pulseAlpha})`;
                        
                        game.ctx.fillRect(this.x - offset, this.y - offset - 12, indicatorSize, indicatorSize);
                        game.ctx.fillRect(this.x - offset + indicatorSize, this.y - offset - 6, indicatorSize, indicatorSize);
                        game.ctx.fillRect(this.x - offset, this.y - offset, indicatorSize, indicatorSize);
                        
                        game.ctx.fillRect(this.x + this.width + offset - indicatorSize, this.y - offset - 12, indicatorSize, indicatorSize);
                        game.ctx.fillRect(this.x + this.width + offset - indicatorSize * 2, this.y - offset - 6, indicatorSize, indicatorSize);
                        game.ctx.fillRect(this.x + this.width + offset - indicatorSize, this.y - offset, indicatorSize, indicatorSize);
                        
                        game.ctx.fillRect(this.x - offset, this.y + this.height + offset, indicatorSize, indicatorSize);
                        game.ctx.fillRect(this.x - offset + indicatorSize, this.y + this.height + offset + 6, indicatorSize, indicatorSize);
                        game.ctx.fillRect(this.x - offset, this.y + this.height + offset + 12, indicatorSize, indicatorSize);
                        
                        game.ctx.fillRect(this.x + this.width + offset - indicatorSize, this.y + this.height + offset, indicatorSize, indicatorSize);
                        game.ctx.fillRect(this.x + this.width + offset - indicatorSize * 2, this.y + this.height + offset + 6, indicatorSize, indicatorSize);
                        game.ctx.fillRect(this.x + this.width + offset - indicatorSize, this.y + this.height + offset + 12, indicatorSize, indicatorSize);
                    }
                    
                    this.drawBossEffects();
                    
                    const barWidth = this.width;
                    const barHeight = 4;
                    game.ctx.fillStyle = '#333333';
                    game.ctx.fillRect(this.x, this.y - 8, barWidth, barHeight);
                    game.ctx.fillStyle = '#ff0000';
                    game.ctx.fillRect(this.x, this.y - 8, (this.health / this.maxHealth) * barWidth, barHeight);
                } else {
                    
                    const sprite = alienSprites[this.spriteType];
                    const pattern = sprite.patterns[this.animFrame];
                    // Mini aliens (spawned by the Spawner boss) keep their normal shape
                    // but are recolored solid red so they read as "spawned" enemies.
                    let colorMap;
                    if (this.isMiniAlien) {
                        colorMap = Object.fromEntries(Object.keys(sprite.colors).map(k => [k, k === '#' ? '#661111' : '#ff2222']));
                    } else if (this.isSwarm) {
                        colorMap = Object.fromEntries(Object.keys(sprite.colors).map(k => [k, k === '#' ? '#660000' : '#ff2222']));
                    } else if (this.subtype === 'pink') {
                        colorMap = getPinkColorMap(sprite.colors, this);
                    } else if (this.subtype === 'orange' && this.accentColor) {
                        colorMap = Object.assign({}, sprite.colors, { B: this.accentColor });
                    } else if (this.subtype === 'blue' && this.accentColor) {
                        colorMap = Object.assign({}, sprite.colors, { '#': this.accentColor });
                    } else if (this.subtype === 'green' && this.accentColor) {
                        colorMap = Object.assign({}, sprite.colors, { A: this.accentColor });
                    } else {
                        colorMap = sprite.colors;
                    }
                    
                    game.ctx.imageSmoothingEnabled = false;
                    
                    Object.keys(colorMap).forEach(pixelType => {
                        game.ctx.fillStyle = colorMap[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < pattern.length; row++) {
                            for (let col = 0; col < pattern[row].length; col++) {
                                if (pattern[row][col] === pixelType) {
                                    game.ctx.rect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                                }
                            }
                        }
                        game.ctx.fill();
                    });

                    if (this.maxHealth > 1 && !this.isMiniAlien) {
                        const barWidth = this.width;
                        const barHeight = 3;
                        game.ctx.fillStyle = '#333333';
                        game.ctx.fillRect(this.x, this.y - 6, barWidth, barHeight);
                        game.ctx.fillStyle = this.health / this.maxHealth > 0.5 ? '#00ff00' : (this.health / this.maxHealth > 0.25 ? '#ffcc00' : '#ff0000');
                        game.ctx.fillRect(this.x, this.y - 6, Math.max(0, this.health / this.maxHealth) * barWidth, barHeight);
                    }

                    // Snipe Lance: dotted telegraph line down the firing lane before green
                    // aliens actually fire their laser.
                    if (this.subtype === 'green' && this.telegraphUntil && Date.now() < this.telegraphUntil) {
                        const lineX = this.telegraphX !== undefined ? this.telegraphX : (this.x + this.width / 2);
                        const startY = this.y + this.height;
                        const endY = game.height;
                        const dashLen = 6, gapLen = 5;
                        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 60);
                        game.ctx.strokeStyle = `rgba(170,255,120,${0.4 + 0.5 * pulse})`;
                        game.ctx.lineWidth = 2;
                        game.ctx.beginPath();
                        for (let yy = startY; yy < endY; yy += dashLen + gapLen) {
                            game.ctx.moveTo(lineX, yy);
                            game.ctx.lineTo(lineX, Math.min(endY, yy + dashLen));
                        }
                        game.ctx.stroke();
                    }
                }
            }

            drawBossEffects() {
                if (this.type !== 'boss') return;
                const now = Date.now();
                
                switch (this.bossType) {
                    case 2:
                        if (this.beamCharging) {
                            game.ctx.strokeStyle = '#ffff00';
                            game.ctx.lineWidth = 3;
                            game.ctx.setLineDash([10, 10]);
                            
                            for (let i = 0; i < this.beamAngles.length; i++) {
                                const beamPath = this.calculateBeamPath(this.beamAngles[i]);
                                
                                game.ctx.beginPath();
                                game.ctx.moveTo(beamPath.start.x, beamPath.start.y);
                                game.ctx.lineTo(beamPath.bounce.x, beamPath.bounce.y);
                                game.ctx.lineTo(beamPath.end.x, beamPath.end.y);
                                game.ctx.stroke();
                            }
                            game.ctx.setLineDash([]);
                        } else if (this.beamFiring) {
                            const growWidth = this.beamEffect === 'growing'
                                ? 8 + Math.min(10, (now - this.beamStartTime) / 300)
                                : 8;
                            const wavy = this.beamEffect === 'sine';
                            for (let i = 0; i < this.beamAngles.length; i++) {
                                const beamPath = this.calculateBeamPath(this.beamAngles[i]);
                                
                                game.ctx.strokeStyle = '#ff0000';
                                game.ctx.lineWidth = growWidth;
                                drawBeamSegment(beamPath, wavy, now);
                                
                                game.ctx.strokeStyle = '#ffaaaa';
                                game.ctx.lineWidth = growWidth + 4;
                                game.ctx.globalAlpha = 0.3;
                                drawBeamSegment(beamPath, wavy, now);
                                game.ctx.globalAlpha = 1;
                            }
                        }
                        break;
                        
                    case 3:
                        this.minions.forEach(minion => {
                            const pixelSize = 2;
                            const px = minion.x;
                            const py = minion.y;
                            
                            const minionPattern = [
                                '  RRRRRRRR  ',
                                ' RRRRRRRRRR ',
                                'RRRR##RRRRRR',
                                'RRR####RRRRR',
                                'RRR####RRRRR',
                                'RRRR##RRRRRR',
                                ' RRRRRRRRRR ',
                                '  RRRRRRRR  '
                            ];
                            
                            const colors = { 'R': '#aa0000', '#': '#000000' };
                            
                            Object.keys(colors).forEach(pixelType => {
                                game.ctx.fillStyle = colors[pixelType];
                                game.ctx.beginPath();
                                
                                for (let row = 0; row < minionPattern.length; row++) {
                                    for (let col = 0; col < minionPattern[row].length; col++) {
                                        if (minionPattern[row][col] === pixelType) {
                                            game.ctx.rect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                                        }
                                    }
                                }
                                game.ctx.fill();
                            });
                        });
                        break;
                }
            }

            calculateBeamPath(angle) {
                const startX = this.beamX;
                const startY = this.beamY;
                
                const dx = Math.cos(angle);
                const dy = Math.sin(angle);
                
                let bounceX, bounceY;
                
                if (dx > 0) {
                    bounceX = game.width;
                    bounceY = startY + (bounceX - startX) * (dy / dx);
                } else {
                    bounceX = 0;
                    bounceY = startY + (bounceX - startX) * (dy / dx);
                }
                
                if (bounceY < 0) {
                    bounceY = 0;
                    bounceX = startX + (bounceY - startY) * (dx / dy);
                } else if (bounceY > game.height) {
                    bounceY = game.height;
                    bounceX = startX + (bounceY - startY) * (dx / dy);
                }
                
                const endX = bounceX;
                const endY = game.height;
                
                return {
                    start: { x: startX, y: startY },
                    bounce: { x: bounceX, y: bounceY },
                    end: { x: endX, y: endY }
                };
            }
        }

        // Fires the correct bullet pattern for a base alien's subtype. All base-alien
        // bullets are purple so the player learns "purple = danger" (bosses fire red).
        // Volley Sync: fires an entire white formation group together in a staggered
        // left-to-right ripple, instead of each member firing on its own timer.
        function fireWhiteVolley(leader) {
            const shooters = game.enemies.filter(e =>
                (e === leader || e.groupLeader === leader) && e.canShoot && e.deployed
            );
            shooters.sort((a, b) => a.x - b.x);
            shooters.forEach((e, i) => {
                setTimeout(() => {
                    if (game.state !== GameState.PLAYING) return;
                    if (!game.enemies.includes(e)) return;
                    fireBaseAlienBullet(e);
                }, i * 90);
            });
        }

        function fireBaseAlienBullet(enemy, depth) {
            depth = depth || 0;
            const bx = enemy.x + enemy.width / 2, by = enemy.y + enemy.height;
            const subtype = enemy.subtype || 'orange';

            if (subtype === 'orange') {
                game.enemyBullets.push(applyRandomBaseAlienBulletEffect(new EnemyBullet(bx, by, 'ab_basic')));
            } else if (subtype === 'green') {
                // Snipe Lance: telegraph a dotted line down the firing lane for 300ms
                // before the laser actually fires.
                enemy.telegraphUntil = Date.now() + 300;
                enemy.telegraphX = bx;
                setTimeout(() => {
                    if (game.state !== GameState.PLAYING) return;
                    game.enemyBullets.push(applyRandomBaseAlienBulletEffect(new EnemyBullet(bx, by, 'ab_laser')));
                }, 300);
            } else if (subtype === 'blue') {
                game.enemyBullets.push(applyRandomBaseAlienBulletEffect(new EnemyBullet(bx, by, 'ab_sine')));
            } else if (subtype === 'white') {
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        if (game.state !== GameState.PLAYING) return;
                        game.enemyBullets.push(applyRandomBaseAlienBulletEffect(new EnemyBullet(bx, by, 'ab_rocket')));
                    }, i * 120);
                }
            } else if (subtype === 'yellow') {
                // Trifecta: at higher waves, occasionally fire a full ring of bullets
                // around the alien instead of the normal 2-way spread.
                const ringChance = Math.min(0.4, 0.04 * game.wave);
                if (Math.random() < ringChance) {
                    const ringCount = 10;
                    for (let i = 0; i < ringCount; i++) {
                        const angle = (i / ringCount) * Math.PI * 2;
                        const rb = new EnemyBullet(bx, by, 'ab_spread');
                        rb.speedX = Math.cos(angle) * 3;
                        rb.speedY = Math.sin(angle) * 3;
                        rb.wallBouncesLeft = 0;
                        game.enemyBullets.push(rb);
                    }
                } else {
                    const b1 = new EnemyBullet(bx, by, 'ab_spread');
                    b1.speedX = -1.3;
                    const b2 = new EnemyBullet(bx, by, 'ab_spread');
                    b2.speedX = 1.3;
                    game.enemyBullets.push(applyRandomBaseAlienBulletEffect(b1), applyRandomBaseAlienBulletEffect(b2));
                }
            } else if (subtype === 'cyan') {
                // Cascade Split: at higher waves, the bullets from the first split
                // split again a second time further down the screen.
                const b = new EnemyBullet(bx, by, 'ab_split');
                b.speedY = 2.2;
                b.splitCount = Math.max(2, Math.floor(game.wave / 2));
                b.cascadeLevel = game.wave >= 12 ? 1 : 0;
                game.enemyBullets.push(applyRandomBaseAlienBulletEffect(b));
            } else if (subtype === 'pink') {
                let nearest = null, nearestDist = Infinity;
                for (const other of game.enemies) {
                    if (other === enemy || other.type === 'boss' || !other.deployed) continue;
                    const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
                    if (d < nearestDist) { nearestDist = d; nearest = other; }
                }
                const doMimicShot = () => {
                    if (nearest && depth < 2) {
                        fireBaseAlienBullet(Object.assign({}, enemy, { subtype: nearest.subtype }), depth + 1);
                    } else {
                        game.enemyBullets.push(applyRandomBaseAlienBulletEffect(new EnemyBullet(bx, by, 'ab_basic')));
                    }
                };
                // Echo Shot: fire the mimicked shot twice in quick succession.
                doMimicShot();
                setTimeout(() => {
                    if (game.state !== GameState.PLAYING) return;
                    doMimicShot();
                }, 150);
            } else {
                game.enemyBullets.push(applyRandomBaseAlienBulletEffect(new EnemyBullet(bx, by, 'ab_basic')));
            }
        }

        // Random bonus effects that can roll onto a bullet. Rolled independently per
        // bullet-burst, not per bullet. `chance` is in percent (0-100) per effect tier.
        function applyRandomBulletEffect(bullet, chance) {
            const roll = Math.random() * 100;
            if (roll < chance) {
                bullet.effectSine = true;
            } else if (roll < chance * 2) {
                bullet.effectWallBounce = true;
                bullet.wallBounceLeft = Math.max(1, Math.floor(game.wave / 5));
            } else if (roll < chance * 3) {
                bullet.effectDoubleShot = true;
                const extra = new EnemyBullet(bullet.x, bullet.y - 14, bullet.type);
                extra.speedX = bullet.speedX;
                extra.speedY = bullet.speedY;
                extra.isBossBullet = true;
                game.enemyBullets.push(extra);
            } else if (roll < chance * 4) {
                bullet.effectGrowing = true;
            }
            return bullet;
        }
        // Boss bullets: chance scales with wave, capped at 5% per tier.
        function getBossBulletEffectChance(wave) {
            return Math.min(5, 0.5 + 0.5 * Math.floor(wave / 5));
        }
        function applyRandomBossBulletEffect(bullet, boss) {
            return applyRandomBulletEffect(bullet, getBossBulletEffectChance(game.wave));
        }
        // Base (non-boss) aliens: same idea, scaled down since they fire far more often -
        // capped at 2% per tier so waves don't become effect soup.
        function getBaseAlienBulletEffectChance(wave) {
            return Math.min(2, 0.2 + 0.2 * Math.floor(wave / 5));
        }
        function applyRandomBaseAlienBulletEffect(bullet) {
            return applyRandomBulletEffect(bullet, getBaseAlienBulletEffectChance(game.wave));
        }

        class EnemyBullet {
            constructor(x, y, type, targetX = null, targetY = null) {
                this.x = x;
                this.y = y;
                this.type = type;
                let w = type === 'spider' ? 18 : (type === 'alienshot' ? 5 : (type === 'ab_laser' ? 4 : ((type === 'ab_rocket' || type === 'boss_rocket') ? 12 : (type === 'boss_split' ? 10 : (type === 'ab_sine' ? 5 : 8)))));
                let h = type === 'spider' ? 36 : (type === 'alienshot' ? 14 : (type === 'ab_laser' ? 22 : ((type === 'ab_rocket' || type === 'boss_rocket') ? 22 : (type === 'boss_split' ? 10 : (type === 'ab_sine' ? 24 : 8)))));
                // Bigger, more visible bullets across the board - except white's rockets,
                // which stay their original size.
                if (type !== 'ab_rocket') {
                    w *= 2;
                    h *= 2;
                }
                // Snipe Lance: green's laser is an extra 50% longer on top of that.
                if (type === 'ab_laser') {
                    h *= 1.5;
                }
                this.width = w;
                this.height = h;
                this.baseWidth = this.width;
                this.baseHeight = this.height;

                if ((type === 'destroyer' || type === 'spider' || type === 'alienshot') && targetX !== null && targetY !== null) {
                    const dx = targetX - x;
                    const dy = targetY - y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const speed = type === 'alienshot' ? 5 : 4;
                    this.speedX = (dx / distance) * speed;
                    this.speedY = (dy / distance) * speed;
                } else {
                    this.speedX = 0;
                    this.speedY = type === 'alienshot' ? 5 : (type === 'ab_laser' ? 9 : (type === 'ab_sine' ? 3 : (type === 'boss_split' ? 2.2 : 4)));
                }

                this.damage = type === 'spider' ? 2 : 1;
                this.spawnX = x;
                this.sineTimer = 0;
                this.hasSplit = false;
                this.wallBouncesLeft = (type === 'ab_spread') ? 2 : 0;
            }

            update() {
                if (this.effectSine) {
                    this.sineTimer = (this.sineTimer || 0) + 1;
                    this.x += Math.sin(this.sineTimer * 0.15) * 1.5;
                }
                if (this.effectGrowing) {
                    this.growTimer = (this.growTimer || 0) + 1;
                    const scale = 1 + this.growTimer * 0.01;
                    this.width = this.baseWidth * scale;
                    this.height = this.baseHeight * scale;
                }
                if (this.effectWallBounce && this.wallBounceLeft > 0 && (this.x <= 0 || this.x >= game.width - this.width)) {
                    this.speedX = -(this.speedX || 1.5) || -1.5;
                    if (this.x <= 0) this.speedX = Math.abs(this.speedX);
                    else this.speedX = -Math.abs(this.speedX);
                    this.wallBounceLeft--;
                    this.x = Math.max(0, Math.min(game.width - this.width, this.x));
                }

                if (this.type === 'boss_split') {
                    this.y += this.speedY;
                    const progress = this.y / game.height;
                    const threshold = this.splitStage === 0 ? 0.25 : 0.75;
                    if (progress >= threshold && this.splitStage < 2) {
                        this.splitStage++;
                        this.markedForRemoval = true;
                        for (let i = 0; i < this.splitCount; i++) {
                            const t = this.splitCount > 1 ? (i / (this.splitCount - 1)) - 0.5 : 0;
                            const nb = new EnemyBullet(this.x, this.y, 'boss_split');
                            nb.speedX = t * 8;
                            nb.speedY = this.speedY;
                            nb.splitStage = this.splitStage;
                            nb.splitCount = this.splitCount;
                            nb.isBossBullet = true;
                            game.enemyBullets.push(nb);
                        }
                    }
                    this.x += this.speedX || 0;
                } else if (this.type === 'ab_sine') {
                    this.sineTimer++;
                    this.x = this.spawnX + Math.sin(this.sineTimer * 0.15) * 30;
                    this.y += this.speedY;
                } else if (this.type === 'ab_split') {
                    this.y += this.speedY;
                    const threshold = this.splitThreshold || 0.3;
                    if (!this.hasSplit && this.y > game.height * threshold) {
                        this.hasSplit = true;
                        this.markedForRemoval = true;
                        const count = this.splitCount || 3;
                        const cascade = this.cascadeLevel || 0;
                        for (let i = 0; i < count; i++) {
                            const t = count > 1 ? (i / (count - 1)) - 0.5 : 0;
                            if (cascade > 0) {
                                // Cascade Split: these children split again further down.
                                const nb = new EnemyBullet(this.x, this.y, 'ab_split');
                                nb.speedX = t * 10;
                                nb.speedY = 3.5;
                                nb.splitCount = Math.max(2, Math.floor(count / 2));
                                nb.cascadeLevel = cascade - 1;
                                nb.splitThreshold = 0.65;
                                game.enemyBullets.push(nb);
                            } else {
                                const b = new EnemyBullet(this.x, this.y, 'ab_basic');
                                b.speedX = t * 10;
                                b.speedY = 3.5;
                                game.enemyBullets.push(b);
                            }
                        }
                    }
                } else if (this.type === 'ab_spread') {
                    this.x += this.speedX;
                    this.y += this.speedY;
                    if ((this.x <= 0 || this.x >= game.width - this.width) && this.wallBouncesLeft > 0) {
                        this.speedX *= -1;
                        this.wallBouncesLeft--;
                        this.x = Math.max(0, Math.min(game.width - this.width, this.x));
                    }
                } else {
                    this.x += this.speedX;
                    this.y += this.speedY;
                }
            }

            draw() {
                if (this.type === 'spider') {
                    game.ctx.fillStyle = '#aa33ff';
                    game.ctx.fillRect(this.x, this.y, this.width, this.height);
                } else if (this.type === 'boss_split') {
                    game.ctx.fillStyle = '#aa33ff';
                    game.ctx.beginPath();
                    game.ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
                    game.ctx.fill();
                } else if (this.type === 'tank_spray') {
                    game.ctx.fillStyle = this.sprayColor || '#aa33ff';
                    game.ctx.beginPath();
                    game.ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
                    game.ctx.fill();
                } else if (this.type === 'ab_laser') {
                    game.ctx.fillStyle = 'rgba(170,51,255,0.35)';
                    game.ctx.fillRect(this.x - 2, this.y - 10, this.width + 4, this.height + 10);
                    game.ctx.fillStyle = '#aa33ff';
                    game.ctx.fillRect(this.x, this.y, this.width, this.height);
                } else if (this.type === 'ab_rocket' || this.type === 'boss_rocket') {
                    const pixelSize = 2;
                    const px = this.x - 4, py = this.y;
                    const rocketPattern = ['  RR  ', ' RRRR ', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'WWWWWW', 'WWWWWW', 'YYYYYY', 'YYYYYY', ' Y  Y ', ' Y  Y '];
                    const colors = this.type === 'boss_rocket'
                        ? { 'R': '#9922ee', 'W': '#ffffff', 'Y': '#550088' }
                        : { 'R': '#aa33ff', 'W': '#ffffff', 'Y': '#6600aa' };
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        for (let row = 0; row < rocketPattern.length; row++) {
                            for (let col = 0; col < rocketPattern[row].length; col++) {
                                if (rocketPattern[row][col] === pixelType) {
                                    game.ctx.fillRect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                                }
                            }
                        }
                    });
                } else if (this.type === 'ab_sine') {
                    // Serpentine Shot: a long, curved-looking bullet to match blue's
                    // smooth weaving flight path.
                    game.ctx.fillStyle = 'rgba(170,51,255,0.3)';
                    game.ctx.beginPath();
                    game.ctx.roundRect(this.x - 1.5, this.y - 4, this.width + 3, this.height + 4, this.width);
                    game.ctx.fill();
                    game.ctx.fillStyle = '#aa33ff';
                    game.ctx.beginPath();
                    game.ctx.roundRect(this.x, this.y, this.width, this.height, this.width / 2);
                    game.ctx.fill();
                } else if (this.type === 'ab_basic' || this.type === 'ab_spread') {
                    game.ctx.fillStyle = '#aa33ff';
                    game.ctx.beginPath();
                    game.ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
                    game.ctx.fill();
                } else if (this.type === 'alienshot') {
                    game.ctx.fillStyle = '#aa33ff';
                    game.ctx.fillRect(this.x, this.y, this.width, this.height);
                } else {
                    game.ctx.fillStyle = '#aa33ff';
                    game.ctx.fillRect(this.x, this.y, this.width, this.height);
                }
            }
        }

        class Powerup {
            constructor(x, y, type = 'bomb') {
                this.x = x;
                this.y = y;
                this.width = 32;
                this.height = 32;
                this.type = type;
                
                this.speed = 2;
                const direction = Math.random() < 0.5 ? -1 : 1;
                this.dx = direction * this.speed * 0.866;
                this.dy = this.speed * 0.5;
                
                this.animFrame = 0;
                this.animTimer = 0;
            }

            update() {
                this.animTimer++;
                if (this.animTimer % 10 === 0) {
                    this.animFrame = (this.animFrame + 1) % 2;
                }
                
                this.x += this.dx;
                this.y += this.dy;
                
                if (this.x <= 0 || this.x >= game.width - this.width) {
                    this.dx *= -1;
                    this.x = Math.max(0, Math.min(game.width - this.width, this.x));
                }
                
                if (this.y <= 0) {
                    this.dy *= -1;
                    this.y = 0;
                }
                
                const landscapeY = game.height - game.landscapeHeight;
                if (this.y + this.height >= landscapeY) {
                    this.dy *= -1;
                    this.y = landscapeY - this.height;
                }
            }

            draw() {
                const pixelSize = 4;
                const px = this.x;
                const py = this.y;
                
                if (this.type === 'bomb') {
                    const bombPattern = [
                        '  OOOOOO  ',
                        ' OYYYYYYO ',
                        'OYYYYYYYY0',
                        'OYYBBBBYY0',
                        'OYYBBBBYY0',
                        'OYYBBBBYY0',
                        'OYYYYYYYY0',
                        ' 0YYYYYY0 ',
                        '  000000  '
                    ];
                    
                    const colors = {
                        'O': '#ff8800',
                        'Y': '#ffff00',
                        'B': '#000000',
                        '0': '#cc6600'
                    };
                    
                    const pulseOffset = this.animFrame === 0 ? 0 : 2;
                    
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < bombPattern.length; row++) {
                            for (let col = 0; col < bombPattern[row].length; col++) {
                                if (bombPattern[row][col] === pixelType) {
                                    game.ctx.rect(
                                        px + col * pixelSize - pulseOffset, 
                                        py + row * pixelSize - pulseOffset, 
                                        pixelSize, 
                                        pixelSize
                                    );
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                    
                    const glowAlpha = this.animFrame === 0 ? 0.3 : 0.5;
                    game.ctx.strokeStyle = `rgba(255, 255, 0, ${glowAlpha})`;
                    game.ctx.lineWidth = 2;
                    game.ctx.strokeRect(this.x - 4, this.y - 4, this.width + 8, this.height + 8);
                } else if (this.type === 'tripleshot') {
                    const tripleShotPattern = [
                        '  CCCCCC  ',
                        ' CBBBBBBC ',
                        'CBBBBBBBBC',
                        'CBB#B#B#BC',
                        'CBB#B#B#BC',
                        'CBB#B#B#BC',
                        'CBBBBBBBBC',
                        ' CBBBBBBCC',
                        '  CCCCCC  '
                    ];
                    
                    const colors = {
                        'C': '#0088ff',
                        'B': '#00ccff',
                        '#': '#0000ff'
                    };
                    
                    const pulseOffset = this.animFrame === 0 ? 0 : 2;
                    
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < tripleShotPattern.length; row++) {
                            for (let col = 0; col < tripleShotPattern[row].length; col++) {
                                if (tripleShotPattern[row][col] === pixelType) {
                                    game.ctx.rect(
                                        px + col * pixelSize - pulseOffset, 
                                        py + row * pixelSize - pulseOffset, 
                                        pixelSize, 
                                        pixelSize
                                    );
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                    
                    const glowAlpha = this.animFrame === 0 ? 0.3 : 0.5;
                    game.ctx.strokeStyle = `rgba(0, 204, 255, ${glowAlpha})`;
                    game.ctx.lineWidth = 2;
                    game.ctx.strokeRect(this.x - 4, this.y - 4, this.width + 8, this.height + 8);
                } else if (this.type === 'rocket') {
                    const rocketPattern = [
                        '  RRRRRR  ',
                        ' RRRRRRRR ',
                        'RRRRRRRRRR',
                        'RRRR##RRRR',
                        'RRR####RRR',
                        'RRR####RRR',
                        'RRRR##RRRR',
                        'RRRRRRRRRR',
                        ' RRRRRRRR ',
                        '  RRRRRR  '
                    ];
                    
                    const colors = {
                        'R': '#ff0000',
                        '#': '#ffffff'
                    };
                    
                    const pulseOffset = this.animFrame === 0 ? 0 : 2;
                    
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < rocketPattern.length; row++) {
                            for (let col = 0; col < rocketPattern[row].length; col++) {
                                if (rocketPattern[row][col] === pixelType) {
                                    game.ctx.rect(
                                        px + col * pixelSize - pulseOffset, 
                                        py + row * pixelSize - pulseOffset, 
                                        pixelSize, 
                                        pixelSize
                                    );
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                    
                    const glowAlpha = this.animFrame === 0 ? 0.3 : 0.5;
                    game.ctx.strokeStyle = `rgba(255, 0, 0, ${glowAlpha})`;
                    game.ctx.lineWidth = 2;
                    game.ctx.strokeRect(this.x - 4, this.y - 4, this.width + 8, this.height + 8);
                } else if (this.type === 'rapidfire') {
                    const rapidFirePattern = [
                        '  OOOOOO  ',
                        ' OOOOOOOO ',
                        'OOOOOOOOOO',
                        'OOO####OOO',
                        'OO######OO',
                        'OO######OO',
                        'OOO####OOO',
                        'OOOOOOOOOO',
                        ' OOOOOOOO ',
                        '  OOOOOO  '
                    ];
                    
                    const colors = {
                        'O': '#ff8800',
                        '#': '#ffcc00'
                    };
                    
                    const pulseOffset = this.animFrame === 0 ? 0 : 2;
                    
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < rapidFirePattern.length; row++) {
                            for (let col = 0; col < rapidFirePattern[row].length; col++) {
                                if (rapidFirePattern[row][col] === pixelType) {
                                    game.ctx.rect(
                                        px + col * pixelSize - pulseOffset, 
                                        py + row * pixelSize - pulseOffset, 
                                        pixelSize, 
                                        pixelSize
                                    );
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                    
                    const glowAlpha = this.animFrame === 0 ? 0.3 : 0.5;
                    game.ctx.strokeStyle = `rgba(255, 136, 0, ${glowAlpha})`;
                    game.ctx.lineWidth = 2;
                    game.ctx.strokeRect(this.x - 4, this.y - 4, this.width + 8, this.height + 8);
                } else if (this.type === 'extralife') {
                    const extraLifePattern = [
                        '  GGGGGG  ',
                        ' GGGGGGGG ',
                        'GGGGGGGGGG',
                        'GGRRRRRRGG',
                        'GGRR##RRGG',
                        'GGR####RGG',
                        'GGR####RGG',
                        'GGGRR#RGGG',
                        'GGGGRRGGG ',
                        ' GGGGGGGG ',
                        '  GGGGGG  '
                    ];
                    
                    const colors = {
                        'G': '#00ff00',
                        'R': '#ff0000',
                        '#': '#880000'
                    };
                    
                    const pulseOffset = this.animFrame === 0 ? 0 : 2;
                    
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < extraLifePattern.length; row++) {
                            for (let col = 0; col < extraLifePattern[row].length; col++) {
                                if (extraLifePattern[row][col] === pixelType) {
                                    game.ctx.rect(
                                        px + col * pixelSize - pulseOffset, 
                                        py + row * pixelSize - pulseOffset, 
                                        pixelSize, 
                                        pixelSize
                                    );
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                    
                    const glowAlpha = this.animFrame === 0 ? 0.3 : 0.5;
                    game.ctx.strokeStyle = `rgba(0, 255, 0, ${glowAlpha})`;
                    game.ctx.lineWidth = 2;
                    game.ctx.strokeRect(this.x - 4, this.y - 4, this.width + 8, this.height + 8);
                }
            }
        }

        class Explosion {
            constructor(x, y, type = 'normal', color = '#ffcc00', particleCount = 8) {
                this.x = x;
                this.y = y;
                this.type = type;
                this.color = color;
                this.particleCount = particleCount;
                this.life = type === 'teleport' ? 20 : (type === 'bomb' ? 30 : (type === 'rocket' ? 25 : (type === 'healing' ? 25 : (type === 'particle' ? 18 : 15))));
                this.maxLife = this.life;
                this.animFrame = 0;
                this.animTimer = 0;
                if (type === 'particle') {
                    this.particles = [];
                    for (let i = 0; i < particleCount; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 0.8 + Math.random() * 2.2;
                        this.particles.push({
                            dx: Math.cos(angle) * speed,
                            dy: Math.sin(angle) * speed,
                            ox: 0, oy: 0,
                            size: 2 + Math.random() * 2
                        });
                    }
                }
            }

            update() {
                this.life--;
                this.animTimer++;
                if (this.animTimer % 3 === 0) {
                    this.animFrame++;
                }
                if (this.type === 'particle') {
                    this.particles.forEach(p => {
                        p.ox += p.dx;
                        p.oy += p.dy;
                    });
                }
            }

            draw() {
                if (this.type === 'particle') {
                    const alpha = Math.max(0, this.life / this.maxLife);
                    this.particles.forEach(p => {
                        game.ctx.fillStyle = this.color;
                        game.ctx.globalAlpha = alpha;
                        game.ctx.fillRect(this.x + p.ox - p.size / 2, this.y + p.oy - p.size / 2, p.size, p.size);
                    });
                    game.ctx.globalAlpha = 1;
                    return;
                }
                if (this.type === 'healing') {
                    const pixelSize = 3;
                    const px = this.x - 12;
                    const py = this.y - 12;
                    
                    const healingFrames = [
                        [
                            '    GGG     ',
                            '    GGG     ',
                            '    GGG     ',
                            'GGGGGGGGGGG ',
                            'GGGGGGGGGGG ',
                            'GGGGGGGGGGG ',
                            '    GGG     ',
                            '    GGG     ',
                            '    GGG     '
                        ],
                        [
                            '     GG     ',
                            '     GG     ',
                            '     GG     ',
                            ' GGGGGGGGG  ',
                            ' GGGGGGGGG  ',
                            ' GGGGGGGGG  ',
                            '     GG     ',
                            '     GG     ',
                            '     GG     '
                        ],
                        [
                            '      G     ',
                            '      G     ',
                            '      G     ',
                            '  GGGGGGG   ',
                            '  GGGGGGG   ',
                            '  GGGGGGG   ',
                            '      G     ',
                            '      G     ',
                            '      G     '
                        ],
                        [
                            '            ',
                            '            ',
                            '            ',
                            '   GGGGG    ',
                            '   GGGGG    ',
                            '   GGGGG    ',
                            '            ',
                            '            ',
                            '            '
                        ],
                        [
                            '            ',
                            '            ',
                            '            ',
                            '    GGG     ',
                            '    GGG     ',
                            '    GGG     ',
                            '            ',
                            '            ',
                            '            '
                        ]
                    ];
                    
                    const frameIndex = Math.min(Math.floor(this.animFrame / 2), healingFrames.length - 1);
                    const pattern = healingFrames[frameIndex];
                    
                    const alpha = 1 - (this.animFrame / (healingFrames.length * 2));
                    game.ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`;
                    game.ctx.beginPath();
                    
                    for (let row = 0; row < pattern.length; row++) {
                        for (let col = 0; col < pattern[row].length; col++) {
                            if (pattern[row][col] === 'G') {
                                game.ctx.rect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                            }
                        }
                    }
                    game.ctx.fill();
                    
                    return;
                }
                
                if (this.type === 'bomb') {
                    const pixelSize = 6;
                    const px = this.x - 80;
                    const py = this.y - 80;
                    
                    const bombExplosionFrames = [
                        [
                            '          ####          ',
                            '        ########        ',
                            '       ##YYYYYY##       ',
                            '      ##YYYYYYYY##      ',
                            '     ##YYYYRRYYYYY##    ',
                            '    ##YYYYRRRRYYYYT##   ',
                            '   ##YYYYRRRRRRYYYYY##  ',
                            '  ##YYYYRRRRRRRRYYYY##  ',
                            ' ##YYYYRRRRRRRRRRYYY##  ',
                            '##YYYYRRRRRRRRRRRYYY##  ',
                            '##YYYYRRRRRRRRRRRYYY##  ',
                            ' ##YYYYRRRRRRRRRRYYY##  ',
                            '  ##YYYYRRRRRRRRYYYY##  ',
                            '   ##YYYYRRRRRRYYYYY##  ',
                            '    ##YYYYRRRRYYYYT##   ',
                            '     ##YYYYRRYYYYY##    ',
                            '      ##YYYYYYYY##      ',
                            '       ##YYYYYY##       ',
                            '        ########        ',
                            '          ####          '
                        ],
                        [
                            '     ####        ####   ',
                            '   ########    ########  ',
                            '  ##YYYYYY##  ##YYYYYY## ',
                            ' ##YYYYYYYY####YYYYYYYY##',
                            '##YYYYRRYYYYYYYYRRYYYYY##',
                            '##YYYYRRRRYYYYRRRRYYYYY##',
                            '##YYYYRRRRRRRRRRRRYYYYY##',
                            '##YYYYRRRRRRRRRRRRYYYYY##',
                            '##YYYYRRRRRRRRRRRRYYYYY##',
                            '##YYYYRRRRRRRRRRRRYYYYY##',
                            '##YYYYRRRRRRRRRRRRYYYYY##',
                            '##YYYYRRRRRRRRRRRRYYYYY##',
                            '##YYYYRRRRRRRRRRRRYYYYY##',
                            '##YYYYRRRRYYYYRRRRYYYYY##',
                            '##YYYYRRYYYYYYYYRRYYYYY##',
                            ' ##YYYYYYYY####YYYYYYYY##',
                            '  ##YYYYYY##  ##YYYYYY## ',
                            '   ########    ########  ',
                            '     ####        ####   '
                        ],
                        [
                            '####            ####    ',
                            '  ####        ####      ',
                            '    ####    ####        ',
                            '  ##YYYY####YYYY##      ',
                            ' ##YYYYYYYYYYYY##       ',
                            '##YYYYRRRRRRYYY##       ',
                            '##YYYYRRRRRRYYY##       ',
                            '##YYYYRRRRRRYYY##       ',
                            '##YYYYRRRRRRYYY##       ',
                            '##YYYYRRRRRRYYY##       ',
                            '##YYYYRRRRRRYYY##       ',
                            '##YYYYRRRRRRYYY##       ',
                            '##YYYYRRRRRRYYY##       ',
                            ' ##YYYYYYYYYYYY##       ',
                            '  ##YYYY####YYYY##      ',
                            '    ####    ####        ',
                            '  ####        ####      ',
                            '####            ####    '
                        ],
                        [
                            '##        ##            ',
                            '  ##    ##              ',
                            '    ####                ',
                            '  ##YY##YY##            ',
                            ' ##YYYYYY##             ',
                            '##YYRRRYY##             ',
                            '##YYRRRYY##             ',
                            '##YYRRRYY##             ',
                            ' ##YYYYYY##             ',
                            '  ##YY##YY##            ',
                            '    ####                ',
                            '  ##    ##              ',
                            '##        ##            '
                        ],
                        [
                            '              ##        ',
                            '  ##                    ',
                            '              ##        ',
                            '    ##                  ',
                            '         ##             ',
                            '  ##                    ',
                            '              ##        ',
                            '    ##                  ',
                            '              ##        ',
                            '  ##                    '
                        ]
                    ];
                    
                    const frameIndex = Math.min(Math.floor(this.animFrame / 2), bombExplosionFrames.length - 1);
                    const pattern = bombExplosionFrames[frameIndex];
                    
                    const colors = {
                        '#': '#ff4400',
                        'Y': '#ffff00',
                        'R': '#ff0000',
                        'T': '#ff8800'
                    };
                    
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < pattern.length; row++) {
                            for (let col = 0; col < pattern[row].length; col++) {
                                if (pattern[row][col] === pixelType) {
                                    game.ctx.rect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                    
                    if (frameIndex < 3) {
                        const radius = 40 + (frameIndex * 60);
                        const alpha = 0.5 - (frameIndex * 0.15);
                        game.ctx.strokeStyle = `rgba(255, 100, 0, ${alpha})`;
                        game.ctx.lineWidth = 4;
                        game.ctx.beginPath();
                        game.ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
                        game.ctx.stroke();
                    }
                    
                    return;
                }
                
                if (this.type === 'rocket') {
                    const pixelSize = 5;
                    const px = this.x - 40;
                    const py = this.y - 40;
                    
                    const rocketExplosionFrames = [
                        [
                            '      ####      ',
                            '    ########    ',
                            '   ##RRRRRR##   ',
                            '  ##RRRRRRRR##  ',
                            ' ##RRRRRRRRRRR## ',
                            '##RRRRRRRRRRRRR##',
                            '##RRRR####RRRRR##',
                            '##RRRR####RRRRR##',
                            '##RRRRRRRRRRRRR##',
                            ' ##RRRRRRRRRRR## ',
                            '  ##RRRRRRRR##  ',
                            '   ##RRRRRR##   ',
                            '    ########    ',
                            '      ####      '
                        ],
                        [
                            '  ##        ##  ',
                            ' ####      #### ',
                            '##RR##    ##RR##',
                            '#RRRR##  ##RRRR#',
                            '#RRRRRR##RRRRRR#',
                            '#RRRRRRRRRRRRRR#',
                            '#RRR########RRR#',
                            '#RRR########RRR#',
                            '#RRRRRRRRRRRRRR#',
                            '#RRRRRR##RRRRRR#',
                            '#RRRR##  ##RRRR#',
                            '##RR##    ##RR##',
                            ' ####      #### ',
                            '  ##        ##  '
                        ],
                        [
                            '##          ##  ',
                            '  ##      ##    ',
                            '   ##    ##     ',
                            ' ##RR####RR##   ',
                            '##RRRRRRRRRR##  ',
                            '#RRRR####RRRR#  ',
                            '#RRR######RRR#  ',
                            '#RRR######RRR#  ',
                            '#RRRR####RRRR#  ',
                            '##RRRRRRRRRR##  ',
                            ' ##RR####RR##   ',
                            '   ##    ##     ',
                            '  ##      ##    ',
                            '##          ##  '
                        ],
                        [
                            '                ',
                            '  ##      ##    ',
                            '    ##  ##      ',
                            '  ##RR##RR##    ',
                            ' ##RRRRRRRR##   ',
                            '##RR####RR##    ',
                            '#RR######RR#    ',
                            '#RR######RR#    ',
                            '##RR####RR##    ',
                            ' ##RRRRRRRR##   ',
                            '  ##RR##RR##    ',
                            '    ##  ##      ',
                            '  ##      ##    ',
                            '                '
                        ],
                        [
                            '                ',
                            '                ',
                            '  ##      ##    ',
                            '    ####        ',
                            '  ##RR##        ',
                            ' ##RRRR##       ',
                            '##RR##RR##      ',
                            '##RR##RR##      ',
                            ' ##RRRR##       ',
                            '  ##RR##        ',
                            '    ####        ',
                            '  ##      ##    ',
                            '                ',
                            '                '
                        ]
                    ];
                    
                    const frameIndex = Math.min(Math.floor(this.animFrame / 2), rocketExplosionFrames.length - 1);
                    const pattern = rocketExplosionFrames[frameIndex];
                    
                    const colors = {
                        '#': '#ff6600',
                        'R': '#ff0000'
                    };
                    
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < pattern.length; row++) {
                            for (let col = 0; col < pattern[row].length; col++) {
                                if (pattern[row][col] === pixelType) {
                                    game.ctx.rect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                    
                    if (frameIndex < 3) {
                        const radius = 25 + (frameIndex * 20);
                        const alpha = 0.5 - (frameIndex * 0.15);
                        game.ctx.strokeStyle = `rgba(255, 102, 0, ${alpha})`;
                        game.ctx.lineWidth = 3;
                        game.ctx.beginPath();
                        game.ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
                        game.ctx.stroke();
                    }
                    
                    return;
                }
                
                if (this.type === 'teleport') {
                    const pixelSize = 4;
                    const px = this.x - 32;
                    const py = this.y - 32;
                    
                    const teleportFrames = [
                        [
                            '        ####        ',
                            '      ##CCCC##      ',
                            '     #CCCCCCCC#     ',
                            '    #CCPPPPPPCC#    ',
                            '   #CCPP####PPCC#   ',
                            '  #CCPP######PPCC#  ',
                            ' #CCPP##MMMM##PPCC# ',
                            '#CCPP##MMMMMM##PPCC#',
                            '#CCPP##MMMMMM##PPCC#',
                            ' #CCPP##MMMM##PPCC# ',
                            '  #CCPP######PPCC#  ',
                            '   #CCPP####PPCC#   ',
                            '    #CCPPPPPPCC#    ',
                            '     #CCCCCCCC#     ',
                            '      ##CCCC##      ',
                            '        ####        '
                        ],
                        [
                            '   ##          ##   ',
                            '  #CC#        #CC#  ',
                            ' #CCCC#      #CCCC# ',
                            '#CCPPCC#    #CCPPCC#',
                            '#CPP##PCC##CCP##PPC#',
                            '#CP####PPCCPP####PC#',
                            ' CP##MM##PP##MM##PC ',
                            ' CP##MMM####MMM##PC ',
                            ' CP##MMM####MMM##PC ',
                            ' CP##MM##PP##MM##PC ',
                            '#CP####PPCCPP####PC#',
                            '#CPP##PCC##CCP##PPC#',
                            '#CCPPCC#    #CCPPCC#',
                            ' #CCCC#      #CCCC# ',
                            '  #CC#        #CC#  ',
                            '   ##          ##   '
                        ],
                        [
                            ' ##              ## ',
                            '#CC#            #CC#',
                            ' #CC#          #CC# ',
                            '  #PCC#      #CCP#  ',
                            '   #PCC#    #CCP#   ',
                            '    #PCC#  #CCP#    ',
                            '     #MM####MM#     ',
                            '      #MMMMMM#      ',
                            '      #MMMMMM#      ',
                            '     #MM####MM#     ',
                            '    #PCC#  #CCP#    ',
                            '   #PCC#    #CCP#   ',
                            '  #PCC#      #CCP#  ',
                            ' #CC#          #CC# ',
                            '#CC#            #CC#',
                            ' ##              ## '
                        ],
                        [
                            '##              ##  ',
                            '                    ',
                            ' ##            ##   ',
                            '                    ',
                            '   ##        ##     ',
                            '                    ',
                            '     ##    ##       ',
                            '       ####         ',
                            '       ####         ',
                            '     ##    ##       ',
                            '                    ',
                            '   ##        ##     ',
                            '                    ',
                            ' ##            ##   ',
                            '                    ',
                            '##              ##  '
                        ]
                    ];
                    
                    const frameIndex = Math.min(Math.floor(this.animFrame / 2), teleportFrames.length - 1);
                    const pattern = teleportFrames[frameIndex];
                    
                    const colors = {
                        '#': '#6600cc',
                        'C': '#00ccff',
                        'P': '#cc00ff',
                        'M': '#ffff00'
                    };
                    
                    Object.keys(colors).forEach(pixelType => {
                        game.ctx.fillStyle = colors[pixelType];
                        game.ctx.beginPath();
                        
                        for (let row = 0; row < pattern.length; row++) {
                            for (let col = 0; col < pattern[row].length; col++) {
                                if (pattern[row][col] === pixelType) {
                                    game.ctx.rect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                                }
                            }
                        }
                        game.ctx.fill();
                    });
                    
                    return;
                }
                
                const pixelSize = 3;
                const px = this.x - 24;
                const py = this.y - 24;
                
                const explosionFrames = [
                    [
                        '        ##        ',
                        '       ####       ',
                        '      ######      ',
                        '     ##YYYY##     ',
                        '    ##YYYYYY##    ',
                        '   ##YYYYYYYY##   ',
                        '  ##YYYYRRYYY##   ',
                        ' ##YYYYRRRRYYYY## ',
                        '##YYYYRRRRRRYYY##',
                        ' ##YYYYRRRRYYYY## ',
                        '  ##YYYYRRYYY##   ',
                        '   ##YYYYYYYY##   ',
                        '    ##YYYYYY##    ',
                        '     ##YYYY##     ',
                        '      ######      ',
                        '       ####       '
                    ],
                    [
                        '   ##        ##   ',
                        '  ####      ####  ',
                        ' ######    ###### ',
                        '##YYYY##  ##YYYY##',
                        '#YYYYYY####YYYYYY#',
                        '#YYYYYYYYYYYYYYYY#',
                        '#YYYYRRRRRRRRYYY#',
                        '#YYYRRRRRRRRRRYYY#',
                        '#YYYRRRRRRRRRRYYY#',
                        '#YYYRRRRRRRRRRYYY#',
                        '#YYYYRRRRRRRRYYY#',
                        '#YYYYYYYYYYYYYYYY#',
                        '#YYYYYY####YYYYYY#',
                        '##YYYY##  ##YYYY##',
                        ' ######    ###### ',
                        '  ####      ####  '
                    ],
                    [
                        ' ##    ##    ##   ',
                        '####  ####  ####  ',
                        '##YY##YYYY##YY##  ',
                        '#YYYY##YY##YYYY#  ',
                        '#YYY######YYY#    ',
                        '##YY######YY##    ',
                        ' #YRRRRRRRRRY#    ',
                        ' #YRRRRRRRRRRY#   ',
                        ' #YRRRRRRRRRRY#   ',
                        ' #YRRRRRRRRRY#    ',
                        '##YY######YY##    ',
                        '#YYY######YYY#    ',
                        '#YYYY##YY##YYYY#  ',
                        '##YY##YYYY##YY##  ',
                        '####  ####  ####  ',
                        ' ##    ##    ##   '
                    ],
                    [
                        '##      ##      ##',
                        '##      ##      ##',
                        '  ##  ####  ##    ',
                        '  ##  #YY#  ##    ',
                        '    ###YY###      ',
                        '    #YYYYYY#      ',
                        '    #YRRRY#       ',
                        '     #RRR#        ',
                        '     #RRR#        ',
                        '    #YRRRY#       ',
                        '    #YYYYYY#      ',
                        '    ###YY###      ',
                        '  ##  #YY#  ##    ',
                        '  ##  ####  ##    ',
                        '##      ##      ##',
                        '##      ##      ##'
                    ],
                    [
                        '                  ',
                        ' ##          ##   ',
                        '                  ',
                        '    ##    ##      ',
                        '                  ',
                        '      ####        ',
                        '      #YY#        ',
                        '       ##         ',
                        '       ##         ',
                        '      #YY#        ',
                        '      ####        ',
                        '                  ',
                        '    ##    ##      ',
                        '                  ',
                        ' ##          ##   ',
                        '                  '
                    ]
                ];
                
                const frameIndex = Math.min(this.animFrame, explosionFrames.length - 1);
                const pattern = explosionFrames[frameIndex];
                
                const colors = {
                    '#': '#ff4400',
                    'Y': '#ffff00',
                    'R': '#ff0000'
                };
                
                Object.keys(colors).forEach(pixelType => {
                    game.ctx.fillStyle = colors[pixelType];
                    game.ctx.beginPath();
                    
                    for (let row = 0; row < pattern.length; row++) {
                        for (let col = 0; col < pattern[row].length; col++) {
                            if (pattern[row][col] === pixelType) {
                                game.ctx.rect(px + col * pixelSize, py + row * pixelSize, pixelSize, pixelSize);
                            }
                        }
                    }
                    game.ctx.fill();
                });
            }
        }

        function selectDifficulty(difficulty) {
            game.difficulty = difficulty;
            
            document.querySelectorAll('.difficulty-option').forEach(option => {
                option.classList.remove('selected');
            });
            event.target.closest('.difficulty-option').classList.add('selected');
        }

        function startGame() {
            if (!quizQuestions || quizQuestions.length === 0) {
                const statusDiv = document.getElementById('bankStatus');
                if (statusDiv) {
                    statusDiv.innerHTML = '❌ Enter a valid question bank code before starting';
                    statusDiv.style.color = 'var(--red-damage)';
                }
                return;
            }
            hideAllModals();
            initializeGame();
            startQuiz();
        }

        function answerQuiz(optionIndex) {
            if (game.state !== GameState.QUIZ) return;
            
            const question = quizQuestions[game.currentQuestionIndex];
            // optionIndex is the clicked DISPLAY position; map back to the real option index
            // via the shuffled order set up in nextQuestion().
            const optionOrder = game.currentOptionOrder || question.options.map((_, idx) => idx);
            const realIndex = optionIndex >= 0 ? optionOrder[optionIndex] : optionIndex;
            const correctDisplayIndex = optionOrder.indexOf(question.correct);
            const isCorrect = realIndex === question.correct;
            const optionsDiv = document.getElementById('quizOptions');
            const options = optionsDiv.querySelectorAll('.quiz-option');
            
            options.forEach(option => {
                option.style.pointerEvents = 'none';
            });
            
            if (isCorrect) {
                options[optionIndex].style.backgroundColor = 'rgba(46, 204, 113, 0.3)';
                options[optionIndex].style.borderColor = 'var(--green-success)';
                game.totalQuestionsCorrect = (game.totalQuestionsCorrect || 0) + 1;
                localStorage.setItem('totalQuestionsCorrect', game.totalQuestionsCorrect.toString());
            } else {
                if (optionIndex >= 0) {
                    options[optionIndex].style.backgroundColor = 'rgba(231, 76, 60, 0.3)';
                    options[optionIndex].style.borderColor = 'var(--red-damage)';
                }
                options[correctDisplayIndex].style.backgroundColor = 'rgba(46, 204, 113, 0.3)';
                options[correctDisplayIndex].style.borderColor = 'var(--green-success)';
            }
            
            // Adaptive difficulty: correct answers make a question rarer (half its
            // weight, floor 0.1), wrong answers make it more likely to reappear
            // (double its weight, cap 16) so struggling students see it again sooner.
            const weightedIndex = game.currentQuestionIndex;
            const currentWeight = game.questionWeights[weightedIndex] ?? 1;
            game.questionWeights[weightedIndex] = isCorrect
                ? Math.max(0.1, currentWeight / 2)
                : Math.min(16, currentWeight * 2);
            
            if (isCorrect) {
                const ammoGenLevel = game.runPowerups.ammoGeneration || 0;
                let ammoGain = game.baseAmmoPerCorrect + (game.permanentUpgrades.correctAnswerBoost * 5) + (ammoGenLevel * 10);
                if (game.equippedRunPowerups.includes('ammoCollector')) {
                    ammoGain += game.runPowerupDoubled.ammoCollector ? 10 : 5;
                }
                
                game.ammo += ammoGain;
                game.score += 10;
                game.quizCorrectCount++;
            } else {
                if (game.shields > 0) {
                    game.shields--;
                } else {
                    game.lives--;
                    game.lastDeathCause = 'quiz';
                }
                updateUI();
                
                if (game.lives <= 0) {
                    game.quizActive = false;
                    clearInterval(game.quizTimer);
                    hideAllModals();
                    gameOver();
                    return;
                }
            }
            
            game.questionsAnswered++;
            
            setTimeout(() => {
                if (!game.quizActive) return; // the 15s timer already ended the quiz
                if (game.difficulty === 'easy') {
                    if (game.questionsAnswered >= game.totalQuestionsThisQuiz) {
                        endQuiz();
                    } else {
                        nextQuestion();
                    }
                } else {
                    // Medium mode: unlimited questions, keep going until the timer
                    // interval itself calls endQuiz() when it hits 0.
                    if (game.quizTimeLeft > 0) {
                        nextQuestion();
                    }
                }
            }, 200);
        }

        // ===== Permanent (cross-run) upgrade shop - now lives on the Game Over screen =====
        function getPermanentUpgradeBaseCost(upgradeType) {
            return 20;
        }

        function getPermanentUpgradeCost(upgradeType) {
            const currentLevel = game.permanentUpgrades[upgradeType];
            return Math.round(getPermanentUpgradeBaseCost(upgradeType) * Math.pow(1.35, currentLevel));
        }

        function loadPermanentUpgrades() {
            const saved = JSON.parse(localStorage.getItem('permanentUpgrades') || 'null');
            game.permanentUpgrades = Object.assign({
                correctAnswerBoost: 0,
                fireRateBoost: 0,
                shipSpeed: 0,
                extraLife: 0,
                powerupSpawnRate: 0,
                startingAmmo: 0,
                bossBonus: 0,
                emergencyAmmo: 0
            }, saved || {});
        }

        function savePermanentUpgrades() {
            localStorage.setItem('permanentUpgrades', JSON.stringify(game.permanentUpgrades));
        }

        function buyPermanentUpgrade(upgradeType) {
            const cost = getPermanentUpgradeCost(upgradeType);
            if (game.coins < cost) return;
            
            game.coins -= cost;
            game.permanentUpgrades[upgradeType]++;
            savePermanentUpgrades();
            localStorage.setItem('coins', game.coins.toString());
            
            renderGameOverShop();
            updateUI();
        }

        function renderGameOverShop() {
            const upgradesDiv = document.getElementById('gameOverShopUpgrades');
            if (!upgradesDiv) return;
            upgradesDiv.innerHTML = '';
            
            document.getElementById('gameOverCoins').textContent = game.coins;
            const shopCoinsEl = document.getElementById('shopCoinsDisplay');
            if (shopCoinsEl) shopCoinsEl.textContent = game.coins;
            
            const upgradeData = {
                correctAnswerBoost: {
                    name: 'Correct Answer Boost',
                    description: 'Get +5 more ammo per correct answer'
                },
                fireRateBoost: {
                    name: 'Fire Rate Boost',
                    description: 'Shoot 10% faster per level'
                },
                shipSpeed: {
                    name: 'Ship Speed',
                    description: 'Move 10% faster per level'
                },
                extraLife: {
                    name: 'Extra Life',
                    description: 'Start every run with 1 more life'
                },
                powerupSpawnRate: {
                    name: 'Powerup Spawn Rate',
                    description: 'Increase powerup spawn chance by 5% per level'
                },
                startingAmmo: {
                    name: 'Starting Ammo',
                    description: 'Increase the amount of ammo you start with by 10 per upgrade'
                },
                bossBonus: {
                    name: 'Boss Bonus',
                    description: 'Defeating a boss upgrades a power-up by +1 more per upgrade level'
                },
                emergencyAmmo: {
                    name: 'Emergency Ammo',
                    description: 'Unlocks an in-game Emergency Ammo button (once per wave): answer a question correctly for a burst of ammo. +1 level increases the ammo you get from it.'
                }
            };
            
            Object.keys(upgradeData).forEach(upgradeType => {
                const data = upgradeData[upgradeType];
                const currentLevel = game.permanentUpgrades[upgradeType];
                const cost = getPermanentUpgradeCost(upgradeType);
                
                const upgradeDiv = document.createElement('div');
                upgradeDiv.className = 'upgrade-item';
                
                if (game.coins < cost) {
                    upgradeDiv.classList.add('cant-afford');
                }
                
                upgradeDiv.innerHTML = `
                    <div class="upgrade-info">
                        <div class="upgrade-name">${data.name}</div>
                        <div class="upgrade-description">${data.description}</div>
                        <div class="upgrade-level">Level: ${currentLevel} • Next Cost: ${cost} 🪙</div>
                    </div>
                    <button class="upgrade-buy" onclick="buyPermanentUpgrade('${upgradeType}')" 
                            ${game.coins < cost ? 'disabled' : ''}>
                        Buy (${cost})
                    </button>
                `;
                
                upgradesDiv.appendChild(upgradeDiv);
            });

            renderRunPowerupsTab();
        }

        function renderRunPowerupsTab() {
            const container = document.getElementById('gameOverShopPowerups');
            const infoEl = document.getElementById('powerupSlotsInfo');
            if (!container) return;
            container.innerHTML = '';
            const slots = getRunPowerupSlots();
            const correct = game.totalQuestionsCorrect || 0;

            if (infoEl) {
                infoEl.textContent = slots === 0
                    ? `Answer ${25 - correct > 0 ? 25 - correct : 25} more questions correctly (lifetime) to unlock your first free powerup.`
                    : `${game.equippedRunPowerups.length}/${slots} powerup slot${slots===1?'':'s'} equipped for your next run. Each equipped powerup gives a bonus question at the start of the run — answer correctly to double its effect!`;
            }

            RUN_POWERUP_KEYS.forEach(key => {
                const def = RUN_POWERUP_DEFS[key];
                const unlocked = correct >= def.unlockAt;
                const equipped = game.equippedRunPowerups.includes(key);

                const div = document.createElement('div');
                div.className = 'shop-item' + (equipped ? ' equipped' : '') + (unlocked ? '' : ' locked');

                if (!unlocked) {
                    div.innerHTML = `
                        <p class="shop-name" style="opacity:0.6;">🔒 ${def.name}</p>
                        <p class="shop-desc" style="opacity:0.6;">${def.desc}</p>
                        <p class="shop-owned" style="color:#999;">Unlocks at ${def.unlockAt} correct answers (you have ${correct})</p>
                    `;
                } else {
                    div.innerHTML = `
                        <p class="shop-name">${def.name}</p>
                        <p class="shop-desc">${def.desc}</p>
                        <button class="shop-btn" onclick="toggleRunPowerup('${key}')" style="width:100%;${equipped ? 'background:linear-gradient(160deg, #4a1a75 0%, #2a1040 100%);border-color:#c084fc;' : ''}">
                            ${equipped ? '✅ Equipped — tap to unequip' : (game.equippedRunPowerups.length >= slots ? 'Slots full' : 'Equip for next run')}
                        </button>
                    `;
                    if (equipped) {
                        // Style toggle button explicitly since shop-btn defaults aren't violet
                    }
                }
                container.appendChild(div);
            });
        }

        // Developer/testing shortcuts - typed into the SAME code box as question bank codes.
        const DEV_CODES = ['wave', 'alien', 'powerup'];

        function applyDevCode(code) {
            const statusDiv = document.getElementById('bankStatus');
            const extraDiv = document.getElementById('bankExtra');
            extraDiv.innerHTML = '';

            if (code === 'wave') {
                statusDiv.innerHTML = '🛠️ Dev mode: choose a starting wave';
                statusDiv.style.color = 'var(--gold)';

                const waveInput = document.createElement('input');
                waveInput.type = 'number';
                waveInput.min = '1';
                waveInput.max = '50';
                waveInput.value = '1';
                waveInput.style.cssText = 'background: rgba(0,0,0,0.5); border: 1px solid #666; border-radius: 5px; padding: 8px; color: white; font-family: "Lexend", sans-serif; width: 120px; margin-right: 10px;';

                const applyBtn = document.createElement('button');
                applyBtn.textContent = 'Set';
                applyBtn.style.cssText = 'padding: 8px 16px; font-size: 14px; background: linear-gradient(45deg, #2ecc71, #27ae60); border: none; border-radius: 4px; color: white; cursor: pointer; margin: 0;';
                applyBtn.onclick = () => {
                    const wave = parseInt(waveInput.value);
                    if (wave >= 1 && wave <= 50) {
                        game.startingWave = wave;
                        game.startingAmmo = 200;
                        game.secretCodeActive = true;
                        extraDiv.innerHTML = `✅ Starting wave set to ${wave} with 200 ammo! Click Begin Game to play.`;
                    } else {
                        extraDiv.innerHTML = '❌ Wave must be between 1-50';
                    }
                };

                extraDiv.appendChild(waveInput);
                extraDiv.appendChild(applyBtn);
            } else if (code === 'alien') {
                game.skipQuizzes = true;
                game.startingAmmo = 500;
                game.secretCodeActive = true;
                statusDiv.innerHTML = '✅ Quiz skip mode activated! Starting with 500 ammo!';
                statusDiv.style.color = 'var(--green-success)';
            } else if (code === 'powerup') {
                game.skipQuizzes = true;
                game.startingAmmo = 2000;
                game.secretCodeActive = true;
                game.powerupTestMode = true;
                statusDiv.innerHTML = '✅ Powerup testing mode! 2000 ammo, quizzes skipped, powerups every wave!';
                statusDiv.style.color = 'var(--green-success)';
            }
        }

        // Single entry point for the code box: figures out whether the person typed
        // a dev/testing shortcut or a question bank code, and handles either one.
        async function applyCode() {
            const codeInput = document.getElementById('bankCode');
            const extraDiv = document.getElementById('bankExtra');
            const code = codeInput.value.trim().toLowerCase();
            extraDiv.innerHTML = '';

            if (DEV_CODES.includes(code)) {
                applyDevCode(code);
                return;
            }

            await loadQuestionBank(code);
        }

        function restartGame(playAgain) {
            loadPermanentUpgrades();
            const savedTotalEnemiesDefeated = parseInt(localStorage.getItem('totalEnemiesDefeated') || '0');
            const savedCoins = parseInt(localStorage.getItem('coins') || '0');
            
            game.wave = game.secretCodeActive ? game.startingWave : 1;
            game.baseLives = 15 + game.permanentUpgrades.extraLife;
            game.lives = game.baseLives;
            game.score = 0;
            game.coins = savedCoins;
            game.ammo = game.secretCodeActive ? game.startingAmmo : 20 + (game.permanentUpgrades.startingAmmo || 0) * 10;
            game.shields = 0;
            game.bullets = [];
            game.pendingBullets = [];
            game.enemyBullets = [];
            game.enemies = [];
            game.explosions = [];
            game.powerups = [];
            game.orbitBlades = [];
            game.volatileHazards = [];
            game.curseSeen = {};
            game.powerupSpawnChance = 0.1;
            game.tripleShotActive = false;
            game.rocketActive = false;
            game.rapidFireActive = false;
            game.rapidFireShotCounter = 0;
            game.enemiesDefeatedThisRun = 0;
            game.enemiesDefeatedForLifeSteal = 0;
            game.shotsFiredThisRun = 0;
            game.totalEnemiesDefeatedAllTime = savedTotalEnemiesDefeated;
            game.runPowerups = {};
            game.firstQuizAwarded = false;
            
            game.secretCodeActive = false;
            game.startingWave = 1;
            game.startingAmmo = 20;
            game.skipQuizzes = false;
            game.powerupTestMode = false;
            
            game.matchStartTime = null;
            const elapsedEl = document.getElementById('elapsedTime');
            if (elapsedEl) elapsedEl.textContent = '00:00';
            
            hideAllModals();
            if (playAgain && quizQuestions && quizQuestions.length > 0) {
                game.canvas = document.getElementById('gameCanvas');
                game.ctx = game.canvas.getContext('2d');
                game.width = 800;
                game.height = 600;
                game.canvas.width = game.width;
                game.canvas.height = game.height;
                resizeCanvasFrame();
                game.matchStartTime = Date.now();
                startQuiz();
            } else {
                document.getElementById('welcomeScreen').style.display = 'flex';
                game.state = GameState.WELCOME;
                updateUI();
            }
        }

        function initializeGame() {
            game.canvas = document.getElementById('gameCanvas');
            game.ctx = game.canvas.getContext('2d');
            
            game.width = 800;
            game.height = 600;
            game.canvas.width = game.width;
            game.canvas.height = game.height;
            resizeCanvasFrame();
            game.matchStartTime = Date.now();
            
            game.highScore = parseInt(localStorage.getItem('spaceInvadersHighScore') || '0');
            
            loadPermanentUpgrades();
            const savedTotalEnemiesDefeated = parseInt(localStorage.getItem('totalEnemiesDefeated') || '0');
            const savedCoins = parseInt(localStorage.getItem('coins') || '0');
            game.totalQuestionsCorrect = parseInt(localStorage.getItem('totalQuestionsCorrect') || '0');
            
            game.totalEnemiesDefeatedAllTime = savedTotalEnemiesDefeated;
            game.coins = savedCoins;
            game.score = 0;
            game.baseLives = 15 + game.permanentUpgrades.extraLife;
            game.lives = game.baseLives;
            game.shields = 0;
            game.runPowerups = {};
            game.firstQuizAwarded = false;
            
            if (game.secretCodeActive) {
                game.wave = game.startingWave;
                game.ammo = game.startingAmmo;
            } else {
                game.ammo = 20 + (game.permanentUpgrades.startingAmmo || 0) * 10;
            }
            
            game.player = new Player(game.width / 2 - 20, game.height - 100);
            
            createStars();
            
            gameLoopToken++;
            gameLoop(gameLoopToken);
            
            updateUI();
        }

        function createStars() {
            const starsContainer = document.getElementById('stars');
            starsContainer.innerHTML = '';
            
            for (let i = 0; i < 100; i++) {
                const star = document.createElement('div');
                star.className = 'star';
                star.style.left = Math.random() * 100 + '%';
                star.style.top = Math.random() * 100 + '%';
                star.style.width = Math.random() * 3 + 1 + 'px';
                star.style.height = star.style.width;
                star.style.animationDelay = Math.random() * 2 + 's';
                starsContainer.appendChild(star);
            }
        }

        function startQuiz() {
            if (game.skipQuizzes) {
                startWave();
                return;
            }
            
            game.state = GameState.QUIZ;
            game.quizActive = true;
            game.questionsAnswered = 0;
            game.usedQuestions = [];
            game.quizCorrectCount = 0;
            
            if (game.difficulty === 'easy') {
                game.totalQuestionsThisQuiz = 4;
            }
            
            document.getElementById('quizTitleText').textContent = currentSubjectName ? currentSubjectName.toUpperCase() : '';
            document.getElementById('quiz').style.display = 'flex';
            nextQuestion();
        }

        // Picks a random index out of `indices`, weighted by game.questionWeights.
        // Questions the student has recently gotten wrong carry a higher weight
        // (up to 16x) and so are more likely to be picked; questions they've
        // nailed carry a lower weight (down to 0.1x) and become rarer.
        function weightedRandomIndex(indices) {
            const weights = indices.map(i => game.questionWeights[i] ?? 1);
            const total = weights.reduce((sum, w) => sum + w, 0);
            if (total <= 0) return indices[Math.floor(Math.random() * indices.length)];
            let roll = Math.random() * total;
            for (let i = 0; i < indices.length; i++) {
                roll -= weights[i];
                if (roll <= 0) return indices[i];
            }
            return indices[indices.length - 1];
        }

        function nextQuestion() {
            let availableIndices = quizQuestions
                .map((_, index) => index)
                .filter(index => !game.usedQuestions.includes(index));
            
            if (availableIndices.length === 0) {
                game.usedQuestions = [];
                availableIndices = quizQuestions.map((_, index) => index);
            }
            
            const questionIndex = weightedRandomIndex(availableIndices);
            game.usedQuestions.push(questionIndex);
            game.currentQuestionIndex = questionIndex;
            
            const question = quizQuestions[questionIndex];
            
            document.getElementById('quizQuestion').textContent = question.question;
            
            const optionsDiv = document.getElementById('quizOptions');
            optionsDiv.innerHTML = '';
            
            // Shuffle the display order of the answer options (Fisher-Yates) so the
            // correct answer isn't always in the same position - students have to
            // actually read and pick the right answer rather than memorize a slot.
            const optionOrder = question.options.map((_, idx) => idx);
            for (let i = optionOrder.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [optionOrder[i], optionOrder[j]] = [optionOrder[j], optionOrder[i]];
            }
            game.currentOptionOrder = optionOrder;
            
            optionOrder.forEach((originalIndex, displayIndex) => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'option quiz-option';
                optionDiv.textContent = question.options[originalIndex];
                optionDiv.style.pointerEvents = 'auto';
                optionDiv.style.backgroundColor = '';
                optionDiv.style.borderColor = '';
                optionDiv.onclick = () => answerQuiz(displayIndex);
                optionsDiv.appendChild(optionDiv);
            });
            
            if (game.difficulty === 'easy') {
                document.getElementById('quizProgress').textContent = `Question ${game.questionsAnswered + 1} of ${game.totalQuestionsThisQuiz}`;
            } else {
                document.getElementById('quizProgress').textContent = `Questions Answered: ${game.questionsAnswered}`;
            }
            
            if (game.difficulty === 'medium') {
                if (game.questionsAnswered === 0) {
                    game.quizTimeLeft = 15;
                    game.quizTimer = setInterval(() => {
                        game.quizTimeLeft--;
                        document.getElementById('quizTimer').textContent = game.quizTimeLeft;
                        
                        if (game.quizTimeLeft <= 0) {
                            clearInterval(game.quizTimer);
                            endQuiz();
                        }
                    }, 1000);
                }
                document.getElementById('quizTimer').textContent = game.quizTimeLeft;
                document.getElementById('quizTimer').style.display = 'block';
            } else {
                document.getElementById('quizTimer').style.display = 'none';
            }
        }

        function endQuiz() {
            game.quizActive = false;
            clearInterval(game.quizTimer);
            hideAllModals();
            
            const wasFirstQuiz = !game.firstQuizAwarded;
            game.firstQuizAwarded = true;
            
            let rewardCount = game.quizCorrectCount;
            let isFreeStarter = false;
            if (wasFirstQuiz && rewardCount === 0) {
                // Guarantee a free pick after the very first quiz, even with 0 correct.
                rewardCount = 1;
                isFreeStarter = true;
            }
            
            if (wasFirstQuiz && game.equippedRunPowerups.length > 0) {
                game.bonusQuizQueue = game.equippedRunPowerups.slice();
                game.runPowerupDoubled = {};
                game.pendingRewardCount = rewardCount;
                game.pendingIsFreeStarter = isFreeStarter;
                startBonusPowerupQuiz();
                return;
            }
            
            showQuizRewardSelect(rewardCount, isFreeStarter);
        }

        // For each equipped single-run powerup, ask one bonus multichoice question at the
        // start of the run. Answering correctly doubles that specific powerup's effect
        // for this run only (tracked in game.runPowerupDoubled).
        function applyLuckyStartIfEquipped() {
            if (!game.equippedRunPowerups.includes('luckyStart')) return;
            const grantCount = game.runPowerupDoubled.luckyStart ? 2 : 1;
            const pool = POWERUP_KEYS.filter(key => !POWERUP_DEFS[key].curse);
            for (let i = 0; i < grantCount && pool.length > 0; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                const key = pool.splice(idx, 1)[0];
                game.runPowerups[key] = (game.runPowerups[key] || 0) + 1;
            }
            updateUI();
        }

        function startBonusPowerupQuiz() {
            if (!game.bonusQuizQueue || game.bonusQuizQueue.length === 0) {
                applyLuckyStartIfEquipped();
                showQuizRewardSelect(game.pendingRewardCount, game.pendingIsFreeStarter);
                return;
            }
            const key = game.bonusQuizQueue[0];
            const def = RUN_POWERUP_DEFS[key];
            const q = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];
            const shuffledOptions = q.options.map((opt, idx) => ({ opt, idx })).sort(() => Math.random() - 0.5);

            document.getElementById('quizTimer').style.display = 'none';
            document.getElementById('quizProgress').textContent = `Bonus Question — Double ${def.name}?`;
            document.getElementById('quizTitleText').textContent = '⭐ BONUS';
            document.getElementById('quizQuestion').textContent = q.question;
            document.getElementById('quizResult').textContent = '';
            const optionsDiv = document.getElementById('quizOptions');
            optionsDiv.innerHTML = '';
            shuffledOptions.forEach(({ opt, idx }) => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'option quiz-option';
                optionDiv.textContent = opt;
                optionDiv.onclick = () => answerBonusPowerupQuiz(idx === q.correct);
                optionsDiv.appendChild(optionDiv);
            });
            document.getElementById('quiz').style.display = 'flex';
        }

        function answerBonusPowerupQuiz(isCorrect) {
            const key = game.bonusQuizQueue.shift();
            if (isCorrect) {
                game.runPowerupDoubled[key] = true;
                document.getElementById('quizResult').textContent = `✅ Correct! ${RUN_POWERUP_DEFS[key].name} is doubled for this run.`;
            } else {
                document.getElementById('quizResult').textContent = `❌ Not quite — ${RUN_POWERUP_DEFS[key].name} stays at its normal effect this run.`;
            }
            document.querySelectorAll('#quizOptions .option').forEach(el => el.style.pointerEvents = 'none');
            setTimeout(startBonusPowerupQuiz, 1200);
        }

        // For every question answered correctly this quiz, the player gets to choose
        // 1 power-up out of that many random unique options (0 correct = 0 picks,
        // 4 correct = pick 1 of 4 options). Picking a power-up they already own
        // upgrades it instead. When isFreeStarter is true, the modal text is tweaked
        // to explain it's a free gift for finishing their first quiz.
        function showQuizRewardSelect(count, isFreeStarter) {
            const titleEl = document.getElementById('powerupSelectTitle');
            const subtitleEl = document.getElementById('powerupSelectSubtitle');
            if (isFreeStarter) {
                if (titleEl) titleEl.textContent = '🎁 FREE STARTER POWER-UP!';
                if (subtitleEl) subtitleEl.textContent = 'A free gift for finishing your first quiz. This power-up lasts for the rest of this run.';
            } else {
                if (titleEl) titleEl.textContent = '⚡ CHOOSE A POWER-UP';
                if (subtitleEl) subtitleEl.textContent = `You got ${count} question${count === 1 ? '' : 's'} correct - pick 1 power-up to unlock or upgrade!`;
            }
            
            if (count <= 0) {
                startWave();
                return;
            }
            
            const pool = POWERUP_KEYS.slice();
            const filteredPool = pool.filter(key => {
                const maxLevel = POWERUP_DEFS[key].maxLevel;
                if ((game.runPowerups[key] || 0) >= maxLevel) return false;
                // A declined (or not-yet-shown) curse only gets one shot at appearing per run.
                if (POWERUP_DEFS[key].curse && game.curseSeen[key]) return false;
                return true;
            });
            
            for (let i = filteredPool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [filteredPool[i], filteredPool[j]] = [filteredPool[j], filteredPool[i]];
            }
            
            const options = filteredPool.slice(0, Math.min(count, filteredPool.length));
            
            // Whether picked or not, once a curse is shown it's used up for this run.
            options.forEach(key => {
                if (POWERUP_DEFS[key].curse) game.curseSeen[key] = true;
            });
            
            game.state = GameState.QUIZ; // reuse quiz-like pause state so gameplay stays frozen
            const container = document.getElementById('powerupSelectOptions');
            container.innerHTML = '';
            
            options.forEach(key => {
                const def = POWERUP_DEFS[key];
                const level = game.runPowerups[key] || 0;
                const div = document.createElement('div');
                div.className = 'option';
                const nameColor = def.curse ? '#ff4444' : 'var(--blue-highlight)';
                const nameLabel = def.curse ? `☠️ ${def.name}` : def.name;
                div.innerHTML = `<strong style="color: ${nameColor};">${nameLabel}${level > 0 ? ` (Owned - Lv ${level})` : ''}</strong><br><span style="font-size: 14px; color: #cccccc;">${def.desc(level)}</span>`;
                div.onclick = () => choosePowerup(key);
                container.appendChild(div);
            });
            
            hideAllModals();
            document.getElementById('powerupSelect').style.display = 'block';
        }

        function choosePowerup(key) {
            game.runPowerups[key] = (game.runPowerups[key] || 0) + 1;
            
            // Immediate one-off effects
            if (key === 'repairedHulls') {
                if (game.lives < game.baseLives) game.lives++;
            } else if (key === 'shieldWall') {
                game.lives++;
            } else if (key === 'glassCannonRounds') {
                game.lives = Math.max(1, Math.floor(game.lives / 2));
            } else if (key === 'staticDischarge') {
                game.runPowerups.piercingRound = (game.runPowerups.piercingRound || 0) + 1;
            }
            
            updateUI();
            hideAllModals();
            startWave();
        }

        // ===== Single-run powerups, unlocked by lifetime correct-answer milestones =====
        const RUN_POWERUP_DEFS = {
            ammoCollector: { name: '🔫 Ammo Collector', desc: 'Increase the ammo collected per question.', unlockAt: 25 },
            higherScore: { name: '⭐ Higher Score', desc: 'Adds a bonus to your score.', unlockAt: 50 },
            luckyStart: { name: '🎁 Lucky Start', desc: 'Start the next run with a random upgrade already active.', unlockAt: 75 },
            treasureHunter: { name: '🪙 Treasure Hunter', desc: 'Gain bonus coins for every enemy defeated during the next run.', unlockAt: 100 }
        };
        const RUN_POWERUP_KEYS = Object.keys(RUN_POWERUP_DEFS);

        function getRunPowerupSlots() {
            const c = game.totalQuestionsCorrect || 0;
            if (c < 25) return 0;
            if (c >= 400) return 4;
            if (c >= 300) return 3;
            if (c >= 200) return 2;
            return 1;
        }

        function loadEquippedRunPowerups() {
            const saved = JSON.parse(localStorage.getItem('equippedRunPowerups') || '[]');
            game.equippedRunPowerups = Array.isArray(saved) ? saved.filter(k => RUN_POWERUP_DEFS[k]) : [];
        }
        function saveEquippedRunPowerups() {
            localStorage.setItem('equippedRunPowerups', JSON.stringify(game.equippedRunPowerups));
        }
        function toggleRunPowerup(key) {
            const idx = game.equippedRunPowerups.indexOf(key);
            if (idx >= 0) {
                game.equippedRunPowerups.splice(idx, 1);
            } else {
                if (game.equippedRunPowerups.length >= getRunPowerupSlots()) return;
                game.equippedRunPowerups.push(key);
            }
            saveEquippedRunPowerups();
            renderGameOverShop();
        }


        // already own (their choice of which one). If they don't own any yet (or
        // everything they own is already maxed out), they get one brand-new random
        // power-up for free instead.
        function showBossUpgradeSelect() {
            const titleEl = document.getElementById('powerupSelectTitle');
            const subtitleEl = document.getElementById('powerupSelectSubtitle');
            const container = document.getElementById('powerupSelectOptions');
            container.innerHTML = '';
            
            const upgradeableOwned = Object.keys(game.runPowerups).filter(key => {
                const level = game.runPowerups[key] || 0;
                return level > 0 && level < POWERUP_DEFS[key].maxLevel;
            });
            
            if (upgradeableOwned.length > 0) {
                if (titleEl) titleEl.textContent = '🏆 BOSS DEFEATED! Free Upgrade!';
                if (subtitleEl) subtitleEl.textContent = 'Pick one of your power-ups to upgrade for free.';
                
                upgradeableOwned.forEach(key => {
                    const def = POWERUP_DEFS[key];
                    const level = game.runPowerups[key] || 0;
                    const div = document.createElement('div');
                    div.className = 'option';
                    div.innerHTML = `<strong style="color: var(--blue-highlight);">${def.name} (Lv ${level})</strong><br><span style="font-size: 14px; color: #cccccc;">${def.desc(level)}</span>`;
                    div.onclick = () => grantBossPowerup(key);
                    container.appendChild(div);
                });
            } else {
                const pool = POWERUP_KEYS.filter(key => {
                    if (POWERUP_DEFS[key].curse) return false;
                    return (game.runPowerups[key] || 0) < POWERUP_DEFS[key].maxLevel;
                });
                
                if (pool.length === 0) {
                    // Nothing left to grant - skip straight to the next quiz.
                    startQuiz();
                    return;
                }
                
                const key = pool[Math.floor(Math.random() * pool.length)];
                const def = POWERUP_DEFS[key];
                if (titleEl) titleEl.textContent = '🏆 BOSS DEFEATED! Free Power-Up!';
                if (subtitleEl) subtitleEl.textContent = "You don't have a power-up to upgrade yet, so here's a free new one.";
                const div = document.createElement('div');
                div.className = 'option';
                div.innerHTML = `<strong style="color: var(--blue-highlight);">${def.name}</strong><br><span style="font-size: 14px; color: #cccccc;">${def.desc(0)}</span>`;
                div.onclick = () => grantBossPowerup(key);
                container.appendChild(div);
            }
            
            game.state = GameState.QUIZ; // reuse quiz-like pause state so gameplay stays frozen
            hideAllModals();
            document.getElementById('powerupSelect').style.display = 'block';
        }

        function grantBossPowerup(key) {
            const bonusLevels = 1 + (game.permanentUpgrades.bossBonus || 0);
            const maxLevel = POWERUP_DEFS[key].maxLevel;
            game.runPowerups[key] = Math.min(maxLevel, (game.runPowerups[key] || 0) + bonusLevels);
            
            if (key === 'repairedHulls') {
                if (game.lives < game.baseLives) game.lives++;
            } else if (key === 'shieldWall') {
                game.lives++;
            }
            
            updateUI();
            hideAllModals();
            startQuiz();
        }

        function showBossIntro(bossTypesOrSwarm, onComplete) {
            game.state = GameState.BOSS_INTRO;
            hideAllModals();

            const container = document.getElementById('bossIntroPortraits');
            container.innerHTML = '';

            bossTypesOrSwarm.forEach(bt => {
                const info = BOSS_INFO[bt] || { name: 'UNKNOWN', tagline: '' };
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; max-width:200px;';

                const canvas = document.createElement('canvas');
                canvas.style.cssText = 'image-rendering: pixelated; filter: drop-shadow(0 0 14px rgba(255,20,120,0.6));';
                wrap.appendChild(canvas);

                if (bt === 'swarm') {
                    // No single boss sprite for the Swarm event - draw a scattered
                    // cluster of small red squares to suggest overwhelming numbers.
                    canvas.width = 96; canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    for (let i = 0; i < 14; i++) {
                        ctx.fillStyle = i % 2 === 0 ? '#ff2222' : '#aa0000';
                        const sx = 6 + Math.random() * 78;
                        const sy = 6 + Math.random() * 46;
                        ctx.fillRect(sx, sy, 8, 8);
                    }
                } else {
                    renderBossPortrait(canvas, bt);
                }

                const nameEl = document.createElement('div');
                nameEl.textContent = info.name;
                nameEl.style.cssText = 'color:#fff; font-weight:800; letter-spacing:1px; margin-top:10px; font-size:clamp(14px,2vw,18px);';
                wrap.appendChild(nameEl);

                const tagEl = document.createElement('div');
                tagEl.textContent = info.tagline;
                tagEl.style.cssText = 'color:#cccccc; font-size:12px; margin-top:4px;';
                wrap.appendChild(tagEl);

                container.appendChild(wrap);
            });

            document.getElementById('bossIntroScreen').style.display = 'block';
            triggerShake(400, 5);

            setTimeout(() => {
                hideAllModals();
                game.state = GameState.PLAYING;
                onComplete();
            }, 1800);
        }

        function startWave() {
            game.state = GameState.PLAYING;
            game.emergencyAmmoUsedThisWave = false;
            game.enemies = [];
            game.bullets = [];
            game.pendingBullets = [];
            game.explosions = [];
            game.powerups = [];
            game.tripleShotActive = false;
            game.rocketActive = false;
            game.rapidFireActive = false;
            game.rapidFireShotCounter = 0;
            
            game.powerupSpawnScheduled = false;
            const upgradeBonus = game.permanentUpgrades.powerupSpawnRate * 0.05;
            const totalSpawnChance = game.powerupSpawnChance + upgradeBonus;
            const shouldSpawn = game.powerupTestMode || Math.random() < totalSpawnChance;
            if (shouldSpawn) {
                const spawnDelay = 2000 + (Math.random() * 3000);
                game.powerupSpawnTime = Date.now() + spawnDelay;
                game.powerupSpawnScheduled = true;
            } else {
                game.powerupSpawnChance = Math.min(1.0, game.powerupSpawnChance + game.powerupSpawnIncrement);
            }
            
            if (game.wave % 5 === 0) {
                game.currentWaveIsBoss = true;
                game.totalEnemiesThisWave = 1;
                
                // Item 4: camera shake to telegraph the boss, then spawn it
                game.waveComplete = true; // hold off the "wave complete" check until the boss exists
                triggerShake(650, 9);
                setTimeout(() => {
                    let bossType;
                    do {
                        bossType = Math.floor(Math.random() * 6); // 0-4 = real bosses, 5 = The Swarm
                    } while (bossType === game.lastBossType && game.wave > 5);
                    
                    game.lastBossType = bossType;

                    if (bossType === 5) {
                        // The Swarm: no boss entity. Instead, double the normal alien
                        // count and spawn it in faster, all colored red as a warning.
                        game.currentWaveIsBoss = false;
                        showBossIntro(['swarm'], () => {
                            spawnSwarmWave();
                            game.waveComplete = false;
                        });
                        return;
                    }

                    // Extra-boss chance: 1 extra boss (1%/wave, capped 10%), or 2 extra (0.5%/5 waves, capped 5%).
                    const extra2Chance = Math.min(5, 0.5 * Math.floor(game.wave / 5));
                    const extra1Chance = Math.min(10, 1 * game.wave);
                    const roll = Math.random() * 100;
                    let extraCount = 0;
                    if (roll < extra2Chance) extraCount = 2;
                    else if (roll < extra1Chance) extraCount = 1;
                    const extraTypes = [];
                    for (let e = 0; e < extraCount; e++) {
                        let extraType;
                        do {
                            extraType = Math.floor(Math.random() * 5);
                        } while (extraType === bossType || extraTypes.includes(extraType));
                        extraTypes.push(extraType);
                    }

                    showBossIntro([bossType, ...extraTypes], () => {
                        game.enemies.push(new Enemy(game.width / 2 - 48, 50, 'boss', 0, bossType));
                        extraTypes.forEach((extraType, e) => {
                            const extraX = (e % 2 === 0) ? 40 : game.width - 136;
                            game.enemies.push(new Enemy(extraX, 50 + (e + 1) * 90, 'boss', 0, extraType));
                        });
                        game.waveComplete = false;
                    });
                }, 550);
            } else {
                game.currentWaveIsBoss = false;
                const enemyCount = game.wave * 2;
                game.totalEnemiesThisWave = enemyCount;
                
                const usedPositions = [];
                const minDistance = 60;
                const upgradeTotal = getTotalPermanentUpgrades();
                const spawnWeights = computeEnemySpawnWeights(game.wave, upgradeTotal);
                
                for (let i = 0; i < enemyCount; i++) {
                    let x, y;
                    let attempts = 0;
                    
                    do {
                        x = Math.random() * (game.width - 48);
                        y = Math.max(TOP_BORDER, -50 - (Math.random() * 200));
                        attempts++;
                    } while (attempts < 50 && usedPositions.some(pos => 
                        Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2) < minDistance
                    ));
                    
                    usedPositions.push({x, y});
                    
                    const maxDelaySeconds = 1.5 * game.wave;
                    const deployDelay = Math.floor(Math.random() * (maxDelaySeconds * 60));
                    
                    const subtype = pickEnemySubtype(spawnWeights);
                    const leaderEnemy = new Enemy(x, y, 'normal', deployDelay, null, false, subtype);
                    game.enemies.push(leaderEnemy);

                    // White enemies always spawn as a formation group (this whole group still only
                    // counts as ONE spawn against the wave's spawn table - the extra members ride
                    // along with the leader's movement instead of adding to the planned wave count).
                    if (subtype === 'white' || subtype === 'cyan') {
                        const clusterSize = subtype === 'white' ? Math.floor(game.wave / 2) : 0;
                        for (let c = 0; c < clusterSize; c++) {
                            const cx = Math.max(0, Math.min(game.width - 48, x + (Math.random() - 0.5) * 70));
                            const cy = Math.max(TOP_BORDER, y - 20 - Math.random() * 40);
                            const member = new Enemy(cx, cy, 'normal', deployDelay + Math.floor(Math.random() * 20), null, false, subtype);
                            if (subtype === 'white') {
                                // Follow the leader's position/movement so the whole group moves as one.
                                member.groupLeader = leaderEnemy;
                                member.groupOffsetX = cx - x;
                                member.groupOffsetY = cy - y;
                            }
                            game.enemies.push(member);
                        }
                    }
                }
                
                // Item 5: a random number of aliens between W and 2W (on wave W) can fire
                // straight down at the player this wave.
                const shooterCount = Math.min(
                    game.wave + Math.floor(Math.random() * (game.wave + 1)),
                    game.enemies.length
                );
                const shuffled = game.enemies.slice().sort(() => Math.random() - 0.5);
                for (let i = 0; i < shooterCount; i++) {
                    shuffled[i].canShoot = true;
                    shuffled[i].alienFireRate = 1500 + Math.random() * 2000;
                    shuffled[i].lastAlienShot = Date.now() + Math.random() * 2000;
                }
                
                game.waveComplete = false;
            }
            
            updateUI();
        }

        // Tracks which gameLoop "chain" is the current one. Each call to initializeGame()
        // (i.e. each new run) bumps this token and starts a fresh loop; any older loop
        // still in flight sees a stale token and quietly stops itself instead of
        // continuing to run alongside the new one (which was doubling/tripling/etc.
        // update() calls per frame and making the game speed up on every replay).
        let gameLoopToken = 0;

        function gameLoop(token) {
            if (token !== gameLoopToken) return;
            if (game.state === GameState.PLAYING) {
                update();
                draw();
            }
            applyFrameTransform();
            requestAnimationFrame(() => gameLoop(token));
        }

        setInterval(() => {
            if (game.state !== GameState.WELCOME && game.state !== GameState.GAME_OVER) {
                updateElapsedTime();
            }
        }, 1000);

        function update() {
            game.player.update();
            
            game.bullets = game.bullets.filter(bullet => {
                bullet.update();
                const offscreen = bullet.isFragment ? false : (bullet.y < -bullet.height - 20 || bullet.y > game.height + 20);
                const remove = bullet.markedForRemoval || offscreen;
                if (remove && !bullet.markedForRemoval && !bullet.isFragment && bullet.mods && bullet.mods.shrapnel > 0) {
                    spawnShrapnel(bullet.x, bullet.y, bullet.mods.shrapnel);
                }
                return !remove;
            });
            if (game.pendingBullets.length) {
                game.bullets = game.bullets.concat(game.pendingBullets);
                game.pendingBullets = [];
            }
            
            for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
                const bullet = game.enemyBullets[i];
                bullet.update();
                const offscreen = !(bullet.y < game.height + bullet.height && bullet.x > -bullet.width && bullet.x < game.width + bullet.width);
                if (bullet.markedForRemoval || offscreen) {
                    game.enemyBullets.splice(i, 1);
                }
            }
            
            game.enemies = game.enemies.filter(enemy => {
                enemy.update();
                if (enemy.type !== 'boss' && enemy.y > game.height + 50) {
                    if (enemy.subtype === 'white' && !enemy.groupLeader) {
                        const followers = game.enemies.filter(e => e !== enemy && e.groupLeader === enemy);
                        if (followers.length > 0) {
                            const newLeader = followers[0];
                            newLeader.groupLeader = null;
                            newLeader.zigTimer = 0;
                            newLeader.moveHeading = enemy.moveHeading || (Math.random() < 0.5 ? -1 : 1);
                            for (const follower of followers) {
                                if (follower === newLeader) continue;
                                follower.groupLeader = newLeader;
                                follower.groupOffsetX = follower.x - newLeader.x;
                                follower.groupOffsetY = follower.y - newLeader.y;
                            }
                        }
                    }
                    return false;
                }
                return true;
            });
            
            if (game.powerupSpawnScheduled && Date.now() >= game.powerupSpawnTime) {
                const spawnX = Math.random() * (game.width - 32);
                const spawnY = -50;
                // 8% chance for extralife, 23% for each of the other 4 types
                const rand = Math.random();
                let powerupType;
                if (rand < 0.08) {
                    powerupType = 'extralife';
                } else if (rand < 0.31) {
                    powerupType = 'bomb';
                } else if (rand < 0.54) {
                    powerupType = 'tripleshot';
                } else if (rand < 0.77) {
                    powerupType = 'rocket';
                } else {
                    powerupType = 'rapidfire';
                }
                game.powerups.push(new Powerup(spawnX, spawnY, powerupType));
                game.powerupSpawnScheduled = false;
                game.powerupSpawnChance = 0.1;
            }
            
            game.powerups.forEach(powerup => {
                powerup.update();
            });
            
            game.explosions = game.explosions.filter(explosion => {
                explosion.update();
                return explosion.life > 0;
            });
            
            updateVolatileCoreHazards();
            
            checkCollisions();
            if (game.pendingBullets.length) {
                game.bullets = game.bullets.concat(game.pendingBullets);
                game.pendingBullets = [];
            }
            
            if (game.enemies.length === 0 && !game.waveComplete && game.state === GameState.PLAYING) {
                game.waveComplete = true;
                const wasBossWave = game.currentWaveIsBoss;
                game.wave++;
                setTimeout(() => {
                    if (wasBossWave) {
                        showBossUpgradeSelect();
                    } else {
                        startQuiz();
                    }
                }, 1000);
            }
            
            if (game.lives <= 0) {
                gameOver();
            }
        }

        // Draws a boss laser beam (start->bounce->end). When `wavy` is true, offsets the
        // line perpendicular to its direction in a sine pattern for the Sine Wave effect.
        // This is purely visual - hit detection still uses the straight base path.
        function drawBeamSegment(beamPath, wavy, now) {
            const segments = [[beamPath.start, beamPath.bounce], [beamPath.bounce, beamPath.end]];
            game.ctx.beginPath();
            segments.forEach(([p1, p2]) => {
                if (!wavy) {
                    game.ctx.moveTo(p1.x, p1.y);
                    game.ctx.lineTo(p2.x, p2.y);
                    return;
                }
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len, ny = dx / len;
                const steps = 20;
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const baseX = p1.x + dx * t, baseY = p1.y + dy * t;
                    const wave = Math.sin(t * 10 + now * 0.01) * 10;
                    const px = baseX + nx * wave, py = baseY + ny * wave;
                    if (s === 0) game.ctx.moveTo(px, py); else game.ctx.lineTo(px, py);
                }
            });
            game.ctx.stroke();
        }

        // The player's actual collision box is smaller than its visible sprite so that
        // near-misses look and feel fair (classic bullet-hell hitbox trick).
        function getPlayerHitbox() {
            const insetX = game.player.width * 0.22;
            const insetY = game.player.height * 0.22;
            return {
                x: game.player.x + insetX,
                y: game.player.y + insetY,
                width: game.player.width - insetX * 2,
                height: game.player.height - insetY * 2
            };
        }

        // Damage the player from direct enemy contact (collision or reaching the ground).
        // Blood Magnet adds +1 damage per level on top of the base 1.
        function applyPlayerContactDamage(deathCause, enemy) {
            const damage = 1 + (game.runPowerups.bloodMagnet || 0);
            for (let d = 0; d < damage; d++) {
                if (game.shields > 0) {
                    game.shields--;
                } else {
                    game.lives--;
                    game.lastDeathCause = deathCause;
                    game.lastDeathEnemyType = enemy.type;
                }
            }
            triggerShake(300, 6);
        }

        function isPlayerInBeam(beamPath) {
            const playerCenterX = game.player.x + game.player.width / 2;
            const playerCenterY = game.player.y + game.player.height / 2;
            const beamWidth = 8;
            
            if (isPointNearLine(playerCenterX, playerCenterY, 
                beamPath.start.x, beamPath.start.y, 
                beamPath.bounce.x, beamPath.bounce.y, beamWidth)) {
                return true;
            }
            
            if (isPointNearLine(playerCenterX, playerCenterY, 
                beamPath.bounce.x, beamPath.bounce.y, 
                beamPath.end.x, beamPath.end.y, beamWidth)) {
                return true;
            }
            
            return false;
        }

        // Finds the beam's x position at a given y along its bent path (diagonal
        // segment from start to bounce, then straight down from bounce to end).
        // Used to knock the player out of the beam sideways when they get hit.
        function getBeamXAtY(beamPath, y) {
            const { start, bounce } = beamPath;
            if (y <= bounce.y || bounce.y === start.y) {
                const t = (y - start.y) / (bounce.y - start.y || 1);
                return start.x + (bounce.x - start.x) * t;
            }
            return bounce.x;
        }

        function isPointNearLine(px, py, x1, y1, x2, y2, threshold) {
            const A = px - x1;
            const B = py - y1;
            const C = x2 - x1;
            const D = y2 - y1;
            
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            
            if (lenSq === 0) return Math.sqrt(A * A + B * B) <= threshold;
            
            const param = dot / lenSq;
            
            let xx, yy;
            if (param < 0) {
                xx = x1;
                yy = y1;
            } else if (param > 1) {
                xx = x2;
                yy = y2;
            } else {
                xx = x1 + param * C;
                yy = y1 + param * D;
            }
            
            const dx = px - xx;
            const dy = py - yy;
            return Math.sqrt(dx * dx + dy * dy) <= threshold;
        }

        // Central bookkeeping whenever any enemy is defeated: score, coins (item 2),
        // Lucky Salvage bonus drops, and Life Steal healing.
        function onEnemyDefeated(enemy, cx, cy) {
            if (enemy.type === 'boss') {
                triggerShake(500, 10);
            }
            // If this was the leader of a white formation group, hand leadership to one of
            // its remaining group-mates so the rest of the group keeps moving together
            // instead of freezing in place.
            if (enemy.subtype === 'white' && !enemy.groupLeader) {
                const followers = game.enemies.filter(e => e !== enemy && e.groupLeader === enemy);
                if (followers.length > 0) {
                    const newLeader = followers[0];
                    newLeader.groupLeader = null;
                    newLeader.zigTimer = 0;
                    newLeader.moveHeading = enemy.moveHeading || (Math.random() < 0.5 ? -1 : 1);
                    for (const follower of followers) {
                        if (follower === newLeader) continue;
                        follower.groupLeader = newLeader;
                        follower.groupOffsetX = follower.x - newLeader.x;
                        follower.groupOffsetY = follower.y - newLeader.y;
                    }
                }
            }

            // Shooting aliens are a bigger threat, so they're worth 1.5x the score.
            game.score += Math.round(enemy.pointValue * (enemy.canShoot ? 1.5 : 1));
            game.coins += (enemy.coinValue !== undefined ? enemy.coinValue : 1);
            game.coins += (game.runPowerups.bloodMagnet || 0) * 2;
            game.enemiesDefeatedThisRun++;

            // Volatile Core: chance for a kill to leave behind a brief hazard cloud that
            // also damages the player if they're standing in it.
            const volatileLevel = game.runPowerups.volatileCore || 0;
            if (volatileLevel > 0 && Math.random() < 0.25) {
                game.volatileHazards.push({ x: cx, y: cy, radius: 4, maxRadius: 55, life: 24, hit: false, hitEnemies: new Set() });
                game.explosions.push(new Explosion(cx, cy, 'particle', '#ff2222', 10));
            }
            game.enemiesDefeatedForLifeSteal++;

            if (game.equippedRunPowerups.includes('higherScore')) {
                game.score += game.runPowerupDoubled.higherScore ? 10 : 5;
            }
            if (game.equippedRunPowerups.includes('treasureHunter')) {
                game.coins += game.runPowerupDoubled.treasureHunter ? 2 : 1;
            }

            const luckyLevel = game.runPowerups.luckySalvage || 0;
            if (luckyLevel > 0) {
                if (Math.random() < luckyLevel * 0.20) {
                    game.coins += 1;
                    game.explosions.push(new Explosion(cx, cy, 'particle', '#ffd700', 10));
                }
                if (Math.random() < luckyLevel * 0.05) {
                    game.ammo += 5;
                    game.explosions.push(new Explosion(cx, cy, 'particle', '#ffd700', 10));
                }
            }

            const lifeStealLevel = game.runPowerups.lifeSteal || 0;
            if (lifeStealLevel > 0) {
                const threshold = 20 - lifeStealLevel;
                if (game.enemiesDefeatedForLifeSteal >= threshold) {
                    game.enemiesDefeatedForLifeSteal = 0;
                    game.lives++;
                    game.explosions.push(new Explosion(cx, cy, 'particle', '#33ff66', 12));
                    game.explosions.push(new Explosion(game.player.x + game.player.width / 2, game.player.y + game.player.height / 2, 'particle', '#33ff66', 12));
                }
            }
        }

        // Volatile Core: brief expanding hazard clouds left behind by kills. They grow for
        // a short time, chip away at nearby enemies caught in them, and also damage the
        // player once if they're standing inside.
        function updateVolatileCoreHazards() {
            if (game.volatileHazards.length === 0) return;
            const ph = getPlayerHitbox();
            const pcx = ph.x + ph.width / 2, pcy = ph.y + ph.height / 2;
            // Index-based backward loop (not .filter()) so a chain-reaction kill that
            // spawns a NEW hazard mid-update doesn't get silently dropped - .filter()
            // snapshots the array length up front and discards anything pushed after.
            for (let i = game.volatileHazards.length - 1; i >= 0; i--) {
                const hz = game.volatileHazards[i];
                hz.life--;
                hz.radius = Math.min(hz.maxRadius, hz.radius + (hz.maxRadius / 12));

                for (let k = game.enemies.length - 1; k >= 0; k--) {
                    const e = game.enemies[k];
                    if (hz.hitEnemies.has(e)) continue;
                    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
                    if (Math.hypot(ecx - hz.x, ecy - hz.y) <= hz.radius) {
                        hz.hitEnemies.add(e);
                        e.health--;
                        if (e.health <= 0) {
                            onEnemyDefeated(e, ecx, ecy);
                            game.explosions.push(new Explosion(ecx, ecy, 'normal'));
                            game.enemies.splice(k, 1);
                        }
                    }
                }

                if (!hz.hit && Math.hypot(pcx - hz.x, pcy - hz.y) <= hz.radius) {
                    hz.hit = true;
                    applyPlayerContactDamage('volatile-core', game.player);
                    updateUI();
                }

                if (hz.life <= 0) {
                    game.volatileHazards.splice(i, 1);
                }
            }
        }

        // Explosive Ammo: small-radius splash damage around a bullet impact point.
        function explosiveSplash(cx, cy, level) {
            const radius = 18 * (1 + 0.25 * (level - 1));
            game.explosions.push(new Explosion(cx, cy, 'particle', '#ff8800', 14));
            for (let k = game.enemies.length - 1; k >= 0; k--) {
                const e = game.enemies[k];
                const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
                if (Math.hypot(ecx - cx, ecy - cy) <= radius) {
                    e.health--;
                    if (e.health <= 0) {
                        onEnemyDefeated(e, ecx, ecy);
                        game.explosions.push(new Explosion(ecx, ecy, 'normal'));
                        game.enemies.splice(k, 1);
                    }
                }
            }
        }

        function updateOrbitBlades() {
            const level = game.runPowerups.orbitingBlades || 0;
            while (game.orbitBlades.length < level) game.orbitBlades.push({});
            while (game.orbitBlades.length > level) game.orbitBlades.pop();
            if (level === 0) return;

            const now = Date.now();
            if (!game.orbitBladeLastDrain) game.orbitBladeLastDrain = now;
            if (now - game.orbitBladeLastDrain > 2000) {
                game.orbitBladeLastDrain = now;
                if (game.ammo > 0) {
                    game.ammo = Math.max(0, game.ammo - level);
                    updateUI();
                }
            }
        }

        function drawOrbitBlades(centerX, centerY) {
            const level = game.runPowerups.orbitingBlades || 0;
            if (level === 0) return;
            const radius = 55;
            const t = Date.now() / 300;
            game.orbitBlades.forEach((blade, i) => {
                const angle = t + (i / level) * Math.PI * 2;
                const bx = centerX + Math.cos(angle) * radius;
                const by = centerY + Math.sin(angle) * radius * 0.6;
                blade.x = bx;
                blade.y = by;
                game.ctx.save();
                game.ctx.translate(bx, by);
                game.ctx.rotate(angle * 3);
                game.ctx.fillStyle = '#66ffff';
                game.ctx.fillRect(-6, -2, 12, 4);
                game.ctx.fillStyle = '#ffffff';
                game.ctx.fillRect(-2, -6, 4, 12);
                game.ctx.restore();
            });
        }

        function checkOrbitBladeCollisions() {
            const level = game.runPowerups.orbitingBlades || 0;
            if (level === 0 || game.ammo <= 0) return;
            const now = Date.now();
            game.orbitBlades.forEach(blade => {
                if (blade.x === undefined) return;
                for (let k = game.enemies.length - 1; k >= 0; k--) {
                    const e = game.enemies[k];
                    if (e._lastBladeHit && now - e._lastBladeHit < 400) continue;
                    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
                    if (Math.hypot(ecx - blade.x, ecy - blade.y) < 20) {
                        e._lastBladeHit = now;
                        e.health--;
                        game.explosions.push(new Explosion(ecx, ecy, 'particle', '#66ffff', 6));
                        if (e.health <= 0) {
                            onEnemyDefeated(e, ecx, ecy);
                            game.explosions.push(new Explosion(ecx, ecy, 'normal'));
                            game.enemies.splice(k, 1);
                        }
                    }
                }
            });
        }

        function activateBombPowerup(x, y) {
            game.explosions.push(new Explosion(x, y, 'bomb'));
            
            const explosiveAmmoLevel = game.runPowerups.explosiveAmmo || 0;
            // Radius tuned to match the drawn 'bomb' explosion sprite (~75-80px), which
            // was previously way smaller than the 200px hit radius - enemies well outside
            // the visible blast were being destroyed.
            const explosionRadius = 80 * (1 + 0.1 * explosiveAmmoLevel);
            
            for (let i = game.enemies.length - 1; i >= 0; i--) {
                const enemy = game.enemies[i];
                const enemyCenterX = enemy.x + enemy.width / 2;
                const enemyCenterY = enemy.y + enemy.height / 2;
                
                const distance = Math.sqrt(
                    (enemyCenterX - x) ** 2 + 
                    (enemyCenterY - y) ** 2
                );
                
                if (distance <= explosionRadius) {
                    onEnemyDefeated(enemy, enemyCenterX, enemyCenterY);
                    
                    game.explosions.push(new Explosion(
                        enemyCenterX, 
                        enemyCenterY, 
                        'normal'
                    ));
                    
                    game.enemies.splice(i, 1);
                }
            }
            
            for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
                const bullet = game.enemyBullets[i];
                const bulletCenterX = bullet.x + bullet.width / 2;
                const bulletCenterY = bullet.y + bullet.height / 2;
                
                const distance = Math.sqrt(
                    (bulletCenterX - x) ** 2 + 
                    (bulletCenterY - y) ** 2
                );
                
                if (distance <= explosionRadius) {
                    game.enemyBullets.splice(i, 1);
                }
            }
            
            updateUI();
        }

        function checkCollisions() {
            for (let i = game.bullets.length - 1; i >= 0; i--) {
                const bullet = game.bullets[i];
                
                for (let j = game.powerups.length - 1; j >= 0; j--) {
                    const powerup = game.powerups[j];
                    
                    if (bullet.x < powerup.x + powerup.width &&
                        bullet.x + bullet.width > powerup.x &&
                        bullet.y < powerup.y + powerup.height &&
                        bullet.y + bullet.height > powerup.y) {
                        
                        game.bullets.splice(i, 1);
                        game.powerups.splice(j, 1);
                        
                        if (powerup.type === 'bomb') {
                            activateBombPowerup(powerup.x + powerup.width/2, powerup.y + powerup.height/2);
                        } else if (powerup.type === 'tripleshot') {
                            game.tripleShotActive = true;
                            game.rocketActive = false;
                            game.rapidFireActive = false;
                        } else if (powerup.type === 'rocket') {
                            game.rocketActive = true;
                            game.tripleShotActive = false;
                            game.rapidFireActive = false;
                        } else if (powerup.type === 'rapidfire') {
                            game.rapidFireActive = true;
                            game.rapidFireShotCounter = 0;
                            game.tripleShotActive = false;
                            game.rocketActive = false;
                        } else if (powerup.type === 'extralife') {
                            game.lives++;
                            
                            // Create healing visual effect with green crosses
                            const centerX = powerup.x + powerup.width/2;
                            const centerY = powerup.y + powerup.height/2;
                            
                            for (let i = 0; i < 8; i++) {
                                const angle = (i / 8) * Math.PI * 2;
                                const distance = 40 + (Math.random() * 30);
                                const offsetX = Math.cos(angle) * distance;
                                const offsetY = Math.sin(angle) * distance;
                                
                                game.explosions.push(new Explosion(centerX + offsetX, centerY + offsetY, 'healing'));
                            }
                            
                            updateUI();
                        }
                        
                        game.powerupSpawnChance = 0.1;
                        
                        break;
                    }
                }
            }
            
            for (let i = game.bullets.length - 1; i >= 0; i--) {
                const bullet = game.bullets[i];
                if (bullet.isFragment) {
                    for (let j = game.enemies.length - 1; j >= 0; j--) {
                        const enemy = game.enemies[j];
                        if (bullet.x < enemy.x + enemy.width && bullet.x + bullet.width > enemy.x &&
                            bullet.y < enemy.y + enemy.height && bullet.y + bullet.height > enemy.y) {
                            enemy.health--;
                            const ecx = enemy.x + enemy.width/2, ecy = enemy.y + enemy.height/2;
                            game.explosions.push(new Explosion(ecx, ecy));
                            if (enemy.health <= 0) {
                                onEnemyDefeated(enemy, ecx, ecy);
                                game.enemies.splice(j, 1);
                            }
                            game.bullets.splice(i, 1);
                            updateUI();
                            break;
                        }
                    }
                    continue;
                }
                
                for (let j = game.enemies.length - 1; j >= 0; j--) {
                    const enemy = game.enemies[j];
                    
                    if (bullet.hitEnemies && bullet.hitEnemies.has(enemy)) continue;
                    
                    if (bullet.x < enemy.x + enemy.width &&
                        bullet.x + bullet.width > enemy.x &&
                        bullet.y < enemy.y + enemy.height &&
                        bullet.y + bullet.height > enemy.y) {
                        
                        if (bullet.type === 'rocket') {
                            // Rocket explosion - area damage
                            const explosionX = bullet.x + bullet.width / 2;
                            const explosionY = bullet.y + bullet.height / 2;
                            game.explosions.push(new Explosion(explosionX, explosionY, 'rocket'));
                            
                            const rocketRadius = 60;
                            for (let k = game.enemies.length - 1; k >= 0; k--) {
                                const targetEnemy = game.enemies[k];
                                const enemyCenterX = targetEnemy.x + targetEnemy.width / 2;
                                const enemyCenterY = targetEnemy.y + targetEnemy.height / 2;
                                
                                const distance = Math.sqrt(
                                    (enemyCenterX - explosionX) ** 2 + 
                                    (enemyCenterY - explosionY) ** 2
                                );
                                
                                if (distance <= rocketRadius) {
                                    targetEnemy.health--;
                                    if (targetEnemy.health <= 0) {
                                        onEnemyDefeated(targetEnemy, enemyCenterX, enemyCenterY);
                                        game.explosions.push(new Explosion(enemyCenterX, enemyCenterY, 'normal'));
                                        game.enemies.splice(k, 1);
                                    }
                                }
                            }
                            game.bullets.splice(i, 1);
                        } else {
                            // Normal bullet hit
                            const ecx = enemy.x + enemy.width/2, ecy = enemy.y + enemy.height/2;
                            game.explosions.push(new Explosion(ecx, ecy));
                            
                            enemy.health--;
                            bullet.hitEnemies.add(enemy);
                            
                            if (bullet.mods.explosive > 0) explosiveSplash(ecx, ecy, bullet.mods.explosive);
                            if (bullet.mods.shrapnel > 0) spawnShrapnel(ecx, ecy, bullet.mods.shrapnel);
                            
                            if (enemy.health <= 0) {
                                onEnemyDefeated(enemy, ecx, ecy);
                                game.enemies.splice(j, 1);
                            }
                            
                            if (bullet.pierceRemaining > 0) {
                                bullet.pierceRemaining--;
                            } else {
                                game.bullets.splice(i, 1);
                            }
                        }
                        
                        updateUI();
                        break;
                    }
                }
            }
            
            checkOrbitBladeCollisions();
            
            game.enemies.forEach((enemy, enemyIndex) => {
                const ph = getPlayerHitbox();
                if (enemy.type !== 'boss' &&
                    enemy.x < ph.x + ph.width &&
                    enemy.x + enemy.width > ph.x &&
                    enemy.y < ph.y + ph.height &&
                    enemy.y + enemy.height > ph.y) {
                    
                    game.explosions.push(new Explosion(
                        game.player.x + game.player.width/2, 
                        game.player.y + game.player.height/2
                    ));
                    
                    applyPlayerContactDamage('collision', enemy);
                    
                    // Colliding with the player defeats the enemy too, instead of just
                    // knocking it back offscreen to fall again.
                    const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
                    game.explosions.push(new Explosion(ecx, ecy));
                    onEnemyDefeated(enemy, ecx, ecy);
                    enemy.markedForRemoval = true;
                    updateUI();
                }
                
                if (enemy.type === 'boss') {
                    // Item 1: boss bodies never hurt the player on contact - only their
                    // shots do. If a boss reaches the ground, it's instant game over.
                    if (enemy.y + enemy.height > game.height - game.landscapeHeight) {
                        game.lastDeathCause = 'boss-breach';
                        gameOver();
                        return;
                    }
                } else if (enemy.y + enemy.height > game.height - game.landscapeHeight) {
                    const gcx = enemy.x + enemy.width / 2, gcy = game.height - game.landscapeHeight;
                    game.explosions.push(new Explosion(gcx, gcy));
                    
                    applyPlayerContactDamage('reached-ground', enemy);
                    // Reaching the ground border defeats the enemy for good, instead of
                    // teleporting it back offscreen above the top border to fall again.
                    onEnemyDefeated(enemy, gcx, gcy);
                    enemy.markedForRemoval = true;
                    updateUI();
                }
                
                if (enemy.type === 'boss' && enemy.bossType === 2 && enemy.beamFiring) {
                    for (let i = 0; i < enemy.beamAngles.length; i++) {
                        const beamPath = enemy.calculateBeamPath(enemy.beamAngles[i]);
                        if (isPlayerInBeam(beamPath)) {
                            game.explosions.push(new Explosion(
                                game.player.x + game.player.width/2, 
                                game.player.y + game.player.height/2
                            ));
                            
                            if (game.shields > 0) {
                                game.shields--;
                            } else {
                                game.lives--;
                                game.lastDeathCause = 'boss-beam';
                            }
                            updateUI();
                            
                            // Knockback: push the player sideways out of the beam
                            const beamXAtPlayer = getBeamXAtY(beamPath, game.player.y + game.player.height / 2);
                            const playerCenterX = game.player.x + game.player.width / 2;
                            const pushDir = playerCenterX >= beamXAtPlayer ? 1 : -1;
                            const knockbackDistance = 60;
                            game.player.x = Math.max(0, Math.min(
                                game.width - game.player.width,
                                game.player.x + pushDir * knockbackDistance
                            ));
                            
                            break;
                        }
                    }
                }
            });
            
            game.enemies = game.enemies.filter(enemy => !enemy.markedForRemoval);
            
            for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
                const bullet = game.enemyBullets[i];
                const ph = getPlayerHitbox();
                
                if (bullet.x < ph.x + ph.width &&
                    bullet.x + bullet.width > ph.x &&
                    bullet.y < ph.y + ph.height &&
                    bullet.y + bullet.height > ph.y) {
                    
                    game.explosions.push(new Explosion(
                        game.player.x + game.player.width/2, 
                        game.player.y + game.player.height/2
                    ));
                    
                    const damage = bullet.damage;
                    for (let d = 0; d < damage; d++) {
                        if (game.shields > 0) {
                            game.shields--;
                        } else {
                            game.lives--;
                            game.lastDeathCause = 'bullet';
                        }
                    }
                    triggerShake(250, 5);
                    
                    game.enemyBullets.splice(i, 1);
                    updateUI();
                }
            }
        }

        function draw() {
            game.ctx.clearRect(0, 0, game.width, game.height);
            
            const landscapeY = game.height - game.landscapeHeight;
            
            game.ctx.fillStyle = '#2d5016';
            game.ctx.fillRect(0, landscapeY, game.width, game.landscapeHeight);
            
            const pixelSize = 4;
            
            for (let x = 0; x < game.width; x += pixelSize * 8) {
                const surfacePattern = [
                    '##......',
                    '.##.....',
                    '..##....',
                    '...##...',
                    '....##..',
                    '.....##.',
                    '......##',
                    '.......#'
                ];
                
                for (let row = 0; row < surfacePattern.length && row < 8; row++) {
                    for (let col = 0; col < surfacePattern[row].length; col++) {
                        if (surfacePattern[row][col] === '#') {
                            game.ctx.fillStyle = '#1a3009';
                            game.ctx.fillRect(x + col * pixelSize, landscapeY + row * pixelSize, pixelSize, pixelSize);
                        }
                    }
                }
            }
            
            for (let x = 0; x < game.width; x += 120) {
                game.ctx.fillStyle = '#1a3009';
                game.ctx.fillRect(x + 20, landscapeY + 10, 16, 8);
                game.ctx.fillRect(x + 24, landscapeY + 6, 8, 4);
                
                game.ctx.fillStyle = '#4a6b2a';
                game.ctx.fillRect(x + 60, landscapeY - 8, 12, 20);
                game.ctx.fillRect(x + 64, landscapeY - 12, 8, 8);
                
                game.ctx.fillStyle = '#3d6018';
                game.ctx.fillRect(x + 90, landscapeY + 4, 4, 8);
                game.ctx.fillRect(x + 100, landscapeY + 2, 4, 12);
            }
            
            game.player.draw();
            game.bullets.forEach(bullet => bullet.draw());
            game.enemies.forEach(enemy => enemy.draw());
            game.enemyBullets.forEach(bullet => bullet.draw());
            game.powerups.forEach(powerup => powerup.draw());
            game.explosions.forEach(explosion => explosion.draw());
            drawVolatileCoreHazards();
        }

        function drawVolatileCoreHazards() {
            game.volatileHazards.forEach(hz => {
                const alpha = Math.max(0, Math.min(1, hz.life / 24));
                game.ctx.save();
                game.ctx.globalAlpha = alpha * 0.45;
                game.ctx.fillStyle = '#ff2222';
                game.ctx.beginPath();
                game.ctx.arc(hz.x, hz.y, hz.radius, 0, Math.PI * 2);
                game.ctx.fill();
                game.ctx.globalAlpha = alpha * 0.8;
                game.ctx.strokeStyle = '#ff8888';
                game.ctx.lineWidth = 2;
                game.ctx.stroke();
                game.ctx.restore();
            });
        }

        function updateEmergencyAmmoButton() {
            const btn = document.getElementById('emergencyAmmoBtn');
            if (!btn) return;
            const unlocked = (game.permanentUpgrades.emergencyAmmo || 0) > 0;
            btn.style.display = unlocked ? 'inline-block' : 'none';
            if (!unlocked) return;
            const used = game.emergencyAmmoUsedThisWave;
            btn.disabled = used || game.state !== GameState.PLAYING;
            btn.style.opacity = used ? '0.5' : '1';
            btn.textContent = used ? '🔋 Used This Wave' : '🔋 Emergency Ammo';
        }

        // Emergency Ammo: once per wave, pause for a single bonus question. The ammo
        // granted deliberately skips Correct Answer Boost (the normal-quiz shop bonus)
        // but still benefits from in-run bonuses (Ammo Generation, Ammo Collector) and
        // its own Emergency Ammo shop upgrade levels.
        function getEmergencyAmmoAmount() {
            const ammoGenLevel = game.runPowerups.ammoGeneration || 0;
            const upgradeLevel = game.permanentUpgrades.emergencyAmmo || 0;
            let amount = game.baseAmmoPerCorrect + (ammoGenLevel * 10) + Math.max(0, upgradeLevel - 1) * 5;
            if (game.equippedRunPowerups.includes('ammoCollector')) {
                amount += game.runPowerupDoubled.ammoCollector ? 10 : 5;
            }
            return amount;
        }

        function openEmergencyAmmo() {
            if ((game.permanentUpgrades.emergencyAmmo || 0) <= 0) return;
            if (game.emergencyAmmoUsedThisWave) return;
            if (game.state !== GameState.PLAYING) return;
            if (!quizQuestions || quizQuestions.length === 0) return;

            game.emergencyAmmoUsedThisWave = true;
            updateEmergencyAmmoButton();
            game.emergencyAmmoPrevState = game.state;
            game.state = GameState.QUIZ; // reuse the quiz pause state so gameplay freezes
            hideAllModals();

            const q = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];
            document.getElementById('emergencyAmmoQuestion').textContent = q.question;
            document.getElementById('emergencyAmmoResult').textContent = '';

            const optionsDiv = document.getElementById('emergencyAmmoOptions');
            optionsDiv.innerHTML = '';

            const optionOrder = q.options.map((_, idx) => idx);
            for (let i = optionOrder.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [optionOrder[i], optionOrder[j]] = [optionOrder[j], optionOrder[i]];
            }

            optionOrder.forEach(originalIndex => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'option quiz-option';
                optionDiv.textContent = q.options[originalIndex];
                optionDiv.onclick = () => answerEmergencyAmmo(originalIndex === q.correct, optionDiv, optionsDiv, q, optionOrder);
                optionsDiv.appendChild(optionDiv);
            });

            document.getElementById('emergencyAmmoModal').style.display = 'block';
        }

        function answerEmergencyAmmo(isCorrect, chosenDiv, optionsDiv, question, optionOrder) {
            Array.from(optionsDiv.children).forEach(child => { child.onclick = null; child.style.pointerEvents = 'none'; });

            const resultEl = document.getElementById('emergencyAmmoResult');
            if (isCorrect) {
                const amount = getEmergencyAmmoAmount();
                game.ammo += amount;
                chosenDiv.style.backgroundColor = 'rgba(46, 204, 113, 0.3)';
                chosenDiv.style.borderColor = 'var(--green-success)';
                resultEl.textContent = `Correct! +${amount} ammo`;
                resultEl.style.color = 'var(--green-success)';
                updateUI();
            } else {
                chosenDiv.style.backgroundColor = 'rgba(231, 76, 60, 0.3)';
                chosenDiv.style.borderColor = 'var(--red-damage)';
                const correctDisplayIndex = optionOrder.indexOf(question.correct);
                const correctDiv = optionsDiv.children[correctDisplayIndex];
                if (correctDiv) {
                    correctDiv.style.backgroundColor = 'rgba(46, 204, 113, 0.3)';
                    correctDiv.style.borderColor = 'var(--green-success)';
                }
                resultEl.textContent = 'Not quite - no ammo this time.';
                resultEl.style.color = 'var(--red-damage)';
            }

            setTimeout(() => {
                hideAllModals();
                game.state = game.emergencyAmmoPrevState || GameState.PLAYING;
                updateUI();
            }, 1200);
        }

        function updateUI() {
            document.getElementById('wave').textContent = game.wave;
            document.getElementById('lives').textContent = game.lives;
            document.getElementById('score').textContent = game.score;
            document.getElementById('coins').textContent = game.coins;
            document.getElementById('highScore').textContent = game.highScore;
            document.getElementById('ammo').textContent = game.ammo;
            document.getElementById('shields').textContent = game.shields;
            document.getElementById('enemies').textContent = game.enemies.length;
            document.getElementById('kills').textContent = game.enemiesDefeatedThisRun;
            updateEmergencyAmmoButton();
        }

        function updateElapsedTime() {
            if (!game.matchStartTime) return;
            const totalSeconds = Math.floor((Date.now() - game.matchStartTime) / 1000);
            const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const secs = (totalSeconds % 60).toString().padStart(2, '0');
            const el = document.getElementById('elapsedTime');
            if (el) el.textContent = `${mins}:${secs}`;
        }

        function buildDeathMessage() {
            const enemyTips = {
                boss: 'Bosses hit hard — keep moving and never sit still under one.',
                fast: 'Fast enemies dive quickly — pick them off early before they close in.',
                tank: 'Tanky enemies take more hits — focus them down instead of spreading fire.'
            };
            const causeInfo = {
                'quiz': { label: 'missed a quiz question', tip: 'Slow down and re-read the question before answering — a wrong answer costs a life.' },
                'collision': { label: `collided with ${game.lastDeathEnemyType ? 'a ' + game.lastDeathEnemyType : 'an enemy'}`, tip: (enemyTips[game.lastDeathEnemyType] || 'Keep your distance from enemies and pick them off from range instead of letting them reach you.') },
                'reached-ground': { label: `let ${game.lastDeathEnemyType ? 'a ' + game.lastDeathEnemyType : 'an enemy'} reach the ground`, tip: 'Prioritize enemies that are getting close to the bottom of the screen over ones still far away.' },
                'boss-breach': { label: 'let the boss reach the ground', tip: 'Boss waves need focus fire from the start — don\'t let it walk all the way down.' },
                'boss-beam': { label: 'was caught in a boss beam', tip: 'Watch for the beam telegraph and dodge sideways early — don\'t wait until it fires.' },
                'bullet': { label: 'was hit by enemy fire', tip: 'Keep moving side to side instead of holding still, so incoming shots are harder to land.' },
                'volatile-core': { label: 'was caught in a Volatile Core blast', tip: 'Volatile Core hazards linger briefly after a kill — clear out from where enemies just died instead of standing still.' }
            };
            const info = causeInfo[game.lastDeathCause];
            if (!info) return '';
            return `You ${info.label}. ${info.tip}`;
        }

        function gameOver() {
            if (game.state === GameState.GAME_OVER) return;
            game.state = GameState.GAME_OVER;
            game.quizActive = false;
            clearInterval(game.quizTimer);
            
            // Update total enemies defeated
            game.totalEnemiesDefeatedAllTime += game.enemiesDefeatedThisRun;
            localStorage.setItem('totalEnemiesDefeated', game.totalEnemiesDefeatedAllTime.toString());
            
            // Item 2: coins persist across runs
            localStorage.setItem('coins', game.coins.toString());
            
            if (game.score > game.highScore) {
                game.highScore = game.score;
                localStorage.setItem('spaceInvadersHighScore', game.highScore.toString());
                document.getElementById('newHighScoreMessage').style.display = 'block';
            } else {
                document.getElementById('newHighScoreMessage').style.display = 'none';
            }
            
            document.getElementById('finalScore').textContent = game.score;
            document.getElementById('gameOverHighScore').textContent = game.highScore;
            document.getElementById('finalWave').textContent = game.wave;
            document.getElementById('enemiesDefeatedThisRun').textContent = game.enemiesDefeatedThisRun;
            document.getElementById('totalEnemiesDefeated').textContent = game.totalEnemiesDefeatedAllTime;
            document.getElementById('deathCauseMessage').textContent = buildDeathMessage();
            
            renderGameOverShop();
            
            hideAllModals();
            const wipe = document.getElementById('screenWipe');
            if (wipe) {
                wipe.classList.add('wipe');
                setTimeout(() => {
                    document.getElementById('gameOver').style.display = 'block';
                    wipe.classList.remove('wipe');
                }, 750);
            } else {
                document.getElementById('gameOver').style.display = 'block';
            }
        }

        function hideAllModals() {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        }

        let shopReturnScreen = 'welcomeScreen';
        function showShop(fromScreen) {
            shopReturnScreen = fromScreen === 'gameover' ? 'gameOver' : 'welcomeScreen';
            loadPermanentUpgrades();
            game.coins = parseInt(localStorage.getItem('coins') || '0');
            hideAllModals();
            renderGameOverShop();
            document.getElementById('shopScreen').style.display = 'block';
        }
        function closeShop() {
            document.getElementById('shopScreen').style.display = 'none';
            document.getElementById(shopReturnScreen).style.display = 'block';
            if (shopReturnScreen === 'welcomeScreen') updateHomeStats();
        }
        function switchShopTab(tab) {
            document.querySelectorAll('.shop-tab-btn').forEach(btn => btn.classList.toggle('active-tab', btn.dataset.tab === tab));
            document.querySelectorAll('.shop-tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById('shopTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
        }

        document.addEventListener('keydown', (e) => {
            game.keys[e.key] = true;
        });

        document.addEventListener('keyup', (e) => {
            game.keys[e.key] = false;
        });

        let targetX = null;
        let isPointerActive = false;

        function screenToCanvasX(clientX) {
            if (!game.canvas) return clientX;
            const rect = game.canvas.getBoundingClientRect();
            const scaleX = game.canvas.width / rect.width;
            return (clientX - rect.left) * scaleX;
        }

        function handlePointerStart(clientX, clientY) {
            if (game.state === GameState.PLAYING) {
                targetX = screenToCanvasX(clientX);
                isPointerActive = true;
            }
        }

        function handlePointerMove(clientX, clientY) {
            if (game.state === GameState.PLAYING && isPointerActive) {
                targetX = screenToCanvasX(clientX);
            }
        }

        function handlePointerEnd() {
            if (game.state === GameState.PLAYING) {
                isPointerActive = false;
                targetX = null;
            }
        }

        document.addEventListener('touchstart', (e) => {
            if (game.state === GameState.PLAYING) {
                e.preventDefault();
                handlePointerStart(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (game.state === GameState.PLAYING) {
                e.preventDefault();
                handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (game.state === GameState.PLAYING) {
                e.preventDefault();
                handlePointerEnd();
            }
        }, { passive: false });

        document.addEventListener('mousedown', (e) => {
            if (game.state === GameState.PLAYING) {
                e.preventDefault();
                handlePointerStart(e.clientX, e.clientY);
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (game.state === GameState.PLAYING && isPointerActive) {
                e.preventDefault();
                handlePointerMove(e.clientX, e.clientY);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (game.state === GameState.PLAYING) {
                e.preventDefault();
                handlePointerEnd();
            }
        });

        let currentFrameScale = 1;

        function triggerShake(duration, intensity) {
            game.shakeUntil = Date.now() + duration;
            game.shakeDuration = duration;
            game.shakeIntensity = intensity;
        }

        function applyFrameTransform() {
            const frame = document.getElementById('canvasFrame');
            if (!frame) return;
            let dx = 0, dy = 0;
            if (Date.now() < game.shakeUntil) {
                const remaining = (game.shakeUntil - Date.now());
                const decay = Math.max(0, Math.min(1, remaining / (game.shakeDuration || 650)));
                const mag = game.shakeIntensity * decay;
                dx = (Math.random() * 2 - 1) * mag;
                dy = (Math.random() * 2 - 1) * mag;
            }
            frame.style.transform = `scale(${currentFrameScale}) translate(${dx}px, ${dy}px)`;
        }

        function resizeCanvasFrame() {
            const frame = document.getElementById('canvasFrame');
            if (!frame) return;
            currentFrameScale = Math.min(window.innerWidth / 800, window.innerHeight / 600);
            applyFrameTransform();
        }

        window.addEventListener('resize', resizeCanvasFrame);

        window.addEventListener('load', () => {
            resizeCanvasFrame();
            createStars();
            updateHomeStats();
            loadEquippedRunPowerups();
            document.getElementById('welcomeScreen').style.display = 'flex';
        });

        // Decorative background: a few idle alien sprites drifting behind the home
        // screen, reusing the existing Enemy class draw() (purely visual, no game-state impact).
        const homeBgEnemies = ['normal','normal','normal','normal'].map((type,i) => {
            const e = new Enemy(80+i*180+Math.random()*40, 80+Math.random()*300, type, 0);
            e.vx = (Math.random()-0.5)*0.5;
            e.vy = (Math.random()-0.5)*0.35;
            return e;
        });
        function animateHomeBg(){
            const canvas = document.getElementById('home-bg-canvas');
            if(canvas && document.getElementById('welcomeScreen').style.display !== 'none'){
                if(canvas.width!==canvas.clientWidth||canvas.height!==canvas.clientHeight){
                    canvas.width=canvas.clientWidth; canvas.height=canvas.clientHeight;
                }
                const bgCtx = canvas.getContext('2d');
                const savedCtx = game.ctx;
                game.ctx = bgCtx;
                bgCtx.clearRect(0,0,canvas.width,canvas.height);
                homeBgEnemies.forEach(e=>{
                    e.x+=e.vx; e.y+=e.vy;
                    e.animTimer=(e.animTimer||0)+1; if(e.animTimer>10){e.animTimer=0;e.animFrame=((e.animFrame||0)+1)%2;}
                    if(e.x<-60)e.x=canvas.width+30;
                    if(e.x>canvas.width+60)e.x=-30;
                    if(e.y<-40)e.y=canvas.height+20;
                    if(e.y>canvas.height+40)e.y=-20;
                    e.draw();
                });
                game.ctx = savedCtx;
            }
            requestAnimationFrame(animateHomeBg);
        }
        animateHomeBg();

        function updateHomeStats() {
            const savedHighScore = parseInt(localStorage.getItem('spaceInvadersHighScore') || '0');
            const savedKills = parseInt(localStorage.getItem('totalEnemiesDefeated') || '0');
            const savedCoins = parseInt(localStorage.getItem('coins') || '0');
            const savedCorrect = parseInt(localStorage.getItem('totalQuestionsCorrect') || '0');
            document.getElementById('homeKills').textContent = savedKills;
            document.getElementById('homeHighScore').textContent = savedHighScore;
            document.getElementById('homeCorrect').textContent = savedCorrect;
            document.getElementById('homeCoins').textContent = savedCoins;
        }
