'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { startRoute, endRoute } from '@/app/actions/field';
import { Badge, Button, Card, H3, Muted, Stack } from '@/components/ui';

/**
 * Starting and ending the route, and the GPS loop in between.
 *
 * The technician can see exactly when their location is being recorded and
 * when it is not, because they are entitled to know — and because the server
 * rejects anything sent outside that window anyway.
 */
export function RouteControls({
  routeId,
  status,
  startedAt,
}: {
  routeId: string;
  status: string;
  startedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [pings, setPings] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  const running = status === 'STARTED';

  useEffect(() => {
    if (!running || typeof navigator === 'undefined' || !navigator.geolocation) return;

    watchId.current = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          const res = await fetch('/api/field/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              routeId,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyM: position.coords.accuracy,
              headingDeg: position.coords.heading ?? undefined,
              speedKmh:
                position.coords.speed === null ? undefined : position.coords.speed * 3.6,
            }),
          });
          if (res.ok) {
            setPings((n) => n + 1);
            setGpsError(null);
          }
        } catch {
          setGpsError('Could not reach the server. Positions will resume when you are back online.');
        }
      },
      (error) => setGpsError(error.message),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [running, routeId]);

  return (
    <Card tone={running ? 'green' : 'sunken'}>
      <Stack gap="sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <H3>{running ? 'Route running' : 'Route not started'}</H3>
          <Badge tone={running ? 'green' : 'neutral'}>
            {running ? 'location on' : 'location off'}
          </Badge>
        </div>

        {running ? (
          <Muted>
            Started at{' '}
            {startedAt
              ? new Date(startedAt).toLocaleTimeString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : '—'}
            . {pings} position{pings === 1 ? '' : 's'} sent. Families with a visit right now can
            see where you are; nobody else can.
          </Muted>
        ) : (
          <Muted>
            Your location is not recorded until you start the route, and stops the moment you end
            it. The server rejects anything sent outside that window.
          </Muted>
        )}

        {gpsError && <p className="font-semibold text-[var(--color-red)]">{gpsError}</p>}
        {message && <p className="font-semibold">{message}</p>}

        {running ? (
          <Button
            tone="secondary"
            full
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await endRoute(routeId);
                setMessage(result.message ?? null);
              })
            }
          >
            End the route
          </Button>
        ) : (
          <Button
            full
            disabled={pending || status === 'COMPLETED'}
            onClick={() =>
              startTransition(async () => {
                const result = await startRoute(routeId);
                setMessage(result.message ?? null);
              })
            }
          >
            {status === 'COMPLETED' ? 'Route finished' : 'Start the route'}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
