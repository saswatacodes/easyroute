export type TripEvent = {
  type: "status_change" | "location_update";
  tripId: number;
  status?: string;
  lat?: number;
  lng?: number;
  driverId?: number;
  timestamp: string;
};

export type DriverEvent = {
  type: "new_trip" | "trip_update";
  tripId: number;
  data: Record<string, unknown>;
};

const tripSubscribers = new Map<number, Set<(event: TripEvent) => void>>();
const driverSubscribers = new Map<number, Set<(event: DriverEvent) => void>>();

export function subscribeTrip(tripId: number, cb: (event: TripEvent) => void) {
  if (!tripSubscribers.has(tripId)) tripSubscribers.set(tripId, new Set());
  tripSubscribers.get(tripId)!.add(cb);
  return () => unsubscribeTrip(tripId, cb);
}

export function unsubscribeTrip(tripId: number, cb: (event: TripEvent) => void) {
  const subs = tripSubscribers.get(tripId);
  if (!subs) return;
  subs.delete(cb);
  if (subs.size === 0) tripSubscribers.delete(tripId);
}

export function publishTripEvent(tripId: number, event: TripEvent) {
  const subs = tripSubscribers.get(tripId);
  if (!subs) return;
  for (const cb of subs) {
    cb(event);
  }
}

export function subscribeDriver(driverId: number, cb: (event: DriverEvent) => void) {
  if (!driverSubscribers.has(driverId)) driverSubscribers.set(driverId, new Set());
  driverSubscribers.get(driverId)!.add(cb);
  return () => unsubscribeDriver(driverId, cb);
}

export function unsubscribeDriver(driverId: number, cb: (event: DriverEvent) => void) {
  const subs = driverSubscribers.get(driverId);
  if (!subs) return;
  subs.delete(cb);
  if (subs.size === 0) driverSubscribers.delete(driverId);
}

export function publishDriverEvent(driverId: number, event: DriverEvent) {
  const subs = driverSubscribers.get(driverId);
  if (!subs) return;
  for (const cb of subs) {
    cb(event);
  }
}
