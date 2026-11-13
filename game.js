(() => {
  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const overlay = document.querySelector("#overlay");
  const panel = document.querySelector("#panel");
  const pauseButton = document.querySelector("#pause-button");
  const skillButton = document.querySelector("#skill-button");
  const dodgeButton = document.querySelector("#touch-dodge");
  const W = canvas.width;
  const H = canvas.height;
  const ROOM = { left: 72, top: 72, right: 888, bottom: 528 };
  const keys = new Set();
  const directions = {
    up: ["w", "arrowup"],
    down: ["s", "arrowdown"],
    left: ["a", "arrowleft"],
    right: ["d", "arrowright"]
  };
  let lastFrame = 0;
  const characters = [
    {
      id: "sword", name: "青霄剑修", epithet: "迅捷 · 单体爆发",
      description: "剑影追星：斩击锁定目标及附近妖物。冷却 7 秒。",
      robe: "#59a99d", trim: "#a9e3cb", damage: 27, fireRate: 0.34,
      skill: { name: "剑影追星", cooldown: 7, color: "#a8fff0" }
    },
    {
      id: "thunder", name: "天雷符师", epithet: "沉稳 · 范围雷击",
      description: "引雷符：轰击目标周围一片区域。冷却 8 秒。",
      robe: "#6579a8", trim: "#c5d0ed", damage: 34, fireRate: 0.52,
      skill: { name: "引雷符", cooldown: 8, color: "#bca8ff" }
    },
    {
      id: "alchemist", name: "丹霞药师", epithet: "均衡 · 治疗护身",
      description: "丹华护体：恢复气血并震伤身边妖物。冷却 10 秒。",
      robe: "#9d7861", trim: "#f1c99b", damage: 24, fireRate: 0.42,
      skill: { name: "丹华护体", cooldown: 10, color: "#ffd29a" }
    }
  ];
  let selectedCharacterId = "sword";
  const dashDuration = 0.16;
  const dashCooldown = 1.4;
  let state;

  const getCharacter = id => characters.find(character => character.id === id) || characters[0];
  const freshState = () => ({
    mode: "title",
    time: 0,
    room: 1,
    wave: 1,
    waveClock: 0,
    waveSpawnLeft: 0,
    guardianSpawned: false,
    attackClock: 0,
    toast: "",
    toastTimer: 0,
    player: {
      x: W / 2, y: H / 2, hp: 100, maxHp: 100,
      speed: 205, damage: 27, fireRate: 0.34, radius: 11,
      aim: 0, invulnerable: 0, dashTime: 0, dashCooldown: 0,
      dashX: 1, dashY: 0, skillCooldown: 0, characterId: "sword"
    },
    level: 1,
    xp: 0,
    nextXp: 6,
    kills: 0,
    enemies: [],
    shots: [],
    enemyShots: [],
    drops: [],
    particles: [],
    damageNumbers: [],
    skillEffects: [],
    target: null
  });

  state = freshState();
  ctx.imageSmoothingEnabled = false;

  function showPanel(content) {
    panel.innerHTML = content;
    overlay.hidden = false;
  }

  function hidePanel() {
    overlay.hidden = true;
  }

  function updateSkillButton() {
    const characterId = state.mode === "title" ? selectedCharacterId : state.player.characterId;
    const character = getCharacter(characterId);
    const remaining = Math.ceil(state.player.skillCooldown);
    const label = remaining > 0
      ? `${character.skill.name} · ${remaining}秒`
      : `E · ${character.skill.name}`;
    if (skillButton.textContent !== label) skillButton.textContent = label;
    const disabled = state.mode !== "playing" || remaining > 0;
    if (skillButton.disabled !== disabled) skillButton.disabled = disabled;
  }

  function showTitle() {
    showPanel(`
      <div class="eyebrow">误入灵墟 · 以战证道</div>
      <h2>择一法门</h2>
      <p>自动锁敌施法，移动闪避妖物。选择一位修士，凭神通破阵。</p>
      <div class="choices">${characters.map(character => `
        <button class="choice character-card" type="button" data-character="${character.id}" aria-pressed="${character.id === selectedCharacterId}">
          <strong>${character.name}</strong><span>${character.epithet}</span><span>${character.description}</span>
        </button>`).join("")}
      </div>
      <button class="primary-button" id="start-button" type="button">开始历练</button>
    `);
    panel.querySelectorAll("[data-character]").forEach(button => {
      button.addEventListener("click", () => {
        selectedCharacterId = button.dataset.character;
        updateSkillButton();
        panel.querySelectorAll("[data-character]").forEach(card => {
          card.setAttribute("aria-pressed", String(card.dataset.character === selectedCharacterId));
        });
      });
    });
    document.querySelector("#start-button").addEventListener("click", startGame);
    updateSkillButton();
  }

  function startWave() {
    state.waveSpawnLeft = 4 + state.wave * 2 + (state.room - 1) * 2;
    state.waveClock = 0;
    state.guardianSpawned = false;
    state.toast = `第 ${state.wave} 波妖物来袭`;
    state.toastTimer = 2;
  }

  function startGame() {
    state = freshState();
    const character = getCharacter(selectedCharacterId);
    state.player.characterId = character.id;
    state.player.damage = character.damage;
    state.player.fireRate = character.fireRate;
    state.mode = "playing";
    pauseButton.disabled = false;
    keys.clear();
    startWave();
    updateSkillButton();
    hidePanel();
  }

  function pauseGame() {
    if (state.mode === "playing") {
      state.mode = "paused";
      updateSkillButton();
      showPanel(`
        <div class="eyebrow">灵台暂歇</div>
        <h2>修行暂停</h2>
        <p>整顿心神，再继续探索灵墟。</p>
        <button class="primary-button" id="resume-button" type="button">继续修行</button>
      `);
      document.querySelector("#resume-button").addEventListener("click", resumeGame);
    } else if (state.mode === "paused") {
      resumeGame();
    }
  }

  function resumeGame() {
    state.mode = "playing";
    keys.clear();
    updateSkillButton();
    hidePanel();
  }

  const upgrades = [
    { name: "青锋剑诀", description: "法术伤害 +35%，发射速度 +10%", apply: () => { state.player.damage *= 1.35; state.player.fireRate *= 0.9; } },
    { name: "灵气护体", description: "最大气血 +30，并恢复 30 点", apply: () => { state.player.maxHp += 30; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 30); } },
    { name: "御风步", description: "移动速度 +18%，气血恢复 10 点", apply: () => { state.player.speed *= 1.18; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 10); } }
  ];

  function applyUpgrade(index) {
    upgrades[index].apply();
  }

  function levelUp() {
    state.xp -= state.nextXp;
    state.level += 1;
    state.nextXp = Math.floor(state.nextXp * 1.32 + 2);
    state.mode = "levelup";
    updateSkillButton();
    showPanel(`
      <div class="eyebrow">境界突破 · 第 ${state.level} 重</div>
      <h2>择一法门</h2>
      <p>灵气涌入丹田，你的修为更进一步。</p>
      <div class="choices">${upgrades.map((upgrade, index) => `
        <button class="choice" type="button" data-upgrade="${index}">
          <strong>${upgrade.name}</strong><span>${upgrade.description}</span>
        </button>`).join("")}
      </div>
    `);
    panel.querySelectorAll("[data-upgrade]").forEach(button => {
      button.addEventListener("click", () => {
        applyUpgrade(Number(button.dataset.upgrade));
        state.mode = "playing";
        updateSkillButton();
        hidePanel();
        if (state.xp >= state.nextXp) levelUp();
      });
    });
  }

  function renderRoomClear(selected = -1) {
    const rewardText = selected < 0
      ? "选择一项战利品强化，再推开灵门前往下一间石室。"
      : `你已习得「${upgrades[selected].name}」，灵门已开启。`;
    showPanel(`
      <div class="eyebrow">第 ${state.room} 间石室 · 三波妖物已肃清</div>
      <h2>灵门开启</h2>
      <p>${rewardText}</p>
      <div class="choices">${upgrades.map((upgrade, index) => `
        <button class="choice" type="button" data-room-upgrade="${index}" ${selected >= 0 ? "disabled" : ""}>
          <strong>${upgrade.name}</strong><span>${upgrade.description}</span>
        </button>`).join("")}
      </div>
      <button class="primary-button" id="next-room-button" type="button" ${selected < 0 ? "disabled" : ""}>进入下一间</button>
    `);
    panel.querySelectorAll("[data-room-upgrade]").forEach(button => {
      button.addEventListener("click", () => {
        if (selected < 0) {
          applyUpgrade(Number(button.dataset.roomUpgrade));
          state.roomReward = Number(button.dataset.roomUpgrade);
          renderRoomClear(state.roomReward);
        }
      });
    });
    const nextButton = document.querySelector("#next-room-button");
    nextButton.addEventListener("click", () => {
      if (state.roomReward === undefined) return;
      state.room += 1;
      state.wave = 1;
      state.roomReward = undefined;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 12);
      state.enemies = [];
      state.shots = [];
      state.enemyShots = [];
      state.mode = "playing";
      startWave();
      updateSkillButton();
      hidePanel();
    });
  }

  function clearRoom() {
    state.mode = "roomclear";
    state.roomReward = undefined;
    updateSkillButton();
    renderRoomClear();
  }

  function gameOver() {
    state.mode = "gameover";
    updateSkillButton();
    showPanel(`
      <div class="eyebrow">历练结束</div>
      <h2>道心未灭</h2>
      <p>你探索了 ${state.room} 间石室，斩杀 ${state.kills} 只妖物，修至第 ${state.level} 重。静心调息，再入灵墟。</p>
      <button class="primary-button" id="restart-button" type="button">重新历练</button>
    `);
    document.querySelector("#restart-button").addEventListener("click", startGame);
  }

  function formatTime(seconds) {
    const whole = Math.floor(seconds);
    return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  }

  function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    const inner = 34;
    const position = [
      { x: ROOM.left + inner + Math.random() * (ROOM.right - ROOM.left - inner * 2), y: ROOM.top + inner },
      { x: ROOM.right - inner, y: ROOM.top + inner + Math.random() * (ROOM.bottom - ROOM.top - inner * 2) },
      { x: ROOM.left + inner + Math.random() * (ROOM.right - ROOM.left - inner * 2), y: ROOM.bottom - inner },
      { x: ROOM.left + inner, y: ROOM.top + inner + Math.random() * (ROOM.bottom - ROOM.top - inner * 2) }
    ][side];
    const guardian = state.wave === 3 && !state.guardianSpawned;
    if (guardian) state.guardianSpawned = true;
    const ranged = !guardian && (state.wave >= 2 || state.room >= 2) && Math.random() < 0.28;
    const scale = 1 + (state.room - 1) * 0.2;
    const maxHp = (guardian ? 190 : ranged ? 55 : 48) * scale;
    state.enemies.push({
      ...position,
      kind: guardian ? "guardian" : ranged ? "ranged" : "chaser",
      hp: maxHp,
      maxHp,
      speed: (guardian ? 43 : ranged ? 48 : 65) + Math.min(state.room * 2, 20),
      damage: guardian ? 22 : ranged ? 9 : 12,
      radius: guardian ? 18 : 12,
      hitClock: 0,
      attackClock: 0.8 + Math.random() * 1.1
    });
  }

  function chooseTarget(player) {
    let target = null;
    let bestScore = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (distance > 560) continue;
      const score = distance - (enemy.kind === "guardian" ? 65 : 0);
      if (score < bestScore) {
        target = enemy;
        bestScore = score;
      }
    }
    return target;
  }

  function damageEnemy(enemy, amount, color) {
    if (enemy.hp <= 0) return;
    enemy.hp -= amount;
    state.damageNumbers.push({
      x: enemy.x, y: enemy.y - enemy.radius - 8,
      value: Math.round(amount), color, life: 0.65, maxLife: 0.65
    });
  }

  function makeLightningBolt(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const points = [{ x: x1, y: y1 }];
    for (let step = 1; step < 6; step += 1) {
      const t = step / 6;
      const offset = (Math.random() - 0.5) * 34;
      points.push({
        x: x1 + dx * t - dy / length * offset,
        y: y1 + dy * t + dx / length * offset
      });
    }
    points.push({ x: x2, y: y2 });
    return points;
  }

  function activateSkill() {
    const player = state.player;
    if (state.mode !== "playing" || player.skillCooldown > 0) return;
    const character = getCharacter(player.characterId);
    const target = state.target && state.enemies.includes(state.target)
      ? state.target
      : chooseTarget(player);
    if (character.id !== "alchemist" && !target) return;
    player.skillCooldown = character.skill.cooldown;
    const color = character.skill.color;

    if (character.id === "sword") {
      const affected = state.enemies
        .filter(enemy => Math.hypot(enemy.x - target.x, enemy.y - target.y) < 112)
        .slice(0, 5);
      for (const enemy of affected) {
        damageEnemy(enemy, 88, color);
        burst(enemy.x, enemy.y, color, 7);
      }
      state.skillEffects.push({
        type: "slash", x1: player.x, y1: player.y, x2: target.x, y2: target.y,
        life: 0.42, maxLife: 0.42, color
      });
    } else if (character.id === "thunder") {
      const affected = state.enemies.filter(enemy =>
        Math.hypot(enemy.x - target.x, enemy.y - target.y) < 150
      );
      const bolts = affected.map(enemy => makeLightningBolt(
        enemy.x + (Math.random() - 0.5) * 50,
        enemy.y - 130 - Math.random() * 45,
        enemy.x,
        enemy.y
      ));
      for (const enemy of affected) {
        damageEnemy(enemy, 68, color);
        burst(enemy.x, enemy.y, color, 9);
      }
      state.skillEffects.push({
        type: "lightning", x: target.x, y: target.y, radius: 150,
        bolts, life: 0.55, maxLife: 0.55, color
      });
    } else {
      player.hp = Math.min(player.maxHp, player.hp + 38);
      const affected = state.enemies.filter(enemy =>
        Math.hypot(enemy.x - player.x, enemy.y - player.y) < 138
      );
      for (const enemy of affected) {
        damageEnemy(enemy, 38, color);
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const distance = Math.hypot(dx, dy) || 1;
        enemy.x += dx / distance * 48;
        enemy.y += dy / distance * 48;
        burst(enemy.x, enemy.y, color, 6);
      }
      state.skillEffects.push({
        type: "aura", x: player.x, y: player.y, radius: 138,
        life: 0.7, maxLife: 0.7, color
      });
      state.damageNumbers.push({
        x: player.x, y: player.y - 22, value: "+38", color,
        life: 0.8, maxLife: 0.8
      });
    }

    state.toast = character.skill.name;
    state.toastTimer = 1.1;
    updateSkillButton();
  }

  function firePlayerShot(target) {
    const player = state.player;
    const { x, y, damage } = player;
    player.aim = Math.atan2(target.y - y, target.x - x);
    const character = getCharacter(player.characterId);
    const speed = character.id === "sword" ? 520 : character.id === "thunder" ? 420 : 470;
    state.shots.push({
      x: x + Math.cos(player.aim) * 14,
      y: y + Math.sin(player.aim) * 14,
      vx: Math.cos(player.aim) * speed,
      vy: Math.sin(player.aim) * speed,
      damage,
      color: character.skill.color,
      trailClock: 0,
      life: 1.5
    });
  }

  function fireEnemyShot(enemy, player) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = 175;
    state.enemyShots.push({
      x: enemy.x,
      y: enemy.y,
      vx: dx / distance * speed,
      vy: dy / distance * speed,
      damage: enemy.damage,
      life: 3
    });
  }

  function requestDash() {
    if (state.mode !== "playing" || state.player.dashCooldown > 0) return;
    const player = state.player;
    let dx = 0;
    let dy = 0;
    for (const key of directions.left) if (keys.has(key)) dx -= 1;
    for (const key of directions.right) if (keys.has(key)) dx += 1;
    for (const key of directions.up) if (keys.has(key)) dy -= 1;
    for (const key of directions.down) if (keys.has(key)) dy += 1;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      dx = Math.cos(player.aim);
      dy = Math.sin(player.aim);
    } else {
      dx /= length;
      dy /= length;
    }
    player.dashX = dx;
    player.dashY = dy;
    player.dashTime = dashDuration;
    player.dashCooldown = dashCooldown;
    player.invulnerable = Math.max(player.invulnerable, dashDuration);
    burst(player.x, player.y, "#8ff5d5", 8);
  }

  function burst(x, y, color, count = 7) {
    const particlesToAdd = Math.min(count, Math.max(0, 360 - state.particles.length));
    for (let i = 0; i < particlesToAdd; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 90;
      state.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.25 + Math.random() * 0.35, maxLife: 0.6, color
      });
    }
  }

  function damagePlayer(amount) {
    if (state.player.invulnerable > 0) return;
    state.player.hp -= amount;
    state.player.invulnerable = 0.65;
    burst(state.player.x, state.player.y, "#f48380", 6);
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      gameOver();
    }
  }

  function update(dt) {
    if (state.mode !== "playing") return;
    state.time += dt;
    state.toastTimer = Math.max(0, state.toastTimer - dt);
    const player = state.player;
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.dashTime = Math.max(0, player.dashTime - dt);
    player.skillCooldown = Math.max(0, player.skillCooldown - dt);
    updateSkillButton();
    let mx = 0;
    let my = 0;
    for (const key of directions.left) if (keys.has(key)) mx -= 1;
    for (const key of directions.right) if (keys.has(key)) mx += 1;
    for (const key of directions.up) if (keys.has(key)) my -= 1;
    for (const key of directions.down) if (keys.has(key)) my += 1;
    const length = Math.hypot(mx, my) || 1;
    const moveX = player.dashTime > 0 ? player.dashX : mx / length;
    const moveY = player.dashTime > 0 ? player.dashY : my / length;
    const moveSpeed = player.dashTime > 0 ? player.speed * 2.8 : player.speed;
    player.x = Math.max(ROOM.left + 18, Math.min(ROOM.right - 18, player.x + moveX * moveSpeed * dt));
    player.y = Math.max(ROOM.top + 18, Math.min(ROOM.bottom - 18, player.y + moveY * moveSpeed * dt));
    player.invulnerable = Math.max(0, player.invulnerable - dt);

    const spawnInterval = Math.max(0.52, 1.12 - state.room * 0.025);
    state.waveClock += dt;
    if (state.waveSpawnLeft > 0 && state.waveClock >= spawnInterval) {
      state.waveClock = 0;
      spawnEnemy();
      state.waveSpawnLeft -= 1;
    }

    state.target = chooseTarget(player);
    state.attackClock = Math.min(player.fireRate, state.attackClock + dt);
    if (state.target) {
      player.aim = Math.atan2(state.target.y - player.y, state.target.x - player.x);
      if (state.attackClock >= player.fireRate) {
        state.attackClock = 0;
        firePlayerShot(state.target);
      }
    }

    for (const enemy of state.enemies) {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (enemy.kind === "ranged") {
        const direction = distance > 230 ? 1 : distance < 145 ? -1 : 0;
        enemy.x += dx / distance * enemy.speed * direction * dt;
        enemy.y += dy / distance * enemy.speed * direction * dt;
        enemy.attackClock -= dt;
        if (enemy.attackClock <= 0 && distance < 440) {
          fireEnemyShot(enemy, player);
          enemy.attackClock = 1.6 + Math.random() * 0.45;
        }
      } else {
        enemy.x += dx / distance * enemy.speed * dt;
        enemy.y += dy / distance * enemy.speed * dt;
      }
      enemy.hitClock = Math.max(0, enemy.hitClock - dt);
      if (distance < player.radius + enemy.radius && enemy.hitClock <= 0) {
        enemy.hitClock = 0.85;
        damagePlayer(enemy.damage);
        if (state.mode !== "playing") return;
      }
    }

    for (const shot of state.shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      shot.trailClock += dt;
      if (shot.trailClock >= 0.06) {
        shot.trailClock = 0;
        if (state.particles.length < 360) {
          state.particles.push({
            x: shot.x, y: shot.y, vx: -shot.vx * 0.035, vy: -shot.vy * 0.035,
            life: 0.18, maxLife: 0.18, color: shot.color
          });
        }
      }
      for (const enemy of state.enemies) {
        if (enemy.hp > 0 && Math.hypot(enemy.x - shot.x, enemy.y - shot.y) < enemy.radius + 6) {
          damageEnemy(enemy, shot.damage, shot.color);
          shot.life = 0;
          burst(shot.x, shot.y, shot.color, 4);
          break;
        }
      }
    }
    state.shots = state.shots.filter(shot =>
      shot.life > 0 &&
      shot.x > ROOM.left && shot.x < ROOM.right &&
      shot.y > ROOM.top && shot.y < ROOM.bottom
    );

    for (const shot of state.enemyShots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (Math.hypot(shot.x - player.x, shot.y - player.y) < player.radius + 5) {
        shot.life = 0;
        damagePlayer(shot.damage);
        if (state.mode !== "playing") return;
      }
    }
    state.enemyShots = state.enemyShots.filter(shot =>
      shot.life > 0 &&
      shot.x > ROOM.left && shot.x < ROOM.right &&
      shot.y > ROOM.top && shot.y < ROOM.bottom
    );

    const survivors = [];
    for (const enemy of state.enemies) {
      if (enemy.hp > 0) {
        survivors.push(enemy);
        continue;
      }
      state.kills += 1;
      burst(enemy.x, enemy.y, enemy.kind === "guardian" ? "#f2cb72" : "#8ce1c3", 9);
      state.drops.push({ x: enemy.x, y: enemy.y, type: "qi", value: enemy.kind === "guardian" ? 3 : 1, phase: Math.random() * 6 });
      if (Math.random() < 0.12) state.drops.push({ x: enemy.x + 8, y: enemy.y, type: "heal", value: 16, phase: 0 });
    }
    state.enemies = survivors;

    for (const drop of state.drops) {
      const dx = player.x - drop.x;
      const dy = player.y - drop.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < 105) {
        const pull = 150 + (105 - distance) * 3;
        drop.x += dx / distance * pull * dt;
        drop.y += dy / distance * pull * dt;
      }
      drop.phase += dt * 5;
      if (distance < player.radius + 9) {
        if (drop.type === "heal") player.hp = Math.min(player.maxHp, player.hp + drop.value);
        else state.xp += drop.value;
        drop.collected = true;
      }
    }
    state.drops = state.drops.filter(drop => !drop.collected);

    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.94;
      particle.vy *= 0.94;
      particle.life -= dt;
    }
    state.particles = state.particles.filter(particle => particle.life > 0);
    for (const effect of state.skillEffects) effect.life -= dt;
    state.skillEffects = state.skillEffects.filter(effect => effect.life > 0);
    for (const number of state.damageNumbers) {
      number.y -= 24 * dt;
      number.life -= dt;
    }
    state.damageNumbers = state.damageNumbers.filter(number => number.life > 0);

    if (state.xp >= state.nextXp) {
      levelUp();
      return;
    }
    if (state.waveSpawnLeft === 0 && state.enemies.length === 0) {
      if (state.waveClock >= 1.2) {
        if (state.wave < 3) {
          state.wave += 1;
          startWave();
        } else {
          clearRoom();
        }
      }
    } else if (state.waveSpawnLeft === 0) {
      state.waveClock = 0;
    }
  }

  function drawBackground() {
    ctx.fillStyle = "#111720";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1a252e";
    ctx.fillRect(ROOM.left, ROOM.top, ROOM.right - ROOM.left, ROOM.bottom - ROOM.top);
    for (let y = ROOM.top + 4; y < ROOM.bottom; y += 32) {
      for (let x = ROOM.left + 4; x < ROOM.right; x += 32) {
        const tile = ((x / 32) * 7 + (y / 32) * 11) % 5;
        ctx.fillStyle = tile === 0 ? "#1d2a32" : "#1b2730";
        ctx.fillRect(x, y, 30, 30);
        if (tile === 2) {
          ctx.fillStyle = "#304039";
          ctx.fillRect(x + 7, y + 9, 2, 2);
          ctx.fillRect(x + 23, y + 22, 2, 2);
        }
        if (tile === 4) {
          ctx.fillStyle = "#28363a";
          ctx.fillRect(x + 13, y + 18, 4, 2);
        }
      }
    }
    ctx.fillStyle = "#34313a";
    ctx.fillRect(ROOM.left - 10, ROOM.top - 10, ROOM.right - ROOM.left + 20, 24);
    ctx.fillRect(ROOM.left - 10, ROOM.bottom - 14, ROOM.right - ROOM.left + 20, 24);
    ctx.fillRect(ROOM.left - 10, ROOM.top, 24, ROOM.bottom - ROOM.top);
    ctx.fillRect(ROOM.right - 14, ROOM.top, 24, ROOM.bottom - ROOM.top);
    ctx.fillStyle = "#55505a";
    for (let x = ROOM.left; x < ROOM.right; x += 64) {
      ctx.fillRect(x, ROOM.top - 7, 26, 6);
      ctx.fillRect(x + 28, ROOM.bottom + 5, 26, 6);
    }
    const doorY = (ROOM.top + ROOM.bottom) / 2;
    ctx.fillStyle = state.mode === "roomclear" ? "#67cbb0" : "#71634b";
    ctx.fillRect(ROOM.right - 13, doorY - 28, 17, 56);
    ctx.fillStyle = state.mode === "roomclear" ? "#b9f1d8" : "#282832";
    ctx.fillRect(ROOM.right - 9, doorY - 20, 8, 40);
    if (state.mode === "roomclear") {
      ctx.fillStyle = "#e9d079";
      ctx.fillRect(ROOM.right - 7, doorY - 3, 2, 6);
    }
    ctx.strokeStyle = "#d2ae6c55";
    ctx.lineWidth = 2;
    ctx.strokeRect(ROOM.left + 26, ROOM.top + 26, ROOM.right - ROOM.left - 52, ROOM.bottom - ROOM.top - 52);
  }

  function drawPlayer() {
    const { x, y, aim, invulnerable } = state.player;
    const character = getCharacter(state.player.characterId);
    if (invulnerable > 0 && Math.floor(invulnerable * 16) % 2 === 0) return;
    ctx.fillStyle = "#0e1119";
    ctx.fillRect(x - 9, y + 8, 18, 5);
    if (state.player.dashTime > 0) {
      ctx.strokeStyle = "#9fffe0";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 13, y - 15, 26, 30);
    }
    ctx.fillStyle = character.robe;
    ctx.fillRect(x - 9, y - 1, 18, 13);
    ctx.fillRect(x - 12, y + 1, 5, 9);
    ctx.fillRect(x + 7, y + 1, 5, 9);
    ctx.fillStyle = character.trim;
    ctx.fillRect(x - 7, y - 3, 14, 8);
    ctx.fillStyle = "#eed1a1";
    ctx.fillRect(x - 5, y - 12, 10, 10);
    ctx.fillStyle = "#322835";
    ctx.fillRect(x - 7, y - 14, 14, 5);
    ctx.fillRect(x + 3, y - 16, 8, 3);
    ctx.fillStyle = "#352c3a";
    ctx.fillRect(x - 3, y - 7, 2, 2);
    ctx.fillRect(x + 3, y - 7, 2, 2);
    const tipX = x + Math.cos(aim) * 21;
    const tipY = y + Math.sin(aim) * 21;
    ctx.strokeStyle = character.skill.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = "#fff1bd";
    ctx.fillRect(tipX - 2, tipY - 2, 4, 4);
    const markerX = x + Math.cos(aim) * 50;
    const markerY = y + Math.sin(aim) * 50;
    ctx.strokeStyle = "#dff9e7a8";
    ctx.lineWidth = 1;
    ctx.strokeRect(markerX - 4, markerY - 4, 8, 8);
  }

  function drawEnemy(enemy) {
    const { x, y, kind } = enemy;
    const color = kind === "guardian" ? "#b35f79" : kind === "ranged" ? "#6579a8" : "#7e8d70";
    const half = enemy.radius;
    if (kind === "ranged" && enemy.attackClock < 0.55) {
      ctx.save();
      ctx.strokeStyle = "#e49aa488";
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(state.player.x, state.player.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "#0d1118";
    ctx.fillRect(x - half, y + half - 3, half * 2, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x - 9, y - 5, 18, 16);
    ctx.fillRect(x - 12, y - 2, 5, 10);
    ctx.fillRect(x + 7, y - 2, 5, 10);
    ctx.fillStyle = kind === "guardian" ? "#e5b3a2" : kind === "ranged" ? "#c5d0ed" : "#b6c096";
    ctx.fillRect(x - 7, y - 12, 14, 9);
    ctx.fillStyle = "#30303a";
    ctx.fillRect(x - 8, y - 14, 16, 4);
    ctx.fillStyle = kind === "ranged" ? "#9de8ef" : "#e4d987";
    ctx.fillRect(x - 5, y - 8, 3, 2);
    ctx.fillRect(x + 3, y - 8, 3, 2);
    if (kind === "guardian") {
      ctx.fillStyle = "#f0ce71";
      ctx.fillRect(x - 12, y - 18, 4, 6);
      ctx.fillRect(x + 8, y - 18, 4, 6);
    }
    if (enemy.hp < enemy.maxHp) {
      const width = kind === "guardian" ? 36 : 22;
      ctx.fillStyle = "#17191f";
      ctx.fillRect(x - width / 2, y - half - 9, width, 3);
      ctx.fillStyle = kind === "guardian" ? "#e3a962" : "#e28276";
      ctx.fillRect(x - width / 2, y - half - 9, width * Math.max(0, enemy.hp / enemy.maxHp), 3);
    }
  }

  function drawTargetBeam() {
    const target = state.target;
    if (!target || !state.enemies.includes(target)) return;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = getCharacter(state.player.characterId).skill.color;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.moveTo(state.player.x, state.player.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawTargetMarker() {
    const target = state.target;
    if (!target || !state.enemies.includes(target)) return;
    const pulse = 2 + Math.sin(state.time * 8) * 2;
    ctx.save();
    ctx.strokeStyle = getCharacter(state.player.characterId).skill.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.radius + 7 + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeRect(target.x - 4, target.y - 4, 8, 8);
    ctx.restore();
  }

  function drawSkillEffects() {
    for (const effect of state.skillEffects) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, effect.life / effect.maxLife);
      ctx.strokeStyle = effect.color;
      ctx.fillStyle = effect.color;
      ctx.lineCap = "round";
      if (effect.type === "slash") {
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(effect.x2 - 38, effect.y2 + 25);
        ctx.lineTo(effect.x2 + 38, effect.y2 - 25);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (effect.type === "lightning") {
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius * (1 - effect.life / effect.maxLife * 0.35), 0, Math.PI * 2);
        ctx.stroke();
        for (const bolt of effect.bolts) {
          ctx.strokeStyle = effect.color;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(bolt[0].x, bolt[0].y);
          for (let i = 1; i < bolt.length; i += 1) ctx.lineTo(bolt[i].x, bolt[i].y);
          ctx.stroke();
          ctx.strokeStyle = "#f2edff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else {
        const radius = effect.radius * (1 - effect.life / effect.maxLife * 0.35);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i += 1) {
          const angle = i * Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(effect.x + Math.cos(angle) * radius * 0.55, effect.y + Math.sin(angle) * radius * 0.55);
          ctx.lineTo(effect.x + Math.cos(angle) * radius, effect.y + Math.sin(angle) * radius);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawDamageNumbers() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 13px sans-serif";
    for (const number of state.damageNumbers) {
      ctx.globalAlpha = Math.max(0, number.life / number.maxLife);
      ctx.fillStyle = number.color;
      ctx.fillText(number.value, number.x, number.y);
    }
    ctx.restore();
  }

  function drawHUD() {
    const player = state.player;
    const character = getCharacter(player.characterId);
    ctx.fillStyle = "#11141ddd";
    ctx.fillRect(16, 14, 250, 104);
    ctx.strokeStyle = "#84704d";
    ctx.strokeRect(16.5, 14.5, 249, 103);
    ctx.fillStyle = "#e4d19d";
    ctx.font = "13px sans-serif";
    ctx.fillText(`第 ${state.room} 间石室　·　第 ${state.wave} / 3 波`, 28, 33);
    ctx.fillStyle = "#28232b";
    ctx.fillRect(28, 43, 224, 8);
    ctx.fillStyle = "#d96f75";
    ctx.fillRect(28, 43, 224 * player.hp / player.maxHp, 8);
    ctx.fillStyle = "#f3dbb7";
    ctx.font = "10px sans-serif";
    ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp} 气血`, 29, 61);
    ctx.fillStyle = "#a9e3cb";
    ctx.fillText("身法", 28, 79);
    ctx.fillStyle = "#28232b";
    ctx.fillRect(62, 72, 152, 7);
    ctx.fillStyle = player.dashCooldown <= 0 ? "#70d7b4" : "#dcb86d";
    ctx.fillRect(62, 72, 152 * (1 - player.dashCooldown / dashCooldown), 7);
    ctx.fillStyle = "#c8c4b8";
    ctx.textAlign = "right";
    ctx.fillText(player.dashCooldown <= 0 ? "就绪" : `${player.dashCooldown.toFixed(1)} 秒`, 252, 79);
    ctx.textAlign = "left";
    ctx.fillStyle = "#f0d58f";
    ctx.fillText(character.skill.name, 28, 100);
    ctx.fillStyle = "#28232b";
    ctx.fillRect(110, 93, 104, 7);
    ctx.fillStyle = character.skill.color;
    ctx.fillRect(
      110, 93, 104 * (1 - Math.min(1, player.skillCooldown / character.skill.cooldown)), 7
    );
    ctx.fillStyle = "#c8c4b8";
    ctx.textAlign = "right";
    ctx.fillText(player.skillCooldown <= 0 ? "就绪" : `${Math.ceil(player.skillCooldown)} 秒`, 252, 100);
    ctx.textAlign = "left";

    const remaining = state.waveSpawnLeft + state.enemies.length;
    ctx.fillStyle = "#c8c4b8";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`自动锁敌　·　灵气 ${state.xp} / ${state.nextXp}　·　剩余妖物 ${remaining}　·　斩妖 ${state.kills}`, W - 20, 29);
    ctx.textAlign = "left";
    const xpWidth = 350;
    ctx.fillStyle = "#12151ddd";
    ctx.fillRect(W / 2 - xpWidth / 2 - 7, H - 25, xpWidth + 14, 12);
    ctx.fillStyle = "#33313a";
    ctx.fillRect(W / 2 - xpWidth / 2, H - 22, xpWidth, 6);
    ctx.fillStyle = "#76cdb1";
    ctx.fillRect(W / 2 - xpWidth / 2, H - 22, xpWidth * Math.min(1, state.xp / state.nextXp), 6);
  }

  function draw() {
    drawBackground();
    for (const drop of state.drops) {
      const bob = Math.sin(drop.phase) * 2;
      ctx.fillStyle = drop.type === "heal" ? "#ef9290" : "#b4f1d8";
      if (drop.type === "heal") {
        ctx.fillRect(drop.x - 4, drop.y - 2 + bob, 8, 4);
        ctx.fillRect(drop.x - 2, drop.y - 4 + bob, 4, 8);
      } else {
        ctx.fillRect(drop.x - 3, drop.y - 3 + bob, 6, 6);
        ctx.fillStyle = "#f4dfa0";
        ctx.fillRect(drop.x - 1, drop.y - 5 + bob, 2, 2);
      }
    }
    for (const shot of state.shots) {
      ctx.fillStyle = shot.color;
      ctx.fillRect(shot.x - 4, shot.y - 4, 8, 8);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(shot.x - 1, shot.y - 1, 3, 3);
    }
    for (const shot of state.enemyShots) {
      ctx.fillStyle = "#e49aa4";
      ctx.fillRect(shot.x - 4, shot.y - 4, 8, 8);
      ctx.fillStyle = "#ffd1b0";
      ctx.fillRect(shot.x - 1, shot.y - 1, 2, 2);
    }
    drawTargetBeam();
    [...state.enemies].sort((a, b) => a.y - b.y).forEach(drawEnemy);
    drawTargetMarker();
    drawPlayer();
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    drawSkillEffects();
    drawDamageNumbers();
    drawHUD();
    if (state.toastTimer > 0 && state.mode === "playing") {
      ctx.fillStyle = "#12151ddb";
      ctx.fillRect(W / 2 - 130, 77, 260, 30);
      ctx.fillStyle = "#f0d58f";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.toast, W / 2, 97);
      ctx.textAlign = "left";
    }
  }

  function frame(timestamp) {
    const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.05) : 0;
    lastFrame = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "e"].includes(key)) event.preventDefault();
    if (key === "escape") {
      pauseGame();
      return;
    }
    if (key === "e") {
      if (!event.repeat) activateSkill();
      return;
    }
    if (key === "shift" && !keys.has(key)) requestDash();
    keys.add(key);
  });
  window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => {
    keys.clear();
  });

  pauseButton.addEventListener("click", pauseGame);

  document.querySelectorAll("[data-dir]").forEach(button => {
    const key = directions[button.dataset.dir][0];
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      keys.add(key);
      button.setPointerCapture(event.pointerId);
    });
    for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(eventName, () => keys.delete(key));
    }
  });
  skillButton.addEventListener("pointerdown", event => {
    event.preventDefault();
    activateSkill();
  });
  dodgeButton.addEventListener("pointerdown", event => {
    event.preventDefault();
    requestDash();
  });

  pauseButton.disabled = true;
  showTitle();
  requestAnimationFrame(frame);
})();
