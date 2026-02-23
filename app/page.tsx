"use client";

import { ReactNode, useMemo, useState } from "react";

type TabKey = "try-it-now" | "reporting" | "reconstruct-ticket";
type GenericRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is GenericRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asText = (value: unknown): string =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

const parseScore = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getErrorMessage = (error: unknown): string => {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (isRecord(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
};

const MAIN_SECTION_HEADINGS = new Set([
  "title",
  "business goal",
  "target audience",
  "business problem",
  "business requirement",
  "acceptance criteria",
  "success metrics & evaluation criteria",
  "tracking & instrumentation",
  "experimentation",
  "rollback",
  "expected impact",
  "people",
  "details",
  "figma",
  "figma link",
]);

const SUPPRESSED_ARTIFACT_LINES = new Set([
  "& evaluation criteria",
  "& instrumentation",
  ":",
  "::",
  ".",
]);

const SECTION_HEADING_LABELS: Record<string, string> = {
  title: "Title",
  "business goal": "Business Goal",
  "target audience": "Target Audience",
  "business problem": "Business Problem",
  "business requirement": "Business Requirement",
  "acceptance criteria": "Acceptance Criteria",
  "success metrics & evaluation criteria": "Success Metrics & Evaluation Criteria",
  "tracking & instrumentation": "Tracking & Instrumentation",
  experimentation: "Experimentation",
  rollback: "Rollback",
  "expected impact": "Expected Impact",
  people: "People",
  details: "Details",
  figma: "Figma Link",
  "figma link": "Figma Link",
};

const normalizeHeadingText = (line: string): string =>
  line
    .replace(/\*\*/g, "")
    .replace(/^\s*\d+[a-z]?[.)]?\s*/i, "")
    .replace(/^[#\-\s]+/, "")
    .replace(/[:\s]*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toLowerCase();

const getMainHeadingDisplay = (line: string): string => {
  const cleaned = line
    .replace(/^\s*\d+[a-z]?[.)]?\s*/i, "")
    .replace(/\s*[:]+\s*$/, "")
    .trim();
  const normalized = normalizeHeadingText(cleaned);
  if (normalized === "expected impact / business goal") return "Expected Impact";
  return SECTION_HEADING_LABELS[normalized] ?? cleaned;
};

type ParsedLine =
  | { kind: "main"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "list"; listType: "ul" | "ol"; text: string; level: number }
  | { kind: "text"; text: string }
  | { kind: "blank" };

const isTableRow = (line: string): boolean => /^\s*\|?.+\|.+\|?\s*$/.test(line);
const isTableSeparatorRow = (line: string): boolean => /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line);
const parseTableRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
const isSeparatorCell = (cell: string): boolean => /^:?-{2,}:?$/.test(cell.trim());
const extractUrl = (value: string): string => {
  const markdownMatch = value.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1];
  const directMatch = value.match(/https?:\/\/[^\s)]+/i);
  return directMatch?.[0] ?? "";
};
const renderFigmaValue = (value: string): ReactNode => {
  const url = extractUrl(value);
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="link-primary text-decoration-underline">
        {url}
      </a>
    );
  }
  return <span className="text-secondary fst-italic">[Figma link not provided]</span>;
};

const renderInlineMarkup = (text: string): ReactNode[] => {
  const parts: ReactNode[] = [];
  const regex = /(\*\*.+?\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match) {
    const [fullMatch] = match;
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    if (fullMatch.startsWith("**") && fullMatch.endsWith("**")) {
      parts.push(
        <strong key={`${matchIndex}-${fullMatch.length}`}>
          {fullMatch.slice(2, -2)}
        </strong>
      );
    } else if (fullMatch.startsWith("`") && fullMatch.endsWith("`")) {
      parts.push(<code key={`${matchIndex}-${fullMatch.length}`}>{fullMatch.slice(1, -1)}</code>);
    } else {
      parts.push(fullMatch);
    }

    lastIndex = matchIndex + fullMatch.length;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const renderCellMarkup = (text: string): ReactNode[] => {
  const parts = text.split(/<br\s*\/?>/gi);
  const nodes: ReactNode[] = [];

  parts.forEach((part, index) => {
    nodes.push(...renderInlineMarkup(part));
    if (index < parts.length - 1) {
      nodes.push(<br key={`cell-br-${index}`} />);
    }
  });

  return nodes;
};

const parseLines = (ticket: string): ParsedLine[] => {
  const lines = ticket.split(/\r?\n/);
  const parsed: ParsedLine[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      parsed.push({ kind: "blank" });
      index += 1;
      continue;
    }

    const normalized = normalizeHeadingText(trimmed);
    if (SUPPRESSED_ARTIFACT_LINES.has(normalized)) {
      index += 1;
      continue;
    }

    if (/^\s*[:.]+\s*$/.test(trimmed)) {
      index += 1;
      continue;
    }

    if (/^\s*\d+[.)]\s*$/.test(trimmed)) {
      index += 1;
      continue;
    }

    if (MAIN_SECTION_HEADINGS.has(normalized)) {
      parsed.push({ kind: "main", text: line });
      index += 1;
      continue;
    }

    if (isTableRow(line)) {
      const rows: string[][] = [];
      let tableIndex = index;
      while (tableIndex < lines.length && isTableRow(lines[tableIndex])) {
        rows.push(parseTableRow(lines[tableIndex]));
        tableIndex += 1;
      }
      parsed.push({ kind: "table", rows });
      index = tableIndex;
      continue;
    }

    const bulletMatch = line.match(/^(\s*)(?:[�*-]|•)\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].replace(/\t/g, "    ").length;
      parsed.push({
        kind: "list",
        listType: "ul",
        text: bulletMatch[2],
        level: Math.floor(indent / 2),
      });
      index += 1;
      continue;
    }

    const numberedMatch = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (numberedMatch) {
      const indent = numberedMatch[1].replace(/\t/g, "    ").length;
      parsed.push({
        kind: "list",
        listType: "ol",
        text: numberedMatch[2],
        level: Math.floor(indent / 2),
      });
      index += 1;
      continue;
    }

    parsed.push({ kind: "text", text: line });
    index += 1;
  }

  return parsed;
};

const renderTable = (rows: string[][], keyPrefix: string): ReactNode => {
  if (!rows.length) return null;
  const hasSeparator = rows.length > 1 && isTableSeparatorRow(`|${rows[1].join("|")}|`);
  const headerRow = rows[0] ?? [];
  const bodyRows = (hasSeparator ? rows.slice(2) : rows.slice(1)).filter(
    (row) => !row.every((cell) => isSeparatorCell(cell))
  );

  return (
    <div className="table-responsive mb-3" key={`${keyPrefix}-table`}>
      <table className="table table-bordered align-middle mb-0">
        <thead className="table-light">
          <tr>
            {headerRow.map((cell, cellIndex) => (
              <th key={`${keyPrefix}-th-${cellIndex}`} className="fw-semibold px-3 py-2 text-start">
                {renderCellMarkup(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={`${keyPrefix}-tr-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${keyPrefix}-td-${rowIndex}-${cellIndex}`}
                  className="px-3 py-2 text-start"
                  style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}
                >
                  {renderCellMarkup(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const renderListTree = (
  lines: ParsedLine[],
  startIndex: number,
  level: number,
  listType: "ul" | "ol",
  keyPrefix: string
): { node: ReactNode; nextIndex: number } => {
  const items: Array<{ text: string; children?: ReactNode }> = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (line.kind !== "list") break;
    if (line.level < level) break;
    if (line.listType !== listType && line.level === level) break;

    if (line.level > level) {
      if (items.length === 0) {
        const nested = renderListTree(
          lines,
          index,
          line.level,
          line.listType,
          `${keyPrefix}-nested-${index}`
        );
        items.push({ text: "", children: nested.node });
        index = nested.nextIndex;
        continue;
      }

      const nested = renderListTree(
        lines,
        index,
        line.level,
        line.listType,
        `${keyPrefix}-nested-${index}`
      );
      items[items.length - 1].children = nested.node;
      index = nested.nextIndex;
      continue;
    }

    items.push({ text: line.text });
    index += 1;
  }

  const ListTag = listType;
  const node = (
    <ListTag className="mb-3 ps-4 lh-lg">
      {items.map((item, itemIndex) => (
        <li key={`${keyPrefix}-item-${itemIndex}`} className="mb-2">
          {item.text ? renderInlineMarkup(item.text) : null}
          {item.children}
        </li>
      ))}
    </ListTag>
  );

  return { node, nextIndex: index };
};

const renderContentLines = (
  lines: ParsedLine[],
  keyPrefix: string,
  currentSectionHeading?: string
): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let index = 0;
  let renderedFigmaLine = false;
  const inFigmaSection =
    normalizeHeadingText(currentSectionHeading ?? "") === "figma link" ||
    normalizeHeadingText(currentSectionHeading ?? "") === "figma";

  while (index < lines.length) {
    const line = lines[index];

    if (line.kind === "blank") {
      nodes.push(<div key={`${keyPrefix}-blank-${index}`} className="mb-3" />);
      index += 1;
      continue;
    }

    if (line.kind === "text") {
      const labelMatch = line.text.match(/^\s*([A-Za-z][A-Za-z0-9 /&()'-]{1,45}):\s*(.+)?$/);
      if (labelMatch) {
        const label = labelMatch[1].trim();
        const value = labelMatch[2] ?? "";
        const normalizedLabel = normalizeHeadingText(label);
        const isFigmaLabel = normalizedLabel.includes("figma");
        if (isFigmaLabel) {
          renderedFigmaLine = true;
        }
        nodes.push(
          <div key={`${keyPrefix}-label-${index}`} className="mb-3 lh-lg">
            <strong>{label}:</strong> {renderInlineMarkup(value)}
          </div>
        );
        if (isFigmaLabel) {
          nodes.pop();
          nodes.push(
            <div key={`${keyPrefix}-label-${index}`} className="mb-3 lh-lg">
              <strong>Figma Link:</strong> {renderFigmaValue(value)}
            </div>
          );
        }
        index += 1;
        continue;
      }

      if (inFigmaSection) {
        const trimmedText = line.text.trim();
        if (trimmedText) {
          renderedFigmaLine = true;
          nodes.push(
            <div key={`${keyPrefix}-text-${index}`} className="mb-3 lh-lg">
              {renderFigmaValue(trimmedText)}
            </div>
          );
          index += 1;
          continue;
        }
      }

      nodes.push(
        <div key={`${keyPrefix}-text-${index}`} className="mb-3 lh-lg">
          {renderInlineMarkup(line.text)}
        </div>
      );
      index += 1;
      continue;
    }

    if (line.kind === "table") {
      nodes.push(renderTable(line.rows, `${keyPrefix}-${index}`));
      index += 1;
      continue;
    }

    if (line.kind === "list") {
      const tree = renderListTree(
        lines,
        index,
        line.level,
        line.listType,
        `${keyPrefix}-list-${index}`
      );
      nodes.push(<div key={`${keyPrefix}-listwrap-${index}`}>{tree.node}</div>);
      index = tree.nextIndex;
      continue;
    }

    if (line.kind === "main") {
      nodes.push(
        <div key={`${keyPrefix}-main-${index}`} className="h4 fw-semibold mt-4 mb-3">
          {renderInlineMarkup(getMainHeadingDisplay(line.text))}
        </div>
      );
      index += 1;
      continue;
    }
  }

  if (inFigmaSection && !renderedFigmaLine) {
    nodes.push(
      <div key={`${keyPrefix}-figma-placeholder`} className="mb-3 lh-lg">
        {renderFigmaValue("")}
      </div>
    );
  }

  return nodes;
};

const renderFormattedTicket = (ticket: string): ReactNode[] => {
  const parsed = parseLines(ticket);
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < parsed.length) {
    const line = parsed[index];

    if (line.kind === "main") {
      const sectionLines: ParsedLine[] = [];
      const headingKey = `main-${index}`;
      index += 1;

      while (index < parsed.length && parsed[index].kind !== "main") {
        sectionLines.push(parsed[index]);
        index += 1;
      }

      nodes.push(
        <div key={headingKey} className="mt-4 mb-4 pb-3 border-bottom border-light-subtle">
          <div className="h4 fw-semibold mb-3">{renderInlineMarkup(getMainHeadingDisplay(line.text))}</div>
          {renderContentLines(sectionLines, headingKey, line.text)}
        </div>
      );
      continue;
    }

    nodes.push(...renderContentLines([line], `root-${index}`, undefined));
    index += 1;
  }

  return nodes;
};
const parseJsonIfString = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const unwrapWebhookPayload = (value: unknown): unknown => {
  const parsed = parseJsonIfString(value);

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return null;
    return unwrapWebhookPayload(parsed[0]);
  }

  if (!isRecord(parsed)) return parsed;

  if ("json" in parsed) {
    return unwrapWebhookPayload(parsed.json);
  }

  if ("body" in parsed) {
    return unwrapWebhookPayload(parsed.body);
  }

  if ("data" in parsed) {
    return unwrapWebhookPayload(parsed.data);
  }

  if ("result" in parsed) {
    return unwrapWebhookPayload(parsed.result);
  }

  if ("response" in parsed) {
    return unwrapWebhookPayload(parsed.response);
  }

  return parsed;
};

export default function Home() {
  const [ticketId, setTicketId] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<unknown | null>(null);
  const [reconstructTicketId, setReconstructTicketId] = useState("");
  const [reconstructLoading, setReconstructLoading] = useState(false);
  const [reconstructError, setReconstructError] = useState<string>("");
  const [reconstructResponse, setReconstructResponse] = useState<string | null>(null);
  const [isDrawerCollapsed, setIsDrawerCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("try-it-now");
  const [isMissingOpen, setIsMissingOpen] = useState(true);
  const [isWeakOpen, setIsWeakOpen] = useState(true);
  const [isSummaryOpen, setIsSummaryOpen] = useState(true);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(true);

  const handleGenerate = async () => {
    const trimmedId = ticketId.trim();

    if (!trimmedId) {
      alert("Please enter a Ticket ID");
      return;
    }

    if (!/^\d+$/.test(trimmedId)) {
      alert("Ticket ID must be numeric");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "https://imworkflow.intermesh.net/webhook/1dce0367-3e65-4916-a699-e40c5362a9d7",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ticketId: trimmedId }),
        }
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const rawText = await response.text();
      const parsedResponse = parseJsonIfString(rawText);
      console.log("Parsed Response Surajj :", JSON.stringify(parsedResponse, null, 2));
      setReport(unwrapWebhookPayload(parsedResponse));
    } catch (error) {
      console.error(error);
      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleReconstructTicket = async () => {
    const trimmedId = reconstructTicketId.trim();

    if (!trimmedId) {
      setReconstructError("Please enter a Ticket ID");
      return;
    }

    setReconstructLoading(true);
    setReconstructError("");
    setReconstructResponse(null);

    try {
      const response = await fetch(
        "https://imworkflow.intermesh.net/webhook/a2172f04-2922-4b4d-bbaa-9c5eebe997ea",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ticket_id: trimmedId }),
        }
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const rawText = await response.text();
      const parsedResponse = parseJsonIfString(rawText);
      const finalTicket = isRecord(parsedResponse)
        ? asText(parsedResponse.final_ticket)
        : "";

      if (!finalTicket) {
        throw new Error("Missing final_ticket in webhook response");
      }

      setReconstructResponse(finalTicket);
    } catch (error) {
      console.error(error);
      setReconstructError(getErrorMessage(error));
    } finally {
      setReconstructLoading(false);
    }
  };

  const navItems: Array<{ key: TabKey; label: string; shortLabel: string }> = [
    { key: "try-it-now", label: "Try It Now", shortLabel: "Try" },
    { key: "reporting", label: "Reporting", shortLabel: "Rep" },
    { key: "reconstruct-ticket", label: "Reconstruct Ticket", shortLabel: "Rebuild" },
  ];

  const normalizedReport = useMemo(() => {
    const normalized = Array.isArray(report) ? report[0] : report;
    const data = isRecord(normalized) ? normalized : {};
    const header = isRecord(data?.report_header) ? data.report_header : {};
    const ticketDetails = isRecord(data?.ticket_details) ? data.ticket_details : {};
    const summary = isRecord(data?.summary) ? data.summary : {};
    const fullScoreBreakdown = isRecord(data?.full_score_breakdown) ? data.full_score_breakdown : {};
    const rawMissing = Array.isArray(data?.missing_sections) ? data.missing_sections : [];
    const rawWeak = Array.isArray(data?.weak_sections) ? data.weak_sections : [];
    const rawStrengths = Array.isArray(data?.strengths) ? data.strengths : [];
    const rawScoreBreakdown = Array.isArray(fullScoreBreakdown?.section_scores)
      ? fullScoreBreakdown.section_scores
      : [];

    const missingSections = rawMissing.map((item) => (isRecord(item) ? item : {}));
    const weakSections = rawWeak.map((item) => (isRecord(item) ? item : {}));
    const strengths = rawStrengths.map((item) => asText(item)).filter((item) => item.trim().length > 0);
    const scoreBreakdown = rawScoreBreakdown.map((item) => (isRecord(item) ? item : {}));

    return {
      scoreValue: parseScore(header?.score),
      scoreBand: asText(header?.score_band),
      title: asText(header?.title) || "PRODUCT STORY ASSESSMENT",
      ticketId: asText(ticketDetails?.id) || "N/A",
      ticketTitle: asText(ticketDetails?.title) || "Untitled Ticket",
      ticketUrl: asText(ticketDetails?.url),
      missingSections,
      weakSections,
      strengths,
      summary,
      scoreBreakdown,
    };
  }, [report]);

  console.log("NORMALIZED REPORT:", JSON.stringify(normalizedReport, null, 2));

  const scoreBadgeClass =
    normalizedReport?.scoreValue === null || normalizedReport?.scoreValue === undefined
      ? "bg-secondary"
      : normalizedReport?.scoreValue >= 8
        ? "bg-success"
        : normalizedReport?.scoreValue >= 5
          ? "bg-warning text-dark"
          : "bg-danger";

  const getCriticalityBadgeClass = (criticality: string): string => {
    const normalized = criticality.toLowerCase();
    if (normalized.includes("high")) return "bg-danger";
    if (normalized.includes("medium")) return "bg-warning text-dark";
    return "bg-secondary";
  };

  const getScoreBandBadgeClass = (scoreBand: string): string => {
    const normalized = scoreBand.toLowerCase();
    if (normalized.includes("excellent") || normalized.includes("strong")) return "bg-success";
    if (normalized.includes("develop")) return "bg-warning text-dark";
    if (normalized.includes("weak") || normalized.includes("risk")) return "bg-danger";
    return "bg-primary";
  };

  return (
    <div className="d-flex min-vh-100 bg-light">
      <aside
        className="bg-white border-end shadow-sm d-flex flex-column"
        style={{
          width: isDrawerCollapsed ? "88px" : "260px",
          transition: "width 0.25s ease",
        }}
      >
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom">
          {!isDrawerCollapsed && (
            <span className="fw-bold text-primary">Story Ticket</span>
          )}
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => setIsDrawerCollapsed((prev) => !prev)}
            aria-label={
              isDrawerCollapsed
                ? "Expand navigation drawer"
                : "Collapse navigation drawer"
            }
          >
            {isDrawerCollapsed ? ">>" : "<<"}
          </button>
        </div>

        <nav className="p-2 d-grid gap-2">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn text-start ${
                activeTab === item.key ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={() => setActiveTab(item.key)}
            >
              {isDrawerCollapsed ? item.shortLabel : item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-grow-1 p-4">
        <div className="w-100 mx-auto" style={{ maxWidth: "980px" }}>
          {activeTab === "try-it-now" ? (
            <>
              <div
                className="card shadow-lg p-5 text-center mx-auto mb-4"
                style={{ maxWidth: "520px", width: "100%", borderRadius: "20px" }}
              >
                <h1 className="mb-4 fw-bold text-primary">Test Your Ticket</h1>
                <p className="text-muted mb-4">
                  Enter your story ticket ID and generate a quality assessment report
                  instantly.
                </p>

                <input
                  type="text"
                  className="form-control mb-3"
                  placeholder="Enter Ticket ID (e.g., 602526)"
                  value={ticketId}
                  onChange={(e) => setTicketId(e.target.value)}
                />

                <button
                  className="btn btn-primary w-100 d-flex justify-content-center align-items-center"
                  onClick={handleGenerate}
                  disabled={loading}
                >
                  {loading && (
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    />
                  )}
                  {loading ? "Generating..." : "Generate Report"}
                </button>
              </div>

              {normalizedReport && (
                <section className="card border-0 shadow-sm p-4 p-md-5">
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3 mb-4">
                    <h2 className="display-6 fw-bold mb-0">{normalizedReport?.title}</h2>
                    <div className="text-md-end">
                      <span className={`badge ${scoreBadgeClass} fs-5 px-4 py-3`}>
                        {normalizedReport?.scoreValue !== null && normalizedReport?.scoreValue !== undefined
                          ? `${normalizedReport.scoreValue.toFixed(2)} / 10`
                          : "N/A"}
                      </span>
                      {normalizedReport?.scoreBand && (
                        <div className="small text-muted mt-2">
                          <strong>Score Band:</strong> {normalizedReport.scoreBand}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card mb-4">
                    <div className="card-body">
                      <h3 className="h5 mb-2">Ticket Details</h3>
                      <p className="mb-2">
                        <strong>Ticket ID:</strong> {normalizedReport?.ticketId}
                      </p>
                      <p className="mb-2">
                        <strong>Ticket Title:</strong> {normalizedReport?.ticketTitle}
                      </p>
                      {normalizedReport?.ticketUrl && (
                        <a
                          href={normalizedReport.ticketUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline-primary btn-sm"
                        >
                          Open Ticket
                        </a>
                      )}
                    </div>
                  </div>

                  {normalizedReport?.missingSections?.length > 0 && (
                    <div className="accordion mb-4">
                      <div className="accordion-item">
                        <h2 className="accordion-header">
                          <button
                            type="button"
                            className={`accordion-button ${isMissingOpen ? "" : "collapsed"}`}
                            onClick={() => setIsMissingOpen((prev) => !prev)}
                            aria-expanded={isMissingOpen}
                          >
                            Missing Sections
                          </button>
                        </h2>
                        {isMissingOpen && (
                          <div className="accordion-body">
                            <div className="row">
                              {normalizedReport.missingSections.map((section, index) => {
                                const sectionName = asText(section.section) || `Section ${index + 1}`;
                                const criticality = asText(section.criticality) || "Medium";
                                const oneLineFix = asText(section.one_line_fix);
                                const whyCritical = asText(section.why_critical);
                                const exampleUpgrade = asText(section.example_upgrade);
                                return (
                                  <div className="col-12 mb-3" key={`${sectionName}-${index}`}>
                                    <div className="border rounded p-3">
                                      <div className="d-flex align-items-center justify-content-between mb-2">
                                        <strong>{sectionName}</strong>
                                        <span className={`badge ${getCriticalityBadgeClass(criticality)}`}>
                                          {criticality}
                                        </span>
                                      </div>
                                      <p className="mb-2">
                                        <strong>One Line Fix:</strong> {oneLineFix || "N/A"}
                                      </p>
                                      <p className="mb-2">
                                        <strong>Why Critical:</strong> {whyCritical || "N/A"}
                                      </p>
                                      <div className="alert alert-light border mb-0">
                                        <strong>Example Upgrade:</strong> {exampleUpgrade || "N/A"}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {normalizedReport?.weakSections?.length > 0 && (
                    <div className="accordion mb-4">
                      <div className="accordion-item">
                        <h2 className="accordion-header">
                          <button
                            type="button"
                            className={`accordion-button ${isWeakOpen ? "" : "collapsed"}`}
                            onClick={() => setIsWeakOpen((prev) => !prev)}
                            aria-expanded={isWeakOpen}
                          >
                            Weak Sections
                          </button>
                        </h2>
                        {isWeakOpen && (
                          <div className="accordion-body">
                            <div className="row">
                              {normalizedReport.weakSections.map((section, index) => {
                                const sectionName = asText(section.section) || `Section ${index + 1}`;
                                const currentScore = asText(section.current_score) || "N/A";
                                const oneLineFix = asText(section.one_line_fix);
                                const whyImprove = asText(section.why_improve);
                                const exampleUpgrade = asText(section.example_upgrade);
                                return (
                                  <div className="col-12 mb-3" key={`${sectionName}-${index}`}>
                                    <div className="border rounded p-3">
                                      <div className="d-flex align-items-center justify-content-between mb-2">
                                        <strong>{sectionName}</strong>
                                        <span className="badge bg-secondary">{currentScore}</span>
                                      </div>
                                      <p className="mb-2">
                                        <strong>One Line Fix:</strong> {oneLineFix || "N/A"}
                                      </p>
                                      <p className="mb-2">
                                        <strong>Why Improve:</strong> {whyImprove || "N/A"}
                                      </p>
                                      <div className="alert alert-light border mb-0">
                                        <strong>Example Upgrade:</strong> {exampleUpgrade || "N/A"}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(asText(normalizedReport?.summary?.overall_assessment) ||
                    asText(normalizedReport?.summary?.what_went_well) ||
                    asText(normalizedReport?.summary?.primary_improvement_direction) ||
                    asText(normalizedReport?.summary?.improvement_path)) && (
                    <div className="accordion mb-4">
                      <div className="accordion-item">
                        <h2 className="accordion-header">
                          <button
                            type="button"
                            className={`accordion-button ${isSummaryOpen ? "" : "collapsed"}`}
                            onClick={() => setIsSummaryOpen((prev) => !prev)}
                            aria-expanded={isSummaryOpen}
                          >
                            Executive Summary
                          </button>
                        </h2>
                        {isSummaryOpen && (
                          <div className="accordion-body">
                            <p className="mb-2">
                              <strong>Overall Assessment:</strong>{" "}
                              <span className={`badge ${getScoreBandBadgeClass(normalizedReport?.scoreBand || "")}`}>
                                {asText(normalizedReport?.summary?.overall_assessment) || "N/A"}
                              </span>
                            </p>
                            <p className="mb-2">
                              <strong>What Went Well:</strong> {asText(normalizedReport?.summary?.what_went_well) || "N/A"}
                            </p>
                            <p className="mb-2">
                              <strong>Primary Improvement Direction:</strong>{" "}
                              {asText(normalizedReport?.summary?.primary_improvement_direction) || "N/A"}
                            </p>
                            <p className="mb-0">
                              <strong>Improvement Path:</strong> {asText(normalizedReport?.summary?.improvement_path) || "N/A"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {normalizedReport?.strengths?.length > 0 && (
                    <div className="mb-4">
                      <h3 className="h5 mb-3">Strengths</h3>
                      <ul className="list-group">
                        {normalizedReport.strengths.map((strength, index) => (
                          <li key={`${strength}-${index}`} className="list-group-item text-success">
                            {strength}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {normalizedReport?.scoreBreakdown?.length > 0 && (
                    <div className="accordion mb-4">
                      <div className="accordion-item">
                        <h2 className="accordion-header">
                          <button
                            type="button"
                            className={`accordion-button ${isBreakdownOpen ? "" : "collapsed"}`}
                            onClick={() => setIsBreakdownOpen((prev) => !prev)}
                            aria-expanded={isBreakdownOpen}
                          >
                            Full Score Breakdown
                          </button>
                        </h2>
                        {isBreakdownOpen && (
                          <div className="accordion-body">
                            <div className="row">
                              {normalizedReport.scoreBreakdown.map((section, index) => {
                                const sectionName = asText(section.section) || `Section ${index + 1}`;
                                const sectionScore = asText(section.score) || "N/A";
                                const sectionDetail = asText(section.detail).trim();
                                return (
                                <div className="col-md-6 mb-3" key={`${sectionName}-${index}`}>
                                  <div className="border rounded p-3 h-100">
                                    <div className="d-flex justify-content-between align-items-start mb-2">
                                      <strong>{sectionName}</strong>
                                      <span className="badge bg-secondary">{sectionScore}</span>
                                    </div>
                                    {sectionDetail && (
                                      <p className="mb-0 text-muted">{sectionDetail}</p>
                                    )}
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!(normalizedReport?.missingSections?.length > 0) &&
                    !(normalizedReport?.weakSections?.length > 0) &&
                    !(normalizedReport?.strengths?.length > 0) &&
                    !(normalizedReport?.scoreBreakdown?.length > 0) && (
                    <div className="mb-4">
                      <p className="text-muted mb-0">No detailed report sections available.</p>
                    </div>
                  )}
                </section>
              )}
            </>
          ) : activeTab === "reporting" ? (
            <div
              className="card shadow-lg p-5 text-center mx-auto"
              style={{ maxWidth: "520px", width: "100%", borderRadius: "20px" }}
            >
              <h1 className="mb-3 fw-bold text-primary">Reporting</h1>
              <p className="text-muted mb-0">
                Reporting view is ready. Add your analytics components here.
              </p>
            </div>
          ) : (
            <div
              className="card shadow-lg p-5 mx-auto"
              style={{ maxWidth: "720px", width: "100%", borderRadius: "20px" }}
            >
              <h1 className="mb-4 fw-bold text-primary">Reconstruct Ticket</h1>

              <div className="mb-3">
                <label htmlFor="reconstruct-ticket-id" className="form-label fw-semibold">
                  Enter Ticket ID
                </label>
                <input
                  id="reconstruct-ticket-id"
                  type="text"
                  className="form-control"
                  value={reconstructTicketId}
                  onChange={(e) => setReconstructTicketId(e.target.value)}
                  placeholder="Enter Ticket ID"
                />
              </div>

              <button
                type="button"
                className="btn btn-primary d-inline-flex align-items-center"
                onClick={handleReconstructTicket}
                disabled={reconstructLoading}
              >
                {reconstructLoading && (
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  />
                )}
                {reconstructLoading ? "Reconstructing..." : "Reconstruct Ticket"}
              </button>

              {reconstructError && (
                <div className="alert alert-danger mt-3 mb-0" role="alert">
                  {reconstructError}
                </div>
              )}

              {reconstructResponse !== null && (
                <div className="card border mt-4">
                  <div className="card-body">
                    <div className="text-start">
                      {renderFormattedTicket(reconstructResponse)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
