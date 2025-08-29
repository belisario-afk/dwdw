/* 3D Boxing Ring Overlay
   - Builds a lightweight 3D scene using Three.js
   - Shows "champ" (current track) vs "challenger" (next track)
   - The fight lasts the duration of the current track minus a KO buffer
   - On end/skip, challenger KOs champ and becomes the new champ
   - Listens to multiple event names to be plug-and-play with common setups

   Public API:
     window.BoxingOverlay.startWithTracks(currentTrack, nextTrack?)
     window.BoxingOverlay.setNextTrack(nextTrack)
     window.BoxingOverlay.skip()
     window.BoxingOverlay.pause()
     window.BoxingOverlay.resume()

   Expected track object shape (flexible, best-effort mapping is applied):
     {
       id?: string,
       title: string,
       artist?: string,
       durationMs: number,
       startedAt?: number (Date.now()),
       progressMs?: number,
       albumArtUrl?: string
     }

   Events supported (dispatch CustomEvent with 'detail' as track object):
     - 'nowPlaying', 'song:nowplaying', 'spotify:nowPlaying', 'songchanged', 'song:play'
       -> promotes track to champ, starts fight
     - 'queue:next', 'nextTrack', 'queueUpdated' (detail.next or detail[0]) -> set challenger
     - 'track:skip', 'song:skip' -> KO immediately
     - 'track:pause', 'song:pause' -> pause
     - 'track:resume', 'song:resume' -> resume
     - 'songrequest' can also supply a challenger (detail treated as nextTrack if not playing)
*/

(function () {
  const CFG = window.BOXING_OVERLAY || {};
  const root = document.getElementById('overlay-root');
  const champTag = document.getElementById('champTag').querySelector('strong');
  const challengerTag = document.getElementById('challengerTag').querySelector('strong');
  const timebarFill = document.getElementById('timebarFill');
  const debugPanel = document.getElementById('debugPanel');

  if (CFG.debug) {
    debugPanel.hidden = false;
  }

  // Basic Three.js setup
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    canvas: undefined
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.pixelRatioCap || 1.75));
  renderer.shadowMap.enabled = !!CFG.enableShadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const canvas = renderer.domElement;
  root.appendChild(canvas);

  const scene = new THREE.Scene();

  // Cinematic camera slightly off-center
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0, 6.5, 12.5);
  camera.lookAt(0, 2.2, 0);

  // Resize handling
  function resize() {
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  resize();

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(5, 10, 6);
  keyLight.castShadow = !!CFG.enableShadows;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x88ccff, 0.5);
  rimLight.position.set(-6, 7, -5);
  scene.add(rimLight);

  // Fog for depth
  scene.fog = new THREE.FogExp2(0x071016, 0.06);

  // Ring platform
  const platform = new THREE.Group();
  scene.add(platform);

  // Floor base
  const baseGeo = new THREE.CylinderGeometry(8, 8, 0.8, 32);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x0b1320,
    metalness: 0.2,
    roughness: 0.8
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.receiveShadow = true;
  baseMesh.position.y = 0;
  platform.add(baseMesh);

  // Mat
  const matGeo = new THREE.PlaneGeometry(12, 12, 1, 1);
  const matMat = new THREE.MeshStandardMaterial({
    color: 0x102033,
    metalness: 0.1,
    roughness: 0.9
  });
  const matMesh = new THREE.Mesh(matGeo, matMat);
  matMesh.receiveShadow = true;
  matMesh.rotation.x = -Math.PI / 2;
  matMesh.position.y = 0.401;
  platform.add(matMesh);

  // Corner posts
  function makePost(color) {
    const g = new THREE.CylinderGeometry(0.15, 0.2, 2.2, 12);
    const m = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 });
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  const postOffset = 5.8;
  const postRed = makePost(0xff3a3a); postRed.position.set(-postOffset, 1.5, -postOffset);
  const postBlue = makePost(0x4a90e2); postBlue.position.set(postOffset, 1.5, postOffset);
  const postRed2 = makePost(0xff3a3a); postRed2.position.set(-postOffset, 1.5, postOffset);
  const postBlue2 = makePost(0x4a90e2); postBlue2.position.set(postOffset, 1.5, -postOffset);
  platform.add(postRed, postBlue, postRed2, postBlue2);

  // Ropes
  function addRope(y, color) {
    const rope = new THREE.Mesh(
      new THREE.TorusGeometry(8.5, 0.05, 8, 64),
      new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.4, emissive: 0x000000 })
    );
    rope.position.y = y;
    rope.rotation.x = Math.PI / 2;
    rope.castShadow = true;
    platform.add(rope);
  }
  addRope(0.9, 0xe0e0e0);
  addRope(1.3, 0xbad7ff);
  addRope(1.7, 0xffffff);

  // Subtle ground haze
  const hazeGeo = new THREE.CircleGeometry(7.5, 64);
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0x0a1220, transparent: true, opacity: 0.55 });
  const haze = new THREE.Mesh(hazeGeo, hazeMat);
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 0.405;
  platform.add(haze);

  // Fighters
  class Fighter {
    constructor(opts) {
      this.group = new THREE.Group();
      this.group.position.copy(opts.position || new THREE.Vector3());
      this.group.rotation.y = opts.facingRight ? Math.PI : 0;

      // Body (song circle) with album art as front disc
      const sphereGeo = new THREE.SphereGeometry(1.1, 24, 24);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: opts.color || 0xffffff,
        metalness: 0.15,
        roughness: 0.85
      });
      const body = new THREE.Mesh(sphereGeo, sphereMat);
      body.castShadow = true;
      body.position.y = 2.1;
      this.body = body;
      this.group.add(body);

      // Front disc for album art
      const discGeo = new THREE.CircleGeometry(0.9, 48);
      const discMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.set(0, 2.1, 0.95);
      this.disc = disc;
      this.group.add(disc);

      // Limbs: simple cylinders
      const limbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.7 });

      const armGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.2, 12);
      this.leftArm = new THREE.Mesh(armGeo, limbMat);
      this.rightArm = new THREE.Mesh(armGeo, limbMat);
      this.leftArm.castShadow = this.rightArm.castShadow = true;
      this.leftArm.position.set(-1.0, 2.1, 0.0);
      this.rightArm.position.set(1.0, 2.1, 0.0);
      this.leftArm.rotation.z = 0.6;
      this.rightArm.rotation.z = -0.6;
      this.group.add(this.leftArm, this.rightArm);

      const legGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.6, 12);
      this.leftLeg = new THREE.Mesh(legGeo, limbMat);
      this.rightLeg = new THREE.Mesh(legGeo, limbMat);
      this.leftLeg.castShadow = this.rightLeg.castShadow = true;
      this.leftLeg.position.set(-0.5, 1.2, 0.0);
      this.rightLeg.position.set(0.5, 1.2, 0.0);
      this.group.add(this.leftLeg, this.rightLeg);

      // Gloves
      const gloveGeo = new THREE.SphereGeometry(0.35, 16, 16);
      const gloveMat = new THREE.MeshStandardMaterial({ color: opts.gloveColor || 0xff3a3a, metalness: 0.1, roughness: 0.6, emissive: 0x000000 });
      this.leftGlove = new THREE.Mesh(gloveGeo, gloveMat);
      this.rightGlove = new THREE.Mesh(gloveGeo, gloveMat);
      this.leftGlove.position.set(-1.45, 2.0, 0.2);
      this.rightGlove.position.set(1.45, 2.0, 0.2);
      this.leftGlove.castShadow = this.rightGlove.castShadow = true;
      this.group.add(this.leftGlove, this.rightGlove);

      // Name plate (billboard)
      const nameCanvas = document.createElement('canvas');
      nameCanvas.width = 512; nameCanvas.height = 128;
      const ctx = nameCanvas.getContext('2d');
      this.nameCanvas = nameCanvas;
      this.nameCtx = ctx;
      const nameTex = new THREE.CanvasTexture(nameCanvas);
      nameTex.minFilter = THREE.LinearFilter;
      const nameMat = new THREE.MeshBasicMaterial({ map: nameTex, transparent: true });
      const nameMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.9), nameMat);
      nameMesh.position.set(0, 3.5, 0);
      this.nameTexture = nameTex;
      this.nameMesh = nameMesh;
      this.group.add(nameMesh);

      // State
      this._albumArtUrl = null;
      this._albumTex = null;
      this.isKO = false;
      this.bouncePhase = Math.random() * Math.PI * 2;

      scene.add(this.group);
    }

    updateName(text) {
      const ctx = this.nameCtx;
      const w = this.nameCanvas.width, h = this.nameCanvas.height;
      ctx.clearRect(0, 0, w, h);
      // gradient background with transparent edges
      const grd = ctx.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, "rgba(0,0,0,0.0)");
      grd.addColorStop(0.08, "rgba(0,0,0,0.55)");
      grd.addColorStop(0.92, "rgba(0,0,0,0.55)");
      grd.addColorStop(1, "rgba(0,0,0,0.0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);

      ctx.font = "700 46px Inter, Arial, sans-serif";
      ctx.fillStyle = "#eafcf6";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 8;
      ctx.fillText(text ?? "", w / 2, h / 2);
      this.nameTexture.needsUpdate = true;
    }

    async setAlbumArt(url, proxyPrefix = "") {
      this._albumArtUrl = url || null;
      // Remove previous texture
      if (this._albumTex) {
        this._albumTex.dispose();
        this._albumTex = null;
      }
      const material = this.disc.material;
      try {
        if (!url) throw new Error("no album art");
        const finalUrl = proxyPrefix ? proxyPrefix + encodeURIComponent(url) : url;
        const tex = await loadTexture(finalUrl, true);
        material.map = tex;
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
        this._albumTex = tex;
      } catch (e) {
        // Fallback: generate stylized circle with initials
        const tex = makeFallbackAlbumTexture();
        material.map = tex;
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
        this._albumTex = tex;
      }
    }

    setTint(hex) {
      this.body.material.color.setHex(hex);
    }

    idle(dt, t) {
      if (this.isKO) return;
      this.bouncePhase += dt * 2.2;
      const bob = Math.sin(this.bouncePhase) * 0.06;
      this.group.position.y = bob;
      this.leftArm.rotation.z = 0.6 + Math.sin(t * 1.6) * 0.15;
      this.rightArm.rotation.z = -0.6 + Math.cos(t * 1.7) * -0.15;
      this.leftGlove.position.z = 0.2 + Math.sin(t * 1.4) * 0.06;
      this.rightGlove.position.z = 0.2 + Math.cos(t * 1.3) * 0.06;
    }

    punch(strength = 1, towards = new THREE.Vector3()) {
      if (this.isKO) return;
      const arm = Math.random() > 0.5 ? this.rightArm : this.leftArm;
      const glove = arm === this.rightArm ? this.rightGlove : this.leftGlove;
      // Quick tween-ish motion
      const baseRot = arm.rotation.z;
      const basePos = glove.position.clone();
      const targetRot = (arm === this.rightArm ? -1.4 : 1.4);
      const targetPos = basePos.clone().add(new THREE.Vector3(0, -0.05, 0.5 * strength));
      const start = performance.now();
      const dur = 140 + Math.random() * 80;
      const animate = () => {
        const t = (performance.now() - start) / dur;
        if (t >= 1) {
          arm.rotation.z = baseRot;
          glove.position.copy(basePos);
          return;
        }
        const ease = t < 0.5 ? (2 * t * t) : (1 - Math.pow(-2 * t + 2, 2) / 2);
        arm.rotation.z = THREE.MathUtils.lerp(baseRot, targetRot, ease);
        glove.position.lerpVectors(basePos, targetPos, ease);
        requestAnimationFrame(animate);
      };
      animate();
    }

    hitReaction(strength = 1) {
      if (this.isKO) return;
      const startRot = this.body.rotation.z;
      const start = performance.now();
      const dur = 220;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const target = startRot + dir * (0.15 + 0.25 * strength);
      const animate = () => {
        const t = (performance.now() - start) / dur;
        if (t >= 1) { this.body.rotation.z = 0; return; }
        const ease = Math.sin(t * Math.PI);
        this.body.rotation.z = THREE.MathUtils.lerp(startRot, target, ease);
        requestAnimationFrame(animate);
      };
      animate();
    }

    KO(fallDir = 1) {
      this.isKO = true;
      const startRot = this.group.rotation.x;
      const startY = this.group.position.y;
      const start = performance.now();
      const dur = 600;
      const targetRot = startRot + (Math.PI / 2) * fallDir;
      const targetY = -0.3;
      const animate = () => {
        const t = (performance.now() - start) / dur;
        if (t >= 1) {
          this.group.rotation.x = targetRot;
          this.group.position.y = targetY;
          return;
        }
        const ease = 1 - Math.pow(1 - t, 3);
        this.group.rotation.x = THREE.MathUtils.lerp(startRot, targetRot, ease);
        this.group.position.y = THREE.MathUtils.lerp(startY, targetY, ease);
        requestAnimationFrame(animate);
      };
      animate();
    }

    celebrate() {
      if (this.isKO) return;
      const upStart = this.rightGlove.position.y;
      const upTarget = upStart + 0.7;
      const start = performance.now();
      const dur = 450;
      const animate = () => {
        const t = (performance.now() - start) / dur;
        if (t >= 1) { this.rightGlove.position.y = upTarget; return; }
        const ease = 1 - Math.pow(1 - t, 3);
        this.rightGlove.position.y = THREE.MathUtils.lerp(upStart, upTarget, ease);
        requestAnimationFrame(animate);
      };
      animate();
    }

    face(targetX) {
      // turn slightly toward x coordinate
      const desired = targetX > this.group.position.x ? Math.PI : 0;
      this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, desired, 0.1);
    }
  }

  // Utilities
  function loadTexture(url, setCrossOrigin = true) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      if (setCrossOrigin) loader.crossOrigin = 'anonymous';
      loader.load(url, (tex) => {
        tex.anisotropy = 4;
        resolve(tex);
      }, undefined, (err) => reject(err));
    });
  }

  function makeFallbackAlbumTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 512, 512);
    grd.addColorStop(0, '#0bd3a8');
    grd.addColorStop(1, '#0b6ed3');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);

    // Vinyl ring
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(256, 256, 200, 0, Math.PI * 2);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // State
  const state = {
    champ: null,
    challenger: null,
    currentTrack: null,
    nextTrack: null,
    fightStartedAt: 0,
    fightEndsAt: 0,
    paused: false,
    pauseAt: 0
  };

  // Create fighters
  const champ = new Fighter({
    position: new THREE.Vector3(-3.0, 0, -0.6),
    color: 0x163651,
    gloveColor: 0xff3a3a
  });
  const challenger = new Fighter({
    position: new THREE.Vector3(3.0, 0, 0.6),
    color: 0x1c2850,
    gloveColor: 0x4a90e2,
    facingRight: false
  });
  state.champ = champ;
  state.challenger = challenger;

  // Camera slow orbit and shake
  let t0 = performance.now();
  let microShake = 0;
  function animate() {
    const now = performance.now();
    const dt = (now - t0) / 1000;
    t0 = now;

    const t = now / 1000;
    // Mild camera motion
    const radius = 0.25;
    camera.position.x = Math.sin(t * 0.3) * radius;
    camera.position.z = 12.5 + Math.cos(t * 0.33) * radius;
    camera.position.y = 6.5 + Math.sin(t * 0.22) * 0.15;
    const shakeX = (Math.random() - 0.5) * microShake;
    const shakeY = (Math.random() - 0.5) * microShake;
    camera.position.x += shakeX;
    camera.position.y += shakeY;
    camera.lookAt(0, 2.2, 0);
    microShake = Math.max(0, microShake - dt * 0.7);

    // Idle anims
    champ.idle(dt, t);
    challenger.idle(dt, t);

    // Fight rhythm (simple RNG punches)
    if (!state.paused && state.currentTrack) {
      const timeLeft = state.fightEndsAt - now;
      // occasional punches
      if (Math.random() < 0.02) {
        champ.punch(1);
        microShake = Math.min(0.2, microShake + 0.05);
        challenger.hitReaction(0.7);
      }
      if (Math.random() < 0.02) {
        challenger.punch(1);
        microShake = Math.min(0.2, microShake + 0.05);
        champ.hitReaction(0.7);
      }
      // progress bar
      const total = (state.fightEndsAt - state.fightStartedAt);
      const elapsed = total - timeLeft;
      const pct = clamp01(elapsed / Math.max(1, total));
      timebarFill.style.width = (pct * 100).toFixed(2) + '%';

      // KO when time is up
      if (timeLeft <= 0) {
        doKOAndSwap();
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // Title helpers
  function formatTitle(track) {
    if (!track) return "—";
    const title = track.title || track.name || "Untitled";
    const artist = track.artist || track.artists?.[0]?.name || "";
    return artist ? `${title} — ${artist}` : title;
  }

  function mapTrackShape(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const t = {};
    t.id = raw.id || raw.uri || raw.videoId || raw.trackId || raw.title + ":" + raw.artist || Math.random().toString(36).slice(2);
    t.title = raw.title || raw.name || raw.songTitle || raw.track?.name || raw.videoTitle || "Unknown Track";
    t.artist = raw.artist || raw.artists?.[0]?.name || raw.author || raw.channel || raw.userName || raw.requester || "";
    t.durationMs =
      numberish(raw.durationMs) ||
      numberish(raw.duration) ||
      (raw.length ? numberish(raw.length) : 0) ||
      180000; // default 3 min
    // progress/start times
    const now = Date.now();
    if (numberish(raw.progressMs)) t.progressMs = numberish(raw.progressMs);
    if (numberish(raw.startedAt)) t.startedAt = numberish(raw.startedAt);
    // Try common album art fields
    t.albumArtUrl = raw.albumArtUrl || raw.albumArt || raw.coverUrl || raw.cover || raw.thumbnailUrl || raw.thumbnail || raw.image || raw.artworkUrl || raw.artUrl || null;
    return t;
  }
  function numberish(v) {
    if (v == null) return null;
    const n = +v;
    return isFinite(n) ? n : null;
  }

  async function applyTrackToFighter(track, fighter, tintHex) {
    fighter.updateName(formatTitle(track));
    fighter.setTint(tintHex);
    await fighter.setAlbumArt(track?.albumArtUrl || null, CFG.imageProxy || "");
  }

  function startFightForCurrentTrack(track, nextTrack) {
    state.currentTrack = track;
    state.nextTrack = nextTrack || state.nextTrack || null;

    // KO buffer
    const dur = Math.max(1000, (track.durationMs || 180000) - (CFG.koBufferMs || 3000));
    const progress = track.progressMs || 0;
    const now = Date.now();
    state.fightStartedAt = now - progress;
    state.fightEndsAt = state.fightStartedAt + dur;

    champTag.textContent = formatTitle(track);
    challengerTag.textContent = formatTitle(state.nextTrack);

    // Face each other
    champ.face(challenger.group.position.x);
    challenger.face(champ.group.position.x);

    // Reset KO states
    champ.isKO = false;
    challenger.isKO = false;
    champ.group.rotation.x = 0;
    challenger.group.rotation.x = 0;

    // Subtle intro punch
    setTimeout(() => {
      champ.punch(1);
      challenger.hitReaction(0.7);
      microShake = Math.min(0.25, microShake + 0.12);
    }, 350);
  }

  function doKOAndSwap() {
    if (!state.currentTrack) return;
    // Challenger KOs champ
    challenger.punch(1.4);
    champ.KO(1);
    setTimeout(() => challenger.celebrate(), 300);
    microShake = Math.min(0.35, microShake + 0.2);

    // After short delay, promote challenger to champ, and await next challenger
    setTimeout(async () => {
      // Swap fighters visuals to keep corners consistent:
      // Instead of swapping meshes, swap their assigned tracks and art/name.
      state.currentTrack = state.nextTrack || null;

      // Visual: champ adopts challenger visuals (title, art), challenger resets to "waiting"
      await applyTrackToFighter(state.currentTrack || {}, champ, 0x163651);
      champTag.textContent = formatTitle(state.currentTrack);

      // Reset challenger to pending (blank) until a new next track is supplied
      state.nextTrack = null;
      challengerTag.textContent = "—";
      await applyTrackToFighter({}, challenger, 0x1c2850);

      // Reset KO state
      champ.isKO = false;
      challenger.isKO = false;
      champ.group.rotation.x = 0;
      challenger.group.rotation.x = 0;

      // Start next fight timeline if we have a current track
      if (state.currentTrack) {
        const dur = Math.max(1000, (state.currentTrack.durationMs || 180000) - (CFG.koBufferMs || 3000));
        const now = Date.now();
        state.fightStartedAt = now;
        state.fightEndsAt = now + dur;
      } else {
        // No track, stop the clock
        state.fightStartedAt = 0;
        state.fightEndsAt = 0;
      }
    }, 750);
  }

  // Public API
  window.BoxingOverlay = {
    startWithTracks: async (currentTrackRaw, nextTrackRaw) => {
      const cur = mapTrackShape(currentTrackRaw);
      const nxt = mapTrackShape(nextTrackRaw);
      await applyTrackToFighter(cur || {}, champ, 0x163651);
      if (nxt) {
        await applyTrackToFighter(nxt, challenger, 0x1c2850);
      } else {
        await applyTrackToFighter({}, challenger, 0x1c2850);
      }
      champTag.textContent = formatTitle(cur);
      challengerTag.textContent = formatTitle(nxt);
      startFightForCurrentTrack(cur || { durationMs: 180000 }, nxt || null);
    },
    setNextTrack: async (nextTrackRaw) => {
      const nxt = mapTrackShape(nextTrackRaw);
      state.nextTrack = nxt;
      await applyTrackToFighter(nxt || {}, challenger, 0x1c2850);
      challengerTag.textContent = formatTitle(nxt);
    },
    skip: () => {
      doKOAndSwap();
    },
    pause: () => {
      if (state.paused) return;
      state.paused = true;
      state.pauseAt = Date.now();
    },
    resume: () => {
      if (!state.paused) return;
      const delta = Date.now() - (state.pauseAt || Date.now());
      state.fightStartedAt += delta;
      state.fightEndsAt += delta;
      state.paused = false;
      state.pauseAt = 0;
    }
  };

  // Event wiring (listen to multiple common names)
  function onEvent(name, handler) {
    window.addEventListener(name, handler);
    document.addEventListener(name, handler);
  }

  onEvent('nowPlaying', async (e) => {
    const cur = mapTrackShape(e.detail);
    if (!cur) return;
    await applyTrackToFighter(cur, champ, 0x163651);
    champTag.textContent = formatTitle(cur);
    startFightForCurrentTrack(cur, state.nextTrack);
  });
  onEvent('song:nowplaying', async (e) => {
    const cur = mapTrackShape(e.detail);
    if (!cur) return;
    await applyTrackToFighter(cur, champ, 0x163651);
    champTag.textContent = formatTitle(cur);
    startFightForCurrentTrack(cur, state.nextTrack);
  });
  onEvent('spotify:nowPlaying', async (e) => {
    const cur = mapTrackShape(e.detail);
    if (!cur) return;
    await applyTrackToFighter(cur, champ, 0x163651);
    champTag.textContent = formatTitle(cur);
    startFightForCurrentTrack(cur, state.nextTrack);
  });
  onEvent('songchanged', async (e) => {
    const cur = mapTrackShape(e.detail);
    if (!cur) return;
    await applyTrackToFighter(cur, champ, 0x163651);
    champTag.textContent = formatTitle(cur);
    startFightForCurrentTrack(cur, state.nextTrack);
  });
  onEvent('song:play', async (e) => {
    const cur = mapTrackShape(e.detail);
    if (!cur) return;
    await applyTrackToFighter(cur, champ, 0x163651);
    champTag.textContent = formatTitle(cur);
    startFightForCurrentTrack(cur, state.nextTrack);
  });

  // Next/queue events
  onEvent('queue:next', async (e) => {
    const nxtRaw = e.detail?.next ?? e.detail;
    const nxt = mapTrackShape(nxtRaw);
    state.nextTrack = nxt;
    await applyTrackToFighter(nxt || {}, challenger, 0x1c2850);
    challengerTag.textContent = formatTitle(nxt);
  });
  onEvent('nextTrack', async (e) => {
    const nxt = mapTrackShape(e.detail);
    state.nextTrack = nxt;
    await applyTrackToFighter(nxt || {}, challenger, 0x1c2850);
    challengerTag.textContent = formatTitle(nxt);
  });
  onEvent('queueUpdated', async (e) => {
    let nxt = null;
    if (Array.isArray(e.detail) && e.detail.length > 0) nxt = e.detail[0];
    else if (Array.isArray(e.detail?.queue) && e.detail.queue.length > 0) nxt = e.detail.queue[0];
    else if (e.detail?.next) nxt = e.detail.next;
    const mapped = mapTrackShape(nxt);
    state.nextTrack = mapped;
    await applyTrackToFighter(mapped || {}, challenger, 0x1c2850);
    challengerTag.textContent = formatTitle(mapped);
  });

  // Song request may serve as "next" if nothing else
  onEvent('songrequest', async (e) => {
    if (!state.currentTrack) return; // if idle, ignore as it's not playing yet
    const nxt = mapTrackShape(e.detail);
    state.nextTrack = nxt;
    await applyTrackToFighter(nxt || {}, challenger, 0x1c2850);
    challengerTag.textContent = formatTitle(nxt);
  });

  // Skip/Pause/Resume
  onEvent('track:skip', () => window.BoxingOverlay.skip());
  onEvent('song:skip', () => window.BoxingOverlay.skip());
  onEvent('track:pause', () => window.BoxingOverlay.pause());
  onEvent('song:pause', () => window.BoxingOverlay.pause());
  onEvent('track:resume', () => window.BoxingOverlay.resume());
  onEvent('song:resume', () => window.BoxingOverlay.resume());

  // Debug controls
  if (CFG.debug) {
    document.getElementById('btnStartMock').addEventListener('click', async () => {
      const cur = {
        id: 'cur_' + Math.random().toString(36).slice(2),
        title: 'Neon Glove',
        artist: 'The Ringmasters',
        durationMs: 20_000,
        progressMs: 0,
        albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273f4bc8e16a3c6ccc0b4e99d73'
      };
      const nxt = {
        id: 'nxt_' + Math.random().toString(36).slice(2),
        title: 'Uppercut Anthem',
        artist: 'Blue Corner',
        durationMs: 18_000,
        albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2731693fbc6aef88a5ce6dd1a3b'
      };
      await window.BoxingOverlay.startWithTracks(cur, nxt);
    });
    document.getElementById('btnSkip').addEventListener('click', () => window.BoxingOverlay.skip());
    document.getElementById('btnPause').addEventListener('click', () => window.BoxingOverlay.pause());
    document.getElementById('btnResume').addEventListener('click', () => window.BoxingOverlay.resume());
    document.getElementById('btnNewChallenger').addEventListener('click', async () => {
      const rnd = Math.floor(Math.random() * 1000);
      await window.BoxingOverlay.setNextTrack({
        id: 'rnd_' + rnd,
        title: 'Random ' + rnd,
        artist: 'Challenger',
        durationMs: 22_000,
        albumArtUrl: 'https://picsum.photos/seed/' + rnd + '/512'
      });
    });

    // Auto-start mock if debug param also has auto=1
    const auto = new URLSearchParams(location.search).get("auto") === "1";
    if (auto) {
      document.getElementById('btnStartMock').click();
    }
  }

  // If no events are wired yet and debug is off, show a quiet idle look
  (async function initialIdle() {
    await applyTrackToFighter({}, champ, 0x163651);
    await applyTrackToFighter({}, challenger, 0x1c2850);
    champTag.textContent = "—";
    challengerTag.textContent = "—";
  })();

})();