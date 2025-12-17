export const SCREEN_WIDTH = window.innerWidth;
export const SCREEN_HEIGHT = window.innerHeight;

export const FPS = 60;
export const FRICTION = 0.98; // Low friction for drift
export const SHIP_THRUST = 0.15; // Acceleration per frame
export const SHIP_ROTATION_SPEED = 0.08; // Radians per frame
export const SHIP_SIZE = 20; // Radius
export const SHIP_INVULNERABILITY_TIME = 3000; // ms

export const BULLET_SPEED = 7;
export const BULLET_LIFESPAN = 1500; // ms
export const FIRE_RATE_DEFAULT = 250; // ms
export const FIRE_RATE_RAPID = 100; // ms

export const ASTEROID_SPEED_BASE = 1.5;
export const ASTEROID_VERTICES = 12;
export const ASTEROID_JAGGEDNESS = 0.4; // 0 to 1
export const ASTEROID_SIZES = {
  LARGE: 45,
  MEDIUM: 25,
  SMALL: 15,
};

export const COLORS = {
  SHIP: '#ffffff',
  ASTEROID: '#ffffff',
  BULLET: '#ff0044',
  SHIELD: '#00ffff',
  POWERUP_SHIELD: '#00ffff',
  POWERUP_SPREAD: '#ffff00',
  POWERUP_RAPID: '#ff00ff',
  TEXT: '#ffffff',
};

export const POINTS = {
  LARGE: 20,
  MEDIUM: 50,
  SMALL: 100,
  POWERUP: 0,
};