#!/usr/bin/env bash
# Met l'app ARP Éducation à disposition du téléphone (point d'accès ou Wi-Fi commun).
# Régénère le certificat pour l'IP courante, relance le serveur HTTPS, affiche l'URL.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/e/nodeJS:$PATH"

echo "[1/4] IP Wi-Fi du PC…"
IP=$(powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' | Where-Object { \$_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress" | tr -d '\r[:space:]')
if [ -z "$IP" ]; then
  echo "      Aucune IP Wi-Fi : connecte d'abord le PC au point d'accès du téléphone."
  exit 1
fi
echo "      $IP"

echo "[2/4] Certificat mkcert pour cette IP…"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-cert.ps1 | tail -3

echo "[3/4] Arrêt de l'ancien serveur HTTPS (443/3443)…"
PIDS=$(netstat -ano | grep -E ":(443|3443) " | grep LISTENING | awk '{print $NF}' | sort -u)
if [ -n "${PIDS:-}" ]; then
  for PID in $PIDS; do taskkill //PID "$PID" //F >/dev/null && echo "      PID $PID arrêté"; done
else
  echo "      rien à arrêter"
fi

echo "[4/4] Démarrage du serveur HTTPS sur le port 443…"
nohup node server-https.js > /tmp/arp-https.log 2>&1 &
sleep 14
CODE=$(curl -s --cacert certs/arp-root-ca.pem -o /dev/null -w "%{http_code}" "https://$IP/login")
echo
echo "     vérification locale : https://$IP/login -> HTTP $CODE"
echo
echo "  ════════════════════════════════════════════════"
echo "   Sur le téléphone :   https://$IP"
echo "   logs serveur       : /tmp/arp-https.log"
echo "  ════════════════════════════════════════════════"
