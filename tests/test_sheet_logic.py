from datetime import date, datetime, timedelta

from reminder.sent_log import SentLog
from reminder.sheet_logic import (
    STATUS_OVERDUE, STATUS_TODAY, STATUS_TOMORROW,
    collect_reminders, format_installment_line, format_morocco_phone, parse_date, parse_sum,
)

TODAY = date(2026, 10, 27)


def make_row(name="Ahmed", phone="0661234567", items="TV (01/10/2026 - 10:00)", sell="3000",
             buy="2000", advance="1000 (01/10/2026 - 10:00)", period="شهر", due="2026-10-27",
             installment="500"):
    row = [""] * 17
    row[0], row[1], row[2], row[3], row[4] = name, phone, items, sell, buy
    row[6], row[8], row[9], row[13] = advance, period, due, installment
    return row


def test_parse_sum_ignores_date_stamps():
    assert parse_sum("500 (01/10/2026 - 10:00) + 300 (05/10/2026 - 12:30)") == 800


def test_parse_sum_handles_french_number_format():
    assert parse_sum("1 500,50") == 1500.5


def test_phone_formats():
    assert format_morocco_phone("0661234567") == "212661234567"
    assert format_morocco_phone("+212 661-23-45-67") == "212661234567"
    assert format_morocco_phone("00212661234567") == "212661234567"
    assert format_morocco_phone("661234567") == "212661234567"


def test_parse_date_formats():
    assert parse_date("2026-10-27") == TODAY
    assert parse_date("27/10/2026") == TODAY
    assert parse_date("pas encore") is None
    assert parse_date("") is None


def test_installment_line():
    assert format_installment_line("500", "شهر") == "500 درهم (كل شهر)"
    assert format_installment_line("", "تحديد يدوي") == "حسب الاتفاق"


def test_statuses():
    rows = [
        make_row(name="Late", due="2026-10-20"),
        make_row(name="Today", due="2026-10-27"),
        make_row(name="Tomorrow", due="28/10/2026"),
        make_row(name="Later", due="2026-11-15"),
    ]
    result = collect_reminders(rows, TODAY)
    assert [(r.client_name, r.status) for r in result] == [
        ("Late", STATUS_OVERDUE), ("Today", STATUS_TODAY), ("Tomorrow", STATUS_TOMORROW)]
    assert [r.row_number for r in result] == [2, 3, 4]


def test_skips_paid_unnamed_and_undated():
    rows = [
        make_row(name="Paid", advance="3000"),
        make_row(name=""),
        make_row(name="NoDate", due=""),
    ]
    assert collect_reminders(rows, TODAY) == []


def test_message_matches_sheet_text():
    r = collect_reminders([make_row(due="2026-10-20")], TODAY)[0]
    assert r.remaining == 2000
    assert r.message == (
        "السلام عليكم Ahmed، نذكركم من متجر ELECTRO-LMESTOUR بأن موعد الدفعة بخصوص "
        "(TV (01/10/2026 - 10:00)) قد حل بتاريخ 2026-10-20."
        "\n⏳ المبلغ المتبقي: 2000 درهم"
        "\n📌 الطريطة المتفق عليها: 500 درهم (كل شهر)"
        "\nالمرجو التواصل معنا عبر رقمنا التجاري 0663336760 وشكراً.")


def test_short_rows_do_not_crash():
    assert collect_reminders([["Ahmed", "0661234567"]], TODAY) == []


def test_sent_log_remembers_success(tmp_path):
    r = collect_reminders([make_row()], TODAY)[0]
    path = tmp_path / "log.csv"
    log = SentLog(str(path))
    when = datetime(2026, 10, 27, 9, 0)
    log.add(r, "failed", now=when)
    assert log.last_success(r.clean_phone, r.due_date) is None
    log.add(r, "sent", now=when)
    reloaded = SentLog(str(path))
    assert reloaded.last_success(r.clean_phone, r.due_date) == when
    assert reloaded.last_success(r.clean_phone, r.due_date + timedelta(days=30)) is None
