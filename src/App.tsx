/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Trophy, RotateCcw, Languages, Info, Pause, Play } from 'lucide-react';
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  TURRET_AMMO, 
  ROCKET_SPEED_MIN, 
  ROCKET_SPEED_MAX, 
  MISSILE_SPEED, 
  EXPLOSION_RADIUS_MAX, 
  EXPLOSION_DURATION, 
  POINTS_PER_ROCKET, 
  WIN_SCORE, 
  COLORS 
} from './constants';
import { 
  Point, 
  Rocket, 
  Missile, 
  Explosion, 
  City, 
  Turret, 
  GameStatus 
} from './types';

const TRANSLATIONS = {
  zh: {
    title: '新星防御',
    start: '开始游戏',
    win: '恭喜！你成功保卫了城市！',
    loss: '防线崩溃，城市陷落...',
    replay: '再玩一次',
    score: '得分',
    target: '目标',
    ammo: '弹药',
    howToPlay: '点击屏幕发射拦截导弹，预判火箭轨迹，在空中摧毁它们。',
    winCondition: '达到 1000 分获胜。',
    rules: '游戏规则',
    backToStart: '返回开始界面',
    pause: '暂停',
    resume: '继续游戏',
    paused: '游戏已暂停',
  },
  en: {
    title: 'Nova Defense',
    start: 'Start Game',
    win: 'Victory! You defended the cities!',
    loss: 'Defenses breached, cities fallen...',
    replay: 'Play Again',
    score: 'Score',
    target: 'Target',
    ammo: 'Ammo',
    howToPlay: 'Click to fire interceptors. Predict rocket paths to destroy them in mid-air.',
    winCondition: 'Reach 1000 points to win.',
    rules: 'Game Rules',
    backToStart: 'Back to Start',
    pause: 'Pause',
    resume: 'Resume',
    paused: 'Game Paused',
  }
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameStatus>('START');
  const [score, setScore] = useState(0);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [showInfo, setShowInfo] = useState(false);

  // Game entities refs to avoid re-renders on every frame
  const rocketsRef = useRef<Rocket[]>([]);
  const missilesRef = useRef<Missile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const citiesRef = useRef<City[]>([]);
  const turretsRef = useRef<Turret[]>([]);
  const frameIdRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);

  const t = TRANSLATIONS[lang];

  const initGame = useCallback(() => {
    setScore(0);
    setGameState('PLAYING');
    
    // Initialize cities
    const cities: City[] = [];
    const citySpacing = GAME_WIDTH / 8;
    for (let i = 0; i < 6; i++) {
      // Avoid turret positions
      let x = (i + 1) * citySpacing;
      if (i >= 2) x += citySpacing; // Skip middle turret
      if (i >= 4) x += citySpacing; // Skip right turret
      
      cities.push({
        id: `city-${i}`,
        x,
        y: GAME_HEIGHT - 20,
        active: true
      });
    }
    citiesRef.current = cities;

    // Initialize turrets
    turretsRef.current = [
      { id: 'turret-left', x: 40, y: GAME_HEIGHT - 30, active: true, ammo: TURRET_AMMO.LEFT, maxAmmo: TURRET_AMMO.LEFT },
      { id: 'turret-middle', x: GAME_WIDTH / 2, y: GAME_HEIGHT - 30, active: true, ammo: TURRET_AMMO.MIDDLE, maxAmmo: TURRET_AMMO.MIDDLE },
      { id: 'turret-right', x: GAME_WIDTH - 40, y: GAME_HEIGHT - 30, active: true, ammo: TURRET_AMMO.RIGHT, maxAmmo: TURRET_AMMO.RIGHT },
    ];

    rocketsRef.current = [];
    missilesRef.current = [];
    explosionsRef.current = [];
    lastSpawnTimeRef.current = performance.now();
  }, []);

  const spawnRocket = useCallback(() => {
    const startX = Math.random() * GAME_WIDTH;
    const startY = -20;
    
    // Target either a city or a turret
    const targets = [...citiesRef.current.filter(c => c.active), ...turretsRef.current.filter(t => t.active)];
    if (targets.length === 0) return;
    
    const target = targets[Math.floor(Math.random() * targets.length)];
    const speed = ROCKET_SPEED_MIN + Math.random() * (ROCKET_SPEED_MAX - ROCKET_SPEED_MIN);
    const angle = Math.atan2(target.y - startY, target.x - startX);

    rocketsRef.current.push({
      id: `rocket-${Date.now()}-${Math.random()}`,
      x: startX,
      y: startY,
      targetX: target.x,
      targetY: target.y,
      speed,
      angle
    });
  }, []);

  const fireMissile = (targetX: number, targetY: number) => {
    if (gameState !== 'PLAYING') return;

    // Find the closest active turret with ammo
    let bestTurret: Turret | null = null;
    let minDist = Infinity;

    turretsRef.current.forEach(turret => {
      if (turret.active && turret.ammo > 0) {
        const dist = Math.abs(turret.x - targetX);
        if (dist < minDist) {
          minDist = dist;
          bestTurret = turret;
        }
      }
    });

    if (bestTurret) {
      const turret = bestTurret as Turret;
      turret.ammo -= 1;
      
      const dist = Math.sqrt(Math.pow(targetX - turret.x, 2) + Math.pow(targetY - turret.y, 2));
      
      missilesRef.current.push({
        id: `missile-${Date.now()}-${Math.random()}`,
        startX: turret.x,
        startY: turret.y,
        x: turret.x,
        y: turret.y,
        targetX,
        targetY,
        progress: 0,
        distance: dist
      });
    }
  };

  const update = useCallback((time: number) => {
    if (gameState !== 'PLAYING') return;

    // Spawn rockets
    const spawnRate = Math.max(500, 2000 - (score / 100) * 100);
    if (time - lastSpawnTimeRef.current > spawnRate) {
      spawnRocket();
      lastSpawnTimeRef.current = time;
    }

    // Update rockets
    rocketsRef.current = rocketsRef.current.filter(rocket => {
      rocket.x += Math.cos(rocket.angle) * rocket.speed;
      rocket.y += Math.sin(rocket.angle) * rocket.speed;

      // Check if hit target
      const distToTarget = Math.sqrt(Math.pow(rocket.x - rocket.targetX, 2) + Math.pow(rocket.y - rocket.targetY, 2));
      if (distToTarget < 5) {
        // Impact!
        citiesRef.current.forEach(city => {
          if (city.active && Math.abs(city.x - rocket.x) < 10 && Math.abs(city.y - rocket.y) < 10) {
            city.active = false;
          }
        });
        turretsRef.current.forEach(turret => {
          if (turret.active && Math.abs(turret.x - rocket.x) < 15 && Math.abs(turret.y - rocket.y) < 15) {
            turret.active = false;
          }
        });
        
        // Create impact explosion
        explosionsRef.current.push({
          id: `exp-impact-${Date.now()}`,
          x: rocket.x,
          y: rocket.y,
          radius: 0,
          maxRadius: 20,
          life: 0,
          maxLife: 30
        });
        return false;
      }
      return rocket.y < GAME_HEIGHT;
    });

    // Update missiles
    missilesRef.current = missilesRef.current.filter(missile => {
      missile.progress += MISSILE_SPEED / missile.distance;
      missile.x = missile.startX + (missile.targetX - missile.startX) * missile.progress;
      missile.y = missile.startY + (missile.targetY - missile.startY) * missile.progress;

      if (missile.progress >= 1) {
        // Explode!
        explosionsRef.current.push({
          id: `exp-${Date.now()}`,
          x: missile.targetX,
          y: missile.targetY,
          radius: 0,
          maxRadius: EXPLOSION_RADIUS_MAX,
          life: 0,
          maxLife: EXPLOSION_DURATION
        });
        return false;
      }
      return true;
    });

    // Update explosions
    explosionsRef.current = explosionsRef.current.filter(exp => {
      exp.life += 1;
      const halfLife = exp.maxLife / 2;
      if (exp.life <= halfLife) {
        exp.radius = (exp.life / halfLife) * exp.maxRadius;
      } else {
        exp.radius = (1 - (exp.life - halfLife) / halfLife) * exp.maxRadius;
      }

      // Check collision with rockets
      rocketsRef.current = rocketsRef.current.filter(rocket => {
        const dist = Math.sqrt(Math.pow(rocket.x - exp.x, 2) + Math.pow(rocket.y - exp.y, 2));
        if (dist < exp.radius) {
          setScore(prev => prev + POINTS_PER_ROCKET);
          return false;
        }
        return true;
      });

      return exp.life < exp.maxLife;
    });

    // Check Win/Loss
    const activeTurrets = turretsRef.current.filter(t => t.active);
    if (activeTurrets.length === 0) {
      setGameState('LOST');
    }

    if (score >= WIN_SCORE) {
      setGameState('WON');
    }

    draw();
    frameIdRef.current = requestAnimationFrame(update);
  }, [gameState, score, spawnRocket]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw Grid
    ctx.strokeStyle = 'rgba(236, 232, 225, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < GAME_WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GAME_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < GAME_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(GAME_WIDTH, y);
      ctx.stroke();
    }

    // Draw Cities (Tactical Bunkers)
    citiesRef.current.forEach(city => {
      if (city.active) {
        ctx.fillStyle = COLORS.CITY;
        ctx.beginPath();
        ctx.moveTo(city.x - 20, city.y + 10);
        ctx.lineTo(city.x - 15, city.y - 10);
        ctx.lineTo(city.x + 15, city.y - 10);
        ctx.lineTo(city.x + 20, city.y + 10);
        ctx.closePath();
        ctx.fill();
        
        // Detail lines
        ctx.strokeStyle = COLORS.BACKGROUND;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(city.x - 10, city.y - 5);
        ctx.lineTo(city.x + 10, city.y - 5);
        ctx.stroke();
      } else {
        // Ruined city
        ctx.fillStyle = '#333';
        ctx.fillRect(city.x - 10, city.y, 20, 10);
      }
    });

    // Draw Turrets (KAY/O Units)
    turretsRef.current.forEach(turret => {
      if (turret.active) {
        ctx.save();
        ctx.translate(turret.x, turret.y);
        
        // KAY/O Head/Shoulders base
        ctx.fillStyle = '#334155'; // Dark metallic blue/grey
        ctx.beginPath();
        ctx.moveTo(-25, 10);
        ctx.lineTo(-20, -10);
        ctx.lineTo(-10, -25);
        ctx.lineTo(10, -25);
        ctx.lineTo(20, -10);
        ctx.lineTo(25, 10);
        ctx.closePath();
        ctx.fill();

        // Visor/Eye (KAY/O's signature blue screen)
        ctx.fillStyle = COLORS.TARGET;
        ctx.shadowBlur = 10;
        ctx.shadowColor = COLORS.TARGET;
        ctx.fillRect(-12, -18, 24, 8);
        
        // Detail lines
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.strokeRect(-12, -18, 24, 8);
        
        // Antenna/Shoulder bits
        ctx.fillStyle = '#475569';
        ctx.fillRect(-22, -5, 5, 15);
        ctx.fillRect(17, -5, 5, 15);

        ctx.restore();
      }
    });

    // Draw Rockets (Enemy Projectiles)
    rocketsRef.current.forEach(rocket => {
      ctx.strokeStyle = COLORS.ROCKET;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rocket.x - Math.cos(rocket.angle) * 15, rocket.y - Math.sin(rocket.angle) * 15);
      ctx.lineTo(rocket.x, rocket.y);
      ctx.stroke();
      
      ctx.fillStyle = COLORS.ROCKET;
      ctx.beginPath();
      ctx.moveTo(rocket.x, rocket.y);
      ctx.lineTo(rocket.x - Math.cos(rocket.angle + 0.5) * 8, rocket.y - Math.sin(rocket.angle + 0.5) * 8);
      ctx.lineTo(rocket.x - Math.cos(rocket.angle - 0.5) * 8, rocket.y - Math.sin(rocket.angle - 0.5) * 8);
      ctx.closePath();
      ctx.fill();
    });

    // Draw Missiles (KAY/O Daggers)
    missilesRef.current.forEach(missile => {
      ctx.strokeStyle = 'rgba(236, 232, 225, 0.2)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(missile.startX, missile.startY);
      ctx.lineTo(missile.x, missile.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dagger Shape
      ctx.save();
      ctx.translate(missile.x, missile.y);
      const angle = Math.atan2(missile.targetY - missile.startY, missile.targetX - missile.startX);
      ctx.rotate(angle + Math.PI / 2); // Rotate to face direction

      // Blade
      ctx.fillStyle = COLORS.MISSILE;
      ctx.beginPath();
      ctx.moveTo(0, -15); // Tip
      ctx.lineTo(4, 0);
      ctx.lineTo(2, 5);
      ctx.lineTo(-2, 5);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();

      // Hilt
      ctx.fillStyle = '#334155';
      ctx.fillRect(-6, 5, 12, 2); // Guard
      ctx.fillRect(-2, 7, 4, 6);  // Handle
      
      // Core Glow
      ctx.fillStyle = COLORS.TARGET;
      ctx.fillRect(-1, -8, 2, 6);

      ctx.restore();

      // Target marker
      ctx.strokeStyle = COLORS.TARGET;
      ctx.lineWidth = 2;
      const tSize = 6;
      ctx.beginPath();
      ctx.moveTo(missile.targetX - tSize, missile.targetY - tSize);
      ctx.lineTo(missile.targetX + tSize, missile.targetY + tSize);
      ctx.moveTo(missile.targetX + tSize, missile.targetY - tSize);
      ctx.lineTo(missile.targetX - tSize, missile.targetY + tSize);
      ctx.stroke();
    });

    // Draw Explosions (KAY/O Suppression Pulse)
    explosionsRef.current.forEach(exp => {
      const pulseColor = '#9333ea'; // Purple
      const innerColor = '#f0abfc'; // Light purple/white
      
      const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
      gradient.addColorStop(0, innerColor);
      gradient.addColorStop(0.4, pulseColor);
      gradient.addColorStop(0.8, 'rgba(147, 51, 234, 0.2)');
      gradient.addColorStop(1, 'transparent');
      
      ctx.fillStyle = gradient;
      
      // Draw circular pulse with some "glitch" lines
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();

      // Outer ring
      ctx.strokeStyle = pulseColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Tactical scan lines inside explosion
      if (exp.life % 4 < 2) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        for (let i = -exp.radius; i < exp.radius; i += 8) {
          const y = exp.y + i;
          const width = Math.sqrt(Math.pow(exp.radius, 2) - Math.pow(i, 2));
          ctx.beginPath();
          ctx.moveTo(exp.x - width, y);
          ctx.lineTo(exp.x + width, y);
          ctx.stroke();
        }
      }
    });
  };

  useEffect(() => {
    if (gameState === 'PLAYING') {
      frameIdRef.current = requestAnimationFrame(update);
    }
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [gameState, update]);

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    fireMissile(x, y);
  };

  return (
    <div className="min-h-screen bg-val-dark text-val-white flex flex-col items-center justify-center p-4 font-sans selection:bg-val-red/30 overflow-hidden relative">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full" style={{ backgroundImage: 'linear-gradient(45deg, #ECE8E1 25%, transparent 25%, transparent 75%, #ECE8E1 75%, #ECE8E1), linear-gradient(45deg, #ECE8E1 25%, transparent 25%, transparent 75%, #ECE8E1 75%, #ECE8E1)', backgroundSize: '60px 60px', backgroundPosition: '0 0, 30px 30px' }} />
      </div>

      {/* Header */}
      <div className="w-full max-w-[800px] flex justify-between items-center mb-6 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-val-red flex items-center justify-center shadow-[4px_4px_0px_rgba(236,232,225,0.2)] rotate-3">
            <Shield className="w-7 h-7 text-val-dark -rotate-3" />
          </div>
          <div>
            <h1 className="text-3xl font-display italic tracking-tighter uppercase leading-none">{t.title}</h1>
            <div className="h-1 w-full bg-val-red mt-1" />
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end bg-val-white/5 px-4 py-1 border-r-4 border-val-red">
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">{t.score}</span>
            <span className="text-3xl font-mono font-bold text-val-white leading-none">{score.toString().padStart(5, '0')}</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
              className="p-2 hover:bg-val-red hover:text-val-dark transition-all border border-val-white/20"
            >
              <Languages className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowInfo(!showInfo)}
              className="p-2 hover:bg-val-red hover:text-val-dark transition-all border border-val-white/20"
            >
              <Info className="w-5 h-5" />
            </button>
            {gameState === 'PLAYING' && (
              <button 
                onClick={() => setGameState('PAUSED')}
                className="p-2 bg-val-red text-val-dark hover:bg-val-white transition-all"
              >
                <Pause className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="relative w-full max-w-[800px] aspect-[4/3] bg-black overflow-hidden border-2 border-val-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] scanline">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          onClick={handleCanvasClick}
          onTouchStart={handleCanvasClick}
          className="w-full h-full cursor-crosshair touch-none"
        />

        {/* HUD Overlay */}
        {gameState === 'PLAYING' && (
          <div className="absolute bottom-6 left-0 right-0 px-12 flex justify-between pointer-events-none">
            {turretsRef.current.map((turret, idx) => (
              <div key={turret.id} className="flex flex-col items-center">
                <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black mb-2">
                  {idx === 0 ? (lang === 'zh' ? 'A-SITE' : 'A-SITE') : idx === 1 ? (lang === 'zh' ? 'B-SITE' : 'B-SITE') : (lang === 'zh' ? 'C-SITE' : 'C-SITE')}
                </div>
                <div className="relative">
                  <div className={`text-2xl font-mono font-black italic ${turret.ammo === 0 ? 'text-val-red' : 'text-val-white'}`}>
                    {turret.ammo.toString().padStart(2, '0')}
                  </div>
                  {/* Ammo pips */}
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-1.5 h-3 skew-x-[-20deg] ${i < (turret.ammo / turret.maxAmmo) * 10 ? 'bg-val-red' : 'bg-zinc-800'}`} 
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Menus */}
        <AnimatePresence>
          {gameState !== 'PLAYING' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-val-dark/90 backdrop-blur-md flex items-center justify-center p-8 text-center z-40"
            >
              <div className="max-w-md w-full">
                {gameState === 'START' && (
                  <motion.div
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex flex-col items-center"
                  >
                    <div className="mb-2 text-val-red font-black tracking-[0.5em] text-xs uppercase">Tactical Defense System</div>
                    <h2 className="text-7xl font-display italic tracking-tighter uppercase mb-8 leading-none border-b-8 border-val-red pb-2">{t.title}</h2>
                    <p className="text-zinc-400 mb-12 leading-relaxed font-medium uppercase tracking-wider text-sm">{t.howToPlay}</p>
                    
                    <div className="flex flex-col gap-4 w-full px-12">
                      <button 
                        onClick={initGame}
                        className="val-button bg-val-red text-val-dark py-6 px-12 font-black text-2xl uppercase tracking-tighter italic flex items-center justify-center gap-3"
                      >
                        <Target className="w-6 h-6" />
                        {t.start}
                      </button>

                      <button 
                        onClick={() => setShowInfo(true)}
                        className="val-button bg-val-white text-val-dark py-4 px-12 font-black text-lg uppercase tracking-tighter italic flex items-center justify-center gap-3"
                      >
                        <Info className="w-5 h-5" />
                        {t.rules}
                      </button>
                    </div>
                  </motion.div>
                )}

                {gameState === 'PAUSED' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center"
                  >
                    <h2 className="text-6xl font-display italic tracking-tighter uppercase mb-12 text-val-cyan">{t.paused}</h2>
                    <div className="flex flex-col gap-4 w-full px-12">
                      <button 
                        onClick={() => setGameState('PLAYING')}
                        className="val-button bg-val-red text-val-dark py-6 px-12 font-black text-2xl uppercase tracking-tighter italic flex items-center justify-center gap-3"
                      >
                        <Play className="w-6 h-6" />
                        {t.resume}
                      </button>

                      <button 
                        onClick={() => setGameState('START')}
                        className="val-button bg-val-white text-val-dark py-4 px-12 font-black text-lg uppercase tracking-tighter italic flex items-center justify-center gap-3"
                      >
                        {t.backToStart}
                      </button>
                    </div>
                  </motion.div>
                )}

                {gameState === 'WON' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-24 h-24 bg-val-cyan flex items-center justify-center mb-8 shadow-[8px_8px_0px_rgba(0,245,255,0.2)] rotate-6">
                      <Trophy className="w-12 h-12 text-val-dark -rotate-6" />
                    </div>
                    <h2 className="text-5xl font-display italic tracking-tighter uppercase mb-4 text-val-cyan">{t.win}</h2>
                    <div className="text-7xl font-mono font-black text-val-white mb-12 italic tracking-tighter">{score}</div>
                    
                    <div className="flex flex-col gap-4 w-full px-12">
                      <button 
                        onClick={initGame}
                        className="val-button bg-val-red text-val-dark py-6 px-12 font-black text-2xl uppercase tracking-tighter italic flex items-center justify-center gap-3"
                      >
                        <RotateCcw className="w-6 h-6" />
                        {t.replay}
                      </button>

                      <button 
                        onClick={() => setGameState('START')}
                        className="val-button bg-val-white text-val-dark py-4 px-12 font-black text-lg uppercase tracking-tighter italic flex items-center justify-center gap-3"
                      >
                        {t.backToStart}
                      </button>
                    </div>
                  </motion.div>
                )}

                {gameState === 'LOST' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center"
                  >
                    <h2 className="text-5xl font-display italic tracking-tighter uppercase mb-8 text-val-red leading-none">{t.loss}</h2>
                    <div className="text-zinc-500 font-black uppercase tracking-[0.3em] mb-2">{t.score}</div>
                    <div className="text-7xl font-mono font-black text-val-white mb-12 italic tracking-tighter">{score}</div>
                    
                    <div className="flex flex-col gap-4 w-full px-12">
                      <button 
                        onClick={initGame}
                        className="val-button bg-val-red text-val-dark py-6 px-12 font-black text-2xl uppercase tracking-tighter italic flex items-center justify-center gap-3"
                      >
                        <RotateCcw className="w-6 h-6" />
                        {t.replay}
                      </button>

                      <button 
                        onClick={() => setGameState('START')}
                        className="val-button bg-val-white text-val-dark py-4 px-12 font-black text-lg uppercase tracking-tighter italic flex items-center justify-center gap-3"
                      >
                        {t.backToStart}
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info Overlay */}
        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="absolute top-4 right-4 w-72 bg-val-dark border-l-4 border-val-red p-6 shadow-2xl z-50 val-panel"
            >
              <h3 className="font-display italic text-2xl uppercase tracking-tighter mb-4 flex items-center gap-2">
                <Info className="w-5 h-5 text-val-red" />
                {t.rules}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-6 font-medium uppercase tracking-wide">
                {t.howToPlay}
              </p>
              <div className="text-sm font-black text-val-cyan uppercase tracking-widest bg-val-cyan/10 p-3 border border-val-cyan/20">
                {t.winCondition}
              </div>
              <button 
                onClick={() => setShowInfo(false)}
                className="mt-8 w-full py-3 bg-val-white text-val-dark font-black uppercase tracking-tighter italic hover:bg-val-red transition-colors"
                style={{ clipPath: 'polygon(0 0, 100% 0, 100% 70%, 90% 100%, 0 100%)' }}
              >
                {lang === 'zh' ? '确认' : 'CONFIRM'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="mt-10 text-zinc-700 text-[10px] uppercase tracking-[0.4em] font-black flex items-center gap-6 relative z-10">
        <span className="hover:text-val-red transition-colors cursor-default">System Status: Operational</span>
        <div className="w-1.5 h-1.5 bg-val-red rotate-45" />
        <span className="hover:text-val-red transition-colors cursor-default">Nova Defense v2.0</span>
        <div className="w-1.5 h-1.5 bg-val-red rotate-45" />
        <span className="hover:text-val-red transition-colors cursor-default">Tactical Interface</span>
      </div>
    </div>
  );
}
