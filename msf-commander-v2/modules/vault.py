"""
MSF-COMMANDER v2 — Credential & Loot Manager Module
Credential vault, hash cracking queue, loot cataloging, and credential reuse testing.
"""

import subprocess
import re
import json
from pathlib import Path
from typing import Dict, List, Any, Tuple, Optional
from datetime import datetime

from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()


class CredentialVault:
    """
    Centralized credential management for pentest engagements.
    Stores, searches, and tests credentials harvested from various sources.
    """

    def __init__(self, db, tm, events):
        self.db = db
        self.tm = tm
        self.events = events

    def add(self, username: str, password: str = "", hash_type: str = "",
            hash_val: str = "", source: str = "", target_id: str = "",
            realm: str = "") -> str:
        """Add a credential to the vault."""
        cid = self.tm.add_credential(username, password, hash_type, hash_val,
                                      source, target_id, realm)
        self.events.emit("info", "creds", "added",
                         f"Credential added: {username}@{realm or 'unknown'} "
                         f"(source: {source})")
        return cid

    def add_from_hashdump(self, hashes: str, source: str = "hashdump",
                          target_id: str = "") -> List[str]:
        """
        Parse Windows hashdump output and add to vault.
        Format: username:RID:lmhash:nthash:::
        """
        ids = []
        for line in hashes.splitlines():
            line = line.strip()
            if not line or line.startswith("Administrator") is False and ":" not in line:
                pass
            m = re.match(r"^([^:]+):\d+:([^:]+):([^:]+):", line)
            if m:
                username = m.group(1)
                lm_hash = m.group(2)
                nt_hash = m.group(3)
                if lm_hash and nt_hash:
                    cid = self.add(username, hash_type="NTLM",
                                   hash_val=f"{lm_hash}:{nt_hash}",
                                   source=source, target_id=target_id)
                    ids.append(cid)
        return ids

    def add_from_shadow(self, shadow_content: str, source: str = "/etc/shadow",
                        target_id: str = "") -> List[str]:
        """
        Parse /etc/shadow entries and add to vault.
        Format: username:$hash_type$salt$hash:...
        """
        ids = []
        for line in shadow_content.splitlines():
            parts = line.strip().split(":")
            if len(parts) >= 2 and "$" in parts[1]:
                username = parts[0]
                hash_field = parts[1]
                hash_type = hash_field.split("$")[1] if "$" in hash_field else "unknown"
                cid = self.add(username, hash_type=f"Linux {hash_type}",
                               hash_val=hash_field, source=source,
                               target_id=target_id)
                ids.append(cid)
        return ids

    def search(self, username: str = "", source: str = "",
               target_id: str = "") -> List[Dict]:
        """Search credentials with filters."""
        return self.tm.get_credentials()

    def list_all(self) -> List[Dict]:
        """List all credentials in the vault."""
        creds = self.tm.get_credentials()
        return creds

    def print_table(self):
        """Display credentials in a formatted table."""
        creds = self.list_all()
        if not creds:
            console.print("[yellow]No credentials in vault.[/]")
            return

        table = Table(title="Credential Vault", box=rich.box.ROUNDED)
        table.add_column("User", style="cyan")
        table.add_column("Realm", style="dim")
        table.add_column("Hash Type", style="yellow")
        table.add_column("Hash/Password", style="red", max_width=30)
        table.add_column("Source", style="white")
        table.add_column("Target IP", style="green")

        for c in creds:
            pw_or_hash = c.get("password") or c.get("hash") or ""
            display = pw_or_hash[:30] + "..." if len(pw_or_hash) > 30 else pw_or_hash
            table.add_row(
                c.get("username", ""),
                c.get("realm", ""),
                c.get("hash_type", ""),
                display,
                c.get("source", ""),
                c.get("ip_address", ""),
            )
        console.print(table)

    def export_hashcat(self, output_file: str = "loot/hashes_hashcat.txt"):
        """Export hashes in hashcat format for cracking."""
        creds = self.tm.get_credentials()
        hashcat_formats = {
            "NTLM": "1000",
            "Linux $6$": "1800",
            "Linux $5$": "1800",
            "Linux $1$": "1500",
            "Linux sha512crypt": "1800",
            "Linux sha256crypt": "1800",
            "Linux md5crypt": "1500",
        }

        lines = []
        for c in creds:
            ht = c.get("hash_type", "")
            h = c.get("hash", "")
            if h and ":" in h:
                # NTLM format: lm:nt
                lines.append(h)
            elif h:
                lines.append(h)

        fp = Path(output_file)
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text("\n".join(lines))

        self.events.emit("info", "creds", "export_hashcat",
                         f"Exported {len(lines)} hashes to {output_file}")
        console.print(f"[green]Exported {len(lines)} hashes to {fp}[/]")
        console.print(f"[dim]Crack with: hashcat -m 1000 {fp} /usr/share/wordlists/rockyou.txt[/]")
        return {"file": str(fp), "count": len(lines)}

    def export_john(self, output_file: str = "loot/hashes_john.txt"):
        """Export hashes in John the Ripper format."""
        creds = self.tm.get_credentials()
        lines = []
        for c in creds:
            username = c.get("username", "")
            h = c.get("hash", "")
            if h:
                if ":" in h:
                    lines.append(f"{username}:{h}")
                else:
                    lines.append(f"{username}:{h}")
            elif c.get("password"):
                lines.append(f"{username}:{c['password']}")

        fp = Path(output_file)
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text("\n".join(lines))
        console.print(f"[green]Exported {len(lines)} entries to {fp}[/]")
        console.print(f"[dim]Crack with: john --wordlist=/usr/share/wordlists/rockyou.txt {fp}[/]")
        return {"file": str(fp), "count": len(lines)}

    def mark_cracked(self, username: str, plaintext: str):
        """Mark a hash as cracked with the plaintext password."""
        creds = self.db.query(
            "SELECT id FROM credentials WHERE username=?",
            (username,)
        )
        if creds:
            self.db.update("credentials", creds[0]["id"], {
                "cracked": 1, "plaintext": plaintext
            })
            self.events.emit("info", "creds", "cracked",
                             f"Password cracked: {username}:{plaintext}")


class LootManager:
    """Catalog all collected evidence and files during the engagement."""

    def __init__(self, db, tm, events):
        self.db = db
        self.tm = tm
        self.events = events

    def add(self, loot_type: str, name: str, local_path: str = "",
            remote_path: str = "", size: int = 0,
            session_id: str = "", target_id: str = "",
            description: str = "", tags: List[str] = None):
        lid = self.tm.add_loot(loot_type, name, local_path, remote_path, size,
                                session_id, target_id, description, tags)
        self.events.emit("info", "loot", "added",
                         f"Loot added: {loot_type}/{name}")
        return lid

    def list_loot(self, loot_type: str = "") -> List[Dict]:
        return self.tm.get_loot(loot_type)

    def print_table(self, loot_type: str = ""):
        items = self.list_loot(loot_type)
        if not items:
            console.print("[yellow]No loot items.[/]")
            return

        table = Table(title=f"Loot Catalog{f' ({loot_type})' if loot_type else ''}",
                      box=rich.box.ROUNDED)
        table.add_column("Type", style="cyan")
        table.add_column("Name", style="white", max_width=30)
        table.add_column("Size", style="yellow")
        table.add_column("Description", style="dim", max_width=40)
        table.add_column("Collected", style="green")

        for item in items:
            size_str = f"{item['size_bytes'] / 1024:.1f} KB" if item["size_bytes"] > 1024 else f"{item['size_bytes']} B"
            table.add_row(
                item.get("loot_type", ""),
                item.get("name", ""),
                size_str,
                item.get("description", "")[:40],
                item.get("collected_at", "")[:16],
            )
        console.print(table)

    def summary(self):
        """Show loot summary by type."""
        all_loot = self.list_loot()
        by_type = {}
        for item in all_loot:
            t = item.get("loot_type", "other")
            by_type[t] = by_type.get(t, 0) + 1

        table = Table(title="Loot Summary", box=rich.box.ROUNDED)
        table.add_column("Type", style="cyan")
        table.add_column("Count", style="green", justify="right")

        for loot_type, count in sorted(by_type.items(), key=lambda x: -x[1]):
            table.add_row(loot_type, str(count))

        table.add_row("[bold]TOTAL[/]", f"[bold]{len(all_loot)}[/]")
        console.print(table)
