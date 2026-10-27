"""Port of the reminder logic from code.gs (collectDueAndUpcomingCustomers_).

Works on the display values of the main customer sheet (17 columns,
row 1 = header). Column indexes below are 0-based.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

COL_NAME = 0         # A  اسم الزبون
COL_PHONE = 1        # B  رقم الهاتف
COL_ITEMS = 2        # C  السلع
COL_SELL = 3         # D  ثمن البيع
COL_ADVANCE = 6      # G  التسبيق / الدفعات
COL_PERIOD = 8       # I  سيمانة / 15 يوم / شهر / تحديد يدوي
COL_DUE_DATE = 9     # J  تاريخ الدفعة المقبلة
COL_INSTALLMENT = 13 # N  مبلغ الطريطة

BUSINESS_PHONE_DISPLAY = "0663336760"
MANUAL_PERIODS = ("تحديد يدوي", "تحديث يدوي")

STATUS_OVERDUE = "overdue"
STATUS_TODAY = "today"
STATUS_TOMORROW = "tomorrow"

STATUS_LABELS = {
    STATUS_OVERDUE: "🔴 متأخر",
    STATUS_TODAY: "🟠 أجل اليوم",
    STATUS_TOMORROW: "🟢 تذكير غداً",
}

# Same patterns as extractNumbersList_ / the time stamps added by the sheet.
_DATE_STAMP_RE = re.compile(r"\(\s*\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}[^)]*\)")
_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")


@dataclass
class Reminder:
    row_number: int
    client_name: str
    phone: str
    clean_phone: str
    items: str
    remaining: float
    installment_line: str
    due_date: date
    status: str
    message: str

    @property
    def status_label(self):
        return f"{STATUS_LABELS[self.status]} ({self.due_date.isoformat()})"


def extract_numbers(value):
    text = str(value or "").replace(" ", "").replace(" ", "")
    text = _DATE_STAMP_RE.sub("", text).replace(",", ".")
    return [float(m) for m in _NUMBER_RE.findall(text)]


def parse_sum(value):
    """Sum every number in the cell, ignoring the "(dd/MM/yyyy - HH:mm)" stamps."""
    return sum(extract_numbers(value))


def format_amount(amount):
    """Print amounts like JavaScript does: 1500 rather than 1500.0."""
    if amount == int(amount):
        return str(int(amount))
    return f"{amount:.2f}".rstrip("0").rstrip(".")


def format_morocco_phone(phone):
    """Return the number in international form without '+', e.g. 212663336760."""
    digits = re.sub(r"\D", "", str(phone or ""))
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("212"):
        return digits
    if digits.startswith("0"):
        return "212" + digits[1:]
    if len(digits) == 9:
        return "212" + digits
    return digits


def is_valid_phone(clean_phone):
    return 11 <= len(clean_phone) <= 15


def parse_date(value):
    """Parse the due date cell: yyyy-mm-dd, dd/mm/yyyy or dd-mm-yyyy."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    m = re.match(r"^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})", text)
    if m:
        year, month, day = m.groups()
    else:
        m = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", text)
        if not m:
            return None
        day, month, year = m.groups()
    try:
        return date(int(year), int(month), int(day))
    except ValueError:
        return None


def format_installment_line(raw, period):
    period = (period or "").strip()
    suffix = f" (كل {period})" if period and period not in MANUAL_PERIODS else ""
    amount = parse_sum(raw)
    if amount > 0:
        return f"{format_amount(amount)} درهم{suffix}"
    raw = str(raw or "").strip()
    if raw and raw != "0":
        return raw + suffix
    return "حسب الاتفاق" + suffix


def build_message(status, client_name, items, due_date, remaining, installment_line):
    due = due_date.isoformat()
    if status == STATUS_OVERDUE:
        intro = (f"السلام عليكم {client_name}، نذكركم من متجر ELECTRO-LMESTOUR "
                 f"بأن موعد الدفعة بخصوص ({items}) قد حل بتاريخ {due}.")
    elif status == STATUS_TODAY:
        intro = (f"السلام عليكم {client_name}، نذكركم بأن اليوم هو موعد أداء "
                 f"الطريطة المتفق عليها بخصوص ({items}).")
    else:
        intro = (f"السلام عليكم {client_name}، نذكركم مسبقاً بأن يوم غد إن شاء الله "
                 f"هو موعد أداء الطريطة بخصوص ({items}).")
    return (intro
            + f"\n⏳ المبلغ المتبقي: {format_amount(remaining)} درهم"
            + f"\n📌 الطريطة المتفق عليها: {installment_line}"
            + f"\nالمرجو التواصل معنا عبر رقمنا التجاري {BUSINESS_PHONE_DISPLAY} وشكراً.")


def _cell(row, index):
    return str(row[index]).strip() if index < len(row) and row[index] is not None else ""


def collect_reminders(rows, today):
    """Return the customers that are overdue, due today or due tomorrow.

    `rows` are the sheet rows *without* the header; row_number in the
    result is the real sheet row (header is row 1).
    """
    tomorrow = today + timedelta(days=1)
    reminders = []
    for i, row in enumerate(rows):
        client_name = _cell(row, COL_NAME)
        items = _cell(row, COL_ITEMS)
        remaining = parse_sum(_cell(row, COL_SELL)) - parse_sum(_cell(row, COL_ADVANCE))
        due_date = parse_date(row[COL_DUE_DATE] if COL_DUE_DATE < len(row) else "")
        if not client_name or remaining <= 0 or due_date is None:
            continue

        if due_date < today:
            status = STATUS_OVERDUE
        elif due_date == today:
            status = STATUS_TODAY
        elif due_date == tomorrow:
            status = STATUS_TOMORROW
        else:
            continue

        phone = _cell(row, COL_PHONE)
        installment_line = format_installment_line(_cell(row, COL_INSTALLMENT), _cell(row, COL_PERIOD))
        reminders.append(Reminder(
            row_number=i + 2,
            client_name=client_name,
            phone=phone,
            clean_phone=format_morocco_phone(phone),
            items=items,
            remaining=remaining,
            installment_line=installment_line,
            due_date=due_date,
            status=status,
            message=build_message(status, client_name, items, due_date, remaining, installment_line),
        ))
    return reminders
