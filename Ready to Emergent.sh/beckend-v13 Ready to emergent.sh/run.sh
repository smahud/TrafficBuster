#!/bin/bash

# ==========================================================
# Skrip Kontrol Server TrafficBuster
# (run.sh)
#
# Membutuhkan:
# 1. node (untuk menjalankan server.js)
# 2. jq (untuk membaca file .pid JSON)
#
# Pastikan Anda sudah menjalankan:
#   apt-get install jq
#   chmod +x run.sh
# ==========================================================

# --- Konfigurasi ---
PID_FILE="server.pid"
SERVER_SCRIPT="server.js"
LOG_FILE="logs/server.log" # Arahkan log ke file

# --- Warna ---
C_RESET='\033[0m'
C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_CYAN='\033[0;36m'

# --- Variabel Global ---
PID=""
PORT=""

# --- Fungsi ---

# Fungsi untuk membaca file PID
read_pid_file() {
    if [ -f "$PID_FILE" ]; then
        # Gunakan JQ untuk parsing JSON yang aman
        PID=$(jq -r .pid "$PID_FILE" 2>/dev/null)
        PORT=$(jq -r .port "$PID_FILE" 2>/dev/null)
        
        if [ -z "$PID" ] || [ "$PID" == "null" ]; then
            PID=""
            PORT=""
        fi
    else
        PID=""
        PORT=""
    fi
}

# Fungsi untuk mengecek apakah server sedang berjalan
is_running() {
    read_pid_file
    if [ -z "$PID" ]; then
        return 1 # Tidak berjalan (tidak ada PID file)
    fi
    
    # Cek apakah proses dengan PID tersebut ada
    if ps -p "$PID" > /dev/null; then
        return 0 # Berjalan
    else
        # Proses tidak ada, tapi file PID ada (stale)
        echo -e "${C_YELLOW}[WARN] Menemukan file PID lama ($PID_FILE) tapi proses (PID: $PID) tidak ditemukan.${C_RESET}"
        echo -e "${C_YELLOW}[INFO] Membersihkan file PID lama...${C_RESET}"
        rm -f "$PID_FILE"
        PID=""
        PORT=""
        return 1 # Tidak berjalan
    fi
}

# Fungsi untuk START server
do_start() {
    if is_running; then
        echo -e "${C_RED}[GAGAL] Server sudah berjalan di Port ${PORT} (PID: ${PID}).${C_RESET}"
        return
    fi
    
    # Cek dependensi JQ
    if ! command -v jq &> /dev/null; then
        echo -e "${C_RED}[ERROR] Dependensi 'jq' tidak ditemukan.${C_RESET}"
        echo -e "Silakan install dengan: ${C_CYAN}sudo apt-get install jq${C_RESET}"
        return
    fi
    
    # Cek dependensi Node
    if ! command -v node &> /dev/null; then
        echo -e "${C_RED}[ERROR] Dependensi 'node' tidak ditemukan.${C_RESET}"
        return
    fi
    
    echo -e "${C_CYAN}[INFO] Memulai ${SERVER_SCRIPT}...${C_RESET}"
    
    # Buat direktori log jika belum ada
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Jalankan server di background (nohup), dan arahkan log ke file
    nohup node "$SERVER_SCRIPT" > "$LOG_FILE" 2>&1 &
    
    echo -e "${C_YELLOW}[INFO] Menunggu server membuat file PID...${C_RESET}"
    sleep 2 # Beri waktu 2 detik untuk server start dan menulis file PID
    
    if is_running; then
        echo -e "${C_GREEN}[LULUS] Server berhasil dimulai.${C_RESET}"
        echo -e "         ${C_GREEN}PID: ${PID}, Port: ${PORT}${C_RESET}"
        echo -e "         ${C_GREEN}Log diarahkan ke: ${LOG_FILE}${C_RESET}"
    else
        echo -e "${C_RED}[GAGAL] Server gagal dimulai.${C_RESET}"
        echo -e "         ${C_RED}Silakan cek log untuk error: ${LOG_FILE}${C_RESET}"
    fi
}

# Fungsi untuk STOP server
do_stop() {
    if ! is_running; then
        echo -e "${C_YELLOW}[INFO] Server tidak sedang berjalan.${C_RESET}"
        return
    fi
    
    echo -e "${C_CYAN}[INFO] Menghentikan server (PID: ${PID})...${C_RESET}"
    
    # Kirim sinyal TERM (graceful shutdown) ke server
    # server.js akan menangkap ini dan menghapus file PID
    kill "$PID"
    
    # Tunggu prosesnya benar-benar berhenti
    TIMEOUT=10
    COUNT=0
    while ps -p "$PID" > /dev/null; do
        if [ "$COUNT" -ge "$TIMEOUT" ]; then
            echo -e "${C_RED}[WARN] Proses (PID: ${PID}) gagal berhenti, melakukan kill paksa (-9)...${C_RESET}"
            kill -9 "$PID"
            sleep 1
            break
        fi
        printf "."
        sleep 0.5
        COUNT=$((COUNT + 1))
    done
    
    echo -e "\n${C_GREEN}[LULUS] Server (PID: ${PID}) berhasil dihentikan.${C_RESET}"
    
    # Hapus file PID jika server gagal membersihkannya (misal: kill -9)
    if [ -f "$PID_FILE" ]; then
        echo -e "${C_YELLOW}[INFO] Membersihkan file PID (backup)...${C_RESET}"
        rm -f "$PID_FILE"
    fi
    
    # (Opsional) Pastikan port benar-benar bebas
    if [ ! -z "$PORT" ] && lsof -t -i:$PORT > /dev/null; then
        echo -e "${C_RED}[WARN] Port ${PORT} masih digunakan! Mencoba kill paksa...${C_RESET}"
        lsof -t -i:$PORT | xargs kill -9
    fi
}

# Fungsi untuk RESTART server
do_restart() {
    echo -e "${C_CYAN}--- Proses Restart Dimulai ---${C_RESET}"
    do_stop
    echo -e "${C_CYAN}[INFO] Menunggu 1 detik sebelum start ulang...${C_RESET}"
    sleep 1
    do_start
    echo -e "${C_CYAN}--- Proses Restart Selesai ---${C_RESET}"
}

# --- Menu Utama ---
show_menu() {
    clear
    echo -e "${C_CYAN}==========================================${C_RESET}"
    echo -e "  ${C_GREEN}TrafficBuster Backend Control Panel${C_RESET}"
    echo -e "${C_CYAN}==========================================${C_RESET}"
    if is_running; then
        echo -e "STATUS: ${C_GREEN}BERJALAN${C_RESET} (PID: ${C_GREEN}${PID}${C_RESET}, Port: ${C_GREEN}${PORT}${C_RESET})"
    else
        echo -e "STATUS: ${C_RED}TIDAK BERJALAN${C_RESET}"
    fi
    echo "------------------------------------------"
    echo " 1. Start Server"
    echo " 2. Restart Server"
    echo " 3. Stop Server"
    echo ""
    echo " 0. Exit"
    echo "------------------------------------------"
}

# --- Loop Utama ---
while true; do
    show_menu
    read -p "Pilih opsi [1, 2, 3, 0]: " PILIHAN
    
    case "$PILIHAN" in
        1)
            do_start
            ;;
        2)
            do_restart
            ;;
        3)
            do_stop
            ;;
        0)
            echo -e "${C_CYAN}Terima kasih. Keluar.${C_RESET}"
            exit 0
            ;;
        *)
            echo -e "${C_RED}[ERROR] Pilihan tidak valid: '$PILIHAN'${C_RESET}"
            ;;
    esac
    
    echo ""
    read -p "Tekan [Enter] untuk kembali ke menu..."
done
