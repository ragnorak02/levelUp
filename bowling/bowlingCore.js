/* =========================
   BowlingCore — bowling storage, scoring and shot recording.
   Shared by bowling/index.html and the dashboard's live scorer (main.js),
   so both score a game the same way.

   A shot is stored as { pinsLeft: [pin numbers still standing after the
   ball], standingPosition, targetBoard }. How many pins a ball knocked down
   depends on how many were standing before it — after a first ball that
   leaves 3, a second ball that leaves 0 knocked 3, not 10.
   ========================= */
(function(){
  'use strict';

  const STORAGE_PREFIX = 'bowling:week:';
  const ARCHIVE_PREFIX = 'bowling:archive:';   // one key per archived season
  const ALL_PINS = [1,2,3,4,5,6,7,8,9,10];
  const MAX_GAMES_PER_WEEK = 3;

  function safeParse(key){
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  /* ---------- Weeks ---------- */

  function getISOWeek(date){
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function weekIdToLabel(weekId){
    const match = weekId.match(/^(\d{4})-W(\d{2})$/);
    if(!match) return weekId;
    const year = parseInt(match[1]);
    const week = parseInt(match[2]);
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const monday = new Date(year, 0, 4 - dayOfWeek + 1 + (week - 1) * 7);
    const tuesday = new Date(monday);
    tuesday.setDate(monday.getDate() + 1);
    return 'Tue, ' + tuesday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function offsetWeek(weekId, offset){
    const match = weekId.match(/^(\d{4})-W(\d{2})$/);
    if(!match) return weekId;
    const year = parseInt(match[1]);
    const week = parseInt(match[2]);
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const monday = new Date(year, 0, 4 - dayOfWeek + 1 + (week - 1) * 7);
    monday.setDate(monday.getDate() + offset * 7);
    return getISOWeek(monday);
  }

  /* ---------- Storage ---------- */

  function storageKey(weekId){ return STORAGE_PREFIX + weekId; }
  function loadWeek(weekId){ return safeParse(storageKey(weekId)); }

  function saveWeek(weekData){
    localStorage.setItem(storageKey(weekData.weekId), JSON.stringify(weekData));
  }

  function ensureWeek(weekId){
    let week = loadWeek(weekId);
    if(!week){
      week = {
        weekId,
        weekLabel: weekIdToLabel(weekId),
        games: [],
        created: new Date().toISOString(),
      };
      saveWeek(week);
    }
    return week;
  }

  function createEmptyGame(gameNumber){
    const frames = [];
    for(let i = 1; i <= 10; i++){
      frames.push({ frameNumber: i, shots: [] });
    }
    return {
      id: 'game_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      gameNumber,
      frames,
      score: null,
      completedDate: null,
    };
  }

  /* ---------- Scoring ---------- */

  const leftCount = shot => (shot && shot.pinsLeft ? shot.pinsLeft.length : 0);

  /* Pins standing when ball `shotIdx` of a frame was thrown. The 10th frame
     re-racks after a strike or a spare. */
  function standingBefore(frame, shotIdx, frameIdx){
    if(shotIdx === 0) return 10;
    const prevLeft = leftCount(frame.shots[shotIdx - 1]);
    if(frameIdx === 9 && prevLeft === 0) return 10;
    return prevLeft;
  }

  function pinsKnocked(frame, shotIdx, frameIdx){
    return standingBefore(frame, shotIdx, frameIdx) - leftCount(frame.shots[shotIdx]);
  }

  function isFrameComplete(frame, frameIndex){
    const n = frame.shots.length;
    if(frameIndex < 9){
      if(n === 0) return false;
      if(leftCount(frame.shots[0]) === 0) return true;   // strike
      return n >= 2;
    }
    if(n < 2) return false;
    // a strike or spare in the 10th earns a third ball
    const earnedBonus = leftCount(frame.shots[0]) === 0 || leftCount(frame.shots[1]) === 0;
    return earnedBonus ? n >= 3 : true;
  }

  /* Running total after each frame; null where it can't be scored yet. */
  function calculateGameScore(frames){
    const scores = new Array(10).fill(null);
    const balls = [];          // pins knocked by every ball, in order
    frames.forEach((f, fi) => f.shots.forEach((s, si) => balls.push(pinsKnocked(f, si, fi))));

    let at = 0, total = 0;
    for(let f = 0; f < 10; f++){
      const frame = frames[f];
      if(!frame.shots.length) break;

      if(f === 9){
        if(!isFrameComplete(frame, 9)) break;
        total += balls.slice(at, at + frame.shots.length).reduce((a, b) => a + b, 0);
        scores[f] = total;
        break;
      }

      const b1 = balls[at];
      if(b1 === 10){
        if(balls[at + 1] === undefined || balls[at + 2] === undefined) break;
        total += 10 + balls[at + 1] + balls[at + 2];
        at += 1;
      }else{
        const b2 = balls[at + 1];
        if(b2 === undefined) break;
        if(b1 + b2 === 10){
          if(balls[at + 2] === undefined) break;
          total += 10 + balls[at + 2];
        }else{
          total += b1 + b2;
        }
        at += 2;
      }
      scores[f] = total;
    }
    return scores;
  }

  function isGameComplete(game){
    return isFrameComplete(game.frames[9], 9);
  }

  /* Finished = scored by frames, or entered with a score (league import). */
  function isGameDone(game){
    return game.score != null || isGameComplete(game);
  }

  function getFinalScore(game){
    return calculateGameScore(game.frames)[9];
  }

  function getRunningScore(game){
    const scores = calculateGameScore(game.frames);
    for(let f = 9; f >= 0; f--){
      if(scores[f] != null) return scores[f];
    }
    return 0;
  }

  /* Score-sheet mark for one ball: X, /, -, or the pin count. */
  function shotDisplay(frame, shotIdx, frameIdx){
    if(!frame.shots[shotIdx]) return '';
    const before = standingBefore(frame, shotIdx, frameIdx);
    const knocked = pinsKnocked(frame, shotIdx, frameIdx);
    if(before === 10 && knocked === 10) return 'X';
    if(before < 10 && leftCount(frame.shots[shotIdx]) === 0) return '/';
    if(knocked === 0) return '-';
    return String(knocked);
  }

  function getAllPins(){ return [...ALL_PINS]; }

  /* Pins that can be hit by the next ball of this frame. */
  function getAvailablePins(frame, frameIndex){
    if(isFrameComplete(frame, frameIndex)) return [];
    const last = frame.shots[frame.shots.length - 1];
    if(!last) return getAllPins();
    const left = last.pinsLeft || [];
    if(frameIndex === 9 && left.length === 0) return getAllPins();
    return [...left];
  }

  /* Where play resumes: the first unfinished frame, or null when done. */
  function currentPosition(game){
    for(let f = 0; f < 10; f++){
      if(!isFrameComplete(game.frames[f], f)) return { frame: f, ball: game.frames[f].shots.length };
    }
    return null;
  }

  /* Record the next ball of a game and save the week. `pinsLeft` = pins
     still standing after it. Completes the game (score + date) on the last
     ball. Returns the game. */
  function recordShot(week, gameIndex, pinsLeft, extra){
    const game = week.games[gameIndex];
    const pos = game && currentPosition(game);
    if(!pos) return game;

    game.frames[pos.frame].shots.push(Object.assign({
      standingPosition: null,
      targetBoard: null
    }, extra, {
      pinsLeft: [...pinsLeft].sort((a, b) => a - b)
    }));

    if(isGameComplete(game)){
      game.score = getFinalScore(game);
      game.completedDate = new Date().toISOString().slice(0, 10);
    }
    saveWeek(week);
    return game;
  }

  /* Replace one frame's balls (re-entering a frame after the fact) and
     re-score the game. Returns the game. */
  function setFrameShots(week, gameIndex, frameIndex, shots){
    const game = week.games[gameIndex];
    if(!game || !game.frames[frameIndex]) return game;
    game.frames[frameIndex].shots = shots.map(s => Object.assign({}, s, { pinsLeft: [...(s.pinsLeft || [])] }));
    if(isGameComplete(game)){
      game.score = getFinalScore(game);
      game.completedDate = game.completedDate || new Date().toISOString().slice(0, 10);
    }else if(!game.imported){
      game.score = null;
      game.completedDate = null;
    }
    saveWeek(week);
    return game;
  }

  /* Take back the last ball recorded in a game. */
  function undoShot(week, gameIndex){
    const game = week.games[gameIndex];
    if(!game) return game;
    for(let f = 9; f >= 0; f--){
      if(game.frames[f].shots.length){
        game.frames[f].shots.pop();
        if(!game.imported){ game.score = null; game.completedDate = null; }
        saveWeek(week);
        break;
      }
    }
    return game;
  }

  /* Add the next game of the week (up to three). Returns its index, or -1. */
  function startGame(week){
    if(week.games.length >= MAX_GAMES_PER_WEEK) return -1;
    week.games.push(createEmptyGame(week.games.length + 1));
    saveWeek(week);
    return week.games.length - 1;
  }

  /* ---------- All weeks ---------- */

  function listAllWeekKeys(){
    const keys = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    return keys;
  }

  function getAllCompletedGames(){
    const games = [];
    listAllWeekKeys().forEach(k => {
      const week = safeParse(k);
      if(!week || !Array.isArray(week.games)) return;
      week.games.forEach(g => {
        if(g.score != null) games.push({ ...g, weekId: week.weekId });
      });
    });
    return games;
  }

  /* ---------- Seasons ----------
     Starting a new season moves every week into one archive record instead
     of deleting it, so an old season can always be brought back. */

  function archiveSeason(){
    const keys = listAllWeekKeys();
    if(!keys.length) return 0;
    const weeks = keys.map(k => safeParse(k)).filter(Boolean)
      .sort((a, b) => (a.weekId < b.weekId ? -1 : 1));
    const archivedAt = new Date().toISOString();
    localStorage.setItem(ARCHIVE_PREFIX + archivedAt, JSON.stringify({ archivedAt, weeks }));
    keys.forEach(k => localStorage.removeItem(k));
    return weeks.length;
  }

  /* Weeks from every archived season, oldest season first. */
  function listArchivedWeeks(){
    const keys = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(ARCHIVE_PREFIX)) keys.push(k);
    }
    return keys.sort().flatMap(k => (safeParse(k) || {}).weeks || []);
  }

  window.BowlingCore = {
    STORAGE_PREFIX, ARCHIVE_PREFIX, MAX_GAMES_PER_WEEK,
    getISOWeek, weekIdToLabel, offsetWeek,
    storageKey, loadWeek, saveWeek, ensureWeek, createEmptyGame,
    standingBefore, pinsKnocked, isFrameComplete, calculateGameScore,
    isGameComplete, isGameDone, getFinalScore, getRunningScore, shotDisplay,
    getAllPins, getAvailablePins, currentPosition,
    recordShot, undoShot, startGame, setFrameShots,
    listAllWeekKeys, getAllCompletedGames,
    archiveSeason, listArchivedWeeks
  };
})();
