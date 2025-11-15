#!/bin/bash

# PROXY TEST SCRIPT - TRAFFICBUSTER
# Updated: 2025-11-14 02:53:22 UTC
# Credit: smahud
# 
# CHANGES:
# - Timeout changed from 15000ms to 1000ms (matching slider default)

echo "========================================"
echo "PROXY TEST - TRAFFICBUSTER"
echo "========================================"
echo ""

# Backend host
BACKEND_HOST="localhost:5252"

# Proxy credentials (na.proxys5.net)
PROXY_HOST="na.proxys5.net"
PROXY_PORT="6200"
PROXY_USER="22956030-zone-custom-region-US-sessid-EAMtXZl1-sessTime-5"
PROXY_PASS="HK9mVWxq"

# Test timeout (MATCHING SLIDER DEFAULT)
TIMEOUT=1000  # 1 second

# Login credentials
USERNAME="premium"
PASSWORD="123"

echo "[1/3] Logging in..."

# Login and get token
TOKEN=$(curl -s -k -X POST "https://${BACKEND_HOST}/api/v1/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}" \
  | jq -r '.token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Login successful (token length: ${#TOKEN})"
echo ""

echo "[2/3] Testing proxy: ${PROXY_HOST}:${PROXY_PORT}"
echo "      Timeout: ${TIMEOUT}ms"
echo ""

# Test proxy
RESULT=$(curl -s -k -X POST "https://${BACKEND_HOST}/api/v1/data/proxy/test" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"host\": \"${PROXY_HOST}\",
    \"port\": ${PROXY_PORT},
    \"username\": \"${PROXY_USER}\",
    \"password\": \"${PROXY_PASS}\",
    \"timeout\": ${TIMEOUT}
  }")

echo "[3/3] Result:"
echo "$RESULT" | jq '.'
echo ""

# Parse result
SUCCESS=$(echo "$RESULT" | jq -r '.success')
SPEED=$(echo "$RESULT" | jq -r '.speed')
PROTOCOL=$(echo "$RESULT" | jq -r '.protocol')
COUNTRY=$(echo "$RESULT" | jq -r '.country')
ERROR=$(echo "$RESULT" | jq -r '.error')

if [ "$SUCCESS" == "true" ]; then
  echo "========================================"
  echo "✅ PROXY TEST PASSED"
  echo "========================================"
  echo "Speed:    ${SPEED}ms"
  echo "Protocol: ${PROTOCOL}"
  echo "Country:  ${COUNTRY}"
  echo "========================================"
else
  echo "========================================"
  echo "❌ PROXY TEST FAILED"
  echo "========================================"
  echo "Error: ${ERROR}"
  echo "========================================"
  exit 1
fi
