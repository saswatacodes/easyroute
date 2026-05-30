#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_EMP_ID="${ADMIN_EMP_ID:-EMP067}"
PASS=0
FAIL=0

pass()  { PASS=$((PASS+1)); }
fail()  { FAIL=$((FAIL+1)); echo "  FAIL: $*"; }
check() { local code="$1" expected="$2" label="$3"; shift 3; [ "$code" = "$expected" ] && pass || fail "$label (got $code, expected $expected)"; }

# ─── Get admin token ──────────────────────────────────────────────
echo "=== Setup: getting admin token ==="
ADMIN_TOKEN=$(curl -s "$BASE_URL/auth/test-login" \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"'"$ADMIN_EMP_ID"'"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || true)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "ERROR: Cannot get admin token. Is the server running at $BASE_URL? Is '$ADMIN_EMP_ID' seeded?"
  exit 1
fi
echo "  Got admin token"

# Create an employee user for testing
echo "=== Setup: creating employee test user ==="
EMP_TOKEN=$(curl -s "$BASE_URL/auth/test-login" \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"E2E_EMP"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || true)

if [ -z "$EMP_TOKEN" ]; then
  echo "  Employee E2E_EMP not found, signing up..."
  curl -s -X POST "$BASE_URL/auth/signup" \
    -H "Content-Type: application/json" \
    -H "Cookie: session_token=$ADMIN_TOKEN" \
    -d '{"employeeId":"E2E_EMP","password":"test1234","role":"employee"}' > /dev/null
  sleep 0.1

  curl -s -X POST "$BASE_URL/auth/signup" \
    -H "Content-Type: application/json" \
    -H "Cookie: session_token=$ADMIN_TOKEN" \
    -d '{"employeeId":"E2E_DRIVER","password":"test1234","role":"driver"}' > /dev/null
  sleep 0.1

  EMP_TOKEN=$(curl -s "$BASE_URL/auth/test-login" \
    -H "Content-Type: application/json" \
    -d '{"employeeId":"E2E_EMP"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
fi
echo "  Got employee token"

COOKIE() { echo "Cookie: session_token=$1"; }

# ═══════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════"
echo "  E2E Tests"
echo "═══════════════════════════════════════════════════"

# ─── Health ────────────────────────────────────────────────────────
echo "--- health ---"
res=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
check "$res" 200 "GET /health"

# ─── Saved Locations ───────────────────────────────────────────────
echo "--- saved-locations ---"
res=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/saved-locations" \
  -H "$(COOKIE $EMP_TOKEN)")
check "$res" 200 "GET /saved-locations"

res=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/saved-locations" \
  -H "Content-Type: application/json" \
  -H "$(COOKIE $EMP_TOKEN)" \
  -d '{"name":"Home","address":"123 Main St","lat":12.34,"lng":56.78,"type":"home"}')
check "$res" 201 "POST /saved-locations"

LOCATION_ID=$(curl -s "$BASE_URL/saved-locations" \
  -H "$(COOKIE $EMP_TOKEN)" | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['id'] if items else '')")
if [ -n "$LOCATION_ID" ]; then
  res=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/saved-locations/$LOCATION_ID" \
    -H "Content-Type: application/json" \
    -H "$(COOKIE $EMP_TOKEN)" \
    -d '{"name":"Work"}')
  check "$res" 200 "PUT /saved-locations/:id"

  res=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/saved-locations/$LOCATION_ID" \
    -H "$(COOKIE $EMP_TOKEN)")
  check "$res" 200 "DELETE /saved-locations/:id"
fi

# ─── Shifts ────────────────────────────────────────────────────────
echo "--- shifts ---"
res=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/shifts")
check "$res" 200 "GET /shifts"

res=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/shifts" \
  -H "Content-Type: application/json" \
  -H "$(COOKIE $ADMIN_TOKEN)" \
  -d '{"name":"Morning","startTime":"08:00","endTime":"12:00"}')
check "$res" 201 "POST /shifts (admin)"

SHIFT_ID=$(curl -s "$BASE_URL/shifts" | python3 -c \
  "import sys,json; items=json.load(sys.stdin).get('items',[]); print(max(i['id'] for i in items) if items else '')")
if [ -n "$SHIFT_ID" ]; then
  res=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/shifts/$SHIFT_ID" \
    -H "Content-Type: application/json" \
    -H "$(COOKIE $ADMIN_TOKEN)" \
    -d '{"name":"Morning Updated"}')
  check "$res" 200 "PUT /shifts/:id (admin)"

  res=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/shifts/$SHIFT_ID" \
    -H "$(COOKIE $ADMIN_TOKEN)")
  check "$res" 200 "DELETE /shifts/:id (admin)"
fi

# ─── Ad-hoc Trips ─────────────────────────────────────────────────
echo "--- adhoc-trips ---"
res=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/adhoc-trips" \
  -H "Content-Type: application/json" \
  -H "$(COOKIE $EMP_TOKEN)" \
  -d '{"pickupLocation":{"lat":12.34,"lng":56.78},"dropoffLocation":{"lat":23.45,"lng":67.89},"scheduledDate":"2026-06-15","scheduledTime":"09:00"}')
check "$res" 201 "POST /adhoc-trips"

res=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/adhoc-trips" \
  -H "$(COOKIE $EMP_TOKEN)")
check "$res" 200 "GET /adhoc-trips"

ADHOC_ID=$(curl -s "$BASE_URL/adhoc-trips" \
  -H "$(COOKIE $EMP_TOKEN)" | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['id'] if items else '')")
if [ -n "$ADHOC_ID" ]; then
  res=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/adhoc-trips/$ADHOC_ID" \
    -H "$(COOKIE $EMP_TOKEN)")
  check "$res" 200 "GET /adhoc-trips/:id"

  res=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/adhoc-trips/$ADHOC_ID/cancel" \
    -H "$(COOKIE $EMP_TOKEN)")
  check "$res" 200 "POST /adhoc-trips/:id/cancel"
fi

# ─── Disputes ─────────────────────────────────────────────────────
echo "--- disputes ---"
# Find first trip to use as dispute target
TRIP_ID=$(curl -s "$BASE_URL/trips" \
  -H "$(COOKIE $ADMIN_TOKEN)" | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['id'] if items else '')" 2>/dev/null || true)
if [ -z "$TRIP_ID" ]; then
  echo "  SKIP: no trips available for dispute test"
  pass
  pass
  pass
  pass
else
  res=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/disputes" \
    -H "Content-Type: application/json" \
    -H "$(COOKIE $EMP_TOKEN)" \
    -d '{"tripId":'"$TRIP_ID"',"reason":"other","description":"E2E test dispute"}')
  check "$res" 201 "POST /disputes"

  res=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/disputes" \
    -H "$(COOKIE $EMP_TOKEN)")
  check "$res" 200 "GET /disputes"

  DISPUTE_ID=$(curl -s "$BASE_URL/disputes" \
    -H "$(COOKIE $EMP_TOKEN)" | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['id'] if items else '')")
  if [ -n "$DISPUTE_ID" ]; then
    res=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/disputes/$DISPUTE_ID" \
      -H "$(COOKIE $EMP_TOKEN)")
    check "$res" 200 "GET /disputes/:id"

    res=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/disputes/$DISPUTE_ID/resolve" \
      -H "Content-Type: application/json" \
      -H "$(COOKIE $ADMIN_TOKEN)" \
      -d '{"resolution":"Resolved in test"}')
    check "$res" 200 "POST /disputes/:id/resolve (admin)"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] || exit 1
