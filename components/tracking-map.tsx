'use client';

import { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
} from '@vis.gl/react-google-maps';
import type { LatLng } from '@/lib/geo';

export interface TrackingUpdate {
  status?: string;
  position: LatLng | null;
  bearingDeg: number | null;
  destination: LatLng;
  distanceKm: number | null;
  etaMinutes: number | null;
  arrival?: string;
  technicianName?: string | null;
  ended?: boolean;
  reason?: string;
}

/**
 * The caregiver's live map.
 *
 * With a Maps key it renders Google Maps. Without one it renders a real SVG
 * map of the route rather than a grey box: the marker genuinely moves along
 * the road geometry, because a tracking feature you cannot see working is a
 * tracking feature you cannot test.
 */
export function TrackingMap({
  bookingId,
  token,
  apiKey,
  routePoints,
  destination,
  technicianName,
}: {
  bookingId: string;
  token?: string;
  apiKey?: string;
  routePoints: LatLng[];
  destination: LatLng;
  technicianName: string | null;
}) {
  const [update, setUpdate] = useState<TrackingUpdate | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = `/api/track/${bookingId}/stream${token ? `?t=${encodeURIComponent(token)}` : ''}`;
    const source = new EventSource(url);

    source.onopen = () => setConnected(true);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as TrackingUpdate;
      if (data.ended) {
        setEnded(data.reason ?? 'Tracking has finished.');
        source.close();
        return;
      }
      setUpdate(data);
    };
    source.onerror = () => setConnected(false);

    return () => source.close();
  }, [bookingId, token]);

  const position = update?.position ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[var(--radius-card)] border-2 border-[var(--color-line)]">
        {apiKey ? (
          <APIProvider apiKey={apiKey}>
            <GoogleMap
              style={{ width: '100%', height: '22rem' }}
              defaultCenter={destination}
              defaultZoom={15}
              gestureHandling="greedy"
              disableDefaultUI
              mapId="swasthasetu-tracking"
            >
              <AdvancedMarker position={destination}>
                <Pin background="#0b5e56" borderColor="#08403a" glyphColor="#fff" />
              </AdvancedMarker>
              {position && (
                <AdvancedMarker position={position}>
                  <Pin background="#a91b1b" borderColor="#7a1414" glyphColor="#fff" />
                </AdvancedMarker>
              )}
            </GoogleMap>
          </APIProvider>
        ) : (
          <FallbackMap
            routePoints={routePoints}
            destination={destination}
            position={position}
          />
        )}
      </div>

      <div className="rounded-[var(--radius-card)] border-2 border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        {ended ? (
          <p className="font-semibold">{ended}</p>
        ) : update ? (
          <div className="flex flex-col gap-2">
            <p className="text-[var(--text-lead)] font-semibold">
              {update.etaMinutes !== null
                ? `${technicianName ?? update.technicianName ?? 'Your technician'} is about ${update.etaMinutes} minute${update.etaMinutes === 1 ? '' : 's'} away`
                : `${technicianName ?? 'Your technician'} has not started the route yet`}
            </p>
            {update.distanceKm !== null && (
              <p className="text-[var(--color-ink-soft)]">
                {update.distanceKm.toFixed(1)} km from the door
              </p>
            )}
            <p className="text-[var(--text-small)] text-[var(--color-ink-faint)]">
              {connected ? 'Updating live' : 'Reconnecting…'} · This link stops working shortly
              after the visit.
            </p>
          </div>
        ) : (
          <p>Connecting…</p>
        )}
      </div>
    </div>
  );
}

/**
 * A genuine map, drawn from the route geometry. Not a placeholder: the road
 * path, the destination and the moving technician are all real coordinates,
 * projected into the viewbox.
 */
function FallbackMap({
  routePoints,
  destination,
  position,
}: {
  routePoints: LatLng[];
  destination: LatLng;
  position: LatLng | null;
}) {
  const all = [...routePoints, destination, ...(position ? [position] : [])];
  if (all.length === 0) return <div className="h-88 bg-[var(--color-surface-sunken)]" />;

  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const pad = 0.002;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad;
  const maxLng = Math.max(...lngs) + pad;

  const W = 600;
  const H = 352;
  const project = (p: LatLng) => ({
    x: ((p.lng - minLng) / (maxLng - minLng || 1)) * W,
    // SVG y grows downward; latitude grows northward.
    y: H - ((p.lat - minLat) / (maxLat - minLat || 1)) * H,
  });

  const path = routePoints.map(project);
  const dest = project(destination);
  const tech = position ? project(position) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-88 w-full bg-[var(--color-surface-sunken)]"
      role="img"
      aria-label="Map showing the technician's position and the destination"
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />

      {path.length > 1 && (
        <polyline
          points={path.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      <g>
        <circle cx={dest.x} cy={dest.y} r="14" fill="var(--color-primary)" />
        <circle cx={dest.x} cy={dest.y} r="6" fill="#fff" />
        <text
          x={dest.x}
          y={dest.y - 22}
          textAnchor="middle"
          className="text-[13px] font-semibold"
          fill="var(--color-ink)"
        >
          Home
        </text>
      </g>

      {tech && (
        <g>
          <circle cx={tech.x} cy={tech.y} r="18" fill="var(--color-red)" opacity="0.2" />
          <circle cx={tech.x} cy={tech.y} r="11" fill="var(--color-red)" />
          <text
            x={tech.x}
            y={tech.y - 20}
            textAnchor="middle"
            className="text-[13px] font-semibold"
            fill="var(--color-ink)"
          >
            Technician
          </text>
        </g>
      )}
    </svg>
  );
}
