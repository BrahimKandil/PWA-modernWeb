$ErrorActionPreference = 'Stop'

# Regenerer un certificat mkcert pour l'IP Wi-Fi courante de ce PC.
# A relancer si l'IP change (bail DHCP renouvelle) : mkcert 192.168.100.10 ...

$mkcert = Join-Path $env:USERPROFILE 'Tools\mkcert.exe'
if (-not (Test-Path $mkcert)) { Write-Output "mkcert introuvable : relance scripts/get-mkcert.ps1"; exit 1 }

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -like 'Wi-Fi*' -and $_.IPAddress -notlike '169.*' } |
    Select-Object -First 1).IPAddress

if (-not $ip) { Write-Output "Aucune IP Wi-Fi detectee"; exit 1 }
Write-Output ("IP Wi-Fi : " + $ip)

$root = Split-Path -Parent $PSScriptRoot
$certs = Join-Path $root 'certs'
New-Item -ItemType Directory -Force -Path $certs | Out-Null

& $mkcert -cert-file (Join-Path $certs 'arp-lan.pem') `
          -key-file   (Join-Path $certs 'arp-lan-key.pem') `
          $ip '127.0.0.1' 'localhost' $env:COMPUTERNAME

Copy-Item (Join-Path (& $mkcert -CAROOT | Select-Object -First 1) 'rootCA.pem') (Join-Path $certs 'arp-root-ca.pem') -Force

Write-Output ""
Write-Output ("Certificat regenere. URL telephone : https://" + $ip + ":3443")
