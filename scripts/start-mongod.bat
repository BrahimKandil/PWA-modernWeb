@echo off
rem Demarre la base MongoDB locale utilisee par ARP Education
if not exist "C:\Users\USER\Tools\mongodb-data" mkdir "C:\Users\USER\Tools\mongodb-data"
if not exist "C:\Users\USER\Tools\mongodb-log" mkdir "C:\Users\USER\Tools\mongodb-log"
start "MongoDB ARP" /min "C:\Users\USER\Tools\mongodb\mongodb-win32-x86_64-windows-8.0.10\bin\mongod.exe" --config "C:\Users\USER\Tools\mongod.cfg"
echo MongoDB demarre sur 127.0.0.1:27017 (une fenetre reduite reste ouverte).
