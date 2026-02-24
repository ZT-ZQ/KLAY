export interface Point {
  x: number;
  y: number;
}

export interface Entity extends Point {
  id: string;
}

export interface Rocket extends Entity {
  targetX: number;
  targetY: number;
  speed: number;
  angle: number;
}

export interface Missile extends Entity {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  progress: number; // 0 to 1
  distance: number;
}

export interface Explosion extends Entity {
  radius: number;
  maxRadius: number;
  life: number; // current frame
  maxLife: number; // total frames
}

export interface City extends Entity {
  active: boolean;
}

export interface Turret extends Entity {
  active: boolean;
  ammo: number;
  maxAmmo: number;
}

export type GameStatus = 'START' | 'PLAYING' | 'PAUSED' | 'WON' | 'LOST';

export interface GameState {
  score: number;
  status: GameStatus;
  rockets: Rocket[];
  missiles: Missile[];
  explosions: Explosion[];
  cities: City[];
  turrets: Turret[];
  language: 'zh' | 'en';
}
