"""
MSF-COMMANDER v2 — Report Generator
Professional HTML pentest report generation from engagement database.
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

from rich.console import Console

console = Console()

REPORT_DIR = Path(__file__).parent.parent / "reports"
REPORT_DIR.mkdir(exist_ok=True)


class ReportBuilder:
    """Generate professional pentest reports from engagement data."""

    def __init__(self, db):
        self.db = db

    def generate(self, engagement_id: str, format_: str = "html") -> str:
        """Generate a report for the engagement."""
        eng = self.db.query("SELECT * FROM engagements WHERE id=?", (engagement_id,))
        if not eng:
            return ""
        eng = eng[0]

        targets = self.db.query("SELECT * FROM targets WHERE engagement_id=?", (engagement_id,))
        vulns = self.db.query(
            "SELECT v.*, t.ip_address FROM vulnerabilities v "
            "LEFT JOIN targets t ON v.target_id = t.id "
            "WHERE v.engagement_id=? ORDER BY v.cvss DESC", (engagement_id,))
        creds = self.db.query(
            "SELECT c.*, t.ip_address FROM credentials c "
            "LEFT JOIN targets t ON c.target_id = t.id "
            "WHERE c.engagement_id=?", (engagement_id,))
        sessions = self.db.query(
            "SELECT s.*, t.ip_address FROM sessions s "
            "LEFT JOIN targets t ON s.target_id = t.id "
            "WHERE s.engagement_id=?", (engagement_id,))
        loot = self.db.query("SELECT * FROM loot WHERE engagement_id=?", (engagement_id,))
        events = self.db.query(
            "SELECT * FROM events WHERE engagement_id=? AND level IN ('info','warn','error') ORDER BY timestamp LIMIT 200",
            (engagement_id,))

        # Severity counts
        sev = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for v in vulns:
            s = v.get("severity", "").lower()
            if s in sev:
                sev[s] += 1

        if format_ == "html":
            return self._html_report(eng, targets, vulns, creds, sessions, loot, events, sev)
        elif format_ == "json":
            return self._json_report(eng, targets, vulns, creds, sessions, loot, events)
        else:
            return self._json_report(eng, targets, vulns, creds, sessions, loot, events)

    def _html_report(self, eng, targets, vulns, creds, sessions, loot, events, sev) -> str:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        name_safe = eng["name"].replace(" ", "_")[:30]
        fp = REPORT_DIR / f"report_{name_safe}_{ts}.html"
        scope = json.loads(eng.get("scope", "[]"))
        now = datetime.now().strftime("%B %d, %Y")

        # Build target details
        target_details = ""
        for t in targets:
            services = self.db.query(
                "SELECT * FROM services WHERE target_id=? ORDER BY port", (t["id"],))
            target_vulns = [v for v in vulns if v.get("target_id") == t["id"]]

            svc_rows = ""
            for s in services:
                svc_rows += f"""<tr><td>{s['port']}/{s['protocol']}</td>
                    <td>{s.get('service','')}</td>
                    <td>{s.get('product','')} {s.get('version','')}</td></tr>"""

            vuln_rows = ""
            for v in target_vulns:
                sc = {"critical": "#ff2222", "high": "#ff8800", "medium": "#ffcc00",
                      "low": "#44cc44", "info": "#4488ff"}.get(v.get("severity", "").lower(), "#888")
                vuln_rows += f"""<tr>
                    <td style="color:{sc};font-weight:bold">{v.get('severity','N/A').upper()}</td>
                    <td>{v.get('title','')}</td>
                    <td>{v.get('cve','') or v.get('cwe','')}</td>
                    <td>{v.get('description','')[:150]}</td>
                    <td><pre style="margin:0;font-size:0.8em;background:#111;padding:4px;overflow-x:auto">{v.get('proof','')[:300]}</pre></td>
                    <td>{v.get('remediation','')[:200]}</td></tr>"""

            target_details += f"""
            <div class="section">
                <h3 style="color:#00ccff;margin-bottom:10px">{t.get('ip_address','')} {t.get('hostname','') and '— '+t['hostname'] or ''}</h3>
                <p style="color:#888;margin-bottom:8px">OS: {t.get('os_version','Unknown')} | MAC: {t.get('mac_address','N/A')}</p>
                {svc_rows and f'<table class="inner"><tr><th>Port</th><th>Service</th><th>Version</th></tr>{svc_rows}</table>' or '<p>No services discovered</p>'}
                {vuln_rows and f'<h4 style="margin-top:15px;color:#ff8888">Vulnerabilities ({len(target_vulns)})</h4><table class="inner"><tr><th>Severity</th><th>Title</th><th>CVE</th><th>Description</th><th>Proof</th><th>Remediation</th></tr>{vuln_rows}</table>' or '<p style="margin-top:10px;color:#44cc44">No vulnerabilities found on this target</p>'}
            </div>"""

        # Credential rows
        cred_rows = ""
        for c in creds:
            cred_rows += f"""<tr><td>{c.get('username','')}</td>
                <td>{c.get('realm','')}</td>
                <td>{c.get('hash_type','')}</td>
                <td><code>{c.get('hash','') or c.get('password','')[:50]}</code></td>
                <td>{c.get('source','')}</td>
                <td>{c.get('ip_address','')}</td></tr>"""

        # Event timeline
        timeline = ""
        for e in events[-50:]:
            color = {"info": "#4488ff", "warn": "#ffcc00", "error": "#ff4444"}.get(e.get("level"), "#888")
            timeline += f"""<tr><td style="color:#666;white-space:nowrap">{e.get('timestamp','')[:19]}</td>
                <td style="color:{color}">{e.get('module','')}</td>
                <td>{e.get('message','')[:100]}</td></tr>"""

        total_vulns = sum(sev.values())
        risk_score = min(100, sev.get("critical", 0) * 25 + sev.get("high", 0) * 10 +
                         sev.get("medium", 0) * 3 + sev.get("low", 0) * 1)
        risk_color = "#ff2222" if risk_score >= 50 else "#ffcc00" if risk_score >= 25 else "#44cc44"
        risk_label = "CRITICAL" if risk_score >= 50 else "HIGH" if risk_score >= 25 else "MEDIUM" if risk_score >= 10 else "LOW"

        html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pentest Report — {eng['name']}</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:'Segoe UI',system-ui,sans-serif; background:#08080e; color:#ddd; line-height:1.7; }}
.container {{ max-width:1200px; margin:0 auto; padding:40px 30px; }}
h1 {{ color:#00ff88; font-size:1.8em; }}
h2 {{ color:#00ccff; margin:35px 0 15px; border-bottom:1px solid #1a1a2e; padding-bottom:8px; }}
h3 {{ color:#aaa; }}
.disclaimer {{ background:#3d1111; border:1px solid #ff4444; padding:15px; border-radius:8px; margin:20px 0; color:#ff8888; }}
.meta {{ color:#666; margin:5px 0; }}
.section {{ background:#0d0d18; border:1px solid #1a1a2e; border-radius:8px; padding:20px; margin:15px 0; }}
.score-box {{ display:flex; gap:20px; margin:20px 0; flex-wrap:wrap; }}
.score {{ padding:15px 25px; border-radius:8px; text-align:center; min-width:90px; }}
.score.crit {{ background:#3d1111; border:1px solid #ff2222; }} .score.crit .n {{ color:#ff2222; }}
.score.high {{ background:#3d2211; border:1px solid #ff8800; }} .score.high .n {{ color:#ff8800; }}
.score.med {{ background:#3d3311; border:1px solid #ffcc00; }} .score.med .n {{ color:#ffcc00; }}
.score.low {{ background:#113d11; border:1px solid #44cc44; }} .score.low .n {{ color:#44cc44; }}
.score .n {{ font-size:2em; font-weight:bold; }} .score .l {{ font-size:0.75em; color:#888; text-transform:uppercase; }}
.risk {{ padding:20px; text-align:center; border-radius:8px; margin:20px 0; }}
.risk .score {{ font-size:3em; font-weight:bold; }}
table {{ width:100%; border-collapse:collapse; margin:15px 0; }}
th {{ background:#12121e; color:#00ff88; padding:10px; text-align:left; font-size:0.85em; }}
td {{ padding:8px 10px; border-bottom:1px solid #12121e; font-size:0.85em; }}
tr:hover {{ background:#0a0a14; }}
.inner {{ font-size:0.85em; margin:10px 0; }}
pre {{ background:#0a0a12; border:1px solid #1a1a2e; padding:8px; border-radius:4px; overflow-x:auto; }}
code {{ background:#1a1a2e; padding:2px 5px; border-radius:3px; color:#00ccff; }}
footer {{ text-align:center; color:#333; margin-top:40px; padding-top:20px; border-top:1px solid #1a1a2e; }}
</style></head><body><div class="container">

<div class="disclaimer"><strong>CONFIDENTIAL</strong> — This report is intended solely for the authorized recipient. Unauthorized distribution is prohibited.</div>

<h1>{eng['name']}</h1>
<p class="meta">Client: <strong>{eng.get('client','N/A')}</strong> | Date: {now} | ID: {engagement_id}</p>

<h2>Executive Summary</h2>
<div class="section">
<p>This security assessment identified <strong>{total_vulns}</strong> vulnerabilities across <strong>{len(targets)}</strong> targets in scope.</p>
<div class="score-box">
  <div class="score crit"><div class="n">{sev['critical']}</div><div class="l">Critical</div></div>
  <div class="score high"><div class="n">{sev['high']}</div><div class="l">High</div></div>
  <div class="score med"><div class="n">{sev['medium']}</div><div class="l">Medium</div></div>
  <div class="score low"><div class="n">{sev['low']}</div><div class="l">Low</div></div>
</div>
<div class="risk" style="background:#111;border:2px solid {risk_color}">
  <div class="l" style="color:#888;text-transform:uppercase;margin-bottom:5px">Overall Risk Score</div>
  <div class="score" style="color:{risk_color}">{risk_score}/100</div>
  <div style="color:{risk_color};font-weight:bold;margin-top:5px">{risk_label} RISK</div>
</div>
</div>

<h2>Scope</h2>
<div class="section">
<p>Authorized targets: {', '.join(scope) if scope else eng.get('notes','See engagement scope document')}</p>
</div>

<h2>Target Details & Findings</h2>
{target_details or '<div class="section"><p>No targets scanned.</p></div>'}

<h2>Credentials</h2>
<div class="section">
{cred_rows and f'<p>Harvested {len(creds)} credential(s):</p><table><tr><th>User</th><th>Realm</th><th>Type</th><th>Hash/Password</th><th>Source</th><th>Target</th></tr>{cred_rows}</table>' or '<p>No credentials harvested.</p>'}
</div>

<h2>Activity Timeline</h2>
<div class="section">
<table><tr><th>Time</th><th>Module</th><th>Event</th></tr>{timeline}</table>
</div>

<footer>Generated by MSF-COMMANDER v2.0 | For authorized use only | {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</footer>
</div></body></html>"""

        fp.write_text(html, encoding="utf-8")
        console.print(f"[bold green]HTML report generated: {fp}[/]")
        return str(fp)

    def _json_report(self, eng, targets, vulns, creds, sessions, loot, events) -> str:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        name_safe = eng["name"].replace(" ", "_")[:30]
        fp = REPORT_DIR / f"report_{name_safe}_{ts}.json"

        # Build per-target data
        target_data = []
        for t in targets:
            services = self.db.query("SELECT * FROM services WHERE target_id=?", (t["id"],))
            target_vulns = [v for v in vulns if v.get("target_id") == t["id"]]
            target_data.append({
                **t,
                "services": services,
                "vulnerabilities": target_vulns,
            })

        report = {
            "engagement": eng,
            "targets": target_data,
            "all_vulnerabilities": vulns,
            "credentials": creds,
            "sessions": sessions,
            "loot": loot,
            "events": events[-100:],
            "generated_at": datetime.utcnow().isoformat() + "Z",
        }

        fp.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        console.print(f"[bold green]JSON report generated: {fp}[/]")
        return str(fp)
