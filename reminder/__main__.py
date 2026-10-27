"""Send WhatsApp debt reminders to the customers in the ELECTRO-LMESTOUR sheet.

Examples:
    python -m reminder --csv clients.csv --dry-run
    python -m reminder --sheet-id <ID> --credentials service_account.json
"""

import argparse
import random
import sys
import time
from datetime import date, datetime
from zoneinfo import ZoneInfo

from .sheet_logic import collect_reminders, is_valid_phone
from .sent_log import SentLog
from .sources import DEFAULT_WORKSHEET, load_rows_from_csv, load_rows_from_google_sheet

TIMEZONE = ZoneInfo("Africa/Casablanca")


def parse_args(argv):
    p = argparse.ArgumentParser(prog="python -m reminder", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group()
    src.add_argument("--csv", help="CSV export of the main sheet (File > Download > CSV)")
    src.add_argument("--sheet-id", help="Google Sheet ID (the long code in the sheet URL)")
    p.add_argument("--credentials", default="service_account.json",
                   help="Google service account JSON key (with --sheet-id)")
    p.add_argument("--worksheet", default=DEFAULT_WORKSHEET, help="tab name (default: %(default)s)")

    p.add_argument("--dry-run", action="store_true", help="only print who would get which message")
    p.add_argument("--login-only", action="store_true", help="open WhatsApp Web to scan the QR code, then exit")
    p.add_argument("--only", choices=["overdue", "today", "tomorrow"], action="append",
                   help="only these statuses (can be repeated); default: all three")
    p.add_argument("--delay", type=int, default=60,
                   help="seconds between two messages, to protect the number (default: %(default)s)")
    p.add_argument("--max", type=int, default=0, help="stop after this many messages (0 = no limit)")
    p.add_argument("--resend-after-days", type=int, default=1,
                   help="do not remind the same customer for the same due date again before this "
                        "many days (default: %(default)s = once a day, like the sheet)")
    p.add_argument("--today", help="pretend today is YYYY-MM-DD (for testing)")

    p.add_argument("--profile-dir", default=".wa-profile", help="browser profile that keeps the WhatsApp login")
    p.add_argument("--headless", action="store_true", help="hide the browser (only after the QR code was scanned)")
    p.add_argument("--browser-path", help="use this Chromium/Chrome executable instead of Playwright's")
    p.add_argument("--log", default="sent_log.csv", help="CSV log of sent messages (default: %(default)s)")
    args = p.parse_args(argv)
    if not args.login_only and not (args.csv or args.sheet_id):
        p.error("give --csv or --sheet-id")
    return args


def main(argv=None):
    args = parse_args(argv)
    today = date.fromisoformat(args.today) if args.today else datetime.now(TIMEZONE).date()

    if args.login_only:
        from .whatsapp import WhatsAppSender
        with WhatsAppSender(args.profile_dir, headless=False, browser_path=args.browser_path) as wa:
            ok = wa.login()
        print("✅ Logged in, the session is saved." if ok else "❌ Login not completed.")
        return 0 if ok else 1

    if args.csv:
        rows = load_rows_from_csv(args.csv)
    else:
        rows = load_rows_from_google_sheet(args.sheet_id, args.credentials, args.worksheet)

    reminders = collect_reminders(rows, today)
    if args.only:
        reminders = [r for r in reminders if r.status in args.only]

    log = SentLog(args.log)
    to_send = []
    for r in reminders:
        if not is_valid_phone(r.clean_phone):
            print(f"⚠️  row {r.row_number} {r.client_name}: bad phone number '{r.phone}', skipped")
            continue
        last = log.last_success(r.clean_phone, r.due_date)
        # Compare calendar days, so a daily run at 9:00 still sends to people reminded at 9:05 yesterday.
        if last and (today - last.date()).days < args.resend_after_days:
            print(f"⏭️  row {r.row_number} {r.client_name}: already reminded on {last:%Y-%m-%d %H:%M}, skipped")
            continue
        to_send.append(r)
    if args.max:
        to_send = to_send[:args.max]

    print(f"\n📋 {len(to_send)} reminder(s) to send (today = {today.isoformat()})\n")
    if args.dry_run:
        for r in to_send:
            print(f"--- row {r.row_number} | {r.client_name} | +{r.clean_phone} | {r.status_label}")
            print(r.message, "\n")
        return 0
    if not to_send:
        return 0

    from .whatsapp import WhatsAppSender
    sent = failed = 0
    with WhatsAppSender(args.profile_dir, headless=args.headless, browser_path=args.browser_path) as wa:
        if not wa.login():
            print("❌ Not logged in to WhatsApp Web. Run with --login-only first.")
            return 1
        for i, r in enumerate(to_send):
            ok, detail = wa.send(r.clean_phone, r.message)
            log.add(r, "sent" if ok else "failed", detail)
            mark = "✅" if ok else "❌"
            print(f"{mark} [{i + 1}/{len(to_send)}] {r.client_name} +{r.clean_phone} {r.status_label}: {detail}")
            sent += ok
            failed += not ok
            if i < len(to_send) - 1:
                wait = args.delay + random.randint(0, max(1, args.delay // 4))
                print(f"⏳ waiting {wait}s to protect the number...")
                time.sleep(wait)

    print(f"\n🎉 Done: {sent} sent, {failed} failed. Log: {args.log}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
