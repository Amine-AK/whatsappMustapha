-- ============================================================================
-- ELECTRO-LMESTOUR: database schema (PostgreSQL 13+)
--
-- Replaces the 17-column Google Sheet managed by code.gs. One sheet row
-- (one customer + what they bought on credit) becomes:
--   customers   1 ── n  sales  1 ── n  sale_items   (columns A-B, C-E)
--                               1 ── n  payments     (column G)
--                               1 ── n  messages     (columns O-P, WhatsApp sends)
-- Profit (F) and remaining (H) are not stored: they are computed by the
-- sale_totals view, so they can never be out of date.
-- ============================================================================

CREATE TYPE installment_period AS ENUM (
    'week',      -- سيمانة   : +7 days
    '15_days',   -- 15 يوم   : +15 days
    'month',     -- شهر      : +1 month
    'manual'     -- تحديد يدوي: date picked by hand
);

CREATE TYPE sale_status AS ENUM ('active', 'cancelled');

CREATE TYPE payment_kind AS ENUM (
    'advance',     -- التسبيق: paid on the day of the sale
    'installment'  -- الطريطة
);

CREATE TYPE message_kind AS ENUM (
    'reminder',     -- "📱 إرسال تذكير" (column O, overdue list, morning job)
    'confirmation'  -- "✅ تأكيد الصفقة" (column P)
);

CREATE TYPE due_status AS ENUM ('overdue', 'today', 'tomorrow');

CREATE TYPE send_channel AS ENUM ('wa_web', 'wa_api', 'wa_web_plus');

CREATE TYPE send_result AS ENUM ('sent', 'failed');


-- ---------------------------------------------------------------------------
-- Shop settings (the constants at the top of code.gs).
-- API tokens do not belong here: keep them in environment variables.
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
    key   text PRIMARY KEY,
    value text NOT NULL
);

INSERT INTO settings (key, value) VALUES
    ('shop_name',               'ELECTRO-LMESTOUR'),
    ('business_phone',          '212663336760'),
    ('business_phone_display',  '0663336760'),
    ('anti_ban_delay_seconds',  '60'),
    ('timezone',                'Africa/Casablanca');


-- ---------------------------------------------------------------------------
-- Customers: columns A (name) and B (phone).
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name   text NOT NULL CHECK (btrim(full_name) <> ''),
    phone_raw   text,                 -- as typed: "06 61 23 45 67"
    phone_e164  text                  -- normalized, no '+': "212661234567"
                CHECK (phone_e164 ~ '^[0-9]{11,15}$'),
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Not unique: relatives sometimes share a number.
CREATE INDEX customers_phone_idx ON customers (phone_e164);


-- ---------------------------------------------------------------------------
-- Sales: one credit deal. Columns I (period), J (next date), N (instalment).
-- ---------------------------------------------------------------------------
CREATE TABLE sales (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id         bigint NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
    sold_at             timestamptz NOT NULL DEFAULT now(),
    installment_amount  numeric(12, 2) CHECK (installment_amount > 0),
    -- Free text used when the instalment is not a plain amount
    -- (the sheet then shows it as typed, or "حسب الاتفاق").
    installment_note    text,
    installment_period  installment_period,
    next_due_date       date,
    status              sale_status NOT NULL DEFAULT 'active',
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sales_customer_idx ON sales (customer_id);
CREATE INDEX sales_due_idx ON sales (next_due_date) WHERE status = 'active';


-- ---------------------------------------------------------------------------
-- Items of a sale: column C (description + time stamp), D (sell), E (buy).
-- "TV + Frigo" with D = "3000+4000" becomes two rows.
-- ---------------------------------------------------------------------------
CREATE TABLE sale_items (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id      bigint NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
    description  text NOT NULL CHECK (btrim(description) <> ''),
    sell_price   numeric(12, 2) NOT NULL CHECK (sell_price >= 0),
    buy_price    numeric(12, 2) CHECK (buy_price >= 0),   -- NULL = cost unknown
    added_at     timestamptz NOT NULL DEFAULT now()       -- the "(dd/MM/yyyy - HH:mm)" stamp
);

CREATE INDEX sale_items_sale_idx ON sale_items (sale_id);


-- ---------------------------------------------------------------------------
-- Payments: column G, one row per "+ amount (stamp)".
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id   bigint NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
    amount    numeric(12, 2) NOT NULL CHECK (amount > 0),
    kind      payment_kind NOT NULL DEFAULT 'installment',
    paid_at   timestamptz NOT NULL DEFAULT now(),
    note      text
);

CREATE INDEX payments_sale_idx ON payments (sale_id);


-- ---------------------------------------------------------------------------
-- WhatsApp messages sent (columns O/P links, the dispatcher, the morning job,
-- and the Python tool's sent_log.csv). Used to avoid double reminders.
-- ---------------------------------------------------------------------------
CREATE TABLE messages (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id      bigint NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
    customer_id  bigint NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    kind         message_kind NOT NULL,
    due_status   due_status,          -- set for reminders only
    due_date     date,                -- the next_due_date the reminder was about
    phone_e164   text NOT NULL,
    body         text NOT NULL,
    channel      send_channel NOT NULL DEFAULT 'wa_web',
    result       send_result NOT NULL,
    detail       text,                -- error text when result = 'failed'
    sent_at      timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'reminder') = (due_status IS NOT NULL AND due_date IS NOT NULL))
);

CREATE INDEX messages_dedup_idx ON messages (sale_id, due_date, sent_at DESC) WHERE result = 'sent';


-- ---------------------------------------------------------------------------
-- Audit log: replaces the hidden "_Backup_Security_" sheet and the secret
-- code. Every change or delete keeps the old values; who may change what is
-- handled with database roles instead of a code written in the source.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name  text NOT NULL,
    record_id   bigint NOT NULL,
    operation   text NOT NULL CHECK (operation IN ('UPDATE', 'DELETE')),
    old_row     jsonb NOT NULL,
    new_row     jsonb,
    changed_by  text NOT NULL DEFAULT current_user,
    changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_record_idx ON audit_log (table_name, record_id);

CREATE FUNCTION audit_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
            INSERT INTO audit_log (table_name, record_id, operation, old_row, new_row)
            VALUES (TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), to_jsonb(NEW));
        END IF;
        RETURN NEW;
    END IF;
    INSERT INTO audit_log (table_name, record_id, operation, old_row)
    VALUES (TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD));
    RETURN OLD;
END;
$$;

CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER customers_audit  AFTER UPDATE OR DELETE ON customers  FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER sales_audit      AFTER UPDATE OR DELETE ON sales      FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER sale_items_audit AFTER UPDATE OR DELETE ON sale_items FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER payments_audit   AFTER UPDATE OR DELETE ON payments   FOR EACH ROW EXECUTE FUNCTION audit_changes();

CREATE TRIGGER customers_touch BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER sales_touch     BEFORE UPDATE ON sales     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Today in the shop's time zone.
CREATE FUNCTION shop_today() RETURNS date
LANGUAGE sql STABLE AS $$
    SELECT (now() AT TIME ZONE 'Africa/Casablanca')::date
$$;

-- calculateNextDateFromPeriod_: next payment date for a period.
CREATE FUNCTION next_date_for_period(p_period installment_period, p_from date DEFAULT shop_today())
RETURNS date
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_period
        WHEN 'week'    THEN p_from + 7
        WHEN '15_days' THEN p_from + 15
        WHEN 'month'   THEN (p_from + interval '1 month')::date
        ELSE NULL
    END
$$;


-- ---------------------------------------------------------------------------
-- Columns F (profit) and H (remaining), always up to date.
-- ---------------------------------------------------------------------------
CREATE VIEW sale_totals AS
SELECT
    s.id                                          AS sale_id,
    s.customer_id,
    s.status,
    s.next_due_date,
    COALESCE(i.sell_total, 0)                     AS sell_total,
    COALESCE(i.buy_total, 0)                      AS buy_total,
    COALESCE(i.sell_total, 0) - COALESCE(i.buy_total, 0) AS profit,
    COALESCE(p.paid_total, 0)                     AS paid_total,
    COALESCE(i.sell_total, 0) - COALESCE(p.paid_total, 0) AS remaining
FROM sales s
LEFT JOIN (
    SELECT sale_id, sum(sell_price) AS sell_total, sum(buy_price) AS buy_total
    FROM sale_items GROUP BY sale_id
) i ON i.sale_id = s.id
LEFT JOIN (
    SELECT sale_id, sum(amount) AS paid_total
    FROM payments GROUP BY sale_id
) p ON p.sale_id = s.id;


-- ---------------------------------------------------------------------------
-- collectDueAndUpcomingCustomers_: who must be reminded on p_today.
-- Active sales with money left and a due date that is past, today or tomorrow.
-- ---------------------------------------------------------------------------
CREATE FUNCTION due_reminders(p_today date DEFAULT shop_today())
RETURNS TABLE (
    sale_id             bigint,
    customer_id         bigint,
    full_name           text,
    phone_e164          text,
    items               text,
    remaining           numeric,
    installment_amount  numeric,
    installment_note    text,
    installment_period  installment_period,
    due_date            date,
    due_status          due_status,
    last_reminded_at    timestamptz
)
LANGUAGE sql STABLE AS $$
    SELECT
        t.sale_id,
        c.id,
        c.full_name,
        c.phone_e164,
        (SELECT string_agg(si.description, ' + ' ORDER BY si.added_at, si.id)
           FROM sale_items si WHERE si.sale_id = t.sale_id),
        t.remaining,
        s.installment_amount,
        s.installment_note,
        s.installment_period,
        s.next_due_date,
        CASE
            WHEN s.next_due_date < p_today THEN 'overdue'
            WHEN s.next_due_date = p_today THEN 'today'
            ELSE 'tomorrow'
        END::due_status,
        (SELECT max(m.sent_at) FROM messages m
          WHERE m.sale_id = t.sale_id AND m.kind = 'reminder'
            AND m.due_date = s.next_due_date AND m.result = 'sent')
    FROM sale_totals t
    JOIN sales s     ON s.id = t.sale_id
    JOIN customers c ON c.id = s.customer_id
    WHERE s.status = 'active'
      AND t.remaining > 0
      AND s.next_due_date IS NOT NULL
      AND s.next_due_date <= p_today + 1
    ORDER BY s.next_due_date, c.full_name
$$;
