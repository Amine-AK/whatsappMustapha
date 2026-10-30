"""Send WhatsApp messages through WhatsApp Web with Playwright.

The browser profile is kept in `profile_dir`, so the QR code only has to be
scanned once. If WhatsApp changes its page, update the selectors below.
"""

import os
import time
from datetime import datetime
from urllib.parse import quote

from playwright.sync_api import sync_playwright

WHATSAPP_URL = "https://web.whatsapp.com"

# Shown once logged in.
SEL_CHAT_LIST = "#pane-side"
# Shown while waiting for the QR code to be scanned.
SEL_QR_CODE = "canvas[aria-label], div[data-ref]"
# The message box of an open chat (pre-filled by the ?text= parameter).
SEL_COMPOSE_BOX = 'footer div[contenteditable="true"]'
# Popup shown when the number is not on WhatsApp ("Phone number shared via url is invalid").
# It has an OK button, unlike the "Starting chat..." popup shown while the chat loads.
SEL_INVALID_POPUP = 'div[role="dialog"]:has(button), div[data-animate-modal-popup="true"]:has(button)'
# Clock icon of a message that is still being sent.
SEL_PENDING_MESSAGE = 'span[data-icon="msg-time"]'


class WhatsAppSender:
    def __init__(self, profile_dir, headless=False, screenshot_dir="logs", browser_path=None):
        self.profile_dir = profile_dir
        self.headless = headless
        self.screenshot_dir = screenshot_dir
        self.browser_path = browser_path
        self._playwright = None
        self._context = None
        self.page = None

    def __enter__(self):
        self._playwright = sync_playwright().start()
        options = {"headless": self.headless, "viewport": {"width": 1280, "height": 900}}
        if self.browser_path:
            options["executable_path"] = self.browser_path
        self._context = self._playwright.chromium.launch_persistent_context(self.profile_dir, **options)
        self.page = self._context.pages[0] if self._context.pages else self._context.new_page()
        return self

    def __exit__(self, *exc):
        if self._context:
            self._context.close()
        if self._playwright:
            self._playwright.stop()

    def login(self, timeout_s=180):
        """Open WhatsApp Web and wait until the chat list is visible."""
        self.page.goto(WHATSAPP_URL)
        deadline = time.monotonic() + timeout_s
        asked_for_qr = False
        while time.monotonic() < deadline:
            if self.page.locator(SEL_CHAT_LIST).count():
                return True
            if not asked_for_qr and self.page.locator(SEL_QR_CODE).count():
                print("📱 Scan the QR code in the browser window with the shop phone "
                      "(WhatsApp > Linked devices > Link a device).")
                asked_for_qr = True
            time.sleep(1)
        self._screenshot("login_failed")
        return False

    def send(self, phone, message, timeout_s=60):
        """Send one message. Returns (ok, detail)."""
        self.page.goto(f"{WHATSAPP_URL}/send?phone={phone}&text={quote(message)}")

        compose = self.page.locator(SEL_COMPOSE_BOX).last
        popup = self.page.locator(SEL_INVALID_POPUP)
        deadline = time.monotonic() + timeout_s
        while True:
            if compose.count() and compose.is_visible() and compose.inner_text().strip():
                break
            if popup.count() and popup.first.is_visible() and not compose.count():
                text = popup.first.inner_text().strip().replace("\n", " ")
                self._screenshot(f"invalid_{phone}")
                return False, f"WhatsApp popup: {text[:150]}"
            if time.monotonic() > deadline:
                self._screenshot(f"timeout_{phone}")
                return False, "chat did not open in time"
            time.sleep(0.5)

        compose.click()
        compose.press("End")
        compose.press("Enter")

        # Wait until the box is empty (message left) and nothing is still pending.
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            box_empty = not compose.inner_text().strip()
            if box_empty and not self.page.locator(SEL_PENDING_MESSAGE).count():
                return True, "sent"
            time.sleep(0.5)
        self._screenshot(f"not_confirmed_{phone}")
        return False, "message not confirmed as sent"

    def _screenshot(self, name):
        try:
            os.makedirs(self.screenshot_dir, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.page.screenshot(path=os.path.join(self.screenshot_dir, f"{stamp}_{name}.png"))
        except Exception:
            pass
