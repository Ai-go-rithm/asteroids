import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Entity,
  Ship,
  Asteroid,
  Bullet,
  Particle,
  PowerUpDrop,
  PowerUpType,
  GameState,
} from '../types';
import {
  COLORS,
  FPS,
  FRICTION,
  SHIP_THRUST,
  SHIP_ROTATION_SPEED,
  SHIP_SIZE,
  SHIP_INVULNERABILITY_TIME,
  BULLET_SPEED,
  BULLET_LIFESPAN,
  FIRE_RATE_DEFAULT,
  FIRE_RATE_RAPID,
  ASTEROID_SPEED_BASE,
  ASTEROID_SIZES,
  POINTS,
} from '../constants';

// --- Audio System ---
const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
const audioCtx = new AudioContextClass();

const playSound = (type: 'shoot' | 'explode' | 'thrust' | 'powerup') => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'shoot') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'explode') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'thrust') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(50, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'powerup') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }
};

const AsteroidsGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  
  // Game State Refs (Mutable for performance)
  const shipRef = useRef<Ship | null>(null);
  const asteroidsRef = useRef<Asteroid[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const powerUpsRef = useRef<PowerUpDrop[]>([]);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const lastTimeRef = useRef<number>(0);
  
  // React State for UI
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    level: 1,
    lives: 3,
    isPlaying: false,
    isGameOver: false,
    highScore: parseInt(localStorage.getItem('asteroids_highscore') || '0', 10),
  });

  // --- Helpers ---
  const createAsteroid = (x: number, y: number, sizeClass: 'LARGE' | 'MEDIUM' | 'SMALL'): Asteroid => {
    const size = ASTEROID_SIZES[sizeClass];
    const angle = Math.random() * Math.PI * 2;
    // Speed increases slightly with levels
    const speed = (ASTEROID_SPEED_BASE + (gameState.level * 0.1)) * (sizeClass === 'SMALL' ? 1.5 : 1); 
    
    // Generate jagged shape points
    const points: number[] = [];
    const numPoints = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < numPoints; i++) {
        const variance = (Math.random() * 0.4) + 0.8; // 0.8 to 1.2
        points.push(variance);
    }

    return {
      id: Math.random().toString(36).substr(2, 9),
      position: { x, y },
      velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius: size,
      angle: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.05,
      sizeClass,
      points
    };
  };

  const createExplosion = (x: number, y: number, color: string = '#ffffff', count: number = 10) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3;
      particlesRef.current.push({
        id: Math.random().toString(),
        position: { x, y },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        radius: Math.random() * 2 + 1,
        angle: 0,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.03,
        color
      });
    }
  };

  const spawnPowerUp = (x: number, y: number) => {
    // 10% chance to spawn a powerup when asteroid destroyed
    if (Math.random() > 0.1) return;
    
    const types = [PowerUpType.SHIELD, PowerUpType.SPREAD_SHOT, PowerUpType.RAPID_FIRE];
    const type = types[Math.floor(Math.random() * types.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5;

    powerUpsRef.current.push({
      id: Math.random().toString(),
      position: { x, y },
      velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius: 15,
      angle: 0,
      type,
      createdAt: Date.now()
    });
  };

  const resetLevel = (newLevel: boolean = false) => {
    if (newLevel) {
        setGameState(prev => ({ ...prev, level: prev.level + 1 }));
    }
    
    // Position ship safely
    shipRef.current = {
      id: 'player',
      position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      velocity: { x: 0, y: 0 },
      radius: SHIP_SIZE,
      angle: -Math.PI / 2, // Point up
      rotationSpeed: 0,
      isThrusting: false,
      lives: newLevel ? gameState.lives : gameState.lives, 
      invulnerableUntil: Date.now() + SHIP_INVULNERABILITY_TIME,
      weaponLevel: 1,
      shieldActive: false,
      powerUpExpiresAt: 0,
      currentPowerUp: null,
      lastShotTime: 0,
    };

    if (newLevel || asteroidsRef.current.length === 0) {
        asteroidsRef.current = [];
        const count = 3 + (newLevel ? gameState.level : gameState.level - 1);
        for (let i = 0; i < count; i++) {
            let x, y;
            // Spawn asteroids away from center
            do {
                x = Math.random() * window.innerWidth;
                y = Math.random() * window.innerHeight;
            } while (Math.hypot(x - window.innerWidth/2, y - window.innerHeight/2) < 200);
            
            asteroidsRef.current.push(createAsteroid(x, y, 'LARGE'));
        }
    }
    bulletsRef.current = [];
    powerUpsRef.current = [];
  };

  const initGame = () => {
    setGameState(prev => ({ ...prev, score: 0, level: 1, lives: 3, isPlaying: true, isGameOver: false }));
    shipRef.current = {
        id: 'player',
        position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        velocity: { x: 0, y: 0 },
        radius: SHIP_SIZE,
        angle: -Math.PI / 2,
        rotationSpeed: 0,
        isThrusting: false,
        lives: 3,
        invulnerableUntil: Date.now() + SHIP_INVULNERABILITY_TIME,
        weaponLevel: 1,
        shieldActive: false,
        powerUpExpiresAt: 0,
        currentPowerUp: null,
        lastShotTime: 0,
    };
    asteroidsRef.current = [];
    // Initial Spawn
    for (let i = 0; i < 4; i++) {
        let x, y;
        do {
            x = Math.random() * window.innerWidth;
            y = Math.random() * window.innerHeight;
        } while (Math.hypot(x - window.innerWidth/2, y - window.innerHeight/2) < 200);
        asteroidsRef.current.push(createAsteroid(x, y, 'LARGE'));
    }
    bulletsRef.current = [];
    particlesRef.current = [];
    powerUpsRef.current = [];
  };

  const handleResize = () => {
      if (canvasRef.current) {
          canvasRef.current.width = window.innerWidth;
          canvasRef.current.height = window.innerHeight;
      }
  };

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;
      if (e.code === 'Space' && !gameState.isPlaying && !gameState.isGameOver) {
         initGame();
      } else if (e.code === 'Enter' && gameState.isGameOver) {
         initGame();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
    };
  }, [gameState.isPlaying, gameState.isGameOver]);


  // --- Game Loop ---
  const update = (dt: number) => {
    if (!gameState.isPlaying || gameState.isGameOver) return;

    const ship = shipRef.current;
    if (!ship) return;

    // 1. Ship Controls
    if (keysPressed.current['ArrowLeft']) ship.angle -= SHIP_ROTATION_SPEED;
    if (keysPressed.current['ArrowRight']) ship.angle += SHIP_ROTATION_SPEED;
    
    ship.isThrusting = !!keysPressed.current['ArrowUp'];
    if (ship.isThrusting) {
        ship.velocity.x += Math.cos(ship.angle) * SHIP_THRUST;
        ship.velocity.y += Math.sin(ship.angle) * SHIP_THRUST;
        // Visual thrust effect
        if (Math.random() > 0.5) playSound('thrust'); // Simple sound limiter
    }

    // Apply friction
    ship.velocity.x *= FRICTION;
    ship.velocity.y *= FRICTION;

    // Update position
    ship.position.x += ship.velocity.x;
    ship.position.y += ship.velocity.y;

    // Wrap Ship
    if (ship.position.x < 0) ship.position.x = window.innerWidth;
    if (ship.position.x > window.innerWidth) ship.position.x = 0;
    if (ship.position.y < 0) ship.position.y = window.innerHeight;
    if (ship.position.y > window.innerHeight) ship.position.y = 0;

    // 2. Shooting
    const now = Date.now();
    let fireRate = FIRE_RATE_DEFAULT;
    if (ship.currentPowerUp === PowerUpType.RAPID_FIRE) fireRate = FIRE_RATE_RAPID;
    
    // Check powerup expiration
    if (ship.currentPowerUp && now > ship.powerUpExpiresAt) {
        ship.currentPowerUp = null;
        ship.shieldActive = false;
    }

    if (keysPressed.current['Space'] && now - ship.lastShotTime > fireRate) {
        playSound('shoot');
        const bulletSpeed = BULLET_SPEED;
        const spawnBullet = (angleOffset: number) => {
            bulletsRef.current.push({
                id: Math.random().toString(),
                position: { x: ship.position.x + Math.cos(ship.angle) * ship.radius, y: ship.position.y + Math.sin(ship.angle) * ship.radius },
                velocity: { 
                    x: Math.cos(ship.angle + angleOffset) * bulletSpeed + ship.velocity.x * 0.5, 
                    y: Math.sin(ship.angle + angleOffset) * bulletSpeed + ship.velocity.y * 0.5 
                },
                radius: 2,
                angle: ship.angle + angleOffset,
                createdAt: now,
                lifespan: BULLET_LIFESPAN
            });
        };

        spawnBullet(0);
        if (ship.currentPowerUp === PowerUpType.SPREAD_SHOT) {
            spawnBullet(0.2);
            spawnBullet(-0.2);
        }
        ship.lastShotTime = now;
    }

    // 3. Update Entities
    // Bullets
    bulletsRef.current = bulletsRef.current.filter(b => now - b.createdAt < b.lifespan);
    bulletsRef.current.forEach(b => {
        b.position.x += b.velocity.x;
        b.position.y += b.velocity.y;
        if (b.position.x < 0) b.position.x = window.innerWidth;
        else if (b.position.x > window.innerWidth) b.position.x = 0;
        if (b.position.y < 0) b.position.y = window.innerHeight;
        else if (b.position.y > window.innerHeight) b.position.y = 0;
    });

    // Asteroids
    asteroidsRef.current.forEach(a => {
        a.position.x += a.velocity.x;
        a.position.y += a.velocity.y;
        a.angle += a.rotationSpeed;
        
        // Wrap
        if (a.position.x < -a.radius) a.position.x = window.innerWidth + a.radius;
        else if (a.position.x > window.innerWidth + a.radius) a.position.x = -a.radius;
        if (a.position.y < -a.radius) a.position.y = window.innerHeight + a.radius;
        else if (a.position.y > window.innerHeight + a.radius) a.position.y = -a.radius;
    });

    // PowerUps
    powerUpsRef.current.forEach(p => {
        p.position.x += p.velocity.x;
        p.position.y += p.velocity.y;
        // Wrap
        if (p.position.x < 0) p.position.x = window.innerWidth;
        if (p.position.x > window.innerWidth) p.position.x = 0;
        if (p.position.y < 0) p.position.y = window.innerHeight;
        if (p.position.y > window.innerHeight) p.position.y = 0;
    });

    // Particles
    particlesRef.current.forEach(p => {
        p.position.x += p.velocity.x;
        p.position.y += p.velocity.y;
        p.life -= p.decay;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    // 4. Collision Detection
    
    // Bullets hit Asteroids
    for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const b = bulletsRef.current[i];
        let bulletHit = false;
        
        for (let j = asteroidsRef.current.length - 1; j >= 0; j--) {
            const a = asteroidsRef.current[j];
            const dist = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
            
            if (dist < a.radius + b.radius) {
                // Hit!
                playSound('explode');
                bulletHit = true;
                
                // Add Score
                let points = POINTS.LARGE;
                if (a.sizeClass === 'MEDIUM') points = POINTS.MEDIUM;
                if (a.sizeClass === 'SMALL') points = POINTS.SMALL;
                setGameState(prev => ({ ...prev, score: prev.score + points }));
                
                // Spawn debris
                createExplosion(a.position.x, a.position.y, COLORS.ASTEROID, 8);
                
                // Spawn smaller asteroids
                if (a.sizeClass === 'LARGE') {
                    asteroidsRef.current.push(createAsteroid(a.position.x, a.position.y, 'MEDIUM'));
                    asteroidsRef.current.push(createAsteroid(a.position.x, a.position.y, 'MEDIUM'));
                } else if (a.sizeClass === 'MEDIUM') {
                    asteroidsRef.current.push(createAsteroid(a.position.x, a.position.y, 'SMALL'));
                    asteroidsRef.current.push(createAsteroid(a.position.x, a.position.y, 'SMALL'));
                } else {
                    // Small destroyed
                    createExplosion(a.position.x, a.position.y, COLORS.ASTEROID, 15);
                    spawnPowerUp(a.position.x, a.position.y);
                }

                asteroidsRef.current.splice(j, 1);
                break; // Bullet hits only one asteroid
            }
        }
        if (bulletHit) bulletsRef.current.splice(i, 1);
    }

    // Ship hits Asteroid
    const isInvulnerable = now < ship.invulnerableUntil;
    if (!isInvulnerable && !ship.shieldActive) {
        for (const a of asteroidsRef.current) {
            const dist = Math.hypot(ship.position.x - a.position.x, ship.position.y - a.position.y);
            // 0.8 scale on ship radius makes hitbox slightly forgiving
            if (dist < ship.radius * 0.8 + a.radius * 0.8) {
                playSound('explode');
                createExplosion(ship.position.x, ship.position.y, COLORS.SHIP, 20);
                
                // Lose life
                const newLives = gameState.lives - 1;
                setGameState(prev => ({ ...prev, lives: newLives }));
                
                if (newLives <= 0) {
                    setGameState(prev => {
                        const newHigh = Math.max(prev.score, prev.highScore);
                        localStorage.setItem('asteroids_highscore', newHigh.toString());
                        return { ...prev, isGameOver: true, highScore: newHigh };
                    });
                } else {
                    // Respawn same level
                    resetLevel(false);
                }
                return; // Stop update for this frame
            }
        }
    }

    // Ship hits PowerUp
    for (let i = powerUpsRef.current.length - 1; i >= 0; i--) {
        const p = powerUpsRef.current[i];
        const dist = Math.hypot(ship.position.x - p.position.x, ship.position.y - p.position.y);
        if (dist < ship.radius + p.radius) {
            playSound('powerup');
            ship.currentPowerUp = p.type;
            ship.powerUpExpiresAt = now + 10000; // 10 seconds
            if (p.type === PowerUpType.SHIELD) ship.shieldActive = true;
            
            powerUpsRef.current.splice(i, 1);
            setGameState(prev => ({ ...prev, score: prev.score + 500 }));
        }
    }

    // Check Level Clear
    if (asteroidsRef.current.length === 0) {
        // Simple delay before next level? 
        // For now instant:
        resetLevel(true);
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    // Clear background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (!gameState.isPlaying) return;

    const ship = shipRef.current;
    if (!ship) return;
    
    // Draw Particles
    particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color || '#fff';
        ctx.beginPath();
        ctx.arc(p.position.x, p.position.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    // Draw PowerUps
    powerUpsRef.current.forEach(p => {
        ctx.strokeStyle = p.type === PowerUpType.SHIELD ? COLORS.POWERUP_SHIELD : 
                          p.type === PowerUpType.SPREAD_SHOT ? COLORS.POWERUP_SPREAD : COLORS.POWERUP_RAPID;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.position.x, p.position.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Icon inside
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '12px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = p.type === PowerUpType.SHIELD ? 'S' : p.type === PowerUpType.SPREAD_SHOT ? 'W' : 'R';
        ctx.fillText(label, p.position.x, p.position.y);
    });

    // Draw Asteroids
    ctx.strokeStyle = COLORS.ASTEROID;
    ctx.lineWidth = 2;
    asteroidsRef.current.forEach(a => {
        ctx.save();
        ctx.translate(a.position.x, a.position.y);
        ctx.rotate(a.angle);
        ctx.beginPath();
        const angleStep = (Math.PI * 2) / a.points.length;
        a.points.forEach((mag, index) => {
            const r = a.radius * mag;
            const x = Math.cos(index * angleStep) * r;
            const y = Math.sin(index * angleStep) * r;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    });

    // Draw Bullets
    ctx.fillStyle = COLORS.BULLET;
    bulletsRef.current.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Ship
    if (!gameState.isGameOver) {
        ctx.save();
        ctx.translate(ship.position.x, ship.position.y);
        ctx.rotate(ship.angle);
        
        // Flicker if invulnerable
        if (ship.invulnerableUntil > Date.now() && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // Hull
        ctx.strokeStyle = COLORS.SHIP;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ship.radius, 0); // Nose
        ctx.lineTo(-ship.radius, ship.radius * 0.7); // Back left
        ctx.lineTo(-ship.radius * 0.6, 0); // Engine indent
        ctx.lineTo(-ship.radius, -ship.radius * 0.7); // Back right
        ctx.closePath();
        ctx.stroke();

        // Thrust flame
        if (ship.isThrusting) {
            ctx.strokeStyle = '#ffaa00';
            ctx.beginPath();
            ctx.moveTo(-ship.radius * 0.6, 0);
            ctx.lineTo(-ship.radius * 1.5 - Math.random() * 10, 0);
            ctx.stroke();
        }

        // Shield Effect
        if (ship.shieldActive) {
            ctx.strokeStyle = COLORS.SHIELD;
            ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 100) * 0.2;
            ctx.beginPath();
            ctx.arc(0, 0, ship.radius + 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }
  };

  const loop = useCallback((time: number) => {
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;
    
    if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            update(dt);
            draw(ctx);
        }
    }
    requestRef.current = requestAnimationFrame(loop);
  }, [gameState]); // Re-create loop if game state important changes (like pause)

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop]);

  // --- Render UI ---
  return (
    <div className="relative w-full h-full">
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full"
      />
      
      {/* HUD */}
      <div className="absolute top-4 left-4 text-white font-mono pointer-events-none">
        <div className="text-xl mb-2">SCORE: {gameState.score}</div>
        <div className="text-sm text-gray-400">HIGH: {gameState.highScore}</div>
      </div>
      
      <div className="absolute top-4 right-4 text-white font-mono text-right pointer-events-none">
        <div className="text-xl mb-2">LEVEL: {gameState.level}</div>
        <div className="flex gap-2 justify-end">
            {Array.from({ length: Math.max(0, gameState.lives) }).map((_, i) => (
                <div key={i} className="w-4 h-4 border-2 border-white transform -rotate-90" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
            ))}
        </div>
      </div>

      {/* Start / Game Over Screen */}
      {(!gameState.isPlaying || gameState.isGameOver) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-10">
            <div className="text-center">
                <h1 className="text-6xl text-white mb-8 tracking-widest font-bold" style={{ textShadow: '4px 4px 0px #ff0044' }}>
                    {gameState.isGameOver ? 'GAME OVER' : 'ASTEROIDS'}
                </h1>
                
                {gameState.isGameOver && (
                    <div className="mb-8 text-2xl text-yellow-400">
                        FINAL SCORE: {gameState.score}
                    </div>
                )}

                <div className="space-y-4 text-gray-300 font-mono">
                    <p className="animate-pulse text-xl text-white mb-8">PRESS {gameState.isGameOver ? 'ENTER' : 'SPACE'} TO START</p>
                    
                    <div className="border border-gray-600 p-6 rounded bg-black/50 text-left inline-block">
                        <p className="mb-2 text-yellow-500">CONTROLS:</p>
                        <p>⬆️ THRUST</p>
                        <p>⬅️ ➡️ ROTATE</p>
                        <p>SPACE : SHOOT</p>
                    </div>
                    
                    <div className="mt-8 text-sm text-gray-500">
                        <p>POWERUPS:</p>
                        <p><span className="text-cyan-400">S</span> SHIELD &bull; <span className="text-yellow-400">W</span> SPREAD &bull; <span className="text-fuchsia-400">R</span> RAPID</p>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AsteroidsGame;