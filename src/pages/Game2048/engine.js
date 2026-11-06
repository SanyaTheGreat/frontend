// Клиентский движок 2048 — ТОЧНЫЙ порт серверной логики из
// lottery-server/src/routes/game2048.js (/run/move).
//
// Цель: предсказывать спавн новой плитки и событие «Дурова» локально по
// детерминированному RNG (seed + rng_index), чтобы рисовать ход мгновенно,
// не дожидаясь сети. Сервер остаётся источником истины (анти-чит/лидерборд),
// но при совпадении логики его ответ просто подтверждает наше предсказание.
//
// ⚠️ Любое расхождение с сервером ломает синхронизацию — поэтому порядок
// потребления RNG и все константы обязаны совпадать 1:1 с сервером.

export const GRID_SIZE = 4;
const DUROV_CHANCE = 0.08;
const DUROV_COOLDOWN_MOVES = 5;
const MASK64 = (1n << 64n) - 1n;

function splitmix64(x) {
  let z = (x + 0x9e3779b97f4a7c15n) & MASK64;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return (z ^ (z >> 31n)) & MASK64;
}

function rand01From64(u64) {
  const v = Number((u64 >> 11n) & ((1n << 53n) - 1n));
  return v / 9007199254740992;
}

export function makeRng(seedStr, startIndex = 0) {
  const seed = BigInt(seedStr || "0");
  let idx = BigInt(startIndex || 0);
  return {
    next01() {
      const u = splitmix64((seed + idx) & MASK64);
      idx += 1n;
      return rand01From64(u);
    },
    getIndex() {
      return Number(idx);
    },
  };
}

function cloneGrid(g) {
  return g.map((row) => row.slice());
}

function gridsEqual(a, b) {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

function getEmptyCells(grid) {
  const cells = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!grid[r][c]) cells.push([r, c]);
    }
  }
  return cells;
}

// Мутирует grid, возвращает {r,c,v} или null
export function spawnTile(grid, rng) {
  const empties = getEmptyCells(grid);
  if (empties.length === 0) return null;
  const pick = Math.floor(rng.next01() * empties.length);
  const [r, c] = empties[pick];
  const v = rng.next01() < 0.9 ? 2 : 4;
  grid[r][c] = v;
  return { r, c, v };
}

function slideAndMergeLine(line) {
  const filtered = line.filter((x) => x !== 0);
  const out = [];
  let score = 0;
  for (let i = 0; i < filtered.length; i++) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const merged = filtered[i] * 2;
      out.push(merged);
      score += merged;
      i += 1;
    } else {
      out.push(filtered[i]);
    }
  }
  while (out.length < GRID_SIZE) out.push(0);
  return { line: out, score };
}

export function applyMove(grid, dir) {
  const g = cloneGrid(grid);
  let gained = 0;

  const readLine = (i) => {
    if (dir === "left") return [g[i][0], g[i][1], g[i][2], g[i][3]];
    if (dir === "right") return [g[i][3], g[i][2], g[i][1], g[i][0]];
    if (dir === "up") return [g[0][i], g[1][i], g[2][i], g[3][i]];
    if (dir === "down") return [g[3][i], g[2][i], g[1][i], g[0][i]];
    return null;
  };

  const writeLine = (i, line) => {
    if (dir === "left") { g[i][0]=line[0]; g[i][1]=line[1]; g[i][2]=line[2]; g[i][3]=line[3]; return; }
    if (dir === "right") { g[i][3]=line[0]; g[i][2]=line[1]; g[i][1]=line[2]; g[i][0]=line[3]; return; }
    if (dir === "up") { g[0][i]=line[0]; g[1][i]=line[1]; g[2][i]=line[2]; g[3][i]=line[3]; return; }
    if (dir === "down") { g[3][i]=line[0]; g[2][i]=line[1]; g[1][i]=line[2]; g[0][i]=line[3]; return; }
  };

  for (let i = 0; i < GRID_SIZE; i++) {
    const { line: merged, score } = slideAndMergeLine(readLine(i));
    gained += score;
    writeLine(i, merged);
  }

  return { grid: g, gained, moved: !gridsEqual(grid, g) };
}

export function canMove(grid) {
  if (getEmptyCells(grid).length > 0) return true;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const v = grid[r][c];
      if (r + 1 < GRID_SIZE && grid[r + 1][c] === v) return true;
      if (c + 1 < GRID_SIZE && grid[r][c + 1] === v) return true;
    }
  }
  return false;
}

function pickNonEmptyCells(grid) {
  const cells = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] !== 0) cells.push([r, c]);
    }
  }
  return cells;
}

// Мутирует grid, возвращает событие свопа или null
export function durovSwap(grid, rng) {
  const filled = pickNonEmptyCells(grid);
  if (filled.length < 2) return null;

  const i1 = Math.floor(rng.next01() * filled.length);
  let i2 = Math.floor(rng.next01() * (filled.length - 1));
  if (i2 >= i1) i2 += 1;

  const [r1, c1] = filled[i1];
  const [r2, c2] = filled[i2];
  const a = grid[r1][c1];
  const b = grid[r2][c2];
  grid[r1][c1] = b;
  grid[r2][c2] = a;

  return { type: "durov_swap", from: { r: r1, c: c1, v: a }, to: { r: r2, c: c2, v: b } };
}

/**
 * Полный ход — реплика серверного /run/move.
 * @param {{grid:number[][], seed:string|number, rngIndex:number, cooldown:number, score:number, moves:number}} st
 * @param {"up"|"down"|"left"|"right"} dir
 * @returns предсказание: { moved, gained, spawn, durov_event, grid, rngIndex, cooldown, score, moves, finished }
 */
export function stepMove(st, dir) {
  const before = st.grid;
  const { grid: movedGrid, gained, moved } = applyMove(before, dir);

  if (!moved) {
    return { moved: false, gained: 0, spawn: null, durov_event: null, grid: before, rngIndex: st.rngIndex, cooldown: st.cooldown, score: st.score, moves: st.moves, finished: false };
  }

  const rng = makeRng(st.seed, st.rngIndex);
  const spawn = spawnTile(movedGrid, rng);

  let durov_event = null;
  let cooldown = Number(st.cooldown ?? 0);
  if (!Number.isFinite(cooldown) || cooldown < 0) cooldown = 0;
  cooldown = Math.max(0, cooldown - 1);

  if (cooldown === 0) {
    if (rng.next01() < DUROV_CHANCE) {
      durov_event = durovSwap(movedGrid, rng);
      if (durov_event) cooldown = DUROV_COOLDOWN_MOVES;
    }
  }

  const nextRngIndex = rng.getIndex();
  const finished = !canMove(movedGrid);

  return {
    moved: true,
    gained,
    spawn,
    durov_event,
    grid: movedGrid,
    rngIndex: nextRngIndex,
    cooldown,
    score: Number(st.score ?? 0) + gained,
    moves: Number(st.moves ?? 0) + 1,
    finished,
  };
}
