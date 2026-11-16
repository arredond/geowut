import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Position } from "geojson";

type ScreenPoint = ReturnType<MapLibreMap["project"]>;

/** Roughly how often a segment is traced, in degrees: often enough to follow its curve on screen. */
const STEP_DEG = 1;
/** The most points a segment is traced with, for the longest. */
const MAX_STEPS = 64;

/**
 * The points a line's segment is drawn through. MapLibre draws segments straight in Web Mercator,
 * which on the globe bends them on screen, so a long one is traced with points between its ends.
 */
export function tracedSegment(a: Position, b: Position): Position[] {
  const span = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(span / STEP_DEG)));
  if (steps === 1) return [a, b];
  const [fromY, toY] = [a, b].map(
    ([lng, lat]) => MercatorCoordinate.fromLngLat([lng, lat]).y,
  );
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    // Web Mercator's x is longitude scaled, so that goes evenly; latitude follows its y.
    const { lat } = new MercatorCoordinate(
      0,
      fromY + (toY - fromY) * t,
    ).toLngLat();
    return [a[0] + (b[0] - a[0]) * t, lat];
  });
}

/** Unprojecting a spot gives the place in front, so a place behind the globe doesn't come back. */
function isBehindGlobe(
  map: MapLibreMap,
  screen: ScreenPoint,
  lng: number,
  lat: number,
): boolean {
  const back = map.unproject(screen);
  const dLng = Math.abs(((((back.lng - lng + 540) % 360) + 360) % 360) - 180);
  return dLng > 1e-4 || Math.abs(back.lat - lat) > 1e-4;
}

/** The spot on segment pq nearest to c, all on screen. */
function nearestOnSegment(
  p: ScreenPoint,
  q: ScreenPoint,
  c: ScreenPoint,
): ScreenPoint {
  const pq = q.sub(p);
  const lengthSq = pq.x * pq.x + pq.y * pq.y;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((c.x - p.x) * pq.x + (c.y - p.y) * pq.y) / lengthSq),
        );
  return p.add(pq.mult(t));
}

/**
 * The spot on a line nearest to a point on screen, along the line as the map draws it, and how
 * far off it is in pixels. Stretches hidden behind the globe don't count. Null when it's all hidden.
 */
export function nearestOnLine(
  map: MapLibreMap,
  line: Position[],
  point: ScreenPoint,
): { point: ScreenPoint; distance: number } | null {
  let best: { point: ScreenPoint; distance: number } | null = null;
  const globe = map.getProjection()?.type === "globe";
  for (let i = 1; i < line.length; i++) {
    const traced = tracedSegment(line[i - 1], line[i]).map(([lng, lat]) => {
      const screen = map.project([lng, lat]);
      return globe && isBehindGlobe(map, screen, lng, lat) ? null : screen;
    });
    for (let j = 1; j < traced.length; j++) {
      const [p, q] = [traced[j - 1], traced[j]];
      if (!p || !q) continue;
      const nearest = nearestOnSegment(p, q, point);
      const distance = nearest.dist(point);
      if (!best || distance < best.distance)
        best = { point: nearest, distance };
    }
  }
  return best;
}
