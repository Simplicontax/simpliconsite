import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "D:/simplicon/outputs/01a01f2b-4c50-7261-b704-2fd6fb125bee";
const previewDir = "D:/simplicon/outputs/01a01f2b-4c50-7261-b704-2fd6fb125bee/previews";
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const workbook = Workbook.create();
const instructions = workbook.worksheets.add("Start Here");
const personal = workbook.worksheets.add("Personal Details");
const income = workbook.worksheets.add("Income & Employment");
const deductions = workbook.worksheets.add("Deductions & Credits");
const international = workbook.worksheets.add("International Details");
const checklist = workbook.worksheets.add("Document Checklist");

const navy = "#102A43";
const teal = "#0F766E";
const mint = "#E7F6F2";
const sky = "#EAF2FF";
const gold = "#F4B942";
const ink = "#243B53";
const muted = "#627D98";
const line = "#D8E2EC";
const white = "#FFFFFF";

function title(sheet, titleText, subtitle, lastCol = "F") {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${lastCol}1`).merge();
  sheet.getRange("A1").values = [[titleText]];
  sheet.getRange(`A1:${lastCol}1`).format = {
    fill: navy,
    font: { bold: true, color: white, size: 18 },
    verticalAlignment: "center",
  };
  sheet.getRange(`A1:${lastCol}1`).format.rowHeight = 34;
  sheet.getRange(`A2:${lastCol}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${lastCol}2`).format = {
    fill: sky,
    font: { color: ink, italic: true, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(`A2:${lastCol}2`).format.rowHeight = 32;
}

function section(sheet, row, text, lastCol = "F") {
  sheet.getRange(`A${row}:${lastCol}${row}`).merge();
  sheet.getRange(`A${row}`).values = [[text]];
  sheet.getRange(`A${row}:${lastCol}${row}`).format = {
    fill: teal,
    font: { bold: true, color: white, size: 11 },
    verticalAlignment: "center",
  };
  sheet.getRange(`A${row}:${lastCol}${row}`).format.rowHeight = 24;
}

function styleInputTable(sheet, range, headerRange) {
  sheet.getRange(headerRange).format = {
    fill: navy,
    font: { bold: true, color: white },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(range).format.borders = {
    insideHorizontal: { style: "thin", color: line },
    bottom: { style: "thin", color: line },
  };
  sheet.getRange(range).format.verticalAlignment = "center";
}

title(instructions, "Simplicon Tax Organizer", "Complete the highlighted fields, save the workbook, and upload it to your ticket. Do not include passwords or payment-card details.", "G");
instructions.getRange("A4:G4").values = [["Step", "What to do", "Status", "Owner", "Notes", "Where", "Required"]];
instructions.getRange("A5:G9").values = [
  [1, "Enter taxpayer and household information", "Not started", "Client", "Use legal names as shown on tax records.", "Personal Details", "Yes"],
  [2, "Add income and employment details", "Not started", "Client", "Add one row per employer or income source.", "Income & Employment", "Yes"],
  [3, "Add deductions and credits", "Not started", "Client", "Enter best-known amounts; your preparer will confirm eligibility.", "Deductions & Credits", "If applicable"],
  [4, "Complete international questions", "Not started", "Client", "Required for cross-border or foreign account situations.", "International Details", "If applicable"],
  [5, "Review the document checklist", "Not started", "Client", "Upload documents in the ticket; video and executable files are not accepted.", "Document Checklist", "Yes"],
];
styleInputTable(instructions, "A4:G9", "A4:G4");
instructions.getRange("C5:C9").dataValidation = { rule: { type: "list", values: ["Not started", "In progress", "Complete"] } };
instructions.getRange("A5:G9").format.rowHeight = 30;
instructions.getRange("C5:C9").conditionalFormats.add("containsText", { text: "Complete", format: { fill: "#DDF5E8", font: { color: "#166534", bold: true } } });
instructions.getRange("C5:C9").conditionalFormats.add("containsText", { text: "In progress", format: { fill: "#FFF4CC", font: { color: "#854D0E", bold: true } } });
instructions.getRange("A12:B12").values = [["Organizer progress", "Completed steps"]];
instructions.getRange("A13:B13").values = [["Progress", null]];
instructions.getRange("B13").formulas = [["=COUNTIF(C5:C9,\"Complete\")/COUNTA(C5:C9)"]];
instructions.getRange("B13").format.numberFormat = "0%";
instructions.getRange("A12:B12").format = { fill: gold, font: { bold: true, color: navy } };
instructions.getRange("A13:B13").format = { fill: "#FFF9E8", font: { bold: true, color: ink } };
instructions.getRange("A16:G18").merge();
instructions.getRange("A16").values = [["Security note: Upload only tax-related documents. Accepted examples include PDF, Word, Excel, CSV, images, and common archive formats. The portal blocks video, scripts, executables, and other unsafe formats."]];
instructions.getRange("A16:G18").format = { fill: "#FFF4E5", font: { color: "#8A4B08", bold: true }, wrapText: true, verticalAlignment: "center" };
instructions.freezePanes.freezeRows(4);
instructions.getRange("A:G").format.columnWidth = 18;
instructions.getRange("B:B").format.columnWidth = 34;
instructions.getRange("E:E").format.columnWidth = 34;
instructions.getRange("F:F").format.columnWidth = 24;

title(personal, "Personal Details", "Complete one organizer per primary taxpayer or household. Leave fields blank when they do not apply.");
section(personal, 4, "Filing profile");
personal.getRange("A5:C12").values = [
  ["Field", "Your response", "Guidance"],
  ["Tax year", 2025, "Calendar year being filed"],
  ["Primary filing country", "United States", "Select United States, United Kingdom, Canada, or India"],
  ["Filing status", "", "Select the closest option"],
  ["First name", "", "As shown on government records"],
  ["Last name", "", "As shown on government records"],
  ["Date of birth", "", "Use yyyy-mm-dd"],
  ["Tax ID type", "", "SSN / ITIN / UTR / SIN / PAN, as applicable"],
];
styleInputTable(personal, "A5:C12", "A5:C5");
personal.getRange("B6:B12").format.fill = mint;
personal.getRange("B7").dataValidation = { rule: { type: "list", values: ["United States", "United Kingdom", "Canada", "India"] } };
personal.getRange("B8").dataValidation = { rule: { type: "list", values: ["Single", "Married / Joint", "Married / Separate", "Head of household", "Civil partner", "Other"] } };
section(personal, 14, "Contact and residency");
personal.getRange("A15:C23").values = [
  ["Field", "Your response", "Guidance"],
  ["Email", "", "Primary contact email"],
  ["Phone", "", "Include country code"],
  ["Street address", "", "Current residential address"],
  ["City", "", ""],
  ["State / Province / County", "", ""],
  ["Postal code", "", "Keep leading zeros"],
  ["Country of residence", "", "Current tax residence"],
  ["Residency changed during year?", "No", "Select Yes if you moved countries or changed residency status"],
];
styleInputTable(personal, "A15:C23", "A15:C15");
personal.getRange("B16:B23").format.fill = mint;
personal.getRange("B23").dataValidation = { rule: { type: "list", values: ["No", "Yes"] } };
personal.freezePanes.freezeRows(5);
personal.getRange("A:A").format.columnWidth = 26;
personal.getRange("B:B").format.columnWidth = 28;
personal.getRange("C:C").format.columnWidth = 48;

title(income, "Income & Employment", "Add one row per employer, business, investment account, property, pension, or other income source.");
income.getRange("A4:H4").values = [["Income type", "Payer / employer", "Country", "Currency", "Gross amount", "Tax withheld", "Document available?", "Notes"]];
income.getRange("A5:H16").values = Array.from({ length: 12 }, () => ["", "", "", "", null, null, "", ""]);
styleInputTable(income, "A4:H16", "A4:H4");
income.getRange("A5:H16").format.fill = mint;
income.getRange("A5:A16").dataValidation = { rule: { type: "list", values: ["Employment", "Self-employment", "Business", "Interest", "Dividends", "Capital gains", "Rental", "Pension", "Benefits", "Other"] } };
income.getRange("C5:C16").dataValidation = { rule: { type: "list", values: ["United States", "United Kingdom", "Canada", "India", "Other"] } };
income.getRange("G5:G16").dataValidation = { rule: { type: "list", values: ["Yes", "No", "Not applicable"] } };
income.getRange("E5:F16").format.numberFormat = "#,##0.00";
income.freezePanes.freezeRows(4);
income.getRange("A:A").format.columnWidth = 20;
income.getRange("B:B").format.columnWidth = 26;
income.getRange("C:D").format.columnWidth = 16;
income.getRange("E:F").format.columnWidth = 16;
income.getRange("G:G").format.columnWidth = 20;
income.getRange("H:H").format.columnWidth = 34;

title(deductions, "Deductions & Credits", "Enter best-known annual amounts. Your tax professional will determine what is allowable in each country.");
deductions.getRange("A4:F4").values = [["Category", "Description / provider", "Country", "Currency", "Amount", "Supporting document?"]];
deductions.getRange("A5:F18").values = Array.from({ length: 14 }, () => ["", "", "", "", null, ""]);
styleInputTable(deductions, "A4:F18", "A4:F4");
deductions.getRange("A5:F18").format.fill = mint;
deductions.getRange("A5:A18").dataValidation = { rule: { type: "list", values: ["Charitable giving", "Medical", "Education", "Childcare", "Retirement", "Mortgage / property", "Business expense", "Professional fees", "Tax paid", "Other"] } };
deductions.getRange("C5:C18").dataValidation = { rule: { type: "list", values: ["United States", "United Kingdom", "Canada", "India", "Other"] } };
deductions.getRange("F5:F18").dataValidation = { rule: { type: "list", values: ["Yes", "No", "Not applicable"] } };
deductions.getRange("E5:E18").format.numberFormat = "#,##0.00";
deductions.freezePanes.freezeRows(4);
deductions.getRange("A:A").format.columnWidth = 22;
deductions.getRange("B:B").format.columnWidth = 34;
deductions.getRange("C:D").format.columnWidth = 17;
deductions.getRange("E:F").format.columnWidth = 20;

title(international, "International Details", "Complete this sheet if you lived, worked, owned assets, or held financial accounts outside your primary filing country.");
international.getRange("A4:D4").values = [["Question", "Response", "Country / jurisdiction", "Details"]];
international.getRange("A5:D14").values = [
  ["Did you live or work in more than one country?", "No", "", ""],
  ["Did you hold foreign bank or investment accounts?", "No", "", ""],
  ["Did combined foreign balances exceed reporting thresholds?", "Unsure", "", ""],
  ["Did you own foreign property?", "No", "", ""],
  ["Did you receive foreign employment or business income?", "No", "", ""],
  ["Did you receive foreign pension income?", "No", "", ""],
  ["Did you receive foreign dividends or interest?", "No", "", ""],
  ["Did you dispose of foreign assets or cryptocurrency?", "No", "", ""],
  ["Did you claim treaty relief in a prior year?", "Unsure", "", ""],
  ["Any other cross-border facts your preparer should know?", "", "", ""],
];
styleInputTable(international, "A4:D14", "A4:D4");
international.getRange("B5:D14").format.fill = mint;
international.getRange("B5:B13").dataValidation = { rule: { type: "list", values: ["No", "Yes", "Unsure"] } };
international.freezePanes.freezeRows(4);
international.getRange("A:A").format.columnWidth = 48;
international.getRange("B:B").format.columnWidth = 15;
international.getRange("C:C").format.columnWidth = 24;
international.getRange("D:D").format.columnWidth = 48;

title(checklist, "Document Checklist", "Mark each item that applies and upload the corresponding documents to your Simplicon ticket.", "G");
checklist.getRange("A4:G4").values = [["Applies?", "Document category", "United States", "United Kingdom", "Canada", "India", "Uploaded?"]];
checklist.getRange("A5:G16").values = [
  ["Yes", "Identity and tax ID", "SSN/ITIN proof", "UTR/NINO proof", "SIN proof", "PAN/Aadhaar as applicable", "No"],
  ["Yes", "Employment income", "W-2", "P60/P45", "T4", "Form 16", "No"],
  ["If applicable", "Self-employment / business", "1099, P&L", "SA103, accounts", "T2125 support", "P&L, AIS/TIS", "No"],
  ["If applicable", "Interest and dividends", "1099-INT/DIV", "Statements/vouchers", "T5/T3", "Interest/dividend statements", "No"],
  ["If applicable", "Investments / gains", "1099-B", "Broker statements", "T5008", "Capital gains statement", "No"],
  ["If applicable", "Property / rental", "1098, rental P&L", "Property statements", "T776 support", "Rental income/expenses", "No"],
  ["If applicable", "Retirement / pension", "1099-R", "Pension statements", "T4A", "Pension statements", "No"],
  ["If applicable", "Education", "1098-T", "Fee statements", "T2202", "Fee receipts", "No"],
  ["If applicable", "Charitable giving", "Receipts", "Gift Aid records", "Donation receipts", "80G receipts", "No"],
  ["If applicable", "Foreign accounts / income", "FBAR/FATCA support", "Foreign income records", "T1135 support", "Foreign asset schedule", "No"],
  ["If applicable", "Prior-year return", "Federal/state return", "SA return", "T1 return", "ITR acknowledgment", "No"],
  ["Yes", "Completed organizer", "This workbook", "This workbook", "This workbook", "This workbook", "No"],
];
styleInputTable(checklist, "A4:G16", "A4:G4");
checklist.getRange("A5:A16").dataValidation = { rule: { type: "list", values: ["Yes", "No", "If applicable"] } };
checklist.getRange("G5:G16").dataValidation = { rule: { type: "list", values: ["No", "Yes"] } };
checklist.getRange("G5:G16").conditionalFormats.add("containsText", { text: "Yes", format: { fill: "#DDF5E8", font: { color: "#166534", bold: true } } });
checklist.freezePanes.freezeRows(4);
checklist.getRange("A:A").format.columnWidth = 16;
checklist.getRange("B:B").format.columnWidth = 25;
checklist.getRange("C:F").format.columnWidth = 25;
checklist.getRange("G:G").format.columnWidth = 15;

for (const sheet of [personal, income, deductions, international, checklist]) {
  const used = sheet.getUsedRange();
  used.format.wrapText = true;
  used.format.font.name = "Aptos";
  sheet.getRange("A1:F2").format.font.name = "Aptos Display";
}
instructions.getUsedRange().format.font.name = "Aptos";
instructions.getRange("A1:G2").format.font.name = "Aptos Display";

const sheetsToRender = ["Start Here", "Personal Details", "Income & Employment", "Deductions & Credits", "International Details", "Document Checklist"];
for (const sheetName of sheetsToRender) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${previewDir}/${sheetName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const inspect = await workbook.inspect({ kind: "table", range: "Start Here!A1:G18", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 8 });
console.log(inspect.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/Simplicon-Tax-Organizer.xlsx`);
