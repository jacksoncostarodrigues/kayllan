/* -------------------------------------------------------------------------- */
       /* AUDIO SYNTHESIZER (Web Audio API Native)                                   */
       /* -------------------------------------------------------------------------- */
       class VRGameAudio {
           constructor() {
               this.ctx = null;
           }


           init() {
               if (!this.ctx) {
                   const AudioContext = window.AudioContext || window.webkitAudioContext;
                   this.ctx = new AudioContext();
               }
               if (this.ctx.state === 'suspended') {
                   this.ctx.resume();
               }
           }


           playSaberSwing() {
               if (!this.ctx) return;
               const osc = this.ctx.createOscillator();
               const gain = this.ctx.createGain();
               osc.type = 'sawtooth';
               osc.frequency.setValueAtTime(600, this.ctx.currentTime);
               osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.15);
              
               gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
               gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);


               osc.connect(gain);
               gain.connect(this.ctx.destination);


               osc.start();
               osc.stop(this.ctx.currentTime + 0.15);
           }


           playCorrectHit() {
               if (!this.ctx) return;
               const now = this.ctx.currentTime;
               const freqs = [523.25, 659.25, 783.99, 1046.50]; // Acorde C5 maior
               freqs.forEach((f, i) => {
                   const osc = this.ctx.createOscillator();
                   const gain = this.ctx.createGain();
                   osc.type = 'sine';
                   osc.frequency.setValueAtTime(f, now + i * 0.04);


                   gain.gain.setValueAtTime(0.25, now + i * 0.04);
                   gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.3);


                   osc.connect(gain);
                   gain.connect(this.ctx.destination);


                   osc.start(now + i * 0.04);
                   osc.stop(now + i * 0.04 + 0.35);
               });
           }


           playWrongHit() {
               if (!this.ctx) return;
               const now = this.ctx.currentTime;
               const osc = this.ctx.createOscillator();
               const gain = this.ctx.createGain();
              
               osc.type = 'sawtooth';
               osc.frequency.setValueAtTime(220, now);
               osc.frequency.linearRampToValueAtTime(70, now + 0.35);


               gain.gain.setValueAtTime(0.4, now);
               gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);


               osc.connect(gain);
               gain.connect(this.ctx.destination);


               osc.start(now);
               osc.stop(now + 0.35);
           }
       }


       const audio = new VRGameAudio();


       /* -------------------------------------------------------------------------- */
       /* GAME STATE VARIABLES                                                      */
       /* -------------------------------------------------------------------------- */
       let isPlaying = false;
       let score = 0;
       let lives = 3;
       let streak = 0;
       let maxStreak = 0;
       let correctCuts = 0;
       let totalAttempts = 0;


       let currentQuestion = { num1: 0, num2: 0, answer: 0 };
       let targetTargets = [];
       let particles3D = [];


       /* Three.js Variables */
       let scene, camera, renderer;
       let leftSaber, rightSaber;
       let controller1, controller2;
       let controllerGrip1, controllerGrip2;
       let hud3DCanvas, hud3DContext, hud3DTexture, hud3DMesh;
       let starParticles;


       /* Mouse/Touch Pointer Fallback */
       const mouse = new THREE.Vector2();


       /* DOM Elements */
       const startModal = document.getElementById('start-modal');
       const gameoverModal = document.getElementById('gameover-modal');
       const mathQuestionEl = document.getElementById('math-question');
       const scoreValEl = document.getElementById('score-val');
       const heartsContainer = document.getElementById('hearts-container');
       const damageFlash = document.getElementById('damage-flash');


       /* -------------------------------------------------------------------------- */
       /* THREE.JS & WEBXR INITIALIZATION                                            */
       /* -------------------------------------------------------------------------- */
       function createVRButton(renderer) {
           const button = document.createElement('button');
           button.id = 'VRButton';


           if ('xr' in navigator) {
               navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
                   if (supported) {
                       button.textContent = 'ENTRAR EM VR 🥽';
                       let currentSession = null;


                       button.onclick = async () => {
                           if (currentSession === null) {
                               const sessionInit = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
                               const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
                               renderer.xr.setSession(session);
                               button.textContent = 'SAIR DO VR';
                               currentSession = session;
                               session.addEventListener('end', () => {
                                   currentSession = null;
                                   button.textContent = 'ENTRAR EM VR 🥽';
                               });
                           } else {
                               currentSession.end();
                           }
                       };
                   } else {
                       button.textContent = 'VR NÃO SUPORTADO NESTE DISPOSITIVO';
                       button.style.opacity = '0.5';
                       button.style.cursor = 'not-allowed';
                   }
               }).catch(() => {
                   button.textContent = 'WEBXR INDISPONÍVEL';
                   button.style.opacity = '0.5';
               });
           } else {
               button.textContent = 'MODO DESKTOP / CELULAR (SEM VR)';
           }
           return button;
       }


       function initThreeJS() {
           const container = document.getElementById('canvas-container');


           // Scene
           scene = new THREE.Scene();
           scene.fog = new THREE.FogExp2(0x030014, 0.022);


           // Camera
           camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
           camera.position.set(0, 1.6, 2); // Eye level in VR (1.6m)


           // Renderer with WebXR
           renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
           renderer.setPixelRatio(window.devicePixelRatio);
           renderer.setSize(window.innerWidth, window.innerHeight);
           renderer.xr.enabled = true;
           renderer.shadowMap.enabled = true;
           container.appendChild(renderer.domElement);


           // Append custom robust VR Button
           document.body.appendChild(createVRButton(renderer));


           // Lighting
           const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
           scene.add(ambientLight);


           const dirLight = new THREE.DirectionalLight(0x00f0ff, 1.5);
           dirLight.position.set(0, 12, 6);
           scene.add(dirLight);


           const pointLight = new THREE.PointLight(0xff007f, 0, 20); // Removido brilho de ponto de luz
           pointLight.position.set(0, 4, -10);
           scene.add(pointLight);


           // Environment: Cyberpunk Grid Floor
           const gridHelper = new THREE.GridHelper(80, 80, 0xff007f, 0x00f0ff);
           gridHelper.position.y = 0;
           scene.add(gridHelper);


           // Neon Rings in background
           createBackgroundRings();


           // Starfield Speed Tunnel
           createStarfield();


           // Create VR Controllers & Sabers
           setupVRControllers();


           // Create 3D Holographic HUD in VR World
           create3DHUD();


           // Event Listeners
           window.addEventListener('resize', onWindowResize);
           window.addEventListener('pointermove', onPointerMove);
           window.addEventListener('pointerdown', onPointerDown);
       }


       function createBackgroundRings() {
           for (let i = 0; i < 5; i++) {
               const ringGeo = new THREE.TorusGeometry(3 + i * 1.5, 0.05, 16, 64);
               const ringMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x00f0ff : 0xff007f });
               const ring = new THREE.Mesh(ringGeo, ringMat);
               ring.position.set(0, 2, -15 - i * 6);
               scene.add(ring);
           }
       }


       function createStarfield() {
           const count = 700;
           const geometry = new THREE.BufferGeometry();
           const positions = new Float32Array(count * 3);


           for (let i = 0; i < count * 3; i += 3) {
               positions[i] = (Math.random() - 0.5) * 50;
               positions[i + 1] = Math.random() * 25;
               positions[i + 2] = (Math.random() - 0.5) * 90;
           }


           geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
           const material = new THREE.PointsMaterial({ color: 0x00f0ff, size: 0.12, transparent: true, opacity: 0.8 });
           starParticles = new THREE.Points(geometry, material);
           scene.add(starParticles);
       }


       /* -------------------------------------------------------------------------- */
       /* VR CONTROLLERS & SABERS (LASER SWORDS)                                    */
       /* -------------------------------------------------------------------------- */
       function setupVRControllers() {
           // Controller 0 (Left Hand Katana)
           controller1 = renderer.xr.getController(0);
           scene.add(controller1);


           // Controller 1 (Right Hand Katana)
           controller2 = renderer.xr.getController(1);
           scene.add(controller2);


           leftSaber = createKatanaSword(0x00f0ff); // Accent wrap
           rightSaber = createKatanaSword(0xff007f); // Accent wrap


           controller1.add(leftSaber);
           controller2.add(rightSaber);


           // Desktop Fallback Katanas attached to Camera
           const desktopGroup = new THREE.Group();
           desktopGroup.name = "desktopSabersGroup";


           const dLeft = createKatanaSword(0x00f0ff);
           dLeft.position.set(-0.35, -0.3, -0.8);
           dLeft.rotation.x = -Math.PI / 4.5;
           desktopGroup.add(dLeft);


           const dRight = createKatanaSword(0xff007f);
           dRight.position.set(0.35, -0.3, -0.8);
           dRight.rotation.x = -Math.PI / 4.5;
           desktopGroup.add(dRight);


           camera.add(desktopGroup);
           scene.add(camera);
       }


       function createKatanaSword(accentColorHex) {
           const group = new THREE.Group();


           // 1. Tsuka (Katanas Handle / Cabo)
           const handleGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.28, 16);
           const handleMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
           const handle = new THREE.Mesh(handleGeo, handleMat);
           handle.position.y = -0.14;
           group.add(handle);


           // Handle Wrap Rings (Ito)
           for (let i = 0; i < 5; i++) {
               const ringGeo = new THREE.TorusGeometry(0.021, 0.003, 8, 16);
               const ringMat = new THREE.MeshBasicMaterial({ color: accentColorHex });
               const ring = new THREE.Mesh(ringGeo, ringMat);
               ring.rotation.x = Math.PI / 2;
               ring.position.y = -0.25 + (i * 0.05);
               group.add(ring);
           }


           // Kashira / Pommel End (Base do cabo)
           const pommelGeo = new THREE.CylinderGeometry(0.023, 0.02, 0.03, 16);
           const pommelMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.2 });
           const pommel = new THREE.Mesh(pommelGeo, pommelMat);
           pommel.position.y = -0.29;
           group.add(pommel);


           // 2. Tsuba (Katana Handguard / Guarda)
           const tsubaGeo = new THREE.BoxGeometry(0.08, 0.008, 0.08);
           const tsubaMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.95, roughness: 0.1 });
           const tsuba = new THREE.Mesh(tsubaGeo, tsubaMat);
           tsuba.position.y = 0.004;
           group.add(tsuba);


           // Habaki (Blade Collar)
           const habakiGeo = new THREE.BoxGeometry(0.032, 0.025, 0.018);
           const habakiMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 }); // Dourado
           const habaki = new THREE.Mesh(habakiGeo, habakiMat);
           habaki.position.y = 0.02;
           group.add(habaki);


           // 3. Lâmina de Aço da Katana (Steel Blade)
           const bladeGeo = new THREE.BoxGeometry(0.025, 1.2, 0.008);
           const bladeMat = new THREE.MeshStandardMaterial({
               color: 0xe2e8f0,
               metalness: 0.95,
               roughness: 0.15
           });
           const blade = new THREE.Mesh(bladeGeo, bladeMat);
           blade.position.y = 0.63;
           blade.name = "bladeMesh";
           group.add(blade);


           // Ponta da Katana (Kissaki Tip)
           const tipGeo = new THREE.ConeGeometry(0.015, 0.1, 4);
           const tip = new THREE.Mesh(tipGeo, bladeMat);
           tip.position.y = 1.28;
           tip.rotation.y = Math.PI / 4;
           group.add(tip);


           return group;
       }


       /* -------------------------------------------------------------------------- */
       /* 3D VR HOLOGRAPHIC HUD                                                      */
       /* -------------------------------------------------------------------------- */
       function create3DHUD() {
           hud3DCanvas = document.createElement('canvas');
           hud3DCanvas.width = 512;
           hud3DCanvas.height = 256;
           hud3DContext = hud3DCanvas.getContext('2d');


           hud3DTexture = new THREE.CanvasTexture(hud3DCanvas);
           const hudGeo = new THREE.PlaneGeometry(2.6, 1.3);
           const hudMat = new THREE.MeshBasicMaterial({ map: hud3DTexture, transparent: true, side: THREE.DoubleSide });


           hud3DMesh = new THREE.Mesh(hudGeo, hudMat);
           hud3DMesh.position.set(0, 2.8, -3.5);
           hud3DMesh.rotation.x = 0.12;
           scene.add(hud3DMesh);


           update3DHUD();
       }


       function update3DHUD() {
           if (!hud3DContext) return;


           hud3DContext.clearRect(0, 0, 512, 256);


           // Cyberpunk Hologram Frame
           hud3DContext.fillStyle = 'rgba(10, 5, 25, 0.88)';
           hud3DContext.strokeStyle = '#00f0ff';
           hud3DContext.lineWidth = 6;
           hud3DContext.beginPath();
           hud3DContext.roundRect(10, 10, 492, 236, 24);
           hud3DContext.fill();
           hud3DContext.stroke();


           // Header Title
           hud3DContext.fillStyle = '#ff007f';
           hud3DContext.font = 'bold 24px Fredoka, sans-serif';
           hud3DContext.fillText('🤖 IA MATEMÁTICA VR', 30, 50);


           // Question
           hud3DContext.fillStyle = '#facc15';
           hud3DContext.font = '900 52px Fredoka, sans-serif';
           hud3DContext.fillText(`${currentQuestion.num1} + ${currentQuestion.num2} = ?`, 30, 120);


           // Stats Bottom Bar
           hud3DContext.fillStyle = '#00f0ff';
           hud3DContext.font = 'bold 28px Fredoka, sans-serif';
           hud3DContext.fillText(`PONTOS: ${score}`, 30, 185);


           hud3DContext.fillStyle = '#ef4444';
           hud3DContext.fillText(`VIDAS: ${'❤️'.repeat(lives)}`, 270, 185);


           hud3DTexture.needsUpdate = true;
       }


       /* -------------------------------------------------------------------------- */
       /* NUMBER TARGETS FLYING TOWARDS & PASSING PLAYER                             */
       /* -------------------------------------------------------------------------- */
       class NumberTarget3D {
           constructor(x, y, zStart, targetX, targetY, value, isCorrect) {
               this.value = value;
               this.isCorrect = isCorrect;
               this.sliced = false;


               // Velocidade reduzida e mais suave (bolas mais devagar)
               const baseSpeed = 0.11 + Math.min(score * 0.003, 0.08);
               this.speed = baseSpeed + (Math.random() * 0.02 - 0.01);


               // Grupo principal do objeto 3D
               this.group = new THREE.Group();
               this.group.position.set(x, y, zStart);


               // Trajetória angular aleatória da frente para o jogador
               this.targetPos = new THREE.Vector3(targetX, targetY, 10);
               const startPos = new THREE.Vector3(x, y, zStart);
               this.direction = new THREE.Vector3().subVectors(this.targetPos, startPos).normalize();


               // Rotação suave contínua
               this.rotSpeedX = (Math.random() - 0.5) * 0.02;
               this.rotSpeedY = (Math.random() - 0.5) * 0.02;


               // Canvas Texture com o número do resultado
               const canvas = document.createElement('canvas');
               canvas.width = 512;
               canvas.height = 512;
               const ctx = canvas.getContext('2d');
              
               // Esfera com fundo Laranja Vibrante
               ctx.fillStyle = '#f97316';
               ctx.fillRect(0, 0, 512, 512);


               // Texto do resultado desenhado em BRANCO PURO
               ctx.fillStyle = '#ffffff';
               ctx.shadowBlur = 0;
               ctx.font = '900 240px Fredoka, sans-serif';
               ctx.textAlign = 'center';
               ctx.textBaseline = 'middle';
               ctx.fillText(value.toString(), 256, 256);


               const texture = new THREE.CanvasTexture(canvas);


               // 1. ESFERAS / BOLAS NORMAIS 3D
               const geometry = new THREE.SphereGeometry(0.65, 32, 32);
               this.geometryRef = geometry;


               // 2. MATERIAL LARANJA VIBRANTE REALISTA
               const mat = new THREE.MeshStandardMaterial({
                   map: texture,
                   color: 0xf97316,
                   roughness: 0.3,
                   metalness: 0.2
               });


               this.targetMesh = new THREE.Mesh(geometry, mat);
               this.group.add(this.targetMesh);


               // Sprite flutuante (Billboard) em BRANCO posicionada NO CENTRO DENTRO DA BOLA
               const spriteCanvas = document.createElement('canvas');
               spriteCanvas.width = 256;
               spriteCanvas.height = 256;
               const sCtx = spriteCanvas.getContext('2d');
               sCtx.fillStyle = '#ffffff';
               sCtx.shadowBlur = 0;
               sCtx.font = '900 140px Fredoka, sans-serif';
               sCtx.textAlign = 'center';
               sCtx.textBaseline = 'middle';
               sCtx.fillText(value.toString(), 128, 128);


               const spriteTexture = new THREE.CanvasTexture(spriteCanvas);
               const textSpriteMat = new THREE.SpriteMaterial({
                   map: spriteTexture,
                   transparent: true,
                   depthTest: false,   // Mantém visível de frente
                   depthWrite: false
               });
               this.spriteRef = new THREE.Sprite(textSpriteMat);
               this.spriteRef.scale.set(1.1, 1.1, 1.1);
               this.spriteRef.position.set(0, 0, 0); // Posição (0, 0, 0) para ficar centralizado exatamente no meio da bola
               this.spriteRef.renderOrder = 999;
               this.group.add(this.spriteRef);


               scene.add(this.group);
           }


           update() {
               if (this.sliced) {
                   if (this.halfLeft && this.halfRight) {
                       this.halfLeft.position.x -= 0.05;
                       this.halfLeft.position.y -= 0.03;
                       this.halfRight.position.x += 0.05;
                       this.halfRight.position.y -= 0.03;
                   }
                   return;
               }


               // Mover em direção ao jogador na trajetória angular
               this.group.position.addScaledVector(this.direction, this.speed);


               // Rotacionar ligeiramente a esfera 3D
               this.targetMesh.rotation.x += this.rotSpeedX;
               this.targetMesh.rotation.y += this.rotSpeedY;


               // Fazer o número interno ficar SEMPRE travado encarando a visão do jogador
               if (this.spriteRef && camera) {
                   this.spriteRef.quaternion.copy(camera.quaternion);
               }
           }


           slice() {
               if (this.sliced) return;
               this.sliced = true;


               // Remover objeto principal
               scene.remove(this.group);


               // Criar duas metades laranjas ao fatiar
               const halfGeo = new THREE.SphereGeometry(0.35, 16, 16);
               const mat = new THREE.MeshStandardMaterial({
                   color: 0xf97316,
                   roughness: 0.3,
                   metalness: 0.2
               });


               this.halfLeft = new THREE.Mesh(halfGeo, mat);
               this.halfLeft.position.copy(this.group.position);
               this.halfLeft.rotation.copy(this.group.rotation);


               this.halfRight = new THREE.Mesh(halfGeo, mat);
               this.halfRight.position.copy(this.group.position);
               this.halfRight.rotation.copy(this.group.rotation);


               scene.add(this.halfLeft);
               scene.add(this.halfRight);


               // Partículas e faíscas metálicas de corte de espada
               createSliceSparks(this.group.position, this.isCorrect ? 0x00f0ff : 0xff007f);
           }


           destroy() {
               scene.remove(this.group);
               if (this.halfLeft) scene.remove(this.halfLeft);
               if (this.halfRight) scene.remove(this.halfRight);
           }
       }


       function createSliceSparks(pos, colorHex) {
           for (let i = 0; i < 30; i++) {
               const geo = new THREE.SphereGeometry(0.04, 8, 8);
               const mat = new THREE.MeshBasicMaterial({ color: colorHex });
               const p = new THREE.Mesh(geo, mat);
               p.position.copy(pos);


               const dir = new THREE.Vector3(
                   (Math.random() - 0.5) * 0.25,
                   (Math.random() - 0.5) * 0.25,
                   (Math.random() - 0.5) * 0.25
               );


               particles3D.push({ mesh: p, vel: dir, life: 1.0 });
               scene.add(p);
           }
       }


       /* -------------------------------------------------------------------------- */
       /* GAME MATH & WAVE LOGIC                                                     */
       /* -------------------------------------------------------------------------- */
       function generateMathProblem() {
           const num1 = Math.floor(Math.random() * 15) + 1;
           const num2 = Math.floor(Math.random() * 15) + 1;
           const answer = num1 + num2;


           currentQuestion = { num1, num2, answer };


           mathQuestionEl.textContent = `${num1} + ${num2} = ?`;
           update3DHUD();


           spawnNumberWave(answer);
       }


       function spawnNumberWave(correctAnswer) {
           // Clear previous targets
           targetTargets.forEach(t => t.destroy());
           targetTargets = [];


           let values = [correctAnswer];
           while (values.length < 3) {
               const wrong = correctAnswer + (Math.floor(Math.random() * 8) + 1) * (Math.random() > 0.5 ? 1 : -1);
               if (wrong > 0 && !values.includes(wrong)) {
                   values.push(wrong);
               }
           }


           // Embaralhar a ordem das respostas
           values = values.sort(() => Math.random() - 0.5);


           // Gerar posições de origem e trajetória TOTALMENTE ALEATÓRIAS da frente (Z = -32)
           values.forEach((val, i) => {
               const isCorrect = (val === correctAnswer);


               // Ponto inicial aleatório no fundo da arena de frente
               const startX = (Math.random() - 0.5) * 5.5; // Espalhamento horizontal
               const startY = 0.8 + Math.random() * 2.5;     // Altura variável
               const startZ = -30 - (i * 2.5);              // Ligeiramente escalonados no tempo


               // Ponto final de ultrapassagem aleatório perto do jogador
               const targetX = startX * 0.6 + (Math.random() - 0.5) * 1.5;
               const targetY = 1.2 + (Math.random() - 0.5) * 0.8;


               const target = new NumberTarget3D(startX, startY, startZ, targetX, targetY, val, isCorrect);
               targetTargets.push(target);
           });
       }


       /* -------------------------------------------------------------------------- */
       /* COLLISION DETECTION & VR HAPTICS                                           */
       /* -------------------------------------------------------------------------- */
       function checkSaberCollisions() {
           if (!isPlaying) return;


           const saberPositions = [];


           if (renderer.xr.isPresenting) {
               // VR Controller 1 & 2 Positions
               const p1 = new THREE.Vector3();
               controller1.getWorldPosition(p1);
               saberPositions.push(p1);


               const p2 = new THREE.Vector3();
               controller2.getWorldPosition(p2);
               saberPositions.push(p2);
           } else {
               // Desktop Pointer Sabers
               const desktopGroup = camera.getObjectByName("desktopSabersGroup");
               if (desktopGroup) {
                   desktopGroup.children.forEach(saber => {
                       const p = new THREE.Vector3();
                       saber.getWorldPosition(p);
                       saberPositions.push(p);
                   });
               }
           }


           // Test collisions against all targets
           targetTargets.forEach(target => {
               if (target.sliced) return;


               saberPositions.forEach(saberPos => {
                   const dist = saberPos.distanceTo(target.group.position);
                  
                   // Slice hit threshold radius
                   if (dist < 0.75) {
                       target.slice();
                       triggerVRHaptic();
                       totalAttempts++;


                       if (target.isCorrect) {
                           score += 10;
                           correctCuts++;
                           streak++;
                           if (streak > maxStreak) maxStreak = streak;


                           scoreValEl.textContent = score;
                           audio.playCorrectHit();
                           update3DHUD();


                           setTimeout(() => {
                               generateMathProblem();
                           }, 500);


                       } else {
                           handleWrongSlice();
                       }
                   }
               });


               // Check if the CORRECT target passed POR VOCÊ (Z > +3.0) without being sliced
               if (!target.sliced && target.isCorrect && target.group.position.z > 3.0) {
                   totalAttempts++;
                   handlePassedPlayer();
               }
           });
       }


       function triggerVRHaptic() {
           if (renderer.xr.isPresenting) {
               const session = renderer.xr.getSession();
               if (session && session.inputSources) {
                   for (const source of session.inputSources) {
                       if (source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
                           source.gamepad.hapticActuators[0].pulse(0.9, 120);
                       } else if (source.gamepad && source.gamepad.vibrationActuator) {
                           source.gamepad.vibrationActuator.playEffect('dual-rumble', {
                               duration: 120,
                               strongMagnitude: 0.8,
                               weakMagnitude: 0.8
                           });
                       }
                   }
               }
           }
       }


       function handleWrongSlice() {
           lives--;
           streak = 0;
           updateHeartsUI();
           update3DHUD();
           triggerDamageFlash();
           audio.playWrongHit();


           if (lives <= 0) {
               gameOver();
           }
       }


       function handlePassedPlayer() {
           lives--;
           streak = 0;
           updateHeartsUI();
           update3DHUD();
           triggerDamageFlash();
           audio.playWrongHit();


           if (lives <= 0) {
               gameOver();
           } else {
               generateMathProblem();
           }
       }


       function triggerDamageFlash() {
           damageFlash.style.opacity = '1';
           setTimeout(() => { damageFlash.style.opacity = '0'; }, 300);
       }


       function updateHeartsUI() {
           heartsContainer.innerHTML = '';
           for (let i = 0; i < 3; i++) {
               const heart = document.createElement('i');
               heart.className = i < lives
                   ? 'fa-solid fa-heart text-red-500 text-2xl drop-shadow'
                   : 'fa-solid fa-heart text-slate-700 text-2xl';
               heartsContainer.appendChild(heart);
           }
       }


       /* -------------------------------------------------------------------------- */
       /* DESKTOP POINTER & TOUCH HANDLERS                                           */
       /* -------------------------------------------------------------------------- */
       function onPointerMove(e) {
           mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
           mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;


           const desktopGroup = camera.getObjectByName("desktopSabersGroup");
           if (desktopGroup) {
               desktopGroup.position.x = mouse.x * 1.6;
               desktopGroup.position.y = mouse.y * 1.2;
           }
       }


       function onPointerDown() {
           audio.playSaberSwing();
       }


       function onWindowResize() {
           camera.aspect = window.innerWidth / window.innerHeight;
           camera.updateProjectionMatrix();
           renderer.setSize(window.innerWidth, window.innerHeight);
       }


       /* -------------------------------------------------------------------------- */
       /* MAIN ANIMATION / RENDER LOOP                                              */
       /* -------------------------------------------------------------------------- */
       function animate() {
           renderer.setAnimationLoop(render);
       }


       function render() {
           // Speed tunnel star particles movement
           if (starParticles) {
               const pos = starParticles.geometry.attributes.position.array;
               for (let i = 2; i < pos.length; i += 3) {
                   pos[i] += 0.35;
                   if (pos[i] > 20) pos[i] = -70;
               }
               starParticles.geometry.attributes.position.needsUpdate = true;
           }


           if (isPlaying) {
               // Update targets
               targetTargets.forEach(target => target.update());


               // Check collisions
               checkSaberCollisions();


               // Update particles FX
               for (let i = particles3D.length - 1; i >= 0; i--) {
                   const p = particles3D[i];
                   p.mesh.position.add(p.vel);
                   p.life -= 0.04;
                   if (p.life <= 0) {
                       scene.remove(p.mesh);
                       particles3D.splice(i, 1);
                   }
               }
           }


           renderer.render(scene, camera);
       }


       /* -------------------------------------------------------------------------- */
       /* GAME FLOW CONTROL                                                          */
       /* -------------------------------------------------------------------------- */
       function startGame() {
           audio.init();
           isPlaying = true;
           score = 0;
           lives = 3;
           streak = 0;
           maxStreak = 0;
           correctCuts = 0;
           totalAttempts = 0;


           scoreValEl.textContent = '0';
           updateHeartsUI();


           startModal.classList.add('hidden');
           gameoverModal.classList.add('hidden');


           generateMathProblem();
       }


       function gameOver() {
           isPlaying = false;


           const accuracy = totalAttempts > 0 ? Math.round((correctCuts / totalAttempts) * 100) : 0;


           document.getElementById('final-score').textContent = score;
           document.getElementById('final-streak').textContent = `${maxStreak}x`;
           document.getElementById('final-correct').textContent = correctCuts;
           document.getElementById('final-accuracy').textContent = `${accuracy}%`;


           gameoverModal.classList.remove('hidden');
       }


       document.getElementById('start-btn').addEventListener('click', startGame);
       document.getElementById('restart-btn').addEventListener('click', startGame);


       // Initialize Three.js scene & loop
       initThreeJS();
       animate();
