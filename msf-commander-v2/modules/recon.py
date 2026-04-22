"""
MSF-COMMANDER v2 — Reconnaissance Module
nmap, enum4linux, Nikto, DNS, HTTP header analysis with auto-target registration.
"""

import re
import subprocess
from pathlib import Path
from typing import Optional, Dict, List, Any, Tuple

from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()


class ReconModule:
    """Reconnaissance and information gathering — results auto-saved to database."""

    def __init__(self, db, tm, events):
        self.db = db
        self.tm = tm  # TargetManager
        self.events = events  # EventBus

    @staticmethod
    def _run(cmd: str, timeout: int = 600) -> Tuple[str, str, int]:
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            return r.stdout.strip(), r.stderr.strip(), r.returncode
        except subprocess.TimeoutExpired:
            return "", "TIMEOUT", -1
        except Exception as e:
            return "", str(e), -1

    def _save_log(self, name: str, content: str) -> str:
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        from datetime import datetime
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        fp = log_dir / f"{name}_{ts}.log"
        fp.write_text(content)
        return str(fp)

    # ── Nmap Scanning ───────────────────────────────────
    def nmap_scan(self, target: str, ports: str = "1-10000",
                  scan_type: str = "-sV -sC -O -T4",
                  save_services: bool = True) -> Dict[str, Any]:
        """
        Full nmap scan with OS detection, service version, and default scripts.
        Automatically registers discovered targets, services, and OS info in the database.
        """
        cmd = f"nmap {scan_type} -p {ports} {target} --open"
        self.events.emit("info", "recon", "nmap_scan", f"Starting nmap scan: {target} ports {ports}")
        console.print(f"[bold cyan]nmap: {cmd}[/]")

        with console.status("[bold cyan]Scanning..."):
            stdout, stderr, rc = self._run(cmd, timeout=900)

        self._save_log(f"nmap_{target.replace('.', 'x')}", stdout)

        hosts_parsed = self._parse_nmap(stdout)
        for host in hosts_parsed:
            tid = self.tm.get_or_create(host["ip"], host.get("hostname", ""))
            if host.get("os"):
                self.db.update("targets", tid, {
                    "os_version": host["os"],
                    "os": host["os"].split(" ")[0],
                })
            if host.get("mac"):
                self.db.update("targets", tid, {"mac_address": host["mac"]})
            for svc in host.get("ports", []):
                self.tm.add_service(tid, svc["port"], svc.get("proto", "tcp"),
                                    svc.get("state", "open"), svc.get("service", ""),
                                    svc.get("version", ""), svc.get("product", ""),
                                    svc.get("banner", ""))

        total_ports = sum(len(h["ports"]) for h in hosts_parsed)
        self.events.emit("info", "recon", "nmap_complete",
                         f"Scan complete: {len(hosts_parsed)} host(s), {total_ports} port(s)")

        return {
            "hosts": hosts_parsed,
            "raw": stdout,
            "targets_registered": len(hosts_parsed),
            "total_ports": total_ports,
        }

    def nmap_quick(self, target: str, ports: str = "22,53,80,443,445,3306,3389,5432,8080,8443"):
        """Quick scan of common ports only."""
        return self.nmap_scan(target, ports, "-sV -T4 --open")

    def nmap_stealth(self, target: str, ports: str = "1-1000"):
        """Stealth SYN scan (requires root)."""
        return self.nmap_scan(target, ports, "-sS -sV -T2 --open")

    def nmap_udp(self, target: str, ports: str = "53,67,68,69,123,161,500,514,1194,1812"):
        """UDP top ports scan (slow but finds DNS, SNMP, etc.)."""
        return self.nmap_scan(target, ports, "-sU -sV -T3 --open")

    @staticmethod
    def _parse_nmap(output: str) -> List[Dict]:
        hosts = []
        current_host = None

        for line in output.splitlines():
            line = line.strip()

            # New host
            m = re.match(r"Nmap scan report for (.+?) \(([\d.]+)\)", line)
            if m:
                current_host = {"hostname": m.group(1), "ip": m.group(2), "ports": [], "os": "", "mac": ""}
                hosts.append(current_host)
                continue
            m = re.match(r"Nmap scan report for ([\d.]+)", line)
            if m:
                current_host = {"hostname": "", "ip": m.group(1), "ports": [], "os": "", "mac": ""}
                hosts.append(current_host)
                continue

            if not current_host:
                continue

            # OS detection
            if line.startswith("OS details:"):
                current_host["os"] = line.replace("OS details:", "").strip()
            elif line.startswith("Running:"):
                current_host["os"] = line.replace("Running:", "").strip()

            # MAC address
            mac_m = re.search(r"MAC Address:\s+([\w:]+)\s+\((.+?)\)", line)
            if mac_m:
                current_host["mac"] = mac_m.group(1)

            # Port line
            port_m = re.match(
                r"(\d+)/(tcp|udp)\s+(open|filtered|closed)\s+(\S+)(.*)", line
            )
            if port_m:
                remainder = port_m.group(5).strip()
                product, version, banner = "", "", remainder
                # Parse product version
                pv = re.match(r"(.+?)\s+([\d.]+.*)", remainder)
                if pv:
                    product = pv.group(1)
                    version = pv.group(2)
                current_host["ports"].append({
                    "port": int(port_m.group(1)),
                    "proto": port_m.group(2),
                    "state": port_m.group(3),
                    "service": port_m.group(4),
                    "product": product,
                    "version": version,
                    "banner": banner,
                })

        return hosts

    # ── DNS Enumeration ─────────────────────────────────
    def dns_enum(self, domain: str) -> Dict[str, Any]:
        """DNS record enumeration + subdomain brute force using dnspython."""
        try:
            import dns.resolver
        except ImportError:
            self.events.emit("error", "recon", "dns", "dnspython not installed")
            return {"error": "pip install dnspython"}

        self.events.emit("info", "recon", "dns", f"Enumerating DNS: {domain}")
        records = {}
        for rtype in ["A", "AAAA", "NS", "MX", "TXT", "SOA", "CNAME"]:
            try:
                answers = dns.resolver.resolve(domain, rtype)
                records[rtype] = [str(r) for r in answers]
            except Exception:
                records[rtype] = []

        subdomains = []
        wordlist = ["www", "mail", "ftp", "admin", "api", "dev", "staging",
                     "vpn", "portal", "remote", "git", "ci", "cdn", "ns1", "ns2",
                     "mx", "smtp", "webmail", "cloud", "app", "test", "prod",
                     "backup", "db", "internal", "proxy", "elk", "jenkins", "jira"]
        for sub in wordlist:
            try:
                answers = dns.resolver.resolve(f"{sub}.{domain}", "A")
                ips = [str(r) for r in answers]
                subdomains.append({"subdomain": f"{sub}.{domain}", "ips": ips})
                for ip in ips:
                    self.tm.get_or_create(ip, f"{sub}.{domain}")
            except Exception:
                pass

        self.events.emit("info", "recon", "dns_complete",
                         f"Found {len(records)} record types, {len(subdomains)} subdomains")
        return {"domain": domain, "records": records, "subdomains": subdomains}

    # ── HTTP Header Analysis ────────────────────────────
    def http_headers(self, url: str) -> Dict[str, Any]:
        """Analyze HTTP security headers and technologies."""
        try:
            import requests
        except ImportError:
            return {"error": "pip install requests"}

        self.events.emit("info", "recon", "http_headers", f"Analyzing: {url}")
        try:
            resp = requests.get(url, timeout=15, verify=False, allow_redirects=True)
        except Exception as e:
            return {"error": str(e)}

        headers = dict(resp.headers)
        security_headers = {
            "Strict-Transport-Security": headers.get("Strict-Transport-Security", "MISSING"),
            "Content-Security-Policy": headers.get("Content-Security-Policy", "MISSING"),
            "X-Content-Type-Options": headers.get("X-Content-Type-Options", "MISSING"),
            "X-Frame-Options": headers.get("X-Frame-Options", "MISSING"),
            "X-XSS-Protection": headers.get("X-XSS-Protection", "MISSING"),
            "Referrer-Policy": headers.get("Referrer-Policy", "MISSING"),
            "Permissions-Policy": headers.get("Permissions-Policy", "MISSING"),
        }
        missing = [k for k, v in security_headers.items() if v == "MISSING"]
        score = f"{(len(security_headers) - len(missing)) / len(security_headers) * 100:.0f}%"

        # Extract IP from URL and register target
        from urllib.parse import urlparse
        hostname = urlparse(url).hostname
        if hostname:
            tid = self.tm.get_or_create(hostname, hostname)
            self.tm.add_service(tid, 80 if url.startswith("http://") else 443,
                                "tcp", "open", "http", resp.headers.get("Server", ""),
                                resp.headers.get("X-Powered-By", ""))

        self.events.emit("info", "recon", "headers_complete",
                         f"Security header score: {score} ({len(missing)} missing)")
        return {
            "url": url, "status_code": resp.status_code,
            "server": headers.get("Server", "unknown"),
            "technology": headers.get("X-Powered-By", "unknown"),
            "security_headers": security_headers, "missing": missing,
            "score": score, "all_headers": headers,
        }

    # ── SMB Enumeration ─────────────────────────────────
    def enum_smb(self, target: str) -> Dict[str, Any]:
        """SMB enumeration using enum4linux and nmap smb scripts."""
        self.events.emit("info", "recon", "smb", f"Enumerating SMB: {target}")
        tid = self.tm.get_or_create(target)

        # nmap SMB scripts
        cmd = f"nmap -p 445,139 --script=smb-os-discovery,smb-protocols,smb-security-mode,smb-shares,smb-enum-users {target}"
        stdout, _, _ = self._run(cmd, timeout=300)
        self._save_log(f"smb_nmap_{target.replace('.', 'x')}", stdout)

        if "open" in stdout:
            self.tm.add_service(tid, 445, "tcp", "open", "microsoft-ds")
        if "139/tcp" in stdout and "open" in stdout:
            self.tm.add_service(tid, 139, "tcp", "open", "netbios-ssn")

        # enum4linux if available
        e4l_out = ""
        try:
            stdout2, _, _ = self._run(f"enum4linux -a {target}", timeout=300)
            e4l_out = stdout2
            self._save_log(f"enum4linux_{target.replace('.', 'x')}", e4l_out)
        except Exception:
            pass

        self.events.emit("info", "recon", "smb_complete", f"SMB enumeration done: {target}")
        return {"nmap_output": stdout, "enum4linux_output": e4l_out, "target": target}

    # ── Web Application Discovery ───────────────────────
    def dir_bruteforce(self, url: str, wordlist: List[str] = None,
                       extensions: List[str] = None,
                       threads: int = 20) -> Dict[str, Any]:
        """Concurrent directory/file brute force on a web server."""
        try:
            import requests
            from concurrent.futures import ThreadPoolExecutor, as_completed
        except ImportError:
            return {"error": "pip install requests"}

        if wordlist is None:
            wordlist = [
                "admin", "login", "api", "dashboard", "wp-admin",
                "backup", "config", "console", "debug", "dev", "staging",
                ".env", ".git/HEAD", ".htaccess", "robots.txt",
                "sitemap.xml", "package.json", "composer.json",
                "phpinfo.php", "info.php", "server-status", "server-info",
                "api/docs", "api/v1", "swagger", "graphql",
                "cgi-bin", "uploads", "static", "assets", "media",
                "phpmyadmin", "adminer", "portal", "internal",
                "elmah.axd", "trace.axd", ".well-known/security.txt",
            ]
        if extensions is None:
            extensions = ["", ".php", ".html", ".js", ".json", ".bak", ".old", ".txt", ".xml", ".asp", ".aspx"]

        self.events.emit("info", "recon", "dir_brute", f"Brute forcing: {url}")
        found = []
        url_base = url.rstrip("/")

        def _check(path):
            for ext in extensions:
                full = f"{url_base}/{path}{ext}"
                try:
                    r = requests.get(full, timeout=8, verify=False, allow_redirects=False)
                    if r.status_code < 400:
                        return {"url": full, "status": r.status_code,
                                "size": len(r.content),
                                "type": r.headers.get("Content-Type", "")}
                except Exception:
                    pass
            return None

        total = len(wordlist) * len(extensions)
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                      console=console) as progress:
            task = progress.add_task(f"Scanning {total} paths...", total=len(wordlist))

            with ThreadPoolExecutor(max_workers=threads) as pool:
                futures = {pool.submit(_check, p): p for p in wordlist}
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        found.append(result)
                    progress.advance(task)

        self.events.emit("info", "recon", "dir_complete",
                         f"Found {len(found)}/{total} paths on {url}")

        # Register as findings
        from urllib.parse import urlparse
        hostname = urlparse(url).hostname
        if hostname:
            tid = self.tm.get_or_create(hostname, hostname)
            for f in found:
                self.tm.add_service(tid, f["status"], "tcp", "open", "http-path",
                                    description=f["url"])

        return {"url": url, "found": found, "total": total, "found_count": len(found)}

    # ── Exploit Suggestions ─────────────────────────────
    def suggest_exploits(self) -> List[Dict[str, str]]:
        """Analyze all registered services and suggest Metasploit modules."""
        suggestions = []
        all_targets = self.tm.get_targets()
        for target in all_targets:
            services = self.tm.get_services(target["id"])
            for svc in services:
                banner = f"{svc.get('product', '')} {svc.get('version', '')} {svc.get('service', '')}".lower()
                port = svc["port"]

                if svc["service"] in ("smb", "microsoft-ds", "netbios-ssn"):
                    suggestions.append({
                        "target": target["ip_address"], "port": port,
                        "module": "auxiliary/scanner/smb/smb_vuln_ms17_010",
                        "check": "MS17-010 (EternalBlue)",
                    })
                    suggestions.append({
                        "target": target["ip_address"], "port": port,
                        "module": "exploit/windows/smb/psexec",
                        "check": "SMB PSExec (requires creds)",
                    })

                if svc["service"] == "ms-wbt-server" or port == 3389:
                    suggestions.append({
                        "target": target["ip_address"], "port": port,
                        "module": "auxiliary/scanner/rdp/cve_2019_0708_bluekeep",
                        "check": "CVE-2019-0708 (BlueKeep)",
                    })

                if svc["service"] == "http" or port in (80, 443, 8080, 8443):
                    if "apache" in banner and "2.4.49" in banner:
                        suggestions.append({
                            "target": target["ip_address"], "port": port,
                            "module": "exploit/multi/http/apache_path_normalize",
                            "check": "CVE-2021-41773 (Apache path traversal)",
                        })

                if svc["service"] in ("mysql", "") and port == 3306:
                    suggestions.append({
                        "target": target["ip_address"], "port": port,
                        "module": "auxiliary/scanner/mysql/mysql_login",
                        "check": "MySQL brute force",
                    })

                if svc["service"] in ("ftp", "") and port == 21:
                    suggestions.append({
                        "target": target["ip_address"], "port": port,
                        "module": "auxiliary/scanner/ftp/anonymous",
                        "check": "Anonymous FTP check",
                    })
                    if "vsftpd 2.3.4" in banner:
                        suggestions.append({
                            "target": target["ip_address"], "port": port,
                            "module": "exploit/unix/ftp/vsftpd_234_backdoor",
                            "check": "vsftpd 2.3.4 backdoor",
                        })

        return suggestions
