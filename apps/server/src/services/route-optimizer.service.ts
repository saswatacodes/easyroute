export interface StopCoordinate {
  id: number
  lat: number
  lng: number
}

export interface BookingStop {
  employeeId: number
  stopId: number
  lat: number
  lng: number
}

export interface OrderedStop {
  stopId: number
  sequence: number
  type: "pickup" | "dropoff" | "office"
  scheduledArrival: string
}

export interface TripCluster {
  passengers: { employeeId: number; stopId: number }[]
  orderedStops: OrderedStop[]
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function speedForTime(timeStr: string): number {
  const hour = parseInt(timeStr.split(":")[0], 10)
  if (hour >= 8 && hour < 11) return 20
  if (hour >= 16 && hour < 19) return 20
  if (hour >= 0 && hour < 6) return 45
  return 35
}

function estimateMinutes(a: StopCoordinate, b: StopCoordinate, departureTime: string): number {
  const km = haversineKm(a, b)
  const speed = speedForTime(departureTime)
  return Math.round((km / speed) * 60)
}

function totalRouteMinutes(
  stops: StopCoordinate[],
  office: StopCoordinate,
  startTime: string,
): number {
  let total = 0
  let currentTime = startTime
  let prev = stops[0]
  for (let i = 1; i < stops.length; i++) {
    const leg = estimateMinutes(prev, stops[i], currentTime)
    total += leg
    currentTime = addMinutes(currentTime, leg)
    prev = stops[i]
  }
  const lastLeg = estimateMinutes(prev, office, currentTime)
  total += lastLeg
  return total
}

function addMinutes(timeStr: string, mins: number): string {
  const [h, m] = timeStr.split(":").map(Number)
  const total = h * 60 + m + mins
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`
}

function formatTime(hours: number, minutes: number): string {
  const total = Math.round(hours * 60 + minutes)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function buildTime(
  startTime: string,
  cumulativeMinutes: number,
): string {
  const [sh, sm] = startTime.split(":").map(Number)
  const total = sh * 60 + sm + cumulativeMinutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

interface ClusterGroup {
  passengers: { employeeId: number; stopId: number }[]
  stops: StopCoordinate[]
}

export function generateLoginClusters(
  bookings: BookingStop[],
  office: StopCoordinate,
  capacity: number,
  shiftStartTime: string,
): TripCluster[] {
  return generateClusters(bookings, office, capacity, shiftStartTime, "login_trip")
}

export function generateLogoutClusters(
  bookings: BookingStop[],
  office: StopCoordinate,
  capacity: number,
  shiftEndTime: string,
): TripCluster[] {
  return generateClusters(bookings, office, capacity, shiftEndTime, "logout_trip")
}

function generateClusters(
  bookings: BookingStop[],
  office: StopCoordinate,
  capacity: number,
  shiftTime: string,
  tripType: "login_trip" | "logout_trip",
): TripCluster[] {
  if (bookings.length === 0) return []

  const stopCoords = new Map<number, StopCoordinate>()
  const bookingGroups = new Map<number, { employeeId: number; stopId: number }[]>()
  for (const b of bookings) {
    if (!stopCoords.has(b.stopId)) {
      stopCoords.set(b.stopId, { id: b.stopId, lat: b.lat, lng: b.lng })
    }
    const g = bookingGroups.get(b.stopId) ?? []
    g.push({ employeeId: b.employeeId, stopId: b.stopId })
    bookingGroups.set(b.stopId, g)
  }

  const uniqueStopIds = [...bookingGroups.keys()]
  const uniqueStops = uniqueStopIds.map((id) => stopCoords.get(id)!)

  const distFromOffice = uniqueStops.map((s) => ({
    stop: s,
    dist: haversineKm(s, office),
  }))
  distFromOffice.sort((a, b) => b.dist - a.dist)

  const assigned = new Set<number>()
  const clusters: ClusterGroup[] = []

  for (const candidate of distFromOffice) {
    if (assigned.has(candidate.stop.id)) continue

    const seed = candidate.stop
    const groupPassengers = [...(bookingGroups.get(seed.id) ?? [])]
    assigned.add(seed.id)

    const clusterStops: StopCoordinate[] = [seed]
    const remaining = uniqueStops.filter((s) => !assigned.has(s.id))
    const seedDist = remaining.map((s) => ({
      stop: s,
      dist: haversineKm(s, seed),
    }))
    seedDist.sort((a, b) => a.dist - b.dist)

    for (const near of seedDist) {
      if (groupPassengers.length >= capacity) break
      if (assigned.has(near.stop.id)) continue

      const addPassengers = bookingGroups.get(near.stop.id) ?? []
      if (groupPassengers.length + addPassengers.length > capacity) continue

      groupPassengers.push(...addPassengers)
      assigned.add(near.stop.id)
      clusterStops.push(near.stop)
    }

    clusters.push({ passengers: groupPassengers, stops: clusterStops })
  }

  const result: TripCluster[] = []
  for (const cluster of clusters) {
    if (cluster.passengers.length === 0) continue

    const ordered = optimizeStopOrder(cluster.stops, office, tripType === "login_trip")

    let cumulativeMinutes = 0
    let currentTime = shiftTime
    const orderedStops: OrderedStop[] = []
    for (let i = 0; i < ordered.length; i++) {
      const stop = ordered[i]
      const isLast = i === ordered.length - 1
      const next = isLast ? office : ordered[i + 1]
      const arrivalTime = buildTime(shiftTime, cumulativeMinutes)
      orderedStops.push({
        stopId: stop.id,
        sequence: i + 1,
        type: tripType === "login_trip" ? "pickup" : "dropoff",
        scheduledArrival: arrivalTime,
      })
      if (!isLast) {
        const leg = estimateMinutes(stop, next, currentTime)
        cumulativeMinutes += leg
        currentTime = addMinutes(currentTime, leg)
      }
    }

    const officeArrival = buildTime(shiftTime, cumulativeMinutes)
    orderedStops.push({
      stopId: office.id,
      sequence: ordered.length + 1,
      type: "office",
      scheduledArrival: officeArrival,
    })

    result.push({ passengers: cluster.passengers, orderedStops })
  }

  return result
}

function optimizeStopOrder(
  stops: StopCoordinate[],
  office: StopCoordinate,
  isLogin: boolean,
): StopCoordinate[] {
  if (stops.length <= 1) return stops

  const startIdx = isLogin ? 0 : stops.length - 1
  const ordered = [...stops]
  if (!isLogin) ordered.reverse()

  if (ordered.length <= 2) return ordered

  let best: StopCoordinate[] = []
  let bestTime = Infinity

  for (const perm of permutations(ordered)) {
    const time = totalRouteMinutes(perm, office, "09:00")
    if (time < bestTime) {
      bestTime = time
      best = perm
    }
  }

  return best
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) {
      result.push([arr[i], ...p])
    }
  }
  return result
}
