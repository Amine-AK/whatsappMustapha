@@ -0,0 +1,558 @@
/********************************************************************
 * ⚡ نظام إدارة متجر ELECTRO-LMESTOUR المتكامل (17 عمود)
 * الرقم التجاري الرسمي والوحيد لإرسال الكريدي والواتساب: 0663336760
 ********************************************************************/

var SECRET_CODE = "1982";
var BACKUP_SHEET_NAME = "_Backup_Security_";
var OVERDUE_SHEET_NAME = "الزبناء المتأخرين";
var BUSINESS_PHONE = "212663336760"; // الرقم التجاري المعتمد
var ANTI_BAN_DELAY_MS = 60000; // فاصل زمني: 60 ثانية (دقيقة واحدة) لحماية الرقم من الحظر

function open() {
  onOpen();
}

function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('⚡ إدارة ELECTRO-LMESTOUR')
      .addItem('🔄 تحديث وتصحيح جميع الحسابات والواتساب الآن', 'updateAllRows')
      .addSeparator()
      .addItem('🚀 نافذة الإرسال المتسلسل للطريطة (فاصل 60 ثانية)', 'showAutoReminderDispatcher')
      .addItem('📲 استخراج الأرقام لـ WA Web Plus (إرسال بالجملة)', 'exportToWaWebPlus')
      .addItem('⏰ تفعيل الفحص والإرسال الصباحي التلقائي (كل صباح)', 'installDailyMorningTrigger')
      .addItem('🔑 إعداد الإرسال الذاتي في الخلفية (WhatsApp API)', 'showWhatsAppApiConfigDialog')
      .addSeparator()
      .addItem('⚙️ تفعيل الكالوندريه التلقائي', 'installCalendarTrigger')
      .addItem('📅 فتح الكالوندريه الجانبي السريع', 'showCalendarSidebar')
      .addItem('📅 اختيار تاريخ الطريطة للسطر المحدد', 'openCalendarForActiveRow')
      .addSeparator()
      .addItem('💰 حساب الأرباح والمداخيل', 'showProfitReportDialog')
      .addItem('🖨️ طباعة الفاتورة للزبون المحدد', 'printSelectedInvoice')
      .addSeparator()
      .addItem('🚨 تحديث لائحة الزبناء المتأخرين وتذكيرات الغد', 'generateOverdueReport')
      .addToUi();
  } catch (e) {}
  refreshAllRowsSilently_();
}

function installCalendarTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEditInstalled') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();
  refreshAllRowsSilently_();
  SpreadsheetApp.getUi().alert("✅ تم تفعيل النظام بنجاح بالرقم التجاري الحصري: 0663336760");
}

function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  if (sheetName === BACKUP_SHEET_NAME || sheetName === OVERDUE_SHEET_NAME) return;

  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row < 2) return;

  var newVal = String(e.range.getValue() || "").trim();

  if (col === 9 && (newVal === "تحديد يدوي" || newVal === "تحديث يدوي")) {
    var dateCell = sheet.getRange(row, 10);
    var dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
    dateCell.setDataValidation(dateRule);
    if (!dateCell.getValue()) {
      dateCell.setValue(new Date());
    }
    dateCell.setNumberFormat("yyyy-mm-dd");
    dateCell.setBackground("#fff9c4");
    sheet.setActiveSelection(dateCell);
  }
}

function onEditInstalled(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  if (sheetName === BACKUP_SHEET_NAME || sheetName === OVERDUE_SHEET_NAME) return;

  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row < 2) return;

  var ss = e.source;
  var backupSheet = getOrCreateBackupSheet_(ss, sheet);

  var oldVal = String(backupSheet.getRange(row, col).getDisplayValue() || "").trim();
  var newVal = String(e.range.getDisplayValue() || "").trim();

  if (col === 17 && newVal !== "") {
    printInvoiceForRow_(sheet, row);
    sheet.getRange(row, 17).setValue("🖨️ جاهز للطباعة");
    return;
  }

  if (col === 9 && (newVal === "تحديد يدوي" || newVal === "تحديث يدوي")) {
    var dateCell = sheet.getRange(row, 10);
    var dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
    dateCell.setDataValidation(dateRule);
    dateCell.setNumberFormat("yyyy-mm-dd");
    dateCell.setBackground("#fff9c4");
    sheet.setActiveSelection(dateCell);
    showCalendarPickerModal_(row);
    syncRowToBackup_(sheet, backupSheet, row);
    return;
  }

  if (col === 9 && (newVal.indexOf("سيمانة") !== -1 || newVal.indexOf("15") !== -1 || newVal.indexOf("شهر") !== -1)) {
    var calcDate = calculateNextDateFromPeriod_(newVal);
    if (calcDate) {
      sheet.getRange(row, 10).setValue(calcDate).setNumberFormat("yyyy-mm-dd").setBackground(null);
    }
  }

  if (col === 10 && newVal !== "") {
    sheet.getRange(row, 10).setBackground(null);
  }

  var currentPeriod = String(sheet.getRange(row, 9).getDisplayValue() || "").trim();
  var bypassProtection = (col === 9) || (col === 10 && (currentPeriod === "تحديد يدوي" || currentPeriod === "تحديث يدوي"));

  if (!bypassProtection && col <= 14 && oldVal !== "" && oldVal !== "0" && oldVal !== "0 درهم") {
    var cleanOldForCheck = oldVal.replace(/ درهم/g, "").trim();
    var isAddition = (col === 3 || col === 4 || col === 7) && newVal.indexOf("+") !== -1 && newVal.indexOf(cleanOldForCheck) === 0;
    if (!isAddition && newVal !== oldVal) {
      var ui = SpreadsheetApp.getUi();
      var response = ui.prompt(
        "🔒 حماية النظام - ELECTRO-LMESTOUR",
        "هاد الخانة فيها معلومات مسجلة مسبقاً (" + oldVal + ").\nأدخل الكود السري لتأكيد التعديل أو الحذف:",
        ui.ButtonSet.OK_CANCEL
      );
      if (response.getSelectedButton() !== ui.Button.OK || response.getResponseText().trim() !== SECRET_CODE) {
        ui.alert("❌ الكود السري غير صحيح! تم إرجاع المعلومات القديمة.");
        e.range.setValue(backupSheet.getRange(row, col).getValue());
        return;
      }
    }
  }

  if ((col === 3 || col === 7) && newVal !== "") {
    var formulaInCell = e.range.getFormula();
    var rawExpr = (formulaInCell && formulaInCell.indexOf("=") === 0) ? formulaInCell.substring(1).trim() : newVal;
    var nowStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy - HH:mm");
    var parts = rawExpr.split("+");
    var updatedParts = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (p !== "" && !/\(\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(p)) {
        p = p + " (" + nowStamp + ")";
      }
      if (p !== "") updatedParts.push(p);
    }
    if (updatedParts.join(" + ") !== newVal) {
      sheet.getRange(row, col).setValue(updatedParts.join(" + "));
    }
  }

  processRowCalculations_(sheet, row);
  syncRowToBackup_(sheet, backupSheet, row);
  generateOverdueReport();
}

function showCalendarPickerModal_(row) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var clientName = String(sheet.getRange(row, 1).getDisplayValue() || "الزبون").trim();
  var currentVal = formatDateISO_(sheet.getRange(row, 10).getValue()) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  var html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><style>body { font-family: Tahoma; background: #f4f6f9; text-align: center; padding: 12px; } input, button { width: 90%; padding: 10px; margin-bottom: 10px; font-weight: bold; border-radius: 6px; } button { background: #2e7d32; color: #fff; cursor: pointer; border: none; } </style></head><body>' +
    '<h3>📅 اختر تاريخ الطريطة</h3><p>الزبون: <b>' + clientName + '</b></p>' +
    '<input type="date" id="pickedDate" value="' + currentVal + '" />' +
    '<button id="saveBtn" onclick="saveSelectedDate()">✅ تأكيد وحفظ التاريخ</button>' +
    '<script>function saveSelectedDate() { var d = document.getElementById("pickedDate").value; if (!d) return; document.getElementById("saveBtn").innerText = "⏳ جاري الحفظ..."; google.script.run.withSuccessHandler(function(){ google.script.host.close(); }).setManualDateFromCalendar(' + row + ', d); }</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(350).setHeight(250), "📅 كالوندريه - ELECTRO-LMESTOUR");
}

function showCalendarSidebar() {
  var todayVal = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><style>body { font-family: Tahoma; background: #f4f6f9; text-align: center; padding: 12px; } input, button { width: 95%; padding: 10px; margin-bottom: 10px; font-weight: bold; border-radius: 6px; } button { background: #2e7d32; color: #fff; cursor: pointer; border: none; }</style></head><body>' +
    '<h3>📅 الكالوندريه السريع</h3><p>كليكي على أي سطر ثم اختار التاريخ:</p>' +
    '<input type="date" id="sideDate" value="' + todayVal + '" />' +
    '<button onclick="applyToActiveRow()">✅ وضع التاريخ</button><div id="msg" style="color:#2e7d32;font-size:12px;"></div>' +
    '<script>function applyToActiveRow() { document.getElementById("msg").innerText = "⏳ جاري الحفظ..."; google.script.run.withSuccessHandler(function(res){ document.getElementById("msg").innerText = res; }).setDateForCurrentActiveRow(document.getElementById("sideDate").value); }</script></body></html>';
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(html).setTitle("📅 كالوندريه ELECTRO-LMESTOUR"));
}

function setDateForCurrentActiveRow(dateStr) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var row = sheet.getActiveCell().getRow();
  if (row < 2) return "⚠️ اختر سطر زبون أولاً!";
  sheet.getRange(row, 9).setValue("تحديد يدوي");
  setManualDateFromCalendar(row, dateStr);
  return "✅ تم حفظ التاريخ في السطر " + row;
}

function setManualDateFromCalendar(row, dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getMainCustomerSheet_(ss);
  var backupSheet = getOrCreateBackupSheet_(ss, sheet);
  var cell = sheet.getRange(row, 10);
  var dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
  cell.setDataValidation(dateRule);
  var parts = dateStr.split("-");
  cell.setValue(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0)).setNumberFormat("yyyy-mm-dd").setBackground(null);
  processRowCalculations_(sheet, row);
  syncRowToBackup_(sheet, backupSheet, row);
  generateOverdueReport();
}

function openCalendarForActiveRow() {
  var row = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getActiveCell().getRow();
  if (row < 2) return SpreadsheetApp.getUi().alert("⚠️ المرجو تحديد سطر الزبون أولاً.");
  showCalendarPickerModal_(row);
}

function setupValidationsAndCalendar_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getMainCustomerSheet_(ss);
  var maxRows = Math.max(sheet.getMaxRows() - 1, 100);
  sheet.getRange(2, 9, maxRows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["سيمانة", "15 يوم", "شهر", "تحديد يدوي"], true).setAllowInvalid(true).build());
  sheet.getRange(2, 10, maxRows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build()).setNumberFormat("yyyy-mm-dd");
}

function processRowCalculations_(sheet, row) {
  var range = sheet.getRange(row, 1, 1, 17);
  var rawValues = range.getValues()[0];
  var displayValues = range.getDisplayValues()[0];
  var formulas = range.getFormulas()[0];

  var clientName = String(displayValues[0] || "").trim();
  var phone = String(displayValues[1] || "").trim();
  var items = String(displayValues[2] || "").trim();
  if (!clientName && !items) return;

  var sellSource = getRawExpression_(formulas[3], displayValues[3], rawValues[3]);
  var buySource = getRawExpression_(formulas[4], displayValues[4], rawValues[4]);
  var advSource = getRawExpression_(formulas[6], displayValues[6], rawValues[6]);
  var period = String(displayValues[8] || "").trim();
  var nextDateVal = rawValues[9];
  var installmentRaw = getRawExpression_(formulas[13], displayValues[13], rawValues[13]);

  var sellTotal = parseSumValue_(sellSource);
  var buyTotal = parseSumValue_(buySource);
  var advTotal = parseSumValue_(advSource);
  
  // تم تصحيح علامة ناقص اللي كانت ضايعة
  var profit = sellTotal - buyTotal; 
  var remaining = sellTotal - advTotal;

  var sellDetailedWithItems = formatAmountWithItems_(sellSource, items, sellTotal);
  var advDetailedWithDates = formatAdvanceWithItemsAndDates_(advSource, items, advTotal);

  sheet.getRange(row, 6).setValue(profit + " درهم");
  sheet.getRange(row, 8).setValue(remaining + " درهم");

  var nextDateStr = formatDateISO_(nextDateVal);
  if (!nextDateStr && period !== "" && period !== "تحديد يدوي" && period !== "تحديث يدوي") {
    nextDateStr = calculateNextDateFromPeriod_(period);
    if (nextDateStr) sheet.getRange(row, 10).setValue(nextDateStr).setNumberFormat("yyyy-mm-dd");
  }

  var cleanPhone = formatMoroccoPhone_(phone);
  var installmentAmt = parseSumValue_(installmentRaw);
  var installmentLineText = formatInstallmentLine_(installmentAmt, installmentRaw, period);

  if (cleanPhone) {
    var reminderMsg = "السلام عليكم " + clientName + "، نذكركم من متجر ELECTRO-LMESTOUR بموعد أداء الدفعة الخاصة بـ: " + items + "\n💰 الإجمالي: " + sellDetailedWithItems + "\n⏳ المتبقي: " + remaining + " درهم\n📌 الطريطة المتفق عليها: " + installmentLineText + "\nيرجى التواصل معنا عبر هذا الرقم 0663336760 وشكراً.";
    var confirmMsg = "مرحباً بكم في متجر ELECTRO-LMESTOUR ⚡\nتأكيد عملية الشراء لـ: " + clientName + "\n📦 السلع: " + items + "\n💰 الإجمالي: " + sellDetailedWithItems + "\n💵 التسبيق: " + advDetailedWithDates + "\n⏳ المتبقي: " + remaining + " درهم\n📌 الطريطة المتفق عليها: " + installmentLineText + (nextDateStr ? "\n📅 تاريخ الدفعة المقبلة: " + nextDateStr : "") + "\nرقمنا التجاري للتواصل: 0663336760";
    
    sheet.getRange(row, 15).setFormula('=HYPERLINK("https://web.whatsapp.com/send?phone=' + cleanPhone + '&text=' + encodeURIComponent(reminderMsg) + '&auto_send=1"; "📱 إرسال تذكير")');
    sheet.getRange(row, 16).setFormula('=HYPERLINK("https://web.whatsapp.com/send?phone=' + cleanPhone + '&text=' + encodeURIComponent(confirmMsg) + '&auto_send=1"; "✅ تأكيد الصفقة")');
  } else {
    sheet.getRange(row, 15).setValue("📱 إرسال تذكير");
    sheet.getRange(row, 16).setValue("✅ تأكيد الصفقة");
  }
  sheet.getRange(row, 17).setValue("🖨️ جاهز للطباعة");
}

function calculateNextDateFromPeriod_(period) {
  var baseDate = new Date();
  if (period.indexOf("سيمانة") !== -1 || period.indexOf("أسبوع") !== -1 || period.indexOf("7") !== -1) {
    baseDate.setDate(baseDate.getDate() + 7);
  } else if (period.indexOf("15") !== -1) {
    baseDate.setDate(baseDate.getDate() + 15);
  } else if (period.indexOf("شهر") !== -1 || period.indexOf("30") !== -1) {
    baseDate.setMonth(baseDate.getMonth() + 1);
  } else { return ""; }
  return Utilities.formatDate(baseDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function refreshAllRowsSilently_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getMainCustomerSheet_(ss);
  setupValidationsAndCalendar_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var backupSheet = getOrCreateBackupSheet_(ss, sheet);
  for (var r = 2; r <= lastRow; r++) {
    backfillAdvanceTimestampsForRow_(sheet, r);
    processRowCalculations_(sheet, r);
    syncRowToBackup_(sheet, backupSheet, r);
  }
  generateOverdueReport();
}

function backfillAdvanceTimestampsForRow_(sheet, row) {
  var itemsCell = sheet.getRange(row, 3);
  var advCell = sheet.getRange(row, 7);
  var advRaw = (advCell.getFormula() && advCell.getFormula().indexOf("=") === 0) ? advCell.getFormula().substring(1).trim() : String(advCell.getDisplayValue() || "").trim();
  if (!advRaw || advRaw === "0") return;

  var itemParts = String(itemsCell.getDisplayValue() || "").trim().split("+");
  var itemStamps = [];
  for (var j = 0; j < itemParts.length; j++) {
    var m = itemParts[j].match(/\(\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}[^)]*)\)/);
    itemStamps.push(m ? m[1].trim() : "");
  }

  var nowStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy - HH:mm");
  var advParts = advRaw.split("+");
  var updatedAdv = [];
  var changed = false;

  for (var i = 0; i < advParts.length; i++) {
    var p = advParts[i].trim();
    if (!p) continue;
    if (!/\(\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(p)) {
      p = p + " (" + (itemStamps[i] || itemStamps[0] || nowStamp) + ")";
      changed = true;
    }
    updatedAdv.push(p);
  }
  if (changed && updatedAdv.length > 0) advCell.setValue(updatedAdv.join(" + "));
}

function updateAllRows() {
  refreshAllRowsSilently_();
  SpreadsheetApp.getUi().alert("✅ تم التحديث بنجاح!");
}

function showProfitReportDialog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getMainCustomerSheet_(ss);
  var lastRow = sheet.getLastRow();
  var salesData = [];
  if (lastRow >= 2) {
    // تم تصحيح علامة ناقص اللي كانت ضايعة
    var values = sheet.getRange(2, 1, lastRow - 1, 9).getDisplayValues();
    var formulas = sheet.getRange(2, 1, lastRow - 1, 9).getFormulas();
    for (var i = 0; i < values.length; i++) {
      var clientName = String(values[i][0] || "").trim();
      var itemsText = String(values[i][2] || "").trim();
      if (!clientName && !itemsText) continue;
      var sellPrice = parseSumValue_(getRawExpression_(formulas[i][3], values[i][3], values[i][3]));
      var buyPrice = parseSumValue_(getRawExpression_(formulas[i][4], values[i][4], values[i][4]));
      var advancePaid = parseSumValue_(getRawExpression_(formulas[i][6], values[i][6], values[i][6]));
      
      // تم تصحيح علامات ناقص اللي كانت ضايعة
      salesData.push({ client: clientName || "غير محدد", items: itemsText, sell: sellPrice, buy: buyPrice, profit: sellPrice - buyPrice, paid: advancePaid, rem: Math.max(0, sellPrice - advancePaid), date: extractDateFromItems_(itemsText) });
    }
  }

  var html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><style>body { font-family: Tahoma; background: #f4f6f9; padding: 15px; } .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; } .card { background: #fff; padding: 12px; border-radius: 8px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); } table { width: 100%; border-collapse: collapse; background: #fff; font-size: 12px; } th, td { padding: 8px; text-align: right; border-bottom: 1px solid #eee; } th { background: #283593; color: #fff; } button { padding: 8px 14px; background: #283593; color: #fff; border: none; border-radius: 4px; cursor: pointer; }</style></head><body>' +
    '<h2>📊 الأرباح والمداخيل</h2><button onclick="window.print()">🖨️ طباعة</button><br><br>' +
    '<table><thead><tr><th>التاريخ</th><th>الزبون</th><th>السلعة</th><th>البيع</th><th>الشراء</th><th>الربح</th></tr></thead><tbody id="tb"></tbody></table>' +
    '<script>var all = ' + JSON.stringify(salesData) + '; var tb = document.getElementById("tb"); all.forEach(function(i){ tb.innerHTML += "<tr><td>"+i.date+"</td><td>"+i.client+"</td><td>"+i.items+"</td><td>"+i.sell+"</td><td>"+i.buy+"</td><td>"+i.profit+"</td></tr>"; });</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(800).setHeight(600), "الأرباح والمداخيل");
}

function printSelectedInvoice() {
  var row = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getActiveCell().getRow();
  if (row < 2) return SpreadsheetApp.getUi().alert("⚠️ المرجو تحديد سطر الزبون أولاً.");
  printInvoiceForRow_(SpreadsheetApp.getActiveSpreadsheet().getActiveSheet(), row);
}

function printInvoiceForRow_(sheet, row) {
  var dispData = sheet.getRange(row, 1, 1, 17).getDisplayValues()[0];
  var html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><style>@page{size:A5 portrait;margin:8mm;} body{font-family:Tahoma;padding:10px;font-size:12px;} .box{border:2px solid #1a237e;padding:12px;border-radius:8px;} table{width:100%;border-collapse:collapse;margin-top:10px;} td,th{border:1px solid #333;padding:6px;} th{background:#1a237e;color:#fff;} .btn{width:100%;padding:10px;background:#1a237e;color:#fff;border:none;cursor:pointer;margin-top:10px;} @media print{.btn{display:none;}}</style></head><body>' +
    '<div class="box"><h2 style="text-align:center;color:#1a237e;">ELECTRO-LMESTOUR</h2><p style="text-align:center;">فاتورة الزبون: <b>' + (dispData[0] || "") + '</b> | الهاتف: ' + (dispData[1] || "") + '</p>' +
    '<table><tr><th>السلع</th><td>' + (dispData[2] || "") + '</td></tr><tr><th>الثمن الإجمالي</th><td>' + (dispData[3] || "") + ' درهم</td></tr><tr><th>التسبيق</th><td>' + (dispData[6] || "") + '</td></tr><tr><th>المتبقي</th><td>' + (dispData[7] || "") + '</td></tr><tr><th>تاريخ الأداء</th><td>' + (dispData[9] || "") + '</td></tr></table>' +
    '<br><div style="text-align:left;font-weight:bold;">توقيع الزبون: ................</div></div><button class="btn" onclick="window.print()">🖨️ طباعة الفاتورة A5</button></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(600).setHeight(500), "فاتورة");
}

function generateOverdueReport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var overdueSheet = ss.getSheetByName(OVERDUE_SHEET_NAME) || ss.insertSheet(OVERDUE_SHEET_NAME);
  overdueSheet.clearContents();
  overdueSheet.getRange(1, 1, 1, 7).setValues([["اسم الزبون", "رقم الهاتف", "المتبقي", "مبلغ الطريطة", "تاريخ الأداء", "إرسال التذكير (واتساب)", "حالة الأجل"]]);
  var list = collectDueAndUpcomingCustomers_();
  var outRow = 2;
  for (var i = 0; i < list.length; i++) {
    overdueSheet.getRange(outRow, 1, 1, 5).setValues([[list[i].clientName, list[i].phone, list[i].remaining + " درهم", list[i].installmentLineText, list[i].dueDateStr]]);
    if (list[i].whatsappUrl) overdueSheet.getRange(outRow, 6).setFormula('=HYPERLINK("' + list[i].whatsappUrl + '"; "📲 إرسال تذكير")');
    overdueSheet.getRange(outRow, 7).setValue(list[i].statusLabel);
    outRow++;
  }
}

function collectDueAndUpcomingCustomers_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mainSheet = getMainCustomerSheet_(ss);
  var lastRow = mainSheet.getLastRow();
  var results = [];
  if (lastRow < 2) return results;

  // تم تصحيح علامة ناقص اللي كانت ضايعة
  var range = mainSheet.getRange(2, 1, lastRow - 1, 17);
  var rawData = range.getValues();
  var dispData = range.getDisplayValues();
  var formData = range.getFormulas();
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  var tomorrowDate = new Date(now.getTime()); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  var tomorrowStr = Utilities.formatDate(tomorrowDate, tz, "yyyy-MM-dd");

  for (var i = 0; i < dispData.length; i++) {
    var dRow = dispData[i], rRow = rawData[i], fRow = formData[i];
    var clientName = String(dRow[0] || "").trim(), phone = String(dRow[1] || "").trim(), items = String(dRow[2] || "").trim(), period = String(dRow[8] || "").trim();
    var sellTotal = parseSumValue_(getRawExpression_(fRow[3], dRow[3], rRow[3]));
    var advTotal = parseSumValue_(getRawExpression_(fRow[6], dRow[6], rRow[6]));
    
    // تم تصحيح علامة ناقص اللي كانت ضايعة
    var remaining = sellTotal - advTotal;
    
    var dueDateStr = formatDateISO_(rRow[9]);
    if (!clientName || remaining <= 0 || !dueDateStr) continue;

    var statusLabel = "", introLine = "";
    if (dueDateStr < todayStr) { statusLabel = "🔴 متأخر (" + dueDateStr + ")"; introLine = "السلام عليكم " + clientName + "، نذكركم من متجر ELECTRO-LMESTOUR بأن موعد الدفعة بخصوص (" + items + ") قد حل بتاريخ " + dueDateStr + "."; }
    else if (dueDateStr === todayStr) { statusLabel = "🟠 أجل اليوم (" + dueDateStr + ")"; introLine = "السلام عليكم " + clientName + "، نذكركم بأن اليوم هو موعد أداء الطريطة المتفق عليها بخصوص (" + items + ")."; }
    else if (dueDateStr === tomorrowStr) { statusLabel = "🟢 تذكير غداً (" + dueDateStr + ")"; introLine = "السلام عليكم " + clientName + "، نذكركم مسبقاً بأن يوم غد إن شاء الله هو موعد أداء الطريطة بخصوص (" + items + ")."; }
    else { continue; }

    var cleanPhone = formatMoroccoPhone_(phone);
    var installmentLineText = formatInstallmentLine_(parseSumValue_(getRawExpression_(fRow[13], dRow[13], rRow[13])), getRawExpression_(fRow[13], dRow[13], rRow[13]), period);
    var msg = introLine + "\n⏳ المبلغ المتبقي: " + remaining + " درهم\n📌 الطريطة المتفق عليها: " + installmentLineText + "\nالمرجو التواصل معنا عبر رقمنا التجاري 0663336760 وشكراً.";
    var url = cleanPhone ? ("https://web.whatsapp.com/send?phone=" + cleanPhone + "&text=" + encodeURIComponent(msg) + "&auto_send=1") : "";
    results.push({ rowNumber: i + 2, clientName: clientName, phone: phone, cleanPhone: cleanPhone, remaining: remaining, installmentLineText: installmentLineText, dueDateStr: dueDateStr, statusLabel: statusLabel, message: msg, whatsappUrl: url });
  }
  return results;
}

function showAutoReminderDispatcher() {
  generateOverdueReport();
  var list = collectDueAndUpcomingCustomers_().filter(function(item) { return item.cleanPhone; });
  var hasApi = !!(PropertiesService.getScriptProperties().getProperty("WA_API_URL") && PropertiesService.getScriptProperties().getProperty("WA_API_TOKEN"));

  var html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><style>body { font-family: Tahoma; background: #f4f6f9; margin: 0; padding: 14px; } .header { background: #1a237e; color: #fff; padding: 12px; border-radius: 8px; text-align: center; margin-bottom: 12px; } .btn-start { background: #2e7d32; color: #fff; padding: 10px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-bottom: 10px; } .status-box { background: #fffde7; border: 2px solid #fbc02d; padding: 10px; border-radius: 8px; text-align: center; font-weight: bold; margin-bottom: 12px; color: #1a237e; font-size: 13px; } table { width: 100%; border-collapse: collapse; background: #fff; font-size: 12px; } th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: right; } th { background: #1a237e; color: #fff; } .sent { background: #e8f5e9; color: #2e7d32; }</style></head><body>' +
    '<div class="header"><h3>🚀 المرسل الآلي المتسلسل (' + list.length + ' زبون)</h3></div>' +
    '<div class="status-box" id="statusBox">✅ جاهز! <b>تحذير هام:</b> إذا لم تفتح نافذة الزبون الثاني تلقائياً، يرجى النظر إلى أعلى المتصفح (شريط الرابط) والنقر على علامة (x) الحمراء واختيار "السماح دائماً بالنوافذ المنبثقة".</div>' +
    '<button class="btn-start" id="startBtn" onclick="startQueue()">▶️ إرسال أوتوماتيكي للكل</button>' +
    '<table><thead><tr><th>الزبون</th><th>الهاتف</th><th>الحالة</th><th>النتيجة</th></tr></thead><tbody id="queueBody"></tbody></table>' +
    '<script>var queue = ' + JSON.stringify(list) + '; var hasApi = ' + (hasApi ? 'true' : 'false') + '; var currentIndex = 0; var timer = null;' +
    'function renderTable() { var tb = document.getElementById("queueBody"); queue.forEach(function(item, idx) { tb.innerHTML += "<tr id=\'row_"+idx+"\'><td><b>"+item.clientName+"</b></td><td>"+item.phone+"</td><td>"+item.statusLabel+"</td><td id=\'st_"+idx+"\'>⏳ في الانتظار</td></tr>"; }); } renderTable();' +
    'function startQueue() { if(queue.length===0)return; document.getElementById("startBtn").style.display="none"; processNext(); }' +
    'function processNext() { if(currentIndex >= queue.length) { document.getElementById("statusBox").innerText = "🎉 تم الإرسال للجميع!"; return; } var item = queue[currentIndex]; document.getElementById("row_"+currentIndex).className = "sent";' +
    'if(hasApi) { document.getElementById("st_"+currentIndex).innerText = "🚀 عبر الـ API..."; google.script.run.withSuccessHandler(function(res){ document.getElementById("st_"+currentIndex).innerText = res ? "✅ تم" : "⚠️ تعذر"; startWaitForNext(); }).sendSingleWhatsAppViaApiServer(item.cleanPhone, item.message); }' +
    'else { window.open(item.whatsappUrl, "_blank"); document.getElementById("st_"+currentIndex).innerText = "✅ فتحت المحادثة"; startWaitForNext(); } }' +
    'function startWaitForNext() { currentIndex++; if(currentIndex >= queue.length) { processNext(); return; } var countdown = 60; document.getElementById("statusBox").innerText = "⏳ ننتظر 60 ثانية لحماية الرقم قبل الزبون: " + queue[currentIndex].clientName; timer = setInterval(function(){ countdown--; if(countdown <= 0) { clearInterval(timer); processNext(); } else { document.getElementById("statusBox").innerText = "⏳ باقي "+countdown+" ثانية قبل الزبون: " + queue[currentIndex].clientName; } }, 1000); }' +
    '</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(700).setHeight(500), "المرسل الآلي");
}

function installDailyMorningTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if(t.getHandlerFunction() === 'runDailyMorningAutomation') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runDailyMorningAutomation').timeBased().everyDays(1).atHour(9).create();
  SpreadsheetApp.getUi().alert("✅ تم تفعيل الفحص الصباحي التلقائي بنجاح!");
}
function runDailyMorningAutomation() {
  refreshAllRowsSilently_();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("WA_API_URL") || !props.getProperty("WA_API_TOKEN")) return;
  var list = collectDueAndUpcomingCustomers_().filter(function(item) { return item.cleanPhone; });
  for (var i = 0; i < list.length; i++) {
    sendSingleWhatsAppViaApiServer(list[i].cleanPhone, list[i].message);
    
    // تم تصحيح علامة ناقص اللي كانت ضايعة
    if (i < list.length - 1) Utilities.sleep(ANTI_BAN_DELAY_MS);
  }
}
function sendSingleWhatsAppViaApiServer(cleanPhone, messageText) {
  try {
    var props = PropertiesService.getScriptProperties();
    var res = UrlFetchApp.fetch(props.getProperty("WA_API_URL"), { method: "post", contentType: "application/json", payload: JSON.stringify({ chatId: cleanPhone + "@c.us", phone: cleanPhone, message: messageText, token: props.getProperty("WA_API_TOKEN") }), muteHttpExceptions: true });
    return (res.getResponseCode() >= 200 && res.getResponseCode() < 300);
  } catch (e) { return false; }
}

function showWhatsAppApiConfigDialog() {
  var props = PropertiesService.getScriptProperties();
  var html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><style>body { font-family: Tahoma; padding: 15px; } input, button { width: 95%; padding: 10px; margin-top: 10px; border-radius: 5px; } button { background: #2e7d32; color: #fff; border: none; font-weight: bold; cursor: pointer; }</style></head><body>' +
    '<h3>🔑 إعداد WhatsApp API</h3><p>لإرسال الرسائل في الخلفية بدون فتح المتصفح:</p>' +
    '<input type="text" id="url" placeholder="API URL" value="' + (props.getProperty("WA_API_URL") || "") + '" />' +
    '<input type="text" id="token" placeholder="API Token" value="' + (props.getProperty("WA_API_TOKEN") || "") + '" />' +
    '<button onclick="var u=document.getElementById(\'url\').value, t=document.getElementById(\'token\').value; google.script.run.withSuccessHandler(function(){ google.script.host.close(); }).saveWhatsAppApiConfig(u, t);">💾 حفظ</button></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(400).setHeight(300), "إعداد API");
}
function saveWhatsAppApiConfig(url, token) {
  PropertiesService.getScriptProperties().setProperty("WA_API_URL", String(url || "").trim());
  PropertiesService.getScriptProperties().setProperty("WA_API_TOKEN", String(token || "").trim());
}

function getMainCustomerSheet_(ss) { return ss.getSheetByName("Feuille 1") || ss.getSheets()[0]; }
function getRawExpression_(f, d, r) { return (f && String(f).indexOf("=") === 0) ? String(f).substring(1).trim() : String(d || r || "").trim(); }
function formatInstallmentLine_(amt, raw, period) { var p = (period && period !== "تحديد يدوي" && period !== "تحديث يدوي") ? " (كل " + period + ")" : ""; return amt > 0 ? amt + " درهم" + p : ((String(raw||"").trim() && String(raw||"").trim()!=="0") ? String(raw||"").trim() + p : "حسب الاتفاق" + p); }
function extractNumbersList_(val) { var matches = String(val||"").replace(/\u202f|\u00a0/g, "").replace(/\(\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}[^)]*\)/g, "").replace(/,/g, ".").match(/\d+(\.\d+)?/g); return matches ? matches.map(Number) : []; }
function parseSumValue_(val) { return extractNumbersList_(val).reduce(function(a, b) { return a + b; }, 0); }
function formatAmountWithItems_(val, items, total) { return total + " درهم"; }
function formatAdvanceWithItemsAndDates_(val, items, total) { return total + " درهم"; }
function extractDateFromItems_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"); }
function formatDateISO_(val) { if (!val) return ""; if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd"); var m = String(val).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); return m ? m[3] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0") : String(val).trim(); }
function formatMoroccoPhone_(phone) { var d = String(phone||"").replace(/\D/g, ""); return d.indexOf("212")===0 ? d : (d.indexOf("0")===0 ? "212"+d.substring(1) : (d.length===9 ? "212"+d : d)); }
function getOrCreateBackupSheet_(ss, main) { var b = ss.getSheetByName(BACKUP_SHEET_NAME); if(!b){ b = ss.insertSheet(BACKUP_SHEET_NAME); b.hideSheet(); var r = main.getLastRow(), c = main.getLastColumn(); if(r>0 && c>0) b.getRange(1,1,r,c).setValues(main.getRange(1,1,r,c).getDisplayValues()); } return b; }
function syncRowToBackup_(main, backup, row) { backup.getRange(row, 1, 1, 17).setValues(main.getRange(row, 1, 1, 17).getDisplayValues()); }

// ==========================================
// الدالة الجديدة ديال الاستخراج لـ WA Web Plus
// ==========================================
function exportToWaWebPlus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var list = collectDueAndUpcomingCustomers_().filter(function(item) { 
    return item.cleanPhone; 
  });
  
  if (list.length === 0) {
    SpreadsheetApp.getUi().alert("ℹ️ ماين حتى زبون وصل الأجل ديالو أو متأخر باش نصيفطو ليه.");
    return;
  }
  
  var waSheetName = "أرقام الواتساب";
  var waSheet = ss.getSheetByName(waSheetName);
  if (!waSheet) {
    waSheet = ss.insertSheet(waSheetName);
  } else {
    waSheet.clear();
  }
  
  waSheet.appendRow(["رقم الهاتف", "الرسالة"]);
  
  var outputData = [];
  for (var i = 0; i < list.length; i++) {
    outputData.push([list[i].cleanPhone, list[i].message]);
  }
  
  waSheet.getRange(2, 1, outputData.length, 2).setValues(outputData);
  
  waSheet.getRange(1, 1, 1, 2).setBackground("#1a237e").setFontColor("white").setFontWeight("bold");
  waSheet.setColumnWidth(1, 150);
  waSheet.setColumnWidth(2, 500);
  
  SpreadsheetApp.getUi().alert("✅ تم استخراج " + outputData.length + " رقم بنجاح لصفحة '" + waSheetName + "'!\n\nتقدر دابا تمشي للصفحة، تتيليشارجيها بصيغة CSV وترفعها في WA Web Plus.");
}
