"""Load the customer rows from Google Sheets or from a CSV export."""

import csv

DEFAULT_WORKSHEET = "Feuille 1"


def load_rows_from_csv(path):
    """Read a CSV downloaded with File > Download > CSV. Drops the header row."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    return rows[1:]


def load_rows_from_google_sheet(sheet_id, credentials_file, worksheet=DEFAULT_WORKSHEET):
    """Read the sheet with a Google service account (the sheet must be shared with it).

    Uses the displayed values, like the Apps Script does. Falls back to the
    first tab when `worksheet` does not exist (same as getMainCustomerSheet_).
    """
    import gspread

    client = gspread.service_account(filename=credentials_file)
    spreadsheet = client.open_by_key(sheet_id)
    try:
        ws = spreadsheet.worksheet(worksheet)
    except gspread.WorksheetNotFound:
        ws = spreadsheet.get_worksheet(0)
    return ws.get_all_values()[1:]
