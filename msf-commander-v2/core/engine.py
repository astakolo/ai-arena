"""
MSF-COMMANDER v2 — Core Engine
SQLite backend, event system, configuration management, authorization tracking.

DISCLAIMER: For AUTHORIZED penetration testing ONLY.
"""

import sqlite3
import json
import os
import time
import secrets
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum

import rich
from rich.console import Console
from rich.table import Table

console = Console()

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "commander.db"


class Database:
    """SQLite-backed storage for all framework data."""

    def __init__(self, path: Path = DB_PATH):
        self.path = path
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self._migrate()

    def _migrate(self):
        c = self.conn.cursor()
        c.execute("""CREATE TABLE IF NOT EXISTS engagements (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT,
            scope TEXT DEFAULT '[]', status TEXT DEFAULT 'active',
            authorization_file TEXT, start_time TEXT NOT NULL,
            end_time TEXT, notes TEXT DEFAULT ''
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS targets (
            id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL,
            hostname TEXT, ip_address TEXT NOT NULL,
            os TEXT DEFAULT '', os_version TEXT DEFAULT '',
            mac_address TEXT DEFAULT '', first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL, status TEXT DEFAULT 'unknown',
            tags TEXT DEFAULT '[]', notes TEXT DEFAULT '',
            FOREIGN KEY (engagement_id) REFERENCES engagements(id)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS services (
            id TEXT PRIMARY KEY, target_id TEXT NOT NULL,
            port INTEGER NOT NULL, protocol TEXT DEFAULT 'tcp',
            state TEXT DEFAULT 'open', service TEXT DEFAULT '',
            version TEXT DEFAULT '', product TEXT DEFAULT '',
            banner TEXT DEFAULT '', confidence INTEGER DEFAULT 0,
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS credentials (
            id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL,
            target_id TEXT, username TEXT NOT NULL,
            password TEXT DEFAULT '', hash_type TEXT DEFAULT '',
            hash TEXT DEFAULT '', source TEXT DEFAULT '',
            realm TEXT DEFAULT '', cracked INTEGER DEFAULT 0,
            plaintext TEXT DEFAULT '', notes TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (engagement_id) REFERENCES engagements(id),
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS vulnerabilities (
            id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL,
            target_id TEXT, title TEXT NOT NULL,
            severity TEXT DEFAULT 'medium', cve TEXT DEFAULT '',
            cwe TEXT DEFAULT '', cvss REAL DEFAULT 0.0,
            description TEXT DEFAULT '', proof TEXT DEFAULT '',
            remediation TEXT DEFAULT '', status TEXT DEFAULT 'open',
            module_used TEXT DEFAULT '', references_json TEXT DEFAULT '[]',
            discovered_at TEXT NOT NULL,
            FOREIGN KEY (engagement_id) REFERENCES engagements(id),
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL,
            target_id TEXT, session_type TEXT DEFAULT '',
            platform TEXT DEFAULT '', pivot_target TEXT DEFAULT '',
            local_port INTEGER DEFAULT 0, created_at TEXT NOT NULL,
            active INTEGER DEFAULT 1, notes TEXT DEFAULT '',
            FOREIGN KEY (engagement_id) REFERENCES engagements(id),
            FOREIGN KEY (target_id) REFERENCES targets(id)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS loot (
            id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL,
            session_id TEXT, target_id TEXT, loot_type TEXT NOT NULL,
            name TEXT NOT NULL, local_path TEXT DEFAULT '',
            remote_path TEXT DEFAULT '', size_bytes INTEGER DEFAULT 0,
            description TEXT DEFAULT '', collected_at TEXT NOT NULL,
            tags TEXT DEFAULT '[]',
            FOREIGN KEY (engagement_id) REFERENCES engagements(id)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            engagement_id TEXT NOT NULL, timestamp TEXT NOT NULL,
            level TEXT DEFAULT 'info', module TEXT DEFAULT '',
            event_type TEXT DEFAULT '', message TEXT NOT NULL,
            data_json TEXT DEFAULT '{}',
            FOREIGN KEY (engagement_id) REFERENCES engagements(id)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL,
            title TEXT NOT NULL, content TEXT NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT,
            FOREIGN KEY (engagement_id) REFERENCES engagements(id)
        )""")

        c.execute("CREATE INDEX IF NOT EXISTS idx_targets_eng ON targets(engagement_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_services_target ON services(target_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_creds_eng ON credentials(engagement_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_vulns_eng ON vulnerabilities(engagement_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_events_eng ON events(engagement_id)")
        self.conn.commit()

    @staticmethod
    def _uid() -> str:
        return secrets.token_hex(8)

    def insert(self, table: str, data: Dict[str, Any]) -> str:
        data["id"] = data.get("id", self._uid())
        cols = list(data.keys())
        vals = [json.dumps(data[c]) if isinstance(data[c], (list, dict)) else data[c] for c in cols]
        placeholders = ",".join(["?"] * len(cols))
        col_str = ",".join(cols)
        try:
            self.conn.execute(f"INSERT OR IGNORE INTO {table} ({col_str}) VALUES ({placeholders})", vals)
            self.conn.commit()
            return data["id"]
        except Exception as e:
            console.print(f"[red]DB Error: {e}[/]")
            return ""

    def update(self, table: str, uid: str, data: Dict[str, Any]):
        sets = ", ".join([f"{k}=?" for k in data.keys()])
        vals = list(data.values()) + [uid]
        try:
            self.conn.execute(f"UPDATE {table} SET {sets} WHERE id=?", vals)
            self.conn.commit()
        except Exception as e:
            console.print(f"[red]DB Error: {e}[/]")

    def query(self, sql: str, params: Tuple = ()) -> List[Dict]:
        try:
            rows = self.conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]
        except Exception as e:
            console.print(f"[red]DB Error: {e}[/]")
            return []

    def delete(self, table: str, uid: str):
        self.conn.execute(f"DELETE FROM {table} WHERE id=?", (uid,))
        self.conn.commit()

    def close(self):
        self.conn.close()


class EventBus:
    """Centralized event logging for the framework."""

    LEVELS = {"debug", "info", "warn", "error", "critical"}

    def __init__(self, db: Database, engagement_id: str = ""):
        self.db = db
        self.engagement_id = engagement_id
        self.subscribers: List[callable] = []

    def emit(self, level: str, module: str, event_type: str,
             message: str, data: Dict = None):
        level = level.lower()
        if level not in self.LEVELS:
            level = "info"
        self.db.insert("events", {
            "engagement_id": self.engagement_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": level, "module": module, "event_type": event_type,
            "message": message,
            "data_json": json.dumps(data or {}, default=str),
        })
        styles = {"debug": "dim", "info": "cyan", "warn": "yellow",
                  "error": "red", "critical": "bold red"}
        console.print(f"[{styles.get(level, 'white')}][{module}] {message}[/]")
        for sub in self.subscribers:
            try:
                sub(level, module, event_type, message, data)
            except Exception:
                pass

    def subscribe(self, callback: callable):
        self.subscribers.append(callback)


class EngagementManager:
    """Manage penetration testing engagements."""

    def __init__(self, db: Database):
        self.db = db

    def create(self, name: str, client: str = "", scope: List[str] = None,
               notes: str = "") -> str:
        return self.db.insert("engagements", {
            "name": name, "client": client,
            "scope": json.dumps(scope or []),
            "status": "active",
            "start_time": datetime.utcnow().isoformat() + "Z",
            "notes": notes,
        })

    def list_engagements(self) -> List[Dict]:
        return self.db.query("SELECT * FROM engagements ORDER BY start_time DESC")

    def get_active(self) -> Optional[Dict]:
        rows = self.db.query(
            "SELECT * FROM engagements WHERE status='active' ORDER BY start_time DESC LIMIT 1"
        )
        return rows[0] if rows else None

    def set_active(self, eid: str) -> bool:
        self.db.update("engagements", eid, {"status": "active"})
        return True

    def close(self, eid: str):
        self.db.update("engagements", eid, {
            "status": "completed",
            "end_time": datetime.utcnow().isoformat() + "Z",
        })

    def get_stats(self, eid: str) -> Dict:
        def _count(table, extra=""):
            r = self.db.query(f"SELECT COUNT(*) as c FROM {table} WHERE engagement_id=? {extra}", (eid,))
            return r[0]["c"] if r else 0

        sev_counts = {}
        for row in self.db.query(
            "SELECT severity, COUNT(*) as c FROM vulnerabilities WHERE engagement_id=? GROUP BY severity", (eid,)
        ):
            sev_counts[row["severity"]] = row["c"]

        return {
            "targets": _count("targets"),
            "vulnerabilities": _count("vulnerabilities"),
            "credentials": _count("credentials"),
            "active_sessions": _count("sessions", "AND active=1"),
            "loot_items": _count("loot"),
            "severity_breakdown": sev_counts,
        }

    def add_note(self, eid: str, title: str, content: str) -> str:
        return self.db.insert("notes", {
            "engagement_id": eid, "title": title, "content": content,
            "created_at": datetime.utcnow().isoformat() + "Z",
        })

    def get_notes(self, eid: str) -> List[Dict]:
        return self.db.query(
            "SELECT * FROM notes WHERE engagement_id=? ORDER BY created_at DESC", (eid,)
        )


class TargetManager:
    """Manage discovered targets, services, vulnerabilities, credentials, sessions, loot."""

    def __init__(self, db: Database, engagement_id: str):
        self.db = db
        self.engagement_id = engagement_id

    def add_target(self, ip: str, hostname: str = "", os_info: str = "",
                   mac: str = "", tags: List[str] = None) -> str:
        now = datetime.utcnow().isoformat() + "Z"
        return self.db.insert("targets", {
            "engagement_id": self.engagement_id, "ip_address": ip,
            "hostname": hostname,
            "os": os_info.split(" ")[0] if os_info else "",
            "os_version": os_info, "mac_address": mac,
            "first_seen": now, "last_seen": now,
            "tags": json.dumps(tags or []),
        })

    def get_or_create(self, ip: str, hostname: str = "") -> str:
        existing = self.db.query(
            "SELECT id FROM targets WHERE ip_address=? AND engagement_id=?",
            (ip, self.engagement_id)
        )
        if existing:
            tid = existing[0]["id"]
            self.db.update("targets", tid, {
                "last_seen": datetime.utcnow().isoformat() + "Z",
                "hostname": hostname or None,
            })
            return tid
        return self.add_target(ip, hostname)

    def add_service(self, target_id: str, port: int, protocol: str = "tcp",
                    state: str = "open", service: str = "", version: str = "",
                    product: str = "", banner: str = ""):
        existing = self.db.query(
            "SELECT id FROM services WHERE target_id=? AND port=? AND protocol=?",
            (target_id, port, protocol)
        )
        if existing:
            self.db.update("services", existing[0]["id"], {
                "state": state, "service": service, "version": version,
                "product": product, "banner": banner,
            })
            return existing[0]["id"]
        return self.db.insert("services", {
            "target_id": target_id, "port": port, "protocol": protocol,
            "state": state, "service": service, "version": version,
            "product": product, "banner": banner,
        })

    def get_targets(self) -> List[Dict]:
        return self.db.query(
            "SELECT * FROM targets WHERE engagement_id=? ORDER BY ip_address",
            (self.engagement_id,)
        )

    def get_target(self, target_id: str) -> Optional[Dict]:
        rows = self.db.query("SELECT * FROM targets WHERE id=? AND engagement_id=?",
                             (target_id, self.engagement_id))
        return rows[0] if rows else None

    def get_services(self, target_id: str) -> List[Dict]:
        return self.db.query(
            "SELECT * FROM services WHERE target_id=? ORDER BY port", (target_id,)
        )

    def get_target_by_ip(self, ip: str) -> Optional[Dict]:
        rows = self.db.query(
            "SELECT * FROM targets WHERE ip_address=? AND engagement_id=?",
            (ip, self.engagement_id)
        )
        return rows[0] if rows else None

    def add_vulnerability(self, target_id: str, title: str,
                          severity: str = "medium", cve: str = "",
                          cwe: str = "", cvss: float = 0.0,
                          description: str = "", proof: str = "",
                          remediation: str = "", module_used: str = "",
                          references: List[str] = None):
        self.db.insert("vulnerabilities", {
            "engagement_id": self.engagement_id, "target_id": target_id,
            "title": title, "severity": severity, "cve": cve, "cwe": cwe,
            "cvss": cvss, "description": description, "proof": proof,
            "remediation": remediation, "module_used": module_used,
            "references_json": json.dumps(references or []),
            "discovered_at": datetime.utcnow().isoformat() + "Z",
        })

    def get_vulnerabilities(self, target_id: str = None) -> List[Dict]:
        if target_id:
            return self.db.query(
                "SELECT v.*, t.ip_address FROM vulnerabilities v "
                "LEFT JOIN targets t ON v.target_id = t.id "
                "WHERE v.target_id=? AND v.engagement_id=? ORDER BY v.cvss DESC",
                (target_id, self.engagement_id))
        return self.db.query(
            "SELECT v.*, t.ip_address FROM vulnerabilities v "
            "LEFT JOIN targets t ON v.target_id = t.id "
            "WHERE v.engagement_id=? ORDER BY v.cvss DESC",
            (self.engagement_id,))

    def add_session(self, target_id: str, session_type: str = "meterpreter",
                    platform: str = "", local_port: int = 0) -> str:
        return self.db.insert("sessions", {
            "engagement_id": self.engagement_id, "target_id": target_id,
            "session_type": session_type, "platform": platform,
            "local_port": local_port,
            "created_at": datetime.utcnow().isoformat() + "Z", "active": 1,
        })

    def get_sessions(self, active_only: bool = True) -> List[Dict]:
        where = "AND s.active=1" if active_only else ""
        return self.db.query(
            f"SELECT s.*, t.ip_address, t.hostname FROM sessions s "
            f"LEFT JOIN targets t ON s.target_id = t.id "
            f"WHERE s.engagement_id=? {where} ORDER BY s.created_at",
            (self.engagement_id,))

    def add_credential(self, username: str, password: str = "",
                       hash_type: str = "", hash_val: str = "",
                       source: str = "", target_id: str = "",
                       realm: str = "") -> str:
        return self.db.insert("credentials", {
            "engagement_id": self.engagement_id, "target_id": target_id,
            "username": username, "password": password,
            "hash_type": hash_type, "hash": hash_val,
            "source": source, "realm": realm,
            "created_at": datetime.utcnow().isoformat() + "Z",
        })

    def get_credentials(self, cracked_only: bool = False) -> List[Dict]:
        where = "AND c.cracked=1" if cracked_only else ""
        return self.db.query(
            f"SELECT c.*, t.ip_address FROM credentials c "
            f"LEFT JOIN targets t ON c.target_id = t.id "
            f"WHERE c.engagement_id=? {where} ORDER BY c.created_at DESC",
            (self.engagement_id,))

    def add_loot(self, loot_type: str, name: str, local_path: str = "",
                 remote_path: str = "", size: int = 0,
                 session_id: str = "", target_id: str = "",
                 description: str = "", tags: List[str] = None) -> str:
        return self.db.insert("loot", {
            "engagement_id": self.engagement_id, "session_id": session_id,
            "target_id": target_id, "loot_type": loot_type, "name": name,
            "local_path": local_path, "remote_path": remote_path,
            "size_bytes": size, "description": description,
            "collected_at": datetime.utcnow().isoformat() + "Z",
            "tags": json.dumps(tags or []),
        })

    def get_loot(self, loot_type: str = "") -> List[Dict]:
        if loot_type:
            return self.db.query(
                "SELECT * FROM loot WHERE engagement_id=? AND loot_type=? ORDER BY collected_at DESC",
                (self.engagement_id, loot_type))
        return self.db.query(
            "SELECT * FROM loot WHERE engagement_id=? ORDER BY collected_at DESC",
            (self.engagement_id,))

    def print_targets_table(self):
        targets = self.get_targets()
        table = Table(title="Discovered Targets", box=rich.box.ROUNDED)
        table.add_column("IP", style="cyan")
        table.add_column("Hostname", style="white")
        table.add_column("OS", style="yellow")
        table.add_column("Services", style="green")
        table.add_column("Vulns", style="red")
        for t in targets:
            svc = self.db.query("SELECT COUNT(*) as c FROM services WHERE target_id=?", (t["id"],))
            vul = self.db.query("SELECT COUNT(*) as c FROM vulnerabilities WHERE target_id=?", (t["id"],))
            table.add_row(t["ip_address"], t["hostname"] or "-",
                          t["os_version"] or t["os"] or "-",
                          str(svc[0]["c"] if svc else 0),
                          str(vul[0]["c"] if vul else 0))
        console.print(table)

    def print_services_table(self, target_id: str):
        services = self.get_services(target_id)
        target = self.get_target(target_id)
        table = Table(title=f"Services: {target['ip_address'] if target else target_id}",
                      box=rich.box.ROUNDED)
        table.add_column("Port", style="cyan")
        table.add_column("Proto", style="dim")
        table.add_column("State", style="green")
        table.add_column("Service", style="yellow")
        table.add_column("Version", style="white")
        for s in services:
            table.add_row(str(s["port"]), s["protocol"], s["state"],
                          s["service"],
                          f"{s.get('product','')} {s.get('version','')}".strip())
        console.print(table)
