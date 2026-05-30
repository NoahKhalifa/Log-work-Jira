Found it — app is at /home/bu01_voffice4/jira-logwork/app.js, running as plain node app.js (PID 815710). (The ERR_REQUIRE_ESM/angular noise is just a login-profile glitch, unrelated to your app.)

1. Copy & overwrite (from PowerShell):


scp "C:\Users\dongnt30.ITBU\Documents\My tool\Logwork jira\app.js" bu01_voffice4@10.110.10.202:/home/bu01_voffice4/jira-logwork/app.js
2. Restart the process — SSH in and run:


ssh bu01_voffice4@10.110.10.202

# dừng bản cũ
pkill -f "node app.js"

# chạy lại bản mới (nền, sống sau khi logout)
cd ~/jira-logwork
nohup node app.js > server.log 2>&1 &

# kiểm tra
curl -s localhost:3005 | head -c 100
You should see HTML starting with <!DOCTYPE html>. Then refresh http://10.110.10.202:3005 in the browser (Ctrl+F5 to bypass cache).

Notes:

Current process runs with no env vars, so it's already using the defaults PORT=3005 HOST=0.0.0.0 (matches the code) — no need to set them.
Restarting briefly drops anyone mid-log-work; do it when idle.
nohup … & survives logout but not a server reboot. If you want it to auto-start on reboot, tell me and I'll give you a small systemd service.