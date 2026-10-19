$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/FiloSottile/mkcert/releases/latest' -Headers @{ 'User-Agent' = 'qoder-setup' }
Write-Output ("version: " + $rel.tag_name)

$asset = $rel.assets | Where-Object { $_.name -like '*windows-amd64.exe' }
Write-Output ("file: " + $asset.name)

$dir = Join-Path $env:USERPROFILE 'Tools'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$dst = Join-Path $dir 'mkcert.exe'
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $dst
Write-Output ("bytes: " + (Get-Item $dst).Length)
Write-Output ("path: " + $dst)
