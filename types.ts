export enum PowerUpType {
  SHIELD = 'SHIELD',
  SPREAD_SHOT = 'SPREAD_SHOT',
  RAPID_FIRE = 'RAPID_FIRE',
}

export interface Point {
  x: number;
  y: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  position: Point;
  velocity: Velocity;
  radius: number;
  angle: number; // in radians
  color?: string;
  markedForDeletion?: boolean;
}

export interface Ship extends Entity {
  rotationSpeed: number;
  isThrusting: boolean;
  lives: number;
  invulnerableUntil: number; // timestamp
  weaponLevel: number;
  shieldActive: boolean;
  powerUpExpiresAt: number;
  currentPowerUp: PowerUpType | null;
  lastShotTime: number;
}

export interface Asteroid extends Entity {
  sizeClass: 'LARGE' | 'MEDIUM' | 'SMALL';
  rotationSpeed: number; // visual rotation
  points: number[]; // For jagged shape drawing
}

export interface Bullet extends Entity {
  createdAt: number;
  lifespan: number;
}

export interface Particle extends Entity {
  life: number; // 0 to 1
  decay: number;
}

export interface PowerUpDrop extends Entity {
  type: PowerUpType;
  createdAt: number;
}

export interface GameState {
  score: number;
  level: number;
  lives: number;
  isPlaying: boolean;
  isGameOver: boolean;
  highScore: number;
}