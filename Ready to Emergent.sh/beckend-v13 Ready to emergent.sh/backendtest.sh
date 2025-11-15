#!/bin/bash

# ==============================================================================
# Skrip Tes Validasi Backend TrafficBuster (v5 - Default Force Login ke Yes)
#
# Dibuat oleh: AI Anda
# Tujuan: Mengotomatiskan FASE 1, 2, 3 (Tugas 51-55) + FASE 4 (Tugas 59)
# PERUBAHAN (Tugas 64):
# - Prompt "force logout" sekarang default-nya 'Yes' (cukup tekan Enter).
# - Hanya jika Anda mengetik 'n' atau 'N' tes akan berjalan standar.
# ==============================================================================

# --- Konfigurasi ---
BASE_URL="https://localhost:5252/api/v1"
SET_T="test_targets"
SET_P="test_proxies"
SET_PF="test_platforms"
SET_S="test_settings"

# --- Helper Warna ---
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m" 

echo_green() { echo -e "${GREEN}$1${NC}"; }
echo_red() { echo -e "${RED}$1${NC}"; }
echo_yellow() { echo -e "${YELLOW}$1${NC}"; }

# --- Helper Global ---
PASSED_COUNT=0
FAILED_COUNT=0
TOKEN_PREMIUM=""
TOKEN_FREE=""
FORCE_PAYLOAD="" # Akan diset berdasarkan prompt

# ... (Fungsi _check tidak berubah) ...
_check() {
    TEST_NAME=$1
    EXPECTED=$2
    ACTUAL=$3

    if [ "$EXPECTED" == "$ACTUAL" ]; then
        echo_green "  [LULUS] $TEST_NAME"
        ((PASSED_COUNT++))
    else
        echo_red "  [GAGAL] $TEST_NAME"
        echo_red "          Ekspektasi: $EXPECTED"
        echo_red "          Diterima  : $ACTUAL"
        ((FAILED_COUNT++))
    fi
}

# DIPERBARUI (Tugas 63/64)
fn_test_login() {
    local USER=$1
    local PASS=$2
    echo -n "Tes Login '$USER'..."
    
    # Payload akan berisi ',"force":true' jika FORCE_PAYLOAD diset
    RESPONSE=$(curl -s -k -X POST "$BASE_URL/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USER\",\"password\":\"$PASS\"$FORCE_PAYLOAD}") 
    
    TOKEN=$(echo "$RESPONSE" | jq -r .token)
    LICENSE=$(echo "$RESPONSE" | jq -r .features.license)

    if [ "$USER" == "premium" ]; then
        TOKEN_PREMIUM=$TOKEN
        _check "Lisensi Premium" "Premium" "$LICENSE"
    else
        TOKEN_FREE=$TOKEN
        _check "Lisensi Free" "Free" "$LICENSE"
    fi
}

# ... (Fungsi fn_test_success, fn_test_start_fail, fn_test_finish_fail ...
# ... tidak berubah. Saya sertakan lengkap agar komprehensif) ...

fn_test_success() {
    local TOKEN=$1
    local TYPE=$2
    local SET_NAME=$3
    local ITEMS_JSON=$4
    local TOTAL_ITEMS=$5

    echo -n "Tes Upload Sukses: $TYPE ($USER)..."
    
    START_RESP=$(curl -s -k -X POST "$BASE_URL/data/upload/start" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -d "{\"datasetType\":\"$TYPE\",\"setName\":\"$SET_NAME\",\"mode\":\"replace\",\"expectChunks\":1,\"totalItems\":$TOTAL_ITEMS}")
    
    UPLOAD_ID=$(echo "$START_RESP" | jq -r .uploadId)
    if [ "$UPLOAD_ID" == "null" ]; then
        _check "Upload $TYPE (Start)" "Berhasil Start" "Gagal Start: $(echo $START_RESP | jq -r .message)"
        return
    fi
    
    CHUNK_RESP=$(curl -s -k -X POST "$BASE_URL/data/upload/chunk" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -d "{\"uploadId\":\"$UPLOAD_ID\",\"chunkIndex\":0,\"items\":$ITEMS_JSON}")
    
    FINISH_RESP=$(curl -s -k -X POST "$BASE_URL/data/upload/finish" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -d "{\"uploadId\":\"$UPLOAD_ID\"}")
    
    SUCCESS=$(echo "$FINISH_RESP" | jq -r .success)
    _check "Upload $TYPE (Finish)" "true" "$SUCCESS"
}

fn_test_start_fail() {
    local TOKEN=$1
    local TYPE=$2
    local EXPECTED_CODE=$3
    
    echo -n "Tes Gagal (Start) $TYPE ($USER)..."

    START_RESP=$(curl -s -k -X POST "$BASE_URL/data/upload/start" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -d "{\"datasetType\":\"$TYPE\",\"setName\":\"test_${TYPE}_gagal\",\"mode\":\"replace\",\"expectChunks\":1,\"totalItems\":1}")

    SUCCESS=$(echo "$START_RESP" | jq -r .success)
    CODE=$(echo "$START_RESP" | jq -r .code)

    if [ "$SUCCESS" == "false" ] && [ "$CODE" == "$EXPECTED_CODE" ]; then
        _check "Blokir Lisensi $TYPE" "$EXPECTED_CODE" "$CODE"
    else
        _check "Blokir Lisensi $TYPE" "$EXPECTED_CODE" "$(echo $START_RESP | jq -r .message)"
    fi
}

fn_test_finish_fail() {
    local TOKEN=$1
    local TYPE=$2
    local SET_NAME=$3
    local ITEMS_JSON=$4
    local TOTAL_ITEMS=$5
    local EXPECTED_CODE=$6

    echo -n "Tes Gagal (Finish) $TYPE ($USER)..."
    
    START_RESP=$(curl -s -k -X POST "$BASE_URL/data/upload/start" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -d "{\"datasetType\":\"$TYPE\",\"setName\":\"$SET_NAME\",\"mode\":\"replace\",\"expectChunks\":1,\"totalItems\":$TOTAL_ITEMS}")
    
    UPLOAD_ID=$(echo "$START_RESP" | jq -r .uploadId)
    if [ "$UPLOAD_ID" == "null" ]; then
        _check "Batas Lisensi $TYPE (Start)" "Berhasil Start" "Gagal Start: $(echo $START_RESP | jq -r .message)"
        return
    fi
    
    CHUNK_RESP=$(curl -s -k -X POST "$BASE_URL/data/upload/chunk" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -d "{\"uploadId\":\"$UPLOAD_ID\",\"chunkIndex\":0,\"items\":$ITEMS_JSON}")
    
    FINISH_RESP=$(curl -s -k -X POST "$BASE_URL/data/upload/finish" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -d "{\"uploadId\":\"$UPLOAD_ID\"}")
    
    SUCCESS=$(echo "$FINISH_RESP" | jq -r .success)
    CODE=$(echo "$FINISH_RESP" | jq -r .code)

    if [ "$SUCCESS" == "false" ] && [ "$CODE" == "$EXPECTED_CODE" ]; then
        _check "Batas Lisensi $TYPE" "$EXPECTED_CODE" "$CODE"
    else
        _check "Batas Lisensi $TYPE" "$EXPECTED_CODE" "Berhasil (Tidak Diharapkan) atau Error: $CODE"
    fi
}

fn_test_run_start() {
    echo -n "Tes /run/start (FASE 3)..."
    
    RESPONSE=$(curl -s -k -X POST "$BASE_URL/run/start" \
      -H "Authorization: Bearer $TOKEN_PREMIUM" \
      -H "Content-Type: application/json" \
      -d "{\"targetSet\":\"$SET_T\",\"proxySet\":\"$SET_P\",\"platformSet\":\"$SET_PF\",\"settingsProfile\":\"$SET_S\"}")
      
    SUCCESS=$(echo "$RESPONSE" | jq -r .success)
    JOB_ID=$(echo "$RESPONSE" | jq -r .jobId)

    if [ "$SUCCESS" == "true" ] && [ "$JOB_ID" != "null" ]; then
        _check "Job Start (Tugas 55)" "true" "$SUCCESS"
        curl -s -k -X POST "$BASE_URL/run/stop" -H "Authorization: Bearer $TOKEN_PREMIUM" -H "Content-Type: application/json" -d "{\"jobId\":\"$JOB_ID\"}" > /dev/null
    else
        _check "Job Start (Tugas 55)" "true" "false: $(echo $RESPONSE | jq -r .message)"
    fi
}

# ==============================================================================
# --- EKSEKUSI TES ---
# ==============================================================================

echo_yellow "Memulai Tes Validasi Backend (v5 - Tugas 64)..."
echo "Target: $BASE_URL"

# --- BARU (Tugas 64): Opsi Force Logout (Default Yes) ---
read -p "❓ Apakah Anda ingin memaksa logout sesi aktif (Y/n)? " -n 1 -r
echo # Pindah baris
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "  OK. Melanjutkan tes standar (tanpa force)."
    FORCE_PAYLOAD=""
else
    echo_yellow "  OK. Sesi login akan dipaksa (force login)."
    FORCE_PAYLOAD=',"force":true'
fi
echo "------------------------------------------------------"

# --- FASE 1: Login & Targets ---
echo_yellow "FASE 1: Menguji Login & Dataset 'targets'"
USER="premium"; fn_test_login "$USER" "123"
USER="free"; fn_test_login "$USER" "123"

USER="premium"; fn_test_success "$TOKEN_PREMIUM" "targets" "$SET_T" \
  '[{"url":"t1.com"},{"url":"t2.com"},{"url":"t3.com"}]' 3

USER="free"; fn_test_finish_fail "$TOKEN_FREE" "targets" "test_targets_gagal" \
  '[{"url":"t1.com"},{"url":"t2.com"}]' 2 "LIMIT_MAX_TARGETS"

echo "------------------------------------------------------"

# --- FASE 2: Proxies, Platforms, Settings ---
echo_yellow "FASE 2: Menguji 'proxies', 'platforms', 'settings'"

# Tes Proxies
USER="premium"; fn_test_success "$TOKEN_PREMIUM" "proxies" "$SET_P" \
  '[{"host":"1.1.1.1","port":80},{"host":"2.2.2.2","port":8080}]' 2
USER="free"; fn_test_start_fail "$TOKEN_FREE" "proxies" "LICENSE_FEATURE_DISABLED"

# Tes Platforms (Sesuai Tugas 59/61)
USER="premium"; fn_test_success "$TOKEN_PREMIUM" "platforms" "$SET_PF" \
  '[{"os":"Windows","browser":"Chrome"}]' 1
  
USER="free"; fn_test_success "$TOKEN_FREE" "platforms" "test_pf_free_sukses" \
  '[{"os":"Windows","browser":"Chrome"},{"os":"Linux","browser":"Firefox"}]' 2 

USER="free"; fn_test_finish_fail "$TOKEN_FREE" "platforms" "test_pf_free_gagal" \
  '[{"os":"1","b":"1"},{"os":"2","b":"2"},{"os":"3","b":"3"},{"os":"4","b":"4"}]' 4 "LIMIT_MAX_PLATFORMS" 

# Tes Settings
USER="premium"; fn_test_success "$TOKEN_PREMIUM" "settings" "$SET_S" \
  '[{"instanceCount":10,"humanSurfing":true}]' 1
USER="free"; fn_test_start_fail "$TOKEN_FREE" "settings" "LICENSE_FEATURE_DISABLED"

echo "------------------------------------------------------"

# --- FASE 3: Job Start ---
echo_yellow "FASE 3: Menguji Endpoint /run/start"
fn_test_run_start

echo "------------------------------------------------------"

# --- HASIL ---
echo_yellow "Ringkasan Tes Selesai:"
echo_green "  LULUS: $PASSED_COUNT"
echo_red "  GAGAL: $FAILED_COUNT"
echo "------------------------------------------------------"

if [ $FAILED_COUNT -ne 0 ]; then
    echo_red "BEBERAPA TES GAGAL. Harap periksa log di atas."
    exit 1
else
    echo_green "SEMUA TES (FASE 1, 2, 3) LULUS. Backend tervalidasi."
    exit 0
fi
