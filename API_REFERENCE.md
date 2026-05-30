# EasyRoute API Reference

Base URL: `http://localhost:3000` (dev) or your production URL.

Auth: Session cookie `session_token` set on login. The SDK handles this automatically via `credentials: "include"`.

---

## Enums

| Enum | Values |
|---|---|
| `role` | `employee`, `driver`, `admin` |
| `trip_status` | `scheduled`, `en_route`, `at_pickup`, `ongoing`, `completed`, `cancelled` |
| `trip_type` | `login_trip`, `logout_trip` |
| `trip_source` | `roster`, `adhoc` |
| `adhoc_trip_status` | `requested`, `allocated`, `completed`, `cancelled` |
| `saved_location_type` | `home`, `work`, `other` |
| `dispute_reason` | `pickup_issue`, `drop_issue`, `trip_quality`, `other` |
| `dispute_status` | `open`, `in_review`, `resolved` |

---

## Error Format

Every error returns:
```json
{ "error": "Human-readable message", "code": "ERROR_CODE", "requestId": "uuid" }
```

| Code | Meaning |
|---|---|
| `NOT_FOUND` | Resource doesn't exist |
| `FORBIDDEN` | Not authorized for this action |
| `UNAUTHORIZED` | Not logged in |
| `VALIDATION_ERROR` | Invalid input |
| `CONFLICT` | State conflict (e.g. invalid transition, duplicate) |
| `INTERNAL` | Server error |

---

## Auth

### POST /auth/login

```
Auth: None
Body: { "employeeId": string, "password": string }
Response 200:
{
  "success": true,
  "token": "session-token-string",
  "role": "employee" | "driver" | "admin"
}
```

Sets `session_token` cookie (httpOnly, 30-day expiry). Verifies password with argon2.

### POST /auth/test-login

```
Auth: None
Body: { "employeeId": string }
Response 200:
{
  "success": true,
  "token": "session-token-string",
  "role": "employee" | "driver" | "admin"
}
```

Dev-only (not available in production). Creates session without password validation.

### POST /auth/signup

```
Auth: requireAuth + requireRole("admin")
Body: {
  "employeeId": string,
  "password": string,          // min 8 chars
  "role"?: "employee" | "driver"  // default: employee
}
Response 201: { "success": true, "userId": string }
```

Auto-creates employee/driver profile row.

### POST /auth/logout

```
Auth: None
Body: None
Response 200: { "success": true }
```

Reads `session_token` cookie, invalidates session, deletes cookie.

### POST /auth/forgot-password

```
Auth: None
Body: { "employeeId": string }
Response 200: { "success": true, "resetToken": string }
```

Silently returns `{ success: true }` (no resetToken) if user not found (prevents enumeration).

### POST /auth/reset-password

```
Auth: None
Body: { "token": string, "password": string }
Response 200: { "success": true }
```

---

## Users

### GET /users/me

```
Auth: requireAuth
Response 200 (employee):
{
  "id": number,
  "employeeId": "EMP001",
  "role": "employee",
  "pushToken": string | null,
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "department": string | null,
  "employeeCode": string | null
}

Response 200 (driver):
{
  "id": number,
  "employeeId": "DRV001",
  "role": "driver",
  "pushToken": string | null,
  "name": string | null,
  "phone": string | null,
  "email": string | null,
  "licenseNumber": string | null,
  "available": boolean,
  "vehicleId": number | null
}

Response 200 (admin):
{
  "id": number,
  "employeeId": "EMP067",
  "role": "admin",
  "pushToken": string | null,
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "department": string | null,
  "employeeCode": string | null
}
```

### PATCH /users/me

```
Auth: requireAuth
Body: {
  "name"?: string (1-255),
  "phone"?: string (max 20),
  "push_token"?: string (max 500)
}
Response 200: { "success": true }
```

---

## Routes (Lookup)

### GET /routes

```
Auth: None
Query: ?offset=0&limit=20
Response 200:
{
  "data": [
    {
      "id": number,
      "name": string,
      "description": string | null,
      "startPoint": { "x": number, "y": number },
      "endPoint": { "x": number, "y": number },
      "isActive": boolean
    }
  ],
  "pagination": { "offset": number, "limit": number, "total": number }
}
```

Cached 5 minutes.

### GET /routes/:id/stops

```
Auth: None
Response 200:
[
  {
    "id": number,
    "routeId": number,
    "name": string,
    "address": string | null,
    "location": { "x": number, "y": number },
    "sequence": number,
    "estimatedMinutesFromPrev": number | null,
    "isOffice": boolean
  }
]
```

Ordered by `sequence`. The stop with `isOffice: true` is the office/hub for that route.

---

## Stops

### GET /stops/nearby

```
Auth: requireAuth
Query: ?lat=28.5&lng=77.1&limit=20
Response 200:
[
  {
    "id": number,
    "name": string,
    "address": string | null,
    "routeId": number,
    "routeName": string,
    "sequence": number,
    "distance": number
  }
]
```

Finds nearest stops within active routes using PostGIS distance operator.

---

## Trips

### GET /trips

```
Auth: requireAuth
Query: ?status=scheduled&dateFrom=2026-06-01&dateTo=2026-06-30&cursor=base64string&limit=20
Response 200:
{
  "items": [
    {
      "id": number,
      "routeId": number | null,
      "driverId": number | null,
      "vehicleId": number | null,
      "scheduledDate": string,
      "status": "scheduled" | "en_route" | "at_pickup" | "ongoing" | "completed" | "cancelled",
      "type": "login_trip" | "logout_trip",
      "source": "roster" | "adhoc",
      "sourceId": string | null,
      "createdAt": string | null
    }
  ],
  "nextCursor": string | null
}
```

Employee sees their own trips (joined via `tripPassengers`). Driver sees assigned trips. Cursor-paginated.

**`type`** indicates the trip direction:
- `login_trip` — morning pickup (employee stops → office)
- `logout_trip` — evening dropoff (office → employee stops)

### GET /trips/:id

```
Auth: requireAuth
Response 200:
{
  "id": number,
  "routeId": number | null,
  "driverId": number | null,
  "vehicleId": number | null,
  "shiftScheduleId": number | null,
  "scheduledDate": string,
  "status": "scheduled" | "en_route" | "at_pickup" | "ongoing" | "completed" | "cancelled",
  "type": "login_trip" | "logout_trip",
  "source": "roster" | "adhoc",
  "sourceId": string | null,
  "createdAt": string | null,
  "updatedAt": string | null,
  "cancelledBy": number | null,
  "cancelReason": string | null,
  "passengers": [
    {
      "employeeId": number,
      "stopId": number | null,
      "loginTime": string | null,     // HH:MM, from shift startTime
      "logoutTime": string | null,    // HH:MM, from shift endTime
      "boardedAt": string | null,     // ISO timestamp, actual boarding
      "droppedAt": string | null      // ISO timestamp, actual dropoff
    }
  ],
  "tripStops": [
    {
      "id": number,
      "stopId": number | null,
      "sequence": number,
      "type": "pickup" | "dropoff" | "office",
      "scheduledArrival": string | null,   // HH:MM, computed during trip generation
      "actualArrival": string | null        // ISO timestamp, set by driver
    }
  ]
}
```

**`passengers[].loginTime`** — the employee's expected login time, set from `shiftSchedule.startTime` during trip generation.

**`passengers[].logoutTime`** — the employee's expected logout time, set from `shiftSchedule.endTime`.

**`tripStops[]`** — ordered list of stops for this trip with scheduled/actual arrival times.

**Access control**: Employees can only view trips where they are a passenger. Drivers see their assigned trips. Admins see all.

### GET /trips/:id/location

```
Auth: requireAuth
Response 200:
{
  "driverId": number,
  "lat": number,
  "lng": number,
  "timestamp": string,
  "tripId": number
}
```

Returns the latest location ping for the trip, or `null` if none exist.

### POST /trips/:id/cancel

```
Auth: requireAuth
Body: { "reason"?: string }
Response 200: { /* full trip object with status: "cancelled" */ }
```

Only `scheduled` trips can be cancelled. Notifies all passengers. Publishes `status_change` event.

### POST /trips/:id/rate

```
Auth: requireAuth
Body: { "score": number (1-5), "comment"?: string }
Response 201:
{
  "id": number,
  "tripId": number,
  "fromUserId": number,
  "toUserId": number,
  "score": number,
  "comment": string | null
}
```

Only employees can rate. Only `ongoing` or `cancelled` trips. One rating per trip per user.

---

## Roster Bookings

### GET /roster-bookings

```
Auth: requireAuth
Response 200:
{
  "items": [
    {
      "id": number,
      "employeeId": number,
      "pickupStopId": number | null,
      "dropoffStopId": number | null,
      "shiftScheduleId": number,
      "daysOfWeek": number,          // bitmask
      "effectiveFrom": string,
      "effectiveUntil": string | null,
      "status": "scheduled" | "ongoing" | "cancelled",
      "rosterId": string | null      // uuid, set when trips are generated
    }
  ]
}
```

**daysOfWeek bitmask:** Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64. Sum for multiple days. E.g. Mon-Fri = 2+4+8+16+32 = 62.

### POST /roster-bookings

```
Auth: requireAuth
Body: {
  "pickupStopId": number,
  "dropoffStopId": number,
  "pickupLocationId"?: number,
  "dropoffLocationId"?: number,
  "shiftScheduleId": number,
  "daysOfWeek": number,     // 0-127 bitmask
  "effectiveFrom": string,  // YYYY-MM-DD
  "effectiveUntil"?: string // YYYY-MM-DD, default no end
}
Response 201: { /* full roster booking object */ }
Response 409: { "error": "Conflict with existing booking", "code": "CONFLICT" }
```

Detects overlapping bookings (same shift + overlapping date range).

### DELETE /roster-bookings/:id

```
Auth: requireAuth
Response 200: { /* roster booking with status: "cancelled" */ }
```

Verifies ownership and that the booking is not already cancelled.

---

## Driver Endpoints

All require `role: "driver"` or `role: "admin"`.

### GET /driver/trips

```
Auth: requireAuth + requireRole("driver", "admin")
Query: ?date=2026-06-01&status=scheduled&cursor=base64&limit=20
Response 200:
{
  "items": [
    {
      "id": number,
      "routeId": number | null,
      "driverId": number | null,
      "vehicleId": number | null,
      "scheduledDate": string,
      "status": "scheduled" | "en_route" | "at_pickup" | "ongoing" | "completed" | "cancelled",
      "type": "login_trip" | "logout_trip",
      "source": "roster" | "adhoc",
      "passengerCount": number,
      "boardedCount": number,
      "droppedCount": number
    }
  ],
  "nextCursor": string | null
}
```

Aggregates passenger, boarded, and dropped counts per trip.

### GET /driver/trips/:id

```
Auth: requireAuth + requireRole("driver", "admin")
Response 200: (same shape as GET /trips/:id — includes passengers + tripStops)
```

Returns full trip detail. Verifies trip is assigned to this driver.

### PATCH /driver/trips/:id/status

```
Auth: requireAuth + requireRole("driver", "admin")
Body: { "status": "en_route" | "at_pickup" | "ongoing" | "completed" | "cancelled" }
Response 200: { /* updated trip object */ }
```

Valid transitions:
```
scheduled → en_route
en_route  → at_pickup, cancelled
at_pickup → ongoing, cancelled
ongoing   → completed, cancelled
completed → (none)
cancelled → (none)
```

Notifies passengers. Publishes `status_change` event to SSE/WebSocket subscribers.

### POST /driver/trips/:id/passengers/:employeeId/board

```
Auth: requireAuth + requireRole("driver", "admin")
Response 200: { "boardedAt": "2026-05-30T10:00:00.000Z" }
```

Sets `tripPassengers.boardedAt = now()`. Prevents double-boarding. Notifies the passenger.

### POST /driver/trips/:id/passengers/:employeeId/drop

```
Auth: requireAuth + requireRole("driver", "admin")
Response 200: { "droppedAt": "2026-05-30T10:30:00.000Z" }
```

Sets `tripPassengers.droppedAt = now()`. Requires passenger to have boarded. Prevents double-drop.

### PATCH /driver/availability

```
Auth: requireAuth + requireRole("driver", "admin")
Body: { "available": boolean }
Response 200: { /* full driver object with updated available flag */ }
```

### POST /driver/trips/:id/location

```
Auth: requireAuth + requireRole("driver", "admin")
Body: { "lat": number, "lng": number }
Response 200: { "lat": number, "lng": number, "timestamp": string }
```

Verifies trip belongs to this driver. Stores in `locationPings` table.

---

## Ad-hoc Trips

### GET /adhoc-trips

```
Auth: requireAuth
Query: ?status=requested&cursor=1&limit=20
Response 200:
{
  "items": [
    {
      "id": number,
      "employeeId": number,
      "tripId": number | null,
      "pickupLocation": { "x": number, "y": number },
      "dropoffLocation": { "x": number, "y": number },
      "scheduledDate": string,
      "scheduledTime": string,
      "status": "requested" | "allocated" | "completed" | "cancelled"
    }
  ],
  "nextCursor": string | null
}
```

Employees see their own. Admins see all.

### POST /adhoc-trips

```
Auth: requireAuth
Body: {
  "pickupLocation": { "lat": number, "lng": number },
  "dropoffLocation": { "lat": number, "lng": number },
  "scheduledDate": string,    // YYYY-MM-DD
  "scheduledTime": string     // HH:MM
}
Response 201:
{
  "id": number,
  "employeeId": number,
  "tripId": number | null,
  "pickupLocation": { "x": number, "y": number },
  "dropoffLocation": { "x": number, "y": number },
  "scheduledDate": string,
  "scheduledTime": string,
  "status": "requested",
  "loginOtp": "6-digit-otp",
  "logoutOtp": "6-digit-otp"
}
```

OTPs are generated via argon2 hash, stored in DB, and returned in plaintext **only at creation**.

### GET /adhoc-trips/:id

```
Auth: requireAuth
Response 200: { /* single adhoc trip object */ }
```

### POST /adhoc-trips/:id/cancel

```
Auth: requireAuth
Response 200: { /* adhoc trip with status: "cancelled" */ }
```

Cannot cancel completed or already-cancelled trips.

### POST /adhoc-trips/:id/verify-otp

```
Auth: requireAuth
Body: { "type": "login" | "logout", "otp": string (6 digits) }
Response 200: { "success": true }
Response 400: { "error": "Invalid OTP", "code": "VALIDATION_ERROR" }
```

Verifies OTP against stored argon2 hash.

---

## Saved Locations

### GET /saved-locations

```
Auth: requireAuth
Response 200:
{
  "items": [
    {
      "id": number,
      "employeeId": number | null,
      "name": string,
      "address": string | null,
      "location": { "x": number, "y": number },
      "type": "home" | "work" | "other"
    }
  ]
}
```

### POST /saved-locations

```
Auth: requireAuth
Body: {
  "name": string (1-255),
  "address"?: string,
  "lat": number,
  "lng": number,
  "type"?: "home" | "work" | "other"   // default: "other"
}
Response 201: { /* full saved location object */ }
```

### PUT /saved-locations/:id

```
Auth: requireAuth
Body: {
  "name"?: string,
  "address"?: string,
  "lat"?: number,
  "lng"?: number,
  "type"?: "home" | "work" | "other"
}
Response 200: { /* updated object */ }
```

Verifies ownership. Updates provided fields only.

### DELETE /saved-locations/:id

```
Auth: requireAuth
Response 200: { "success": true }
```

---

## Shifts

### GET /shifts

```
Auth: None
Response 200:
{
  "items": [
    {
      "id": number,
      "name": string,
      "startTime": string,   // HH:MM
      "endTime": string      // HH:MM
    }
  ]
}
```

Seed shifts:
- Morning: `09:00–17:00`
- Evening: `14:00–22:00`
- Night: `22:00–06:00`

### POST /shifts

```
Auth: requireAuth + requireRole("admin")
Body: { "name": string, "startTime": string (HH:MM), "endTime": string (HH:MM) }
Response 201: { /* full shift object */ }
```

### PUT /shifts/:id

```
Auth: requireAuth + requireRole("admin")
Body: { "name"?: string, "startTime"?: string, "endTime"?: string }
Response 200: { /* updated shift object */ }
```

### DELETE /shifts/:id

```
Auth: requireAuth + requireRole("admin")
Response 200: { "success": true }
```

---

## Notifications

### GET /notifications

```
Auth: requireAuth
Query: ?cursor=50&limit=20
Response 200:
{
  "items": [
    {
      "id": number,
      "title": string,
      "body": string,
      "isRead": boolean,
      "createdAt": string
    }
  ],
  "nextCursor": string | null
}
```

Unread first, then by most recent.

### PATCH /notifications/:id/read

```
Auth: requireAuth
Response 200: { /* notification with isRead: true */ }
```

Verifies notification belongs to user.

### PATCH /notifications/read-all

```
Auth: requireAuth
Response 200: { "success": true }
```

Marks all unread notifications for this user as read.

---

## Disputes

### GET /disputes

```
Auth: requireAuth
Query: ?status=open&cursor=10&limit=20
Response 200:
{
  "items": [
    {
      "id": number,
      "tripId": number,
      "raisedByUserId": number,
      "reason": "pickup_issue" | "drop_issue" | "trip_quality" | "other",
      "description": string | null,
      "status": "open" | "in_review" | "resolved",
      "resolutionMsg": string | null,
      "resolvedByUserId": number | null,
      "createdAt": string,
      "updatedAt": string
    }
  ],
  "nextCursor": string | null
}
```

Employees see their own. Admins see all.

### POST /disputes

```
Auth: requireAuth
Body: {
  "tripId": number,
  "reason": "pickup_issue" | "drop_issue" | "trip_quality" | "other",
  "description"?: string
}
Response 201: { /* full dispute object */ }
```

### GET /disputes/:id

```
Auth: requireAuth
Response 200: { /* single dispute object */ }
```

### POST /disputes/:id/resolve

```
Auth: requireAuth + requireRole("admin")
Body: { "resolution": string }
Response 200: { /* dispute with status: "resolved" */ }
```

---

## Admin Endpoints

All require `role: "admin"`.

### GET /admin/users

```
Auth: requireAuth + requireRole("admin")
Response 200:
{
  "items": [
    {
      "id": number,
      "employeeId": string,
      "role": "employee" | "driver" | "admin",
      "pushToken": string | null,
      "name": string | null,
      "email": string | null,
      "phone": string | null,
      "department": string | null,
      "driverLicense": string | null,
      "driverAvailable": boolean | null,
      "driverVehicleId": number | null
    }
  ]
}
```

Left-joins employee/driver profiles.

### POST /admin/users

```
Auth: requireAuth + requireRole("admin")
Body: {
  "employeeId": string (1-50),
  "password": string (min 6),
  "role": "employee" | "driver" | "admin",
  "name": string (1-255),
  "email"?: string,
  "phone"?: string,
  "department"?: string,
  "licenseNumber"?: string,
  "vehicleId"?: number
}
Response 201: { /* created user row */ }
```

Auto-creates employee or driver profile.

### GET /admin/users/:id

```
Auth: requireAuth + requireRole("admin")
Response 200: { /* full users table row */ }
```

### PATCH /admin/users/:id

```
Auth: requireAuth + requireRole("admin")
Body: {
  "name"?: string,
  "email"?: string,
  "phone"?: string,
  "department"?: string,
  "role"?: "employee" | "driver" | "admin",
  "licenseNumber"?: string,
  "vehicleId"?: number
}
Response 200: { /* updated user row */ }
```

### DELETE /admin/users/:id

```
Auth: requireAuth + requireRole("admin")
Response 200: { "id": number }
```

Cascades: deletes driver/employee profile, then user.

### GET /admin/vehicles

```
Auth: requireAuth + requireRole("admin")
Response 200:
{
  "items": [
    {
      "id": number,
      "plateNumber": string,
      "model": string | null,
      "capacity": number,
      "color": string | null,
      "isActive": boolean
    }
  ]
}
```

### POST /admin/vehicles

```
Auth: requireAuth + requireRole("admin")
Body: {
  "plateNumber": string (1-50),
  "model"?: string,
  "capacity": number (min 1),
  "color"?: string
}
Response 201: { /* created vehicle row */ }
```

### PUT /admin/vehicles/:id

```
Auth: requireAuth + requireRole("admin")
Body: {
  "plateNumber"?: string,
  "model"?: string,
  "capacity"?: number,
  "color"?: string,
  "isActive"?: boolean
}
Response 200: { /* updated vehicle row */ }
```

### DELETE /admin/vehicles/:id

```
Auth: requireAuth + requireRole("admin")
Response 200: { "id": number }
```

### GET /admin/routes

```
Auth: requireAuth + requireRole("admin")
Response 200:
{
  "items": [
    {
      "id": number,
      "name": string,
      "description": string | null,
      "startPoint": { "x": number, "y": number },
      "endPoint": { "x": number, "y": number },
      "isActive": boolean
    }
  ]
}
```

Lists all routes including inactive.

### POST /admin/routes

```
Auth: requireAuth + requireRole("admin")
Body: {
  "name": string (1-255),
  "description"?: string,
  "startLat": number,
  "startLng": number,
  "endLat": number,
  "endLng": number,
  "isActive"?: boolean
}
Response 201: { /* created route row */ }
```

### PUT /admin/routes/:id

```
Auth: requireAuth + requireRole("admin")
Body: {
  "name"?: string,
  "description"?: string,
  "startLat"?: number,
  "startLng"?: number,
  "endLat"?: number,
  "endLng"?: number,
  "isActive"?: boolean
}
Response 200: { /* updated route row */ }
```

### DELETE /admin/routes/:id

```
Auth: requireAuth + requireRole("admin")
Response 200: { "id": number }
```

Also deletes associated `route_stops`.

### GET /admin/trips

```
Auth: requireAuth + requireRole("admin")
Query: ?status=scheduled&source=roster&dateFrom=...&cursor=...&limit=20
Response 200:
{
  "items": [
    {
      "id": number,
      "routeId": number | null,
      "driverId": number | null,
      "vehicleId": number | null,
      "shiftScheduleId": number | null,
      "scheduledDate": string,
      "status": "scheduled" | "en_route" | ...,
      "type": "login_trip" | "logout_trip",
      "source": "roster" | "adhoc",
      "sourceId": string | null,
      "createdAt": string
    }
  ],
  "nextCursor": string | null
}
```

### PATCH /admin/trips/:id/allocate

```
Auth: requireAuth + requireRole("admin")
Body: { "driverId": number, "vehicleId"?: number }
Response 200: { /* updated trip with driverId/vehicleId set */ }
```

Publishes `new_trip` event to driver's SSE stream.

### GET /admin/adhoc-trips

```
Auth: requireAuth + requireRole("admin")
Query: ?status=requested&dateFrom=...&cursor=...&limit=20
Response 200:
{
  "items": [ /* adhoc trip objects */ ],
  "nextCursor": string | null
}
```

### PATCH /admin/adhoc-trips/:id/allocate

```
Auth: requireAuth + requireRole("admin")
Body: { "driverId": number }
Response 200: { /* created trips row linked to adhoc trip */ }
```

Creates a `trips` row with `source: "adhoc"`, updates adhoc trip to `allocated`.

### POST /admin/cron/generate-trips

```
Auth: requireAuth + requireRole("admin")
Body: { "date"?: string }  // defaults to tomorrow
Response 200: { "created": number, "skipped": number }
```

Runs trip generation for the given date. Groups active roster bookings by `shiftScheduleId + routeId`. For each group:

1. Fetches the shift schedule's `startTime` and `endTime`
2. Fetches the office stop for the route (`route_stops` where `isOffice = true`)
3. Fetches the vehicle capacity from the active vehicle
4. Runs a **route optimization algorithm** that:
   - Clusters employee pickup/dropoff stops by geographic proximity (seed farthest-from-office, grow by nearest-to-seed)
   - Orders stops within each cluster using brute-force TSP (max 4! = 24 permutations)
   - Estimates travel times using **speed profiles** (peak 8-11AM / 4-7PM = 20 km/h, off-peak = 35 km/h, night = 45 km/h)
5. Creates **two trips per cluster**:
   - **Login trip** (`type: "login_trip"`): pickup stops → office in forward sequence
   - **Logout trip** (`type: "logout_trip"`): office → dropoff stops in reverse sequence
6. Populates `trip_passengers` with `loginTime`/`logoutTime` from shift schedule
7. Populates `trip_stops` with `scheduledArrival` times computed from the route optimizer

---

## SSE (Server-Sent Events) — Real-time

### GET /sse/trips/:id/stream

```
Auth: requireAuth (employee must be passenger, driver must be assigned)
Response: SSE stream (text/event-stream)
```

Events:
- `message` — `{ "type": "status_change", "tripId": number, "status": string, "timestamp": string }`
- `message` — `{ "type": "location_update", "tripId": number, "driverId": number, "lat": number, "lng": number, "timestamp": string }`
- `heartbeat` — `ping` (every 30s)

### GET /sse/drivers/trips/stream

```
Auth: requireAuth (must be driver)
Response: SSE stream
```

Events:
- `message` — `{ "type": "new_trip", "tripId": number, "data": { ...trip } }`
- `message` — `{ "type": "trip_update", "tripId": number, "data": { ... } }`
- `heartbeat` — `ping` (every 30s)

**SDK usage (EventSource):**
```ts
const es = new EventSource("/sse/trips/1/stream", { withCredentials: true });
es.addEventListener("message", (e) => {
  const data = JSON.parse(e.data);
  if (data.type === "status_change") { /* update trip status */ }
  if (data.type === "location_update") { /* update map marker */ }
});
es.addEventListener("heartbeat", () => {});
```

---

## WebSocket Protocol — `/ws`

### Connect

```js
const ws = new WebSocket("ws://localhost:3000/ws");
```

On open, receives: `{ "type": "connected" }`

### 1. Authenticate

```json
// Send: { "type": "auth", "token": "session-token-string" }
// Receive: { "type": "authenticated", "userId": 1 }
```

On failure: `{ "type": "error", "message": "Invalid token" }` + connection closed.

### 2. Subscribe to trip updates (employee)

```json
// Send: { "type": "subscribe_trip", "tripId": 1 }
// Receive: { "type": "subscribed", "tripId": 1 }
```

Now receives location updates and status changes:
```json
{ "type": "location_update", "tripId": 1, "driverId": 1, "lat": 28.5, "lng": 77.1, "timestamp": "..." }
{ "type": "status_change", "tripId": 1, "status": "en_route", "timestamp": "..." }
```

### 3. Send location ping (driver)

```json
// Send: { "type": "location", "tripId": 1, "lat": 28.5, "lng": 77.1 }
// Receive: { "type": "location_ack", "tripId": 1 }
```

Location pings are stored in `locationPings` table and broadcast to all trip subscribers (WebSocket + SSE).

### Cleanup

On connection close, automatically unsubscribes from all trip subscriptions.

---

## Trip Generation & Lifecycle

### How trips are created

1. **Cron job** runs every 60 minutes, calls `generateTripsForDate(tomorrow)`
2. Queries `roster_bookings` matching the day-of-week bitmask, not cancelled, effective for the target date
3. Groups bookings by `shiftScheduleId + routeId`
4. For each group:
   - Fetches vehicle capacity from `vehicles` table
   - Fetches office stop (marked `isOffice: true` on `route_stops`)
   - Fetches stop coordinates for all pickup/dropoff stops
   - Clusters employees using the **route optimizer** (seed farthest from office, grow by proximity, brute-force TSP for internal ordering)
   - For each cluster, creates **login trip** (pickup → office) and **logout trip** (office → dropoff)
   - Populates `trip_passengers` with `loginTime` (shift start) / `logoutTime` (shift end)
   - Populates `trip_stops` with `scheduledArrival` computed from travel time estimates

### Trip status lifecycle

```
scheduled → en_route → at_pickup → ongoing → completed
    |          |           |          |
    +--- cancelled <-------+----------+
```

Roster trips start as `scheduled`. Adhoc trips start as `requested` (separate lifecycle: `requested → allocated → completed → cancelled`).

### Driver actions during a trip

| Step | Action | Endpoint |
|---|---|---|
| 1 | Mark en route | `PATCH /driver/trips/:id/status` → `en_route` |
| 2 | Arrive at stop | Driver marks `tripStops.actualArrival` (future: auto-detect via geofence) |
| 3 | Board passenger | `POST /driver/trips/:id/passengers/:employeeId/board` |
| 4 | Mark at pickup | `PATCH /driver/trips/:id/status` → `at_pickup` |
| 5 | Start trip | `PATCH /driver/trips/:id/status` → `ongoing` |
| 6 | Drop passenger | `POST /driver/trips/:id/passengers/:employeeId/drop` |
| 7 | Complete trip | `PATCH /driver/trips/:id/status` → `completed` |

---

## Common Types

```ts
// Trip stop (per-trip stop tracking)
type TripStop = {
  id: number
  stopId: number | null
  sequence: number
  type: "pickup" | "dropoff" | "office"
  scheduledArrival: string | null   // HH:MM
  actualArrival: string | null      // ISO timestamp
}

// Trip passenger
type TripPassenger = {
  employeeId: number
  stopId: number | null
  loginTime: string | null    // HH:MM, from shift
  logoutTime: string | null   // HH:MM, from shift
  boardedAt: string | null    // ISO timestamp, actual
  droppedAt: string | null    // ISO timestamp, actual
}

// Location point (PostGIS geometry)
type Point = {
  x: number  // longitude
  y: number  // latitude
}
```

---

## Health

### GET /health

```
Auth: None
Response 200: { "status": "ok" }
```

---

## Recommended Mobile API Client Structure

```ts
// api/client.ts
class ApiClient {
  baseUrl: string;
  token: string | null;

  async request(method, path, body?, query?) { /* fetch with Cookie header */ }

  // Auth
  async login(employeeId, password): Promise<{ token, role }>
  async testLogin(employeeId): Promise<{ token, role }>
  async logout(): Promise<void>
  async signup(data): Promise<{ userId }>

  // User
  async getProfile(): Promise<User>
  async updateProfile(data): Promise<void>

  // Trips (employee)
  async listTrips(filters?): Promise<{ items: Trip[], nextCursor? }>
  async getTrip(id): Promise<TripDetail>  // includes passengers + tripStops
  async cancelTrip(id, reason?): Promise<Trip>
  async rateTrip(id, score, comment?): Promise<Rating>

  // Trips (driver)
  async getDriverTrips(filters?): Promise<{ items: DriverTrip[], nextCursor? }>
  async getDriverTrip(id): Promise<TripDetail>
  async updateTripStatus(id, status): Promise<Trip>
  async boardPassenger(tripId, employeeId): Promise<{ boardedAt }>
  async dropPassenger(tripId, employeeId): Promise<{ droppedAt }>
  async toggleAvailability(available): Promise<Driver>
  async sendLocation(tripId, lat, lng): Promise<void>

  // Routes & Stops
  async listRoutes(): Promise<{ data, pagination }>
  async getRouteStops(id): Promise<RouteStop[]>
  async getNearbyStops(lat, lng, limit?): Promise<NearbyStop[]>

  // Roster Bookings
  async listRosterBookings(): Promise<{ items }>
  async createRosterBooking(data): Promise<RosterBooking>
  async deleteRosterBooking(id): Promise<RosterBooking>

  // Ad-hoc trips
  async listAdhocTrips(filters?): Promise<{ items, nextCursor }>
  async createAdhocTrip(data): Promise<AdhocTripWithOtp>
  async getAdhocTrip(id): Promise<AdhocTrip>
  async cancelAdhocTrip(id): Promise<AdhocTrip>
  async verifyOtp(id, type, otp): Promise<void>

  // Saved locations
  async listSavedLocations(): Promise<{ items }>
  async createSavedLocation(data): Promise<SavedLocation>
  async updateSavedLocation(id, data): Promise<SavedLocation>
  async deleteSavedLocation(id): Promise<void>

  // Shifts
  async listShifts(): Promise<{ items }>

  // Disputes
  async listDisputes(filters?): Promise<{ items, nextCursor }>
  async createDispute(data): Promise<Dispute>
  async getDispute(id): Promise<Dispute>

  // Notifications
  async listNotifications(cursor?, limit?): Promise<{ items, nextCursor }>
  async markNotificationRead(id): Promise<Notification>
  async markAllNotificationsRead(): Promise<void>

  // SSE / WebSocket
  subscribeTripSSE(tripId): EventSource
  subscribeDriverSSE(): EventSource
  connectWebSocket(): WebSocket
}
```
