// Пещера: тайлы Ansimuz по соседям из клеточной сетки, коллизии Arcade.
import Phaser from 'phaser';
import { MAP } from '../config/map.ts';
import { buildWallGrid, isWallAt, pickTile, TILE, type WallGrid } from '../core/grid.ts';

export interface Cave {
  grid: WallGrid;
  layer: Phaser.Tilemaps.TilemapLayer;
  isWall(x: number, y: number): boolean;
  isWaterRect(x: number, y: number, w: number, h: number): boolean;
}

export function buildCave(scene: Phaser.Scene): Cave {
  const grid = buildWallGrid(MAP.water, MAP.width, MAP.height);
  const data: number[][] = [];
  for (let cy = 0; cy < grid.rows; cy++) {
    const row: number[] = [];
    for (let cx = 0; cx < grid.cols; cx++) row.push(pickTile(grid, cx, cy));
    data.push(row);
  }
  const map = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
  if (!tileset) throw new Error('tileset tiles.png not loaded');
  const layer = map.createLayer(0, tileset, 0, 0);
  if (!layer) throw new Error('cave layer failed');
  layer.setCollisionByExclusion([-1]);
  layer.setDepth(10);

  const isWall = (x: number, y: number) => isWallAt(grid, x, y);
  const isWaterRect = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy <= y + h; yy += TILE / 2) for (let xx = x; xx <= x + w; xx += TILE / 2) if (isWall(xx, yy)) return false;
    return true;
  };
  return { grid, layer, isWall, isWaterRect };
}
