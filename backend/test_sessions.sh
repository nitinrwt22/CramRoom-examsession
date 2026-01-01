#!/bin/bash

BASE_URL="http://localhost:5001"
echo "Testing Session Routes against $BASE_URL..."

# 1. Register Host
echo -e "\n1. Registering Host..."
HOST_EMAIL="host_$(date +%s)@test.com"
curl -v -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Host User\",\"email\":\"$HOST_EMAIL\",\"password\":\"password123\"}" > host_reg.json
cat host_reg.json

# 2. Login Host
echo -e "\n\n2. Logging in Host..."
HOST_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$HOST_EMAIL\",\"password\":\"password123\"}" | jq -r '.token')
echo "Host Token: ${HOST_TOKEN:0:10}..."

# 3. Create Session
echo -e "\n3. Creating Session..."
SESSION_RESP=$(curl -s -X POST "$BASE_URL/session/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HOST_TOKEN" \
  -d "{\"subject\":\"Math 101\",\"examDate\":\"2026-12-31T10:00:00Z\",\"expiryTime\":\"2026-12-31T12:00:00Z\"}")
echo $SESSION_RESP
SESSION_ID=$(echo $SESSION_RESP | jq -r '.id')
echo "Session ID: $SESSION_ID"

# 4. Register Participant
echo -e "\n\n4. Registering Participant..."
PARTICIPANT_EMAIL="student_$(date +%s)@test.com"
curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Student Member\",\"email\":\"$PARTICIPANT_EMAIL\",\"password\":\"password123\"}" > part_reg.json

# 5. Login Participant
echo -e "\n\n5. Logging in Participant..."
PARTICIPANT_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PARTICIPANT_EMAIL\",\"password\":\"password123\"}" | jq -r '.token')
echo "Participant Token: ${PARTICIPANT_TOKEN:0:10}..."

# 6. Join Session
echo -e "\n\n6. Joining Session..."
curl -s -X POST "$BASE_URL/session/join" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PARTICIPANT_TOKEN" \
  -d "{\"sessionId\":$SESSION_ID}"
  
# 7. Leave Session
echo -e "\n\n7. Leaving Session..."
curl -s -X POST "$BASE_URL/session/leave" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PARTICIPANT_TOKEN" \
  -d "{\"sessionId\":$SESSION_ID}"

echo -e "\n\nDone."
