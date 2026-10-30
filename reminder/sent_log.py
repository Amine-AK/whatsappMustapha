"""CSV log of every send attempt, used to avoid messaging a customer twice."""

import csv
import os
from datetime import datetime

FIELDS = ["sent_at", "row", "client_name", "phone", "due_date", "status", "result", "detail"]


class SentLog:
    def __init__(self, path):
        self.path = path
        self.entries = []
        if os.path.exists(path):
            with open(path, newline="", encoding="utf-8") as f:
                self.entries = list(csv.DictReader(f))

    def last_success(self, phone, due_date):
        """When this phone was last reminded successfully for this due date, or None."""
        last = None
        for e in self.entries:
            if e["phone"] == phone and e["due_date"] == due_date.isoformat() and e["result"] == "sent":
                sent_at = datetime.fromisoformat(e["sent_at"])
                if last is None or sent_at > last:
                    last = sent_at
        return last

    def add(self, reminder, result, detail="", now=None):
        entry = {
            "sent_at": (now or datetime.now()).isoformat(timespec="seconds"),
            "row": reminder.row_number,
            "client_name": reminder.client_name,
            "phone": reminder.clean_phone,
            "due_date": reminder.due_date.isoformat(),
            "status": reminder.status,
            "result": result,
            "detail": detail,
        }
        self.entries.append(entry)
        is_new = not os.path.exists(self.path)
        with open(self.path, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            if is_new:
                writer.writeheader()
            writer.writerow(entry)
